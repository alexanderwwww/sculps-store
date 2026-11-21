// Builds ONE v0 transaction: compute budget, ATAs, Kamino flashBorrow, swap1, swap2, Kamino flashRepay.
// It is never signed and never sent. The wallet is a NoopSigner over a PUBLIC address.
import {
  address,
  AccountRole,
  appendTransactionMessageInstructions,
  compileTransaction,
  compressTransactionMessageUsingAddressLookupTables,
  createNoopSigner,
  createTransactionMessage,
  fetchAddressesForLookupTables,
  getBase64EncodedWireTransaction,
  getTransactionSize,
  none,
  pipe,
  setTransactionMessageFeePayerSigner,
  setTransactionMessageLifetimeUsingBlockhash,
  type Address,
  type Instruction,
  type Rpc,
  type SolanaRpcApi,
} from '@solana/kit';
import { getSetComputeUnitLimitInstruction, getSetComputeUnitPriceInstruction } from '@solana-program/compute-budget';
import {
  ASSOCIATED_TOKEN_PROGRAM_ADDRESS,
  TOKEN_PROGRAM_ADDRESS,
  findAssociatedTokenPda,
  getCreateAssociatedTokenIdempotentInstruction,
} from '@solana-program/token';
import { getFlashLoanInstructions } from '@kamino-finance/klend-sdk';
import Decimal from 'decimal.js';
import type { JupIx, SwapInstructionsResponse } from './jupiter.ts';
import type { KaminoUsdc } from './kamino.ts';

export const TX_SIZE_LIMIT = 1232; // @solana/transactions LEGACY_TRANSACTION_SIZE_LIMIT (applies to v0 too)

export function jupIxToKit(ix: JupIx): Instruction {
  return {
    programAddress: address(ix.programId),
    accounts: ix.accounts.map((a) => ({
      address: address(a.pubkey),
      role: a.isSigner
        ? a.isWritable
          ? AccountRole.WRITABLE_SIGNER
          : AccountRole.READONLY_SIGNER
        : a.isWritable
          ? AccountRole.WRITABLE
          : AccountRole.READONLY,
    })),
    data: new Uint8Array(Buffer.from(ix.data, 'base64')),
  };
}

/** Byte 16 of Kamino flashRepay data is borrowInstructionIndex (codegen flashRepayReserveLiquidity.ts:18,40-42). */
export function decodeRepayBorrowIndex(data: Uint8Array): number {
  return data[16];
}
export const FLASH_BORROW_DISCRIMINATOR = [135, 231, 52, 167, 7, 52, 212, 193];
export const FLASH_REPAY_DISCRIMINATOR = [185, 117, 0, 203, 96, 245, 180, 186];
export function hasDiscriminator(data: Uint8Array | undefined, d: number[]): boolean {
  return !!data && d.every((b, i) => data[i] === b);
}

/** Drop Jupiter ATA-creation setup instructions for ATAs we already create ourselves. */
export function filterSetup(setup: JupIx[], ourAtas: Set<string>): JupIx[] {
  return setup.filter((ix) => !(ix.programId === ASSOCIATED_TOKEN_PROGRAM_ADDRESS && ourAtas.has(ix.accounts[1]?.pubkey)));
}

export interface AssembleInput {
  pre: Instruction[]; // compute budget + ATAs
  swap1: SwapInstructionsResponse;
  swap2: SwapInstructionsResponse;
  ourAtas: Set<string>;
  makeFlash: (borrowIxIndex: number) => { flashBorrowIx: Instruction; flashRepayIx: Instruction };
}

/** Pure assembly; the borrow index is the real position of flashBorrow in the final list. */
export function assembleInstructions(a: AssembleInput) {
  const borrowIxIndex = a.pre.length;
  const { flashBorrowIx, flashRepayIx } = a.makeFlash(borrowIxIndex);
  const legIxs = (s: SwapInstructionsResponse) => [
    ...filterSetup(s.setupInstructions ?? [], a.ourAtas).map(jupIxToKit),
    jupIxToKit(s.swapInstruction),
    ...(s.cleanupInstruction ? [jupIxToKit(s.cleanupInstruction)] : []),
  ];
  // Jupiter's own computeBudgetInstructions are deliberately NOT included (we set our own; duplicates fail).
  const ixs: Instruction[] = [...a.pre, flashBorrowIx, ...legIxs(a.swap1), ...legIxs(a.swap2), flashRepayIx];
  if (ixs[borrowIxIndex] !== flashBorrowIx) throw new Error('borrow index mismatch');
  const repayIdx = decodeRepayBorrowIndex(flashRepayIx.data as Uint8Array);
  if (repayIdx !== borrowIxIndex) throw new Error(`repay says borrow index ${repayIdx}, real index ${borrowIxIndex}`);
  return { ixs, borrowIxIndex, repayIndex: ixs.length - 1 };
}

export interface BuildInput {
  rpc: Rpc<SolanaRpcApi>;
  kamino: KaminoUsdc;
  wallet: string;
  borrowAmount: bigint;
  xMint: string;
  swap1: SwapInstructionsResponse;
  swap2: SwapInstructionsResponse;
  computeUnitLimit: number;
  computeUnitPriceMicroLamports: number;
  extraLuts?: string[];
}

export async function buildArbTx(b: BuildInput) {
  const walletAddr = address(b.wallet);
  const signer = createNoopSigner(walletAddr);
  const usdcMint = b.kamino.reserve.getLiquidityMint();
  const [usdcAta] = await findAssociatedTokenPda({ owner: walletAddr, mint: usdcMint, tokenProgram: TOKEN_PROGRAM_ADDRESS });
  const [xAta] = await findAssociatedTokenPda({ owner: walletAddr, mint: address(b.xMint), tokenProgram: TOKEN_PROGRAM_ADDRESS });

  const pre: Instruction[] = [
    getSetComputeUnitLimitInstruction({ units: b.computeUnitLimit }),
    getSetComputeUnitPriceInstruction({ microLamports: BigInt(b.computeUnitPriceMicroLamports) }),
    getCreateAssociatedTokenIdempotentInstruction({ payer: signer, ata: usdcAta, owner: walletAddr, mint: usdcMint }),
    getCreateAssociatedTokenIdempotentInstruction({ payer: signer, ata: xAta, owner: walletAddr, mint: address(b.xMint) }),
  ];
  const { ixs, borrowIxIndex, repayIndex } = assembleInstructions({
    pre,
    swap1: b.swap1,
    swap2: b.swap2,
    ourAtas: new Set([usdcAta, xAta]),
    makeFlash: (borrowIxIndex) =>
      getFlashLoanInstructions({
        borrowIxIndex,
        userTransferAuthority: signer,
        lendingMarketAuthority: b.kamino.marketAuthority,
        lendingMarketAddress: b.kamino.marketAddress,
        reserve: b.kamino.reserve,
        amountLamports: new Decimal(b.borrowAmount.toString()),
        destinationAta: usdcAta,
        referrerAccount: none(),
        referrerTokenState: none(),
        programId: b.kamino.programId,
      }) as any,
  });

  const lutAddrs = [
    ...new Set([...(b.swap1.addressLookupTableAddresses ?? []), ...(b.swap2.addressLookupTableAddresses ?? []), ...(b.extraLuts ?? [])]),
  ].map((a) => address(a));
  const luts = lutAddrs.length ? await fetchAddressesForLookupTables(lutAddrs, b.rpc) : {};
  const { value: blockhash } = await b.rpc.getLatestBlockhash({ commitment: 'confirmed' }).send();

  const message = pipe(
    createTransactionMessage({ version: 0 }),
    (m) => setTransactionMessageFeePayerSigner(signer, m),
    (m) => setTransactionMessageLifetimeUsingBlockhash(blockhash, m),
    (m) => appendTransactionMessageInstructions(ixs, m),
    (m) => compressTransactionMessageUsingAddressLookupTables(m, luts),
  );
  const tx = compileTransaction(message as any);
  const size = getTransactionSize(tx);
  return {
    tx,
    wire: getBase64EncodedWireTransaction(tx),
    size,
    fitsSizeLimit: size <= TX_SIZE_LIMIT,
    ixs,
    borrowIxIndex,
    repayIndex,
    usdcAta: usdcAta as Address,
    xAta: xAta as Address,
    lookupTables: lutAddrs,
  };
}
