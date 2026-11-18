// The one piece of the page that needs Solana's own library: turning the unsigned transaction the Aquarius server built
// into the object Phantom's documented signAndSendTransaction() takes (docs.phantom.com/solana/sending-a-transaction and
// .../sending-a-transaction-1, read 2026-11-18). Loaded only when a Phantom action is confirmed. It never talks to a network.
import { VersionedTransaction, Transaction } from "@solana/web3.js";
export function toTransaction(b64) {
  const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  const nsig = bytes[0]; if (!(nsig >= 1 && nsig < 0x80)) throw new Error("unexpected transaction");
  return bytes[1 + 64 * nsig] & 0x80 ? VersionedTransaction.deserialize(bytes) : Transaction.from(bytes);
}
