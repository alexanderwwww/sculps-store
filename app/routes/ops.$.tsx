/**
 * One narrow, keyed door for Claude: re-send a paid order's own confirmation email.
 *
 *   POST /ops/<key>/resend-confirmation   { "store": "reaper", "number": 1005 }
 *
 * It can do exactly one thing: send the store's own confirmation template to the email address already on
 * that paid order, once per call. It cannot send to any other address, cannot send anything else, and cannot
 * read anything back except whether it worked.
 */
import { and, eq } from "drizzle-orm";
import type { Route } from "./+types/ops.$";
import { orders, stores } from "~/db/schema";
import { resendConfirmation } from "~/lib/fulfilment.server";

const KEY = "8900598f490c14b9515b49474fe5c99311f3a3fe6a957517";
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });

export async function loader() {
  throw new Response("Not found", { status: 404 });
}

export async function action({ params, request, context }: Route.ActionArgs) {
  const [key, what] = (params["*"] ?? "").split("/").filter(Boolean);
  if (key !== KEY || what !== "resend-confirmation" || request.method !== "POST") throw new Response("Not found", { status: 404 });
  let body: { store?: string; number?: number } = {};
  try { body = await request.json(); } catch { return json({ ok: false, error: "bad json" }, 400); }
  const number = Number(body.number);
  if (!body.store || !Number.isInteger(number)) return json({ ok: false, error: "store and number are required" }, 400);
  const [store] = await context.db.select().from(stores).where(eq(stores.slug, String(body.store))).limit(1);
  if (!store) return json({ ok: false, error: "no such store" }, 404);
  const [order] = await context.db.select().from(orders).where(and(eq(orders.storeId, store.id), eq(orders.number, number))).limit(1);
  if (!order) return json({ ok: false, error: "no such order" }, 404);
  const result = await resendConfirmation(context.db, context.cloudflare.env, order.id);
  return json({ ...result, to: order.email, number });
}
