/**
 * Enrolling a browser for push, and the list of the ones already enrolled.
 *
 * This is a resource route: the Notifications settings card talks to it with
 * fetch, because subscribing has to happen in the browser (the push service
 * hands the keys to the page, not to us) and only the result comes back here.
 */
import { and, eq, inArray } from "drizzle-orm";
import type { LoaderFunctionArgs, ActionFunctionArgs } from "react-router";
import { requireUser } from "~/lib/auth.server";
import { pushSubscriptions } from "~/db/schema";
import { sendPush } from "~/lib/push.server";

export async function loader({ context, request }: LoaderFunctionArgs) {
  const user = await requireUser(context.db, request);
  const devices = await context.db
    .select({
      id: pushSubscriptions.id,
      label: pushSubscriptions.label,
      endpoint: pushSubscriptions.endpoint,
      createdAt: pushSubscriptions.createdAt,
    })
    .from(pushSubscriptions)
    .where(eq(pushSubscriptions.userId, user.id));

  return {
    // Public by design — it is the key the browser needs to subscribe.
    publicKey: context.cloudflare.env.VAPID_PUBLIC_KEY ?? "",
    devices: devices.map((d: { id: string; label: string | null; endpoint: string; createdAt: Date }) => ({
      id: d.id,
      label: d.label ?? "This browser",
      since: d.createdAt.toISOString(),
      // enough of the endpoint for the browser to recognise its own, never
      // enough to push to
      endpointTail: d.endpoint.slice(-24),
    })),
  };
}

export async function action({ context, request }: ActionFunctionArgs) {
  const user = await requireUser(context.db, request);
  const form = await request.formData();
  const intent = String(form.get("intent") ?? "");

  if (intent === "subscribe") {
    const endpoint = String(form.get("endpoint") ?? "");
    const p256dh = String(form.get("p256dh") ?? "");
    const auth = String(form.get("auth") ?? "");
    if (!endpoint || !p256dh || !auth) {
      return Response.json({ ok: false, error: "The browser did not return a subscription." }, { status: 400 });
    }
    // A device that re-enrols has a new endpoint; its old row would only ever
    // answer 410 from now on, so it goes before the new one is written.
    const label = String(form.get("label") ?? "").slice(0, 60) || null;
    if (label) {
      await context.db
        .delete(pushSubscriptions)
        .where(and(eq(pushSubscriptions.userId, user.id), eq(pushSubscriptions.label, label)));
    }
    // The endpoint already identifies the browser, so re-enrolling the same
    // one updates its keys rather than leaving a second row that will fail.
    await context.db
      .insert(pushSubscriptions)
      .values({
        userId: user.id,
        endpoint,
        p256dh,
        auth,
        label,
      })
      .onConflictDoUpdate({
        target: pushSubscriptions.endpoint,
        set: { userId: user.id, p256dh, auth },
      });
    return Response.json({ ok: true });
  }

  if (intent === "remove") {
    const id = String(form.get("id") ?? "");
    await context.db
      .delete(pushSubscriptions)
      .where(and(eq(pushSubscriptions.id, id), eq(pushSubscriptions.userId, user.id)));
    return Response.json({ ok: true });
  }

  if (intent === "test") {
    const rows = await context.db
      .select({
        id: pushSubscriptions.id,
        label: pushSubscriptions.label,
        endpoint: pushSubscriptions.endpoint,
        p256dh: pushSubscriptions.p256dh,
        auth: pushSubscriptions.auth,
      })
      .from(pushSubscriptions)
      .where(eq(pushSubscriptions.userId, user.id));
    if (rows.length === 0) return Response.json({ ok: false, error: "No device is enrolled yet." }, { status: 400 });

    const results = await Promise.all(
      rows.map(async (row: { id: string; label: string | null; endpoint: string; p256dh: string; auth: string }) => ({
        row,
        status: await sendPush(context.cloudflare.env, row, {
          title: "Test notification",
          body: "This is what a sale will sound like.",
          url: "/admin/orders",
          tag: `test-${Date.now()}`,
        }).catch(() => 0),
      })),
    );

    // 404 and 410 are the push service saying this browser threw the
    // subscription away. The row is useless from here on: delete it and say
    // which device has to be enabled again.
    const dead = results.filter((r) => r.status === 404 || r.status === 410);
    if (dead.length) {
      await context.db.delete(pushSubscriptions).where(
        inArray(
          pushSubscriptions.id,
          dead.map((r) => r.row.id),
        ),
      );
    }
    const delivered = results.filter((r) => r.status >= 200 && r.status < 300).length;
    const deadNames = dead.map((r) => r.row.label ?? "a device").join(", ");
    return Response.json({
      ok: delivered > 0,
      delivered,
      total: rows.length,
      error: delivered
        ? undefined
        : dead.length
          ? `${deadNames}: the browser dropped its subscription (${dead[0]!.status}). Press Enable on this device again.`
          : `Push service answered ${results.map((r) => r.status).join(", ")}`,
    });
  }

  return Response.json({ ok: false, error: "Unknown intent" }, { status: 400 });
}
