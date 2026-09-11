/**
 * Web push — the shop's notification sound on his phone and his laptop.
 *
 * There is no iOS app and there will not be one. A browser can already do
 * this: a page added to the iPhone home screen, or open in Safari/Chrome on
 * the Mac, can hold a push subscription and be woken by the server even when
 * it is closed. That is the whole mechanism behind Shopify's ping, minus the
 * app store.
 *
 * The protocol is RFC 8291 (payload encryption) plus RFC 8292 (VAPID, which
 * is how the push service knows the message really came from us). Both are
 * implemented here against WebCrypto because the npm library for this is
 * built on Node's crypto and cannot run on a Worker.
 */

const b64url = (bytes: ArrayBuffer | Uint8Array) => {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let s = "";
  for (const b of view) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};

const unb64url = (value: string) => {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(padded + "=".repeat((4 - (padded.length % 4)) % 4));
  return Uint8Array.from(raw, (ch) => ch.charCodeAt(0));
};

const concat = (...parts: Uint8Array[]) => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
};

const utf8 = (s: string) => new TextEncoder().encode(s);

/** HKDF-SHA256, the one shape RFC 8291 uses. */
async function hkdf(salt: Uint8Array, ikm: Uint8Array, info: Uint8Array, length: number) {
  const key = await crypto.subtle.importKey("raw", ikm as BufferSource, "HKDF", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "HKDF", hash: "SHA-256", salt: salt as BufferSource, info: info as BufferSource },
    key,
    length * 8,
  );
  return new Uint8Array(bits);
}

/**
 * The signed token that identifies this server to the push service. It is
 * scoped to the push endpoint's origin and short-lived on purpose.
 */
async function vapidHeader(endpoint: string, publicKey: string, privateKey: string, subject: string) {
  const aud = new URL(endpoint).origin;
  const header = b64url(utf8(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const body = b64url(
    utf8(JSON.stringify({ aud, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: subject })),
  );
  const raw = unb64url(publicKey);
  const jwk: JsonWebKey = {
    kty: "EC",
    crv: "P-256",
    d: privateKey,
    x: b64url(raw.slice(1, 33)),
    y: b64url(raw.slice(33, 65)),
    ext: true,
  };
  const key = await crypto.subtle.importKey("jwk", jwk, { name: "ECDSA", namedCurve: "P-256" }, false, [
    "sign",
  ]);
  const signature = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    key,
    utf8(`${header}.${body}`) as BufferSource,
  );
  return `vapid t=${header}.${body}.${b64url(signature)}, k=${publicKey}`;
}

/** RFC 8291 aes128gcm: one record, the whole payload. */
async function encrypt(payload: string, p256dh: string, auth: string) {
  const uaPublic = unb64url(p256dh);
  const authSecret = unb64url(auth);

  const pair = (await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, [
    "deriveBits",
  ])) as CryptoKeyPair;
  const asPublic = new Uint8Array(await crypto.subtle.exportKey("raw", pair.publicKey));
  const uaKey = await crypto.subtle.importKey(
    "raw",
    uaPublic as BufferSource,
    { name: "ECDH", namedCurve: "P-256" },
    false,
    [],
  );
  const shared = new Uint8Array(
    await crypto.subtle.deriveBits({ name: "ECDH", public: uaKey }, pair.privateKey, 256),
  );

  const prk = await hkdf(
    authSecret,
    shared,
    concat(utf8("WebPush: info\0"), uaPublic, asPublic),
    32,
  );
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(salt, prk, utf8("Content-Encoding: aes128gcm\0"), 16);
  const nonce = await hkdf(salt, prk, utf8("Content-Encoding: nonce\0"), 12);

  const aes = await crypto.subtle.importKey("raw", cek as BufferSource, "AES-GCM", false, ["encrypt"]);
  const record = concat(utf8(payload), new Uint8Array([0x02]));
  const sealed = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: "AES-GCM", iv: nonce as BufferSource },
      aes,
      record as BufferSource,
    ),
  );

  const recordSize = new Uint8Array(4);
  new DataView(recordSize.buffer).setUint32(0, 4096);
  return concat(salt, recordSize, new Uint8Array([asPublic.length]), asPublic, sealed);
}

export type PushTarget = { endpoint: string; p256dh: string; auth: string };

export type PushMessage = {
  title: string;
  body: string;
  /** where clicking it should land — an admin path */
  url?: string;
  /** so a second delivery of the same order does not stack two banners */
  tag?: string;
};

/**
 * Sends one notification. Returns the push service's status so the caller can
 * delete a subscription the browser has thrown away (404/410) rather than
 * keep pushing into nothing.
 */
export async function sendPush(
  env: Env,
  target: PushTarget,
  message: PushMessage,
): Promise<number> {
  const publicKey = env.VAPID_PUBLIC_KEY;
  const privateKey = env.VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey) return 0;

  const bodyBytes = await encrypt(JSON.stringify(message), target.p256dh, target.auth);
  const authorization = await vapidHeader(
    target.endpoint,
    publicKey,
    privateKey,
    env.VAPID_SUBJECT || "mailto:getsculps@gmail.com",
  );

  const res = await fetch(target.endpoint, {
    method: "POST",
    headers: {
      Authorization: authorization,
      "Content-Encoding": "aes128gcm",
      "Content-Type": "application/octet-stream",
      TTL: "86400",
      Urgency: "high",
    },
    body: bodyBytes as BodyInit,
  });
  return res.status;
}
