/**
 * The email the pop-up collects, and the code it hands back.
 *
 * Deliberately not a newsletter sign-up. Somebody who types an address into
 * a box on a product page is telling you they want the thing and are looking
 * for a reason, so the only honest trade is a code they can use in the next
 * two minutes — which means the code has to come back in the response, not
 * in an email they will read tomorrow.
 *
 * The address is stored against the store as a customer with marketing
 * consent, which is the same row a checkout would have made, so the recovery
 * emails and the customer list already know what to do with it.
 */
import { data } from "react-router";
import { and, eq } from "drizzle-orm";
import type { Route } from "./+types/subscribe";
import { resolveStore } from "~/lib/store.server";
import { upsertCustomer, looksLikeEmail, normaliseEmail } from "~/lib/customers.server";
import { discounts } from "~/db/schema";
import { readVisitorSession } from "~/lib/visitor.server";

export async function action({ request, context }: Route.ActionArgs) {
  const url = new URL(request.url);
  const store = await resolveStore(context.db, context.hostname, url);
  if (!store) return data({ ok: false, error: "No store here.", code: null }, { status: 404 });

  const form = await request.formData();
  const email = normaliseEmail(String(form.get("email") ?? ""));
  if (!looksLikeEmail(email)) {
    return data({ ok: false, error: "That does not look like an email address.", code: null }, { status: 400 });
  }

  // A pop-up cannot be allowed to invent a discount. It offers whichever
  // code the shop already has switched on, so turning the offer off is one
  // toggle in the admin rather than a deploy.
  // Read before the write, because the card wants to name the amount.
  const [live] = await context.db
    .select()
    .from(discounts)
    .where(and(eq(discounts.storeId, store.id), eq(discounts.active, true)))
    .limit(1);

  const session = readVisitorSession(request);
  await upsertCustomer(context.db, store.id, {
    email,
    consent: true,
    sessionId: session,
  }).catch(() => null);

  // The amount goes back with the code so the card can say what it is worth
  // in dollars. "Take the code" is not an offer; "$20 off" is.
  const offer =
    live && live.kind === "fixed" && Number(live.value) > 0
      ? `$${(Number(live.value) / 100).toFixed(0)}`
      : null;

  return data({ ok: true, error: null, code: live?.code ?? null, offer });
}

/** Nothing to look at: the pop-up posts here and stays where it is. */
export function loader() {
  return new Response("Not here.", { status: 404 });
}
