// Kamino lending: load the main market and its float-rate USDC reserve from chain.
// API references (klend-sdk 14.0.0):
//   KaminoMarket.load(rpc, marketAddress, recentSlotDurationMs, programId?, withReserves?)  dist/classes/market.d.ts:47
//   market.getFloatRateReserveBySymbol(symbol)                                              dist/classes/market.d.ts:226
//   market.getLendingMarketAuthority()                                                       dist/classes/market.d.ts:73
//   reserve.getLiquidityAvailableAmount()  (= state.liquidity.totalAvailableAmount)          src/classes/reserve.ts:506
//   reserve.state.config.fees.flashLoanFeeSf                                                 src/classes/reserve.ts:655
import { address, type Address, type Rpc, type SolanaRpcApi } from '@solana/kit';
import { KaminoMarket, KaminoReserve, DEFAULT_RECENT_SLOT_DURATION_MS, PROGRAM_ID } from '@kamino-finance/klend-sdk';
import { U64_MAX } from './math.ts';

export interface KaminoUsdc {
  market: KaminoMarket;
  reserve: KaminoReserve;
  marketAddress: Address;
  marketName: string;
  marketAuthority: Address;
  programId: Address;
  reserveAddress: Address;
  flashLoanFeeSf: bigint;
  flashLoanFeeRate: number;
  availableLiquidity: bigint; // USDC base units
  flashLoansEnabled: boolean;
}

export async function loadKaminoUsdc(rpc: Rpc<SolanaRpcApi>, marketAddress: string): Promise<KaminoUsdc> {
  const market = await KaminoMarket.load(rpc as any, address(marketAddress), DEFAULT_RECENT_SLOT_DURATION_MS, PROGRAM_ID);
  if (!market) throw new Error(`Kamino market ${marketAddress} not found on chain`);
  const reserve = market.getFloatRateReserveBySymbol('USDC');
  if (!reserve) throw new Error('No float-rate USDC reserve in this Kamino market');
  const sf = BigInt(reserve.state.config.fees.flashLoanFeeSf.toString());
  return {
    market,
    reserve,
    marketAddress: address(marketAddress),
    marketName: market.getName(),
    marketAuthority: await market.getLendingMarketAuthority(),
    programId: PROGRAM_ID,
    reserveAddress: reserve.address,
    flashLoanFeeSf: sf,
    flashLoanFeeRate: Number(reserve.getFlashLoanFee().toString()),
    availableLiquidity: BigInt(reserve.getLiquidityAvailableAmount().floor().toFixed(0)),
    flashLoansEnabled: sf !== U64_MAX,
  };
}
