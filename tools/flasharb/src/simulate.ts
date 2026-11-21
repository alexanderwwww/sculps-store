// simulateTransaction only. Nothing in this project signs or sends a transaction.
import { address, type Address, type Base64EncodedWireTransaction, type Rpc, type SolanaRpcApi } from '@solana/kit';

async function tokenAmounts(rpc: Rpc<SolanaRpcApi>, accts: Address[]): Promise<bigint[]> {
  const { value } = await rpc.getMultipleAccounts(accts, { encoding: 'jsonParsed', commitment: 'processed' }).send();
  return value.map((a: any) => (a?.data?.parsed?.info?.tokenAmount?.amount ? BigInt(a.data.parsed.info.tokenAmount.amount) : 0n));
}

export interface SimResult {
  ok: boolean;
  err: unknown;
  unitsConsumed: number | null;
  logs: string[];
  pre: bigint[];
  post: bigint[];
  delta: bigint[];
  slot: number;
}

export async function simulate(rpc: Rpc<SolanaRpcApi>, wire: Base64EncodedWireTransaction, watch: Address[]): Promise<SimResult> {
  const pre = await tokenAmounts(rpc, watch);
  const res = await rpc
    .simulateTransaction(wire, {
      encoding: 'base64',
      sigVerify: false,
      replaceRecentBlockhash: true,
      commitment: 'processed',
      accounts: { addresses: watch, encoding: 'jsonParsed' },
    } as any)
    .send();
  const v: any = res.value;
  const post: bigint[] = (v.accounts ?? []).map((a: any) =>
    a?.data?.parsed?.info?.tokenAmount?.amount ? BigInt(a.data.parsed.info.tokenAmount.amount) : 0n,
  );
  return {
    ok: v.err === null,
    err: v.err,
    unitsConsumed: v.unitsConsumed != null ? Number(v.unitsConsumed) : null,
    logs: v.logs ?? [],
    pre,
    post,
    delta: post.map((p, i) => p - (pre[i] ?? 0n)),
    slot: Number(res.context.slot),
  };
}

/**
 * Find a funded mainnet wallet (PUBLIC address only) to simulate with when WALLET_PUBKEY is not set.
 * 1) owners of the largest USDC token accounts (getTokenLargestAccounts) that are plain system accounts with SOL;
 * 2) fallback: recent fee payers of the Kamino USDC reserve that hold >= 0.05 SOL.
 */
export async function usdcBalance(rpc: Rpc<SolanaRpcApi>, owner: string, usdcMint: string): Promise<bigint> {
  const { value } = await rpc.getTokenAccountsByOwner(address(owner), { mint: address(usdcMint) }, { encoding: 'jsonParsed' }).send();
  return value.reduce((s: bigint, a: any) => s + BigInt(a.account.data.parsed.info.tokenAmount.amount), 0n);
}

export async function findFundedWallet(
  rpc: Rpc<SolanaRpcApi>,
  usdcMint: string,
  probeAddr: string,
  minUsdc = 0n,
): Promise<{ wallet: string; how: string }> {
  const SYSTEM = '11111111111111111111111111111111';
  const isFunded = async (w: string) => {
    const { value } = await rpc.getAccountInfo(address(w), { encoding: 'base64' }).send();
    return value && value.owner === SYSTEM && BigInt(value.lamports) >= 50_000_000n ? BigInt(value.lamports) : null;
  };
  try {
    const { value } = await rpc.getTokenLargestAccounts(address(usdcMint)).send();
    const { value: infos } = await rpc
      .getMultipleAccounts(value.slice(0, 10).map((v: any) => v.address), { encoding: 'jsonParsed' })
      .send();
    for (const i of infos as any[]) {
      const owner = i?.data?.parsed?.info?.owner;
      if (!owner) continue;
      const lam = await isFunded(owner);
      if (lam && (minUsdc === 0n || (await usdcBalance(rpc, owner, usdcMint)) >= minUsdc)) return { wallet: owner, how: `owner of a top-10 USDC token account (getTokenLargestAccounts), ${Number(lam) / 1e9} SOL` };
    }
  } catch {
    /* public RPC answers 429 to getTokenLargestAccounts; fall through */
  }
  const sigs = await rpc.getSignaturesForAddress(address(probeAddr), { limit: 40 }).send();
  for (const s of sigs) {
    if (s.err) continue;
    // Mainnet now carries v1 transactions; the RPC rejects the lookup unless we accept version 1.
    const tx: any = await rpc
      .getTransaction(s.signature, { maxSupportedTransactionVersion: 1, encoding: 'json' } as any)
      .send()
      .catch(() => null);
    const payer = tx?.transaction?.message?.accountKeys?.[0];
    if (!payer) continue;
    const lam = await isFunded(payer);
    if (!lam) continue;
    const usdc = minUsdc > 0n ? await usdcBalance(rpc, payer, usdcMint) : 0n;
    if (usdc < minUsdc) continue;
    return { wallet: payer, how: `fee payer of recent tx ${s.signature} touching ${probeAddr}, ${Number(lam) / 1e9} SOL, ${Number(usdc) / 1e6} USDC` };
  }
  throw new Error('Could not find a funded wallet from on-chain data');
}
