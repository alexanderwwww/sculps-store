/**
 * Customer messages (Mysterious Archive offers and chats).
 *
 * Alex answers every conversation personally: reply, accept (at the offer or at
 * a counter price) or decline. Nothing here replies on its own.
 */
import { Form, Link, useNavigation } from "react-router";
import type { Route } from "./+types/admin.archive-messages";
import { requireUser } from "~/lib/auth.server";
import { resolveAdminStore } from "~/lib/admin.server";
import { card, Empty } from "~/admin/ui";
import {
  acceptOffer,
  addMessage,
  getThread,
  listThreads,
  markRead,
  rejectOffer,
} from "~/lib/ma-offers.server";
import { OFFER_HOURS, dollars } from "~/lib/ma-shared";

export function meta() {
  return [{ title: "Customer messages — Shop Admin" }];
}

type Status = "pending" | "accepted" | "rejected" | "withdrawn" | "chat";

export async function loader({ context, request }: Route.LoaderArgs) {
  await requireUser(context.db, request);
  const url = new URL(request.url);
  const { store } = await resolveAdminStore(context.db, url);
  if (!store) return { store: null, threads: [], thread: null, now: Date.now() };
  const s = { id: store.id, slug: store.slug, name: store.name, currency: store.currency, contactEmail: store.contactEmail };

  const threads = await listThreads(context.db, s, "all");
  const openId = url.searchParams.get("offer");
  let thread = openId ? await getThread(context.db, s, openId, "all") : null;
  if (thread && thread.offer.ownerUnread) await markRead(context.db, thread.offer.id, "owner").catch(() => undefined);

  return {
    store: { slug: store.slug, name: store.name, domain: store.domain, currency: store.currency },
    now: Date.now(),
    threads: threads.map((t) => ({
      id: t.id,
      email: t.email,
      title: t.title.replace(/^Chrome Hearts\s*/, ""),
      status: t.status as Status,
      amountCents: t.amountCents,
      listCents: t.listCents,
      unread: t.ownerUnread && t.id !== thread?.offer.id,
      last: t.last,
      updatedAt: t.updatedAt.toISOString(),
      expiresAt: t.expiresAt ? t.expiresAt.toISOString() : null,
    })),
    thread: thread
      ? {
          id: thread.offer.id,
          email: thread.offer.email,
          title: thread.title.replace(/^Chrome Hearts\s*/, ""),
          handle: thread.handle,
          image: thread.image,
          status: thread.offer.status as Status,
          amountCents: thread.offer.amountCents,
          listCents: thread.offer.listCents,
          expiresAt: thread.offer.expiresAt ? thread.offer.expiresAt.toISOString() : null,
          purchased: thread.purchased,
          available: thread.available,
          messages: thread.messages,
        }
      : null,
  };
}

export async function action({ context, request }: Route.ActionArgs) {
  await requireUser(context.db, request);
  const url = new URL(request.url);
  const { store } = await resolveAdminStore(context.db, url);
  if (!store) return { ok: false, message: "No store." };
  const s = { id: store.id, slug: store.slug, name: store.name, currency: store.currency, contactEmail: store.contactEmail };
  const env = context.cloudflare.env as Env;
  const form = await request.formData();
  const intent = String(form.get("intent") ?? "");
  const offerId = String(form.get("offerId") ?? "");
  const origin = url.origin;

  const thread = await getThread(context.db, s, offerId, "all");
  if (!thread) return { ok: false, message: "That conversation was not found in this store." };

  if (intent === "reply") {
    const res = await addMessage(context.db, env, s, offerId, "owner", String(form.get("body") ?? ""), origin);
    return res.ok ? { ok: true, message: "Sent." } : { ok: false, message: res.reason ?? "Could not send." };
  }
  if (intent === "accept") {
    const raw = String(form.get("amount") ?? "").replace(/[$,\s]/g, "");
    const dollarsValue = Number(raw);
    if (!raw || !Number.isFinite(dollarsValue) || dollarsValue <= 0) return { ok: false, message: "Enter the price in dollars." };
    const cents = Math.round(dollarsValue * 100);
    if (cents > thread.offer.listCents) return { ok: false, message: `The price cannot be above the list price (${dollars(thread.offer.listCents, store.currency)}).` };
    const res = await acceptOffer(context.db, env, s, offerId, cents, origin);
    return res.ok
      ? { ok: true, message: `${OFFER_HOURS}-hour buy link sent to ${thread.offer.email}.` }
      : { ok: false, message: res.reason ?? "Could not accept." };
  }
  if (intent === "reject") {
    const res = await rejectOffer(context.db, env, s, offerId, origin);
    return res.ok ? { ok: true, message: "Offer declined." } : { ok: false, message: res.reason ?? "Could not decline." };
  }
  return { ok: false, message: "Unknown action." };
}

function ago(iso: string, now: number): string {
  const minutes = Math.max(0, Math.round((now - new Date(iso).getTime()) / 60000));
  if (minutes < 1) return "now";
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours} h`;
  return `${Math.round(hours / 24)} d`;
}

function when(iso: string): string {
  return new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

const CHIP: Record<string, { label: string; bg: string; fg: string }> = {
  pending: { label: "Needs answer", bg: "#fff4d6", fg: "#7a5200" },
  accepted: { label: "Accepted", bg: "#dff5e3", fg: "#17612b" },
  rejected: { label: "Declined", bg: "#f3dcdc", fg: "#8a1f1f" },
  withdrawn: { label: "Withdrawn", bg: "#ececec", fg: "#555" },
  chat: { label: "Chat", bg: "#e6eefb", fg: "#1d4a99" },
};

function Chip({ status, expired }: { status: string; expired?: boolean }) {
  const c = expired ? { label: "Expired", bg: "#ececec", fg: "#555" } : CHIP[status] ?? CHIP.chat;
  return (
    <span style={{ display: "inline-block", padding: "2px 8px", borderRadius: 8, fontSize: 12, fontWeight: 600, background: c.bg, color: c.fg, whiteSpace: "nowrap" }}>
      {c.label}
    </span>
  );
}

export default function ArchiveMessages({ loaderData, actionData }: Route.ComponentProps) {
  const { store, threads, thread, now } = loaderData;
  const navigation = useNavigation();
  const busy = navigation.state !== "idle";

  if (!store) {
    return (
      <div style={{ maxWidth: 640, margin: "40px auto", ...card }}>
        <Empty title="No store yet" help="Create a store first." />
      </div>
    );
  }

  const cur = store.currency;
  const link = (id: string) => `/admin/archive-messages?store=${store.slug}&offer=${id}`;
  const expired = (status: string, expiresAt: string | null) => status === "accepted" && !!expiresAt && new Date(expiresAt).getTime() <= now;

  return (
    <div style={{ maxWidth: 1180, margin: "0 auto", display: "flex", flexDirection: "column", gap: 16 }}>
      <h1 style={{ margin: 0, fontSize: 20, lineHeight: "28px", fontWeight: 650 }}>Customer messages · {store.name}</h1>

      {actionData ? (
        <div
          role="status"
          style={{
            padding: "10px 14px",
            borderRadius: 10,
            fontSize: 14,
            background: actionData.ok ? "#dff5e3" : "#f9dede",
            color: actionData.ok ? "#17612b" : "#8a1f1f",
          }}
        >
          {actionData.message}
        </div>
      ) : null}

      {threads.length === 0 ? (
        <div style={card}>
          <Empty title="No offers or messages yet." help="When a customer makes an offer or starts a chat on a piece, it appears here." />
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "minmax(280px, 380px) 1fr", gap: 16, alignItems: "start" }}>
          {/* conversations */}
          <div style={{ ...card, maxHeight: "78vh", overflowY: "auto" }}>
            {threads.map((t) => {
              const active = thread?.id === t.id;
              return (
                <Link
                  key={t.id}
                  to={link(t.id)}
                  style={{
                    display: "block",
                    padding: "12px 14px",
                    borderBottom: "1px solid var(--border)",
                    textDecoration: "none",
                    color: "inherit",
                    background: active ? "rgba(0,0,0,.05)" : "transparent",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center" }}>
                    <strong style={{ fontSize: 14, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {t.unread ? <span aria-label="Unread" style={{ display: "inline-block", width: 8, height: 8, borderRadius: "50%", background: "#d4202a", marginRight: 6 }} /> : null}
                      {t.email}
                    </strong>
                    <span style={{ fontSize: 12, color: "var(--muted, #777)" }}>{ago(t.updatedAt, now)}</span>
                  </div>
                  <div style={{ fontSize: 13, marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.title}</div>
                  <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 6 }}>
                    <Chip status={t.status} expired={expired(t.status, t.expiresAt)} />
                    {t.status !== "chat" ? (
                      <span style={{ fontSize: 13 }}>
                        <strong>{dollars(t.amountCents, cur)}</strong> <span style={{ color: "var(--muted, #777)" }}>of {dollars(t.listCents, cur)}</span>
                      </span>
                    ) : null}
                  </div>
                  {t.last ? (
                    <div style={{ fontSize: 12, color: "var(--muted, #777)", marginTop: 6, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.last}</div>
                  ) : null}
                </Link>
              );
            })}
          </div>

          {/* open thread */}
          {thread ? (
            <div style={{ ...card, display: "flex", flexDirection: "column" }}>
              <div style={{ display: "flex", gap: 14, padding: 16, borderBottom: "1px solid var(--border)", alignItems: "center", flexWrap: "wrap" }}>
                {thread.image ? (
                  <img src={thread.image} alt="" style={{ width: 72, height: 90, objectFit: "contain", background: "#f5f6f8", borderRadius: 6 }} />
                ) : null}
                <div style={{ flex: 1, minWidth: 220 }}>
                  <a href={`https://${store.domain}/archive/${thread.handle}`} target="_blank" rel="noreferrer" style={{ fontWeight: 650, fontSize: 15 }}>
                    {thread.title}
                  </a>
                  <div style={{ fontSize: 13, marginTop: 4 }}>
                    List {dollars(thread.listCents, cur)}
                    {thread.status !== "chat" ? <> · Offer <strong>{dollars(thread.amountCents, cur)}</strong></> : null}
                  </div>
                  <div style={{ fontSize: 13, marginTop: 2 }}>
                    <a href={`mailto:${thread.email}`}>{thread.email}</a>
                  </div>
                  <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 6, fontSize: 12 }}>
                    <Chip status={thread.status} expired={expired(thread.status, thread.expiresAt)} />
                    {thread.status === "accepted" && thread.expiresAt ? (
                      <span>
                        {thread.purchased
                          ? "Purchased"
                          : expired(thread.status, thread.expiresAt)
                            ? `Expired ${when(thread.expiresAt)}`
                            : `Buy link open until ${when(thread.expiresAt)}`}
                      </span>
                    ) : null}
                    {thread.available < 1 && !thread.purchased ? <span>Piece is no longer in stock</span> : null}
                  </div>
                </div>
              </div>

              <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 10, maxHeight: "50vh", overflowY: "auto", background: "rgba(0,0,0,.02)" }}>
                {thread.messages.map((m) =>
                  m.sender === "system" ? (
                    <div key={m.id} style={{ alignSelf: "center", fontSize: 12, color: "var(--muted, #777)", textAlign: "center" }}>
                      {m.body} · {when(m.createdAt)}
                    </div>
                  ) : (
                    <div
                      key={m.id}
                      style={{
                        alignSelf: m.sender === "owner" ? "flex-end" : "flex-start",
                        maxWidth: "78%",
                        padding: "9px 13px",
                        borderRadius: 14,
                        fontSize: 14,
                        lineHeight: 1.45,
                        whiteSpace: "pre-wrap",
                        wordBreak: "break-word",
                        background: m.sender === "owner" ? "#171717" : "#e9eaec",
                        color: m.sender === "owner" ? "#fff" : "#171717",
                      }}
                    >
                      {m.body}
                      <div style={{ fontSize: 11, opacity: 0.6, marginTop: 4 }}>{when(m.createdAt)}</div>
                    </div>
                  ),
                )}
              </div>

              {thread.status === "pending" || expired(thread.status, thread.expiresAt) ? (
                <Form method="post" style={{ display: "flex", gap: 10, padding: "12px 16px", borderTop: "1px solid var(--border)", alignItems: "center", flexWrap: "wrap" }}>
                  <input type="hidden" name="offerId" value={thread.id} />
                  <label style={{ fontSize: 13 }}>
                    Accept at $
                    <input
                      name="amount"
                      inputMode="decimal"
                      defaultValue={String(thread.amountCents / 100)}
                      aria-label="Price in dollars"
                      style={{ width: 110, marginLeft: 4, padding: "7px 9px", border: "1px solid var(--border)", borderRadius: 8, font: "inherit" }}
                    />
                  </label>
                  <button
                    type="submit"
                    name="intent"
                    value="accept"
                    disabled={busy}
                    style={{ padding: "9px 16px", borderRadius: 8, border: 0, background: "#17612b", color: "#fff", fontWeight: 600, cursor: "pointer" }}
                  >
                    Accept
                  </button>
                  <button
                    type="submit"
                    name="intent"
                    value="reject"
                    disabled={busy}
                    onClick={(e) => {
                      if (!window.confirm("Decline this offer?")) e.preventDefault();
                    }}
                    style={{ padding: "9px 16px", borderRadius: 8, border: "1px solid var(--border)", background: "transparent", fontWeight: 600, cursor: "pointer" }}
                  >
                    Decline
                  </button>
                  <span style={{ fontSize: 12, color: "var(--muted, #777)" }}>
                    Accepting emails the buyer a {OFFER_HOURS}-hour link at this price. A different price is a counter offer.
                  </span>
                </Form>
              ) : null}

              <Form method="post" style={{ display: "flex", gap: 10, padding: "12px 16px", borderTop: "1px solid var(--border)", alignItems: "flex-end" }}>
                <input type="hidden" name="offerId" value={thread.id} />
                <textarea
                  name="body"
                  required
                  maxLength={1500}
                  rows={3}
                  placeholder="Write to the customer"
                  style={{ flex: 1, padding: "9px 11px", border: "1px solid var(--border)", borderRadius: 8, font: "inherit", resize: "vertical" }}
                />
                <button
                  type="submit"
                  name="intent"
                  value="reply"
                  disabled={busy}
                  style={{ padding: "10px 20px", borderRadius: 8, border: 0, background: "#171717", color: "#fff", fontWeight: 600, cursor: "pointer" }}
                >
                  Send
                </button>
              </Form>
            </div>
          ) : (
            <div style={card}>
              <Empty title="Pick a conversation" help="Choose one on the left to read it and answer." />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
