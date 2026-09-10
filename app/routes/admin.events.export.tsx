/** Visitor events as CSV — the raw material behind Live View and Analytics. */
import type { Route } from "./+types/admin.events.export";
import { eq, desc } from "drizzle-orm";
import { requireUser } from "~/lib/auth.server";
import { resolveAdminStore } from "~/lib/admin.server";
import { events } from "~/db/schema";

function cell(value: unknown): string {
  let text = value === null || value === undefined ? "" : String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export async function loader({ context, request }: Route.LoaderArgs) {
  await requireUser(context.db, request);
  const url = new URL(request.url);
  const { store } = await resolveAdminStore(context.db, url);
  if (!store) return new Response("No store.", { status: 404 });

  const rows = await context.db
    .select()
    .from(events)
    .where(eq(events.storeId, store.id))
    .orderBy(desc(events.at))
    .limit(100_000);

  const header = ["At", "Type", "Session", "Path", "City", "Region", "Country", "Lat", "Lon", "Source", "Campaign", "Amount", "Order"];
  const lines = rows.map((row) =>
    [
      new Date(row.at).toLocaleString("en-US", { timeZone: store.timezone, hour12: false }),
      row.type,
      row.sessionId,
      row.path,
      row.city,
      row.region,
      row.country,
      row.lat,
      row.lon,
      row.source,
      row.campaign,
      row.amountCents == null ? "" : (row.amountCents / 100).toFixed(2),
      row.orderId,
    ]
      .map(cell)
      .join(","),
  );

  return new Response([header.join(","), ...lines].join("\n"), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${store.slug}-events-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}
