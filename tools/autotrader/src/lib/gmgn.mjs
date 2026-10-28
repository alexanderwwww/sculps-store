// GMGN OpenAPI client, written from the source of gmgn-cli 1.7.0 (MIT) and its skills docs. Read, not remembered:
//   host https://openapi.gmgn.ai; every call carries ?timestamp=<unix s>&client_id=<uuid> and header X-APIKEY.
//   "signed" calls (swap, query_order, wallet_holdings) also carry X-Signature = base64 signature over
//   `${subPath}:${sortedQuery}:${body}:${timestamp}` with the user's Ed25519 (raw message) or RSA-PSS-SHA256 key.
//   The signing key only proves the request is yours; the wallet is bound to the API key on GMGN's side.
import crypto from "node:crypto";
const HOST = "https://openapi.gmgn.ai";
export const SOL_MINT = "So11111111111111111111111111111111111111112";

export function algorithmOf(pem) {
  const t = crypto.createPrivateKey(pem).asymmetricKeyType;
  if (t === "ed25519") return "Ed25519";
  if (t === "rsa") return "RSA-SHA256";
  throw new Error(`Unsupported key type: ${t}. Supported: Ed25519, RSA`);
}
export function buildMessage(subPath, query, body, timestamp) {
  const qs = Object.keys(query).sort().flatMap((k) => {
    const ek = encodeURIComponent(k), v = query[k];
    return Array.isArray(v) ? [...v].sort().map((x) => `${ek}=${encodeURIComponent(x)}`) : [`${ek}=${encodeURIComponent(String(v))}`];
  }).join("&");
  return `${subPath}:${qs}:${body}:${timestamp}`;
}
export function signMessage(message, pem, algorithm = algorithmOf(pem)) {
  const buf = Buffer.from(message, "utf-8");
  if (algorithm === "Ed25519") return crypto.sign(null, buf, pem).toString("base64");
  return crypto.sign("sha256", buf, { key: pem, padding: crypto.constants.RSA_PKCS1_PSS_PADDING, saltLength: 32 }).toString("base64");
}
function buildUrl(host, subPath, query) {
  const u = new URL(host + subPath);
  for (const [k, v] of Object.entries(query)) for (const x of Array.isArray(v) ? v : [v]) u.searchParams.append(k, String(x));
  return u.toString();
}
export class GmgnError extends Error {
  constructor(m, o = {}) { super(m); Object.assign(this, o); }
}
export class GmgnClient {
  constructor({ apiKey, privateKeyPem, host = HOST, fetchImpl = fetch, now = Date.now }) {
    Object.assign(this, { apiKey, host, fetchImpl, now });
    this.pem = privateKeyPem ? privateKeyPem.replace(/\\n/g, "\n") : null;
  }
  async #send(method, subPath, extra, body, signed) {
    if (signed && !this.pem) throw new GmgnError("GMGN signing key missing");
    const timestamp = Math.floor(this.now() / 1000), client_id = crypto.randomUUID();
    const query = { ...extra, timestamp, client_id };
    const bodyStr = body != null ? JSON.stringify(body) : "";
    const headers = { "X-APIKEY": this.apiKey, "Content-Type": "application/json", "User-Agent": "ultra/1" };
    if (signed) headers["X-Signature"] = signMessage(buildMessage(subPath, query, bodyStr, timestamp), this.pem);
    const res = await this.fetchImpl(buildUrl(this.host, subPath, query), { method, headers, body: bodyStr || undefined, signal: AbortSignal.timeout(20000) });
    const text = await res.text();
    let j; try { j = JSON.parse(text); } catch { throw new GmgnError(`${method} ${subPath}: HTTP ${res.status}, not JSON`, { status: res.status }); }
    if (j.code !== 0) throw new GmgnError(`${method} ${subPath}: HTTP ${res.status} code=${j.code} ${j.error || ""} ${j.message || ""}`.trim(), { status: res.status, apiError: j.error, apiCode: j.code });
    return j.data;
  }
  tokenSecurity(address) { return this.#send("GET", "/v1/token/security", { chain: "sol", address }, null, false); }
  tokenInfo(address) { return this.#send("GET", "/v1/token/info", { chain: "sol", address }, null, false); }
  quote({ from, input, output, amount, slippage }) { return this.#send("GET", "/v1/trade/quote", { chain: "sol", from_address: from, input_token: input, output_token: output, input_amount: String(amount), slippage }, null, false); }
  swap(params) { return this.#send("POST", "/v1/trade/swap", {}, { chain: "sol", ...params }, true); }
  order(orderId) { return this.#send("GET", "/v1/trade/query_order", { order_id: orderId, chain: "sol" }, null, true); }
  userInfo() { return this.#send("GET", "/v1/user/info", {}, null, false); }
}
