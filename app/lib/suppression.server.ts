/**
 * Unsubscribe for recovery email.
 *
 * The link in the email carries the address and an HMAC of it, so it can only
 * be made by this Worker and nobody can unsubscribe a stranger by guessing.
 * A suppressed address is skipped before every send.
 */
import { eq } from "drizzle-orm";
import { emailSuppressions } from "~/db/schema";
import type { DB } from "~/db/client";

async function sign(env: Env, email: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(env.ENCRYPTION_KEY || "no-key"),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(email.toLowerCase()));
  return Array.from(new Uint8Array(mac).slice(0, 16), (b) => b.toString(16).padStart(2, "0")).join("");
}

export async function unsubscribeUrl(env: Env, site: string, email: string): Promise<string> {
  const e = email.toLowerCase();
  return `${site}/unsubscribe?e=${encodeURIComponent(e)}&s=${await sign(env, e)}`;
}

export async function validUnsubscribe(env: Env, email: string, sig: string): Promise<boolean> {
  return Boolean(email && sig) && (await sign(env, email)) === sig;
}

export async function suppress(db: DB, email: string): Promise<void> {
  await db.insert(emailSuppressions).values({ email: email.toLowerCase() }).onConflictDoNothing();
}

export async function isSuppressed(db: DB, email: string): Promise<boolean> {
  const [row] = await db.select().from(emailSuppressions).where(eq(emailSuppressions.email, email.toLowerCase())).limit(1);
  return Boolean(row);
}
