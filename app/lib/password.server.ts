/**
 * Pre-launch storefront password.
 *
 * The password itself is never stored; its SHA-256 is. A correct entry sets
 * a cookie carrying that same hash for a day, which is what lets a person
 * through on the next request without asking again.
 */
const COOKIE = "kerberos_storefront";

export async function hashPassword(password: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(password.trim()));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function passwordCookieValid(request: Request, expectedHash: string | null): boolean {
  if (!expectedHash) return false;
  const header = request.headers.get("Cookie") ?? "";
  for (const part of header.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === COOKIE && rest.join("=") === expectedHash) return true;
  }
  return false;
}

export function passwordCookie(hash: string, url: URL): string {
  const secure = url.protocol === "https:" ? "; Secure" : "";
  return `${COOKIE}=${hash}; Path=/; HttpOnly; SameSite=Lax; Max-Age=86400${secure}`;
}
