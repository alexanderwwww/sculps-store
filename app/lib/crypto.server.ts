/**
 * Encryption for the secrets that live in the database: Stripe secret keys,
 * webhook secrets, and the Meta Conversions API token.
 *
 * AES-GCM with a master key held as a Cloudflare Worker secret. The key is
 * never in the repo and never in the database, so a copy of the database on
 * its own does not hand anyone a live payment key.
 */

const ALGORITHM = "AES-GCM";

async function masterKey(env: Env): Promise<CryptoKey | null> {
  const raw = env.ENCRYPTION_KEY;
  if (!raw || raw.length < 32) return null;

  // Hash whatever was configured down to exactly 32 bytes, so the secret does
  // not have to be a precise length to be valid.
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(raw));
  return crypto.subtle.importKey("raw", digest, ALGORITHM, false, ["encrypt", "decrypt"]);
}

/** Returns null when no master key is configured, so callers can say so. */
export async function encryptSecret(env: Env, plaintext: string): Promise<string | null> {
  const key = await masterKey(env);
  if (!key) return null;

  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt(
    { name: ALGORITHM, iv },
    key,
    new TextEncoder().encode(plaintext),
  );

  const packed = new Uint8Array(iv.length + encrypted.byteLength);
  packed.set(iv, 0);
  packed.set(new Uint8Array(encrypted), iv.length);
  return btoa(String.fromCharCode(...packed));
}

export async function decryptSecret(env: Env, stored: string | null): Promise<string | null> {
  if (!stored) return null;
  const key = await masterKey(env);
  if (!key) return null;

  try {
    const packed = Uint8Array.from(atob(stored), (character) => character.charCodeAt(0));
    const iv = packed.slice(0, 12);
    const body = packed.slice(12);
    const decrypted = await crypto.subtle.decrypt({ name: ALGORITHM, iv }, key, body);
    return new TextDecoder().decode(decrypted);
  } catch {
    // A key rotation or a corrupted row. Say nothing rather than throwing into
    // a settings screen the person needs in order to fix it.
    return null;
  }
}

export function encryptionReady(env: Env): boolean {
  return Boolean(env.ENCRYPTION_KEY && env.ENCRYPTION_KEY.length >= 32);
}

/** Shows the last four characters only, for confirming which key is stored. */
export function maskSecret(value: string | null): string {
  if (!value) return "—";
  if (value.length <= 4) return "••••";
  return `••••••••${value.slice(-4)}`;
}
