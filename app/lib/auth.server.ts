/**
 * Admin sign-in.
 *
 * Google only, and only for addresses that already exist in the `users` table.
 * There is no sign-up, no password, and no "create an account" path — a
 * stranger who finds the admin URL and signs in with their own Google account
 * is rejected before a session is ever created. That is what makes the admin
 * being on a public URL safe.
 */
import { eq, and, gt, lt, sql } from "drizzle-orm";
import type { DB } from "~/db/client";
import { users, sessions, loginAttempts } from "~/db/schema";

const COOKIE = "kerberos_session";
/** "Remember me" means this, renewed every time the session is used. */
const SESSION_DAYS = 30;

export interface AdminUser {
  id: string;
  email: string;
  name: string | null;
  avatarUrl: string | null;
}

export interface GoogleConfig {
  clientId: string;
  clientSecret: string;
}

/**
 * Reads Google credentials from the Worker environment. Returns null when they
 * are not configured yet, so the sign-in page can say so plainly instead of
 * failing with a stack trace.
 */
export function googleConfig(env: Env): GoogleConfig | null {
  const clientId = env.GOOGLE_CLIENT_ID;
  const clientSecret = env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;
  return { clientId, clientSecret };
}

/* --------------------------------------------------------------- utilities */

function randomToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function readCookie(request: Request, name: string): string | null {
  const header = request.headers.get("Cookie");
  if (!header) return null;
  for (const part of header.split(";")) {
    const [k, ...rest] = part.trim().split("=");
    if (k === name) return decodeURIComponent(rest.join("="));
  }
  return null;
}

function cookieHeader(name: string, value: string, maxAgeSeconds: number, url: URL): string {
  const secure = url.protocol === "https:" ? "; Secure" : "";
  return `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSeconds}${secure}`;
}

/* ----------------------------------------------------------------- sessions */

/**
 * Returns the signed-in user, or null. Also slides the expiry forward, which
 * is what "it remembers me" actually means — an active browser never gets
 * logged out, an abandoned one expires after 30 days.
 */
export async function currentUser(db: DB, request: Request): Promise<AdminUser | null> {
  const token = readCookie(request, COOKIE);
  if (!token) return null;

  const tokenHash = await sha256(token);
  const [row] = await db
    .select({
      sessionId: sessions.id,
      id: users.id,
      email: users.email,
      name: users.name,
      avatarUrl: users.avatarUrl,
    })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(and(eq(sessions.tokenHash, tokenHash), gt(sessions.expiresAt, new Date())))
    .limit(1);

  if (!row) return null;

  const expiresAt = new Date(Date.now() + SESSION_DAYS * 86400_000);
  await db
    .update(sessions)
    .set({ lastUsedAt: new Date(), expiresAt })
    .where(eq(sessions.id, row.sessionId));

  return { id: row.id, email: row.email, name: row.name, avatarUrl: row.avatarUrl };
}

/**
 * A state-changing request must come from a page on this same origin.
 *
 * The session cookie is SameSite=Lax, which stops a cross-site form POST from
 * carrying it in most browsers but not all. Checking Origin (or Referer) is
 * the belt to that braces: a form on another site cannot refund an order.
 */
function assertSameOrigin(request: Request): void {
  if (request.method === "GET" || request.method === "HEAD") return;
  const url = new URL(request.url);
  const origin = request.headers.get("Origin");
  const referer = request.headers.get("Referer");
  const source = origin ?? (referer ? new URL(referer).origin : null);
  if (!source || source !== url.origin) {
    throw new Response("This request did not come from the admin.", { status: 403 });
  }
}

/** Throws a redirect to the sign-in page when nobody is signed in. */
export async function requireUser(db: DB, request: Request): Promise<AdminUser> {
  assertSameOrigin(request);
  const user = await currentUser(db, request);
  if (user) return user;
  const url = new URL(request.url);
  const next = url.pathname + url.search;
  throw new Response(null, {
    status: 302,
    headers: { Location: `/admin/login?next=${encodeURIComponent(next)}` },
  });
}

export async function createSession(
  db: DB,
  userId: string,
  request: Request,
): Promise<string> {
  const token = randomToken();
  await db.insert(sessions).values({
    userId,
    tokenHash: await sha256(token),
    userAgent: request.headers.get("User-Agent")?.slice(0, 500) ?? null,
    ip: request.headers.get("CF-Connecting-IP"),
    expiresAt: new Date(Date.now() + SESSION_DAYS * 86400_000),
  });

  // Opportunistic cleanup so expired rows do not pile up forever.
  await db.delete(sessions).where(lt(sessions.expiresAt, new Date()));

  return token;
}

export async function destroySession(db: DB, request: Request): Promise<void> {
  const token = readCookie(request, COOKIE);
  if (!token) return;
  await db.delete(sessions).where(eq(sessions.tokenHash, await sha256(token)));
}

export function sessionCookie(token: string, url: URL): string {
  return cookieHeader(COOKIE, token, SESSION_DAYS * 86400, url);
}

export function clearedSessionCookie(url: URL): string {
  return cookieHeader(COOKIE, "", 0, url);
}

/* ------------------------------------------------------------------ google */

const OAUTH_STATE_COOKIE = "kerberos_oauth_state";

export function redirectUri(url: URL): string {
  return `${url.origin}/admin/auth/callback`;
}

/** Step one: send the browser to Google. */
export function googleAuthUrl(config: GoogleConfig, url: URL, state: string): string {
  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: redirectUri(url),
    response_type: "code",
    scope: "openid email profile",
    state,
    prompt: "select_account",
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
}

/**
 * The state cookie carries both a random value (so a forged callback is
 * rejected) and where to go afterwards.
 */
export function newState(next: string): { state: string; cookie: (url: URL) => string } {
  const nonce = randomToken().slice(0, 24);
  const state = `${nonce}:${encodeURIComponent(next)}`;
  return {
    state,
    cookie: (url: URL) => cookieHeader(OAUTH_STATE_COOKIE, state, 600, url),
  };
}

export function checkState(request: Request, returned: string | null): string | null {
  const stored = readCookie(request, OAUTH_STATE_COOKIE);
  if (!stored || !returned || stored !== returned) return null;
  const next = decodeURIComponent(stored.split(":").slice(1).join(":") || "");
  return next.startsWith("/admin") ? next : "/admin";
}

export function clearedStateCookie(url: URL): string {
  return cookieHeader(OAUTH_STATE_COOKIE, "", 0, url);
}

export interface GoogleProfile {
  sub: string;
  email: string;
  name?: string;
  picture?: string;
  email_verified?: boolean;
}

/** Step two: swap the one-time code for the person's Google profile. */
export async function exchangeCode(
  config: GoogleConfig,
  code: string,
  url: URL,
): Promise<GoogleProfile> {
  const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: config.clientId,
      client_secret: config.clientSecret,
      redirect_uri: redirectUri(url),
      grant_type: "authorization_code",
    }),
  });

  if (!tokenResponse.ok) {
    throw new Error(`Google rejected the sign-in (${tokenResponse.status}).`);
  }

  const { access_token } = (await tokenResponse.json()) as { access_token?: string };
  if (!access_token) throw new Error("Google did not return an access token.");

  const profileResponse = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
    headers: { Authorization: `Bearer ${access_token}` },
  });
  if (!profileResponse.ok) {
    throw new Error(`Could not read the Google profile (${profileResponse.status}).`);
  }

  return (await profileResponse.json()) as GoogleProfile;
}

/**
 * The interim way in, for use until Google credentials are configured.
 *
 * A single long random code held as a Worker secret. It signs in the one user
 * row that exists, and it is compared in constant time so the code cannot be
 * guessed a character at a time. When GOOGLE_CLIENT_ID is set this stops being
 * offered — Google becomes the only door.
 */
const MAX_ATTEMPTS = 8;
const ATTEMPT_WINDOW_MS = 15 * 60_000;

/**
 * Brute-force guard for the access code: eight wrong tries per address per
 * fifteen minutes. Kept in the database so it holds across Worker isolates.
 */
export async function loginAllowed(db: DB, ip: string): Promise<boolean> {
  const since = new Date(Date.now() - ATTEMPT_WINDOW_MS);
  const [row] = await db
    .select({ n: sql<number>`cast(count(*) as int)` })
    .from(loginAttempts)
    .where(and(eq(loginAttempts.ip, ip), gt(loginAttempts.at, since)));
  return (row?.n ?? 0) < MAX_ATTEMPTS;
}

export async function recordFailedLogin(db: DB, ip: string): Promise<void> {
  await db.insert(loginAttempts).values({ ip });
  await db.delete(loginAttempts).where(lt(loginAttempts.at, new Date(Date.now() - ATTEMPT_WINDOW_MS)));
}

export function clientIp(request: Request): string {
  // Off Cloudflare (local dev) there is no trustworthy address; a random
  // bucket means nobody is locked out by someone else's typos.
  return request.headers.get("CF-Connecting-IP") ?? `local-${crypto.randomUUID()}`;
}

export async function checkAccessCode(
  db: DB,
  env: Env,
  submitted: string,
): Promise<AdminUser | null> {
  const expected = env.ADMIN_ACCESS_CODE;
  if (!expected || expected.length < 16) return null;
  if (!timingSafeEqual(submitted.trim(), expected)) return null;

  const [row] = await db.select().from(users).orderBy(users.createdAt).limit(1);
  if (!row) return null;

  await db.update(users).set({ lastSeenAt: new Date() }).where(eq(users.id, row.id));
  return { id: row.id, email: row.email, name: row.name, avatarUrl: row.avatarUrl };
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let difference = 0;
  for (let i = 0; i < a.length; i++) difference |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return difference === 0;
}

/**
 * Looks the Google account up in `users`. Returns null when that address is
 * not on the list — the caller turns that into "this account cannot open this
 * admin", never into a new account.
 */
export async function findAllowedUser(
  db: DB,
  profile: GoogleProfile,
): Promise<AdminUser | null> {
  const email = profile.email?.toLowerCase().trim();
  if (!email || profile.email_verified === false) return null;

  const [row] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  if (!row) return null;

  await db
    .update(users)
    .set({
      googleSub: profile.sub,
      name: row.name ?? profile.name ?? null,
      avatarUrl: profile.picture ?? row.avatarUrl,
      lastSeenAt: new Date(),
    })
    .where(eq(users.id, row.id));

  return {
    id: row.id,
    email: row.email,
    name: row.name ?? profile.name ?? null,
    avatarUrl: profile.picture ?? row.avatarUrl,
  };
}
