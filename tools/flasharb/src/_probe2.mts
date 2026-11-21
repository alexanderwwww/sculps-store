import { createSolanaRpc, address } from '@solana/kit';
import { KaminoMarket, DEFAULT_RECENT_SLOT_DURATION_MS } from '@kamino-finance/klend-sdk';
const rpc = createSolanaRpc('https://api.mainnet-beta.solana.com');
const m = await KaminoMarket.load(rpc as any, address('7u3HeHxYDLhnCoErrtycNokbQYbWGzLs6JSDqGAv5PfF'), DEFAULT_RECENT_SLOT_DURATION_MS);
const f = m!.getFloatRateReserveBySymbol('USDC'); console.log('float USDC', f?.address);
for (const r of m!.getReservesBySymbol('USDC')) console.log(r.address, JSON.stringify((r as any).state.config.reserveKind ?? (r as any).reserveKind ?? 'n/a'));
