// SOL balance of the wallet from the public chain: the number the sizer and the halt rule trust.
const ENDPOINTS = ["https://api.mainnet-beta.solana.com", "https://solana-rpc.publicnode.com"];
export async function solBalance(wallet, { fetchImpl = fetch, endpoints = ENDPOINTS } = {}) {
  let last;
  for (const url of endpoints) {
    try {
      const r = await fetchImpl(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "getBalance", params: [wallet, { commitment: "confirmed" }] }), signal: AbortSignal.timeout(8000) });
      const j = await r.json();
      const v = j?.result?.value;
      if (typeof v === "number") return v / 1e9;
      last = new Error(j?.error?.message || "no value");
    } catch (e) { last = e; }
  }
  throw new Error(`could not read the wallet balance: ${last?.message || "unknown"}`);
}
export async function publicIpv4(fetchImpl = fetch) {
  try { return (await (await fetchImpl("https://api.ipify.org", { signal: AbortSignal.timeout(6000) })).text()).trim(); } catch { return null; }
}
