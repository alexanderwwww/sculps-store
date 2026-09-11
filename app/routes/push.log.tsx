/**
 * The service worker reporting for duty.
 *
 * A push that a browser swallows looks exactly like a push that was never
 * delivered, and from here I cannot see either. So the worker says so itself:
 * one line when it wakes for a push, one when it has drawn the notification,
 * and one if drawing it threw. With that, "I received nothing" becomes a
 * question with an answer.
 */
import type { ActionFunctionArgs } from "react-router";
import { clientEvents } from "~/db/schema";

export async function action({ context, request }: ActionFunctionArgs) {
  try {
    const form = await request.formData();
    await context.db.insert(clientEvents).values({
      storeId: null,
      kind: `push:${String(form.get("kind") ?? "unknown").slice(0, 40)}`,
      detail: String(form.get("detail") ?? "").slice(0, 500),
      userAgent: (request.headers.get("user-agent") ?? "").slice(0, 300),
    });
  } catch {
    /* a diagnostic must never be the thing that breaks */
  }
  return new Response(null, { status: 204 });
}
