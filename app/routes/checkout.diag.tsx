/**
 * Where the checkout says what went wrong in the browser.
 *
 * Deliberately tiny and deliberately silent: it answers 204 whatever happens,
 * because a diagnostic that can fail loudly is a diagnostic that can break a
 * checkout. Reached with sendBeacon, so it costs the page nothing.
 */
import type { ActionFunctionArgs } from "react-router";
import { clientEvents } from "~/db/schema";
import { resolveStore } from "~/lib/store.server";

export async function action({ context, request }: ActionFunctionArgs) {
  try {
    const url = new URL(request.url);
    const store = await resolveStore(context.db, context.hostname, url);
    const form = await request.formData();
    await context.db.insert(clientEvents).values({
      storeId: store?.id ?? null,
      kind: String(form.get("kind") ?? "unknown").slice(0, 80),
      detail: String(form.get("detail") ?? "").slice(0, 500),
      userAgent: (request.headers.get("user-agent") ?? "").slice(0, 300),
    });
  } catch {
    /* never answer with a problem */
  }
  return new Response(null, { status: 204 });
}
