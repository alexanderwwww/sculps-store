/**
 * The checkout's own "pay" action, answering in plain JSON.
 *
 * The product page's wallet button places the order through exactly the same
 * code the checkout uses — the same validation, the same re-pricing, the same
 * one-order-per-intent rule — it only needs the answer as JSON rather than as
 * a rendered page. This route is that: nothing of its own.
 */
import type { ActionFunctionArgs } from "react-router";
import { action as checkoutAction } from "./checkout";

export async function action(args: ActionFunctionArgs) {
  const result = await checkoutAction(args as any);
  if (result instanceof Response) return result;
  return Response.json(result);
}
