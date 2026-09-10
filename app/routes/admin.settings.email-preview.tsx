/**
 * Renders one of the customer emails as HTML, for the Preview buttons in
 * Settings → Notifications. Uses the real templates with example values, so
 * what he sees is what a customer gets.
 */
import type { Route } from "./+types/admin.settings.email-preview";
import { requireUser } from "~/lib/auth.server";
import { resolveAdminStore } from "~/lib/admin.server";
import { previewEmail } from "~/lib/email.server";

export async function loader({ context, request }: Route.LoaderArgs) {
  await requireUser(context.db, request);
  const url = new URL(request.url);
  const { store } = await resolveAdminStore(context.db, url);
  if (!store) return new Response("No store.", { status: 404 });

  const kind = url.searchParams.get("kind") || "confirmation";
  const html = previewEmail(kind, { storeName: store.name, currency: store.currency });
  return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8" } });
}
