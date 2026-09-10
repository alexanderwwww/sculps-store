/**
 * Orders as CSV.
 *
 * Rule five: orders are permanent and exportable. This is the file that gets
 * handed to a payment processor during a review, so every column that proves
 * an order was real, paid and shipped is in it.
 */
import type { Route } from "./+types/admin.orders.export";
import { requireUser } from "~/lib/auth.server";
import { resolveAdminStore, listOrders } from "~/lib/admin.server";
import type { OrderState } from "~/db/schema";

function cell(value: unknown): string {
  const text = value === null || value === undefined ? "" : String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export async function loader({ context, request }: Route.LoaderArgs) {
  await requireUser(context.db, request);
  const url = new URL(request.url);
  const { store } = await resolveAdminStore(context.db, url);
  if (!store) return new Response("No store.", { status: 404 });

  const state = (url.searchParams.get("state") || "all") as OrderState | "all";
  const ids = url.searchParams.getAll("id");

  // Everything, not a page. A review wants the whole record.
  const { rows } = await listOrders(context.db, { storeId: store.id, state, perPage: 100_000 });
  const chosen = ids.length ? rows.filter((row) => ids.includes(row.order.id)) : rows;

  const header = [
    "Order", "Date", "Status", "Payment status", "Customer", "Email", "Phone",
    "Address 1", "Address 2", "City", "Region", "Postal code", "Country",
    "Items", "Subtotal", "Tax", "Shipping", "Total", "Refunded", "Currency",
    "Payment provider", "Payment reference", "Tracking", "Carrier", "Source", "Campaign", "Note",
  ];

  const lines = chosen.map(({ order, itemSummary }) =>
    [
      order.number,
      new Date(order.createdAt).toISOString(),
      order.state,
      order.paymentStatus,
      order.customerName,
      order.email,
      order.phone,
      order.address1,
      order.address2,
      order.city,
      order.region,
      order.postalCode,
      order.country,
      itemSummary,
      (order.subtotalCents / 100).toFixed(2),
      (order.taxCents / 100).toFixed(2),
      (order.shippingCents / 100).toFixed(2),
      (order.totalCents / 100).toFixed(2),
      (order.refundedCents / 100).toFixed(2),
      order.currency,
      order.paymentProvider,
      order.paymentRef,
      order.tracking,
      order.carrier,
      order.source,
      order.campaign,
      order.note,
    ]
      .map(cell)
      .join(","),
  );

  const filename = `${store.slug}-orders-${new Date().toISOString().slice(0, 10)}.csv`;
  return new Response([header.join(","), ...lines].join("\n"), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
