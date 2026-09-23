/**
 * The two things Alex opens his phone for, out of the live board.
 *
 * Shared by the page and its refresh so the shape cannot drift between them —
 * a number that means one thing on load and another ten seconds later is worse
 * than no number.
 */
import type { liveBoard } from "~/lib/admin.server";
import { formatMoney } from "~/lib/money";

type Board = Awaited<ReturnType<typeof liveBoard>>;

export function phoneNumbers(board: Board, currency: string) {
  return {
    live: board.activeVisitors,
    sessions: board.sessionsToday,
    orders: board.ordersToday,
    revenue: formatMoney(board.revenueToday, currency),
    carts: board.activeCarts,
    checkingOut: board.checkingOut,
    purchased: board.purchased,
    // The board already names each place; it is not re-assembled here.
    where: (board.byLocation ?? []).slice(0, 6).map((l) => ({
      place: l.label || "somewhere",
      count: l.count,
    })),
    recent: (board.recent ?? []).slice(0, 12).map((e) => ({
      id: e.id,
      type: e.type,
      place: [e.city, e.country].filter(Boolean).join(", "),
      at: new Date(e.at as unknown as string).getTime(),
    })),
  };
}
