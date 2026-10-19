/*
 * The live execution interface. The live layer will act through ultracursor
 * in Alex's own Chrome (his separate Phantom wallet, his own clicks approved
 * there). Nothing in this repo holds a key, signs, or sends an order: this is
 * the one place a live order would go, and it refuses.
 *
 *   execute({ side: "buy"|"sell", mint, usd|units, limit, reason }) -> never resolves here
 */
export const LIVE_CONNECTED = false;

export async function execute(order) {
  void order;
  throw new Error("live wallet not connected");
}
