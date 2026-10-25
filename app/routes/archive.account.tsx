import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useRevalidator } from "react-router";
import { inArray } from "drizzle-orm";
import { products } from "~/db/schema";
import { resolveStore } from "~/lib/store.server";
import { MA_SLUG, getThread, listThreads, markRead, readOwner, readSession } from "~/lib/ma-offers.server";
import { OFFER_HOURS, REPLY_TIME } from "~/lib/ma-shared";
import type { Route } from "./+types/archive.account";
import css from "~/storefronts/mysterious-archive/theme.css?url";

export const links = () => [
  { rel: "stylesheet", href: css },
  { rel: "icon", type: "image/png", href: "/archive-icon.png" },
];
/** The owner's Inbox can be added to the iPhone home screen as an app with the logo icon. */
export const meta = ({ data }: { data?: { owner?: boolean } }) => [
  { title: data?.owner ? "Inbox — Mysterious Archive" : "Messages — Mysterious Archive" },
  ...(data?.owner
    ? [
        { tagName: "link", rel: "manifest", href: "/archive-owner.webmanifest" },
        { tagName: "link", rel: "apple-touch-icon", href: "/archive-app-180.png" },
        { name: "apple-mobile-web-app-capable", content: "yes" },
        { name: "mobile-web-app-capable", content: "yes" },
        { name: "apple-mobile-web-app-title", content: "MA Inbox" },
        { name: "apple-mobile-web-app-status-bar-style", content: "black" },
        { name: "theme-color", content: "#000000" },
      ]
    : [{ tagName: "link", rel: "apple-touch-icon", href: "/archive-icon-180.png" }]),
];

export async function loader({ request, context }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const store = await resolveStore(context.db, context.hostname, url);
  if (!store || store.slug !== MA_SLUG) throw new Response("Not found", { status: 404 });
  const query = url.searchParams.has("store") ? "?store=mysterious-archive" : "";
  const owner = await readOwner(context.db, store.id, request);
  const session = owner ? null : await readSession(context.db, store.id, request);
  if (!owner && !session) return { signedIn: false as const, query, currency: store.currency };
  const scope = owner ? ("all" as const) : { email: session!.email };

  const rows = await listThreads(context.db, store, scope);
  const ids = [...new Set(rows.map((r) => r.productId))];
  const imgs = ids.length
    ? await context.db.select({ id: products.id, images: products.images }).from(products).where(inArray(products.id, ids))
    : [];
  const photo = new Map(imgs.map((p) => [p.id, p.images?.[0]?.url ?? null]));
  const openId = url.searchParams.get("offer");
  const thread = openId ? await getThread(context.db, store, openId, scope) : null;
  if (thread) await markRead(context.db, thread.offer.id, owner ? "owner" : "customer");

  return {
    signedIn: true as const,
    owner,
    email: owner ? "Owner" : session!.email,
    query,
    currency: store.currency,
    openId: thread ? thread.offer.id : null,
    list: rows.map((r) => ({
      id: r.id,
      title: r.title.replace(/^Chrome Hearts\s*/, ""),
      status: r.status,
      amountCents: r.amountCents,
      counterCents: r.counterCents,
      who: r.email,
      unread: (owner ? r.ownerUnread : r.customerUnread) && r.id !== thread?.offer.id,
      last: r.last,
      image: photo.get(r.productId) ?? null,
    })),
    thread: thread
      ? {
          id: thread.offer.id,
          title: thread.title.replace(/^Chrome Hearts\s*/, ""),
          handle: thread.handle,
          image: thread.image,
          status: thread.offer.status,
          listCents: thread.offer.listCents,
          amountCents: thread.offer.amountCents,
          counterCents: thread.offer.counterCents,
          who: thread.offer.email,
          typing: owner && thread.offer.customerTypingAt ? new Date(thread.offer.customerTypingAt).toISOString() : null,
          expiresAt: thread.offer.expiresAt ? new Date(thread.offer.expiresAt).toISOString() : null,
          available: thread.available,
          purchased: thread.purchased,
          messages: thread.messages,
        }
      : null,
  };
}

type Reply = { ok?: boolean; reason?: string; to?: string };

async function post(op: string, data: Record<string, string>): Promise<Reply> {
  try {
    const res = await fetch("/archive/api/" + op, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(data),
      credentials: "same-origin",
    });
    return (await res.json()) as Reply;
  } catch {
    return { ok: false, reason: "Connection problem. Try again." };
  }
}

const money = (cents: number, currency: string) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 0 }).format(cents / 100);

const STATUS: Record<string, string> = {
  pending: "Pending",
  countered: "Counter offer",
  accepted: "Accepted",
  rejected: "Declined",
  withdrawn: "Withdrawn",
  chat: "Chat",
};

function AppTip() {
  const [show, setShow] = useState(false);
  useEffect(() => {
    const standalone = (navigator as unknown as { standalone?: boolean }).standalone === true || window.matchMedia("(display-mode: standalone)").matches;
    let dismissed = false;
    try { dismissed = localStorage.getItem("ma-app-tip") === "1"; } catch { /* private mode */ }
    setShow(!standalone && !dismissed);
  }, []);
  if (!show) return null;
  return (
    <p className="ma-acct-tip">
      <span>Get the app icon: tap <strong>Share</strong>, then <strong>Add to Home Screen</strong> (Safari) or <strong>Install</strong> (Chrome).</span>
      <button type="button" className="ma-acct-link" onClick={() => { try { localStorage.setItem("ma-app-tip", "1"); } catch { /* ignore */ } setShow(false); }}>Got it</button>
    </p>
  );
}

function left(ms: number): string {
  const mins = Math.max(0, Math.floor(ms / 60000));
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function SignIn() {
  const [step, setStep] = useState<"email" | "code">("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const sendEmail = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    const r = await post("code", { email });
    setBusy(false);
    if (r.ok) setStep("code");
    else setError(r.reason || "Could not send the code.");
  };
  const verify = async (value: string) => {
    if (busy) return;
    setBusy(true);
    setError("");
    const r = await post("verify", { email, code: value });
    if (r.ok) {
      window.location.reload();
      return;
    }
    setBusy(false);
    setCode("");
    setError(r.reason || "That code is not right.");
  };
  const onCode = (v: string) => {
    const digits = v.replace(/\D/g, "").slice(0, 6);
    setCode(digits);
    if (digits.length === 6) void verify(digits);
  };

  return (
    <main className="ma-acct-signin">
      <div className="ma-acct-card">
        <h1>Sign in</h1>
        {step === "email" ? (
          <form onSubmit={sendEmail}>
            <p>Enter your email. We send you a code, no password needed.</p>
            <label>
              Email
              <input type="email" name="email" autoComplete="email" inputMode="email" required autoFocus value={email} onChange={(e) => setEmail(e.target.value)} />
            </label>
            <button className="ma-acct-primary" disabled={busy || !email.includes("@")}>{busy ? "Sending…" : "Continue"}</button>
          </form>
        ) : (
          <div>
            <p>We sent a 6-digit code to <strong>{email}</strong>.</p>
            <label>
              Code
              <input className="ma-acct-code" name="code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} autoFocus value={code} onChange={(e) => onCode(e.target.value)} placeholder="000000" />
            </label>
            <button className="ma-acct-link" type="button" onClick={() => { setStep("email"); setCode(""); setError(""); }}>Use a different email</button>
          </div>
        )}
        {error && <p className="ma-acct-error" role="alert">{error}</p>}
      </div>
    </main>
  );
}

function Thread({ thread, currency, query, owner }: { thread: NonNullable<Extract<Route.ComponentProps["loaderData"], { signedIn: true }>["thread"]>; currency: string; query: string; owner: boolean }) {
  const revalidator = useRevalidator();
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [now, setNow] = useState(() => Date.now());
  const end = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(t);
  }, []);
  useEffect(() => {
    end.current?.scrollIntoView({ block: "end" });
  }, [thread.messages.length, thread.id]);

  // Live chat: pick up new messages and the customer's typing every few seconds while the tab is open.
  useEffect(() => {
    const t = setInterval(() => {
      if (document.visibilityState === "visible") void revalidator.revalidate();
    }, owner ? 3000 : 5000);
    return () => clearInterval(t);
  }, [owner, revalidator]);
  const lastTyping = useRef(0);
  const [counter, setCounter] = useState("");
  const typingNow = owner && thread.typing ? Date.now() - new Date(thread.typing).getTime() < 7000 : false;
  const ownerAct = async (op: string, extra: Record<string, string> = {}) => {
    if (busy) return;
    setBusy(true);
    setError("");
    const r = await post(op, { offerId: thread.id, ...extra });
    setBusy(false);
    if (r.ok) {
      setCounter("");
      void revalidator.revalidate();
    } else setError(r.reason || "That did not work.");
  };
  const expires = thread.expiresAt ? new Date(thread.expiresAt).getTime() : null;
  const expired = thread.status === "accepted" && expires !== null && expires <= now;
  const open = thread.status === "accepted" && !expired && !thread.purchased && thread.available > 0;

  const send = async () => {
    if (busy || !body.trim()) return;
    setBusy(true);
    setError("");
    const r = owner ? await post("owner-reply", { offerId: thread.id, body }) : await post("message", { offerId: thread.id, body });
    setBusy(false);
    if (r.ok) {
      setBody("");
      void revalidator.revalidate();
    } else setError(r.reason || "Could not send.");
  };
  const buy = async () => {
    if (busy) return;
    setBusy(true);
    setError("");
    const r = await post("redeem", { offerId: thread.id });
    if (r.ok && r.to) {
      window.location.href = r.to + query;
      return;
    }
    setBusy(false);
    setError(r.reason || "Could not open checkout.");
  };
  const answerCounter = async (accept: boolean) => {
    if (busy) return;
    setBusy(true);
    setError("");
    const r = await post(accept ? "counter-accept" : "counter-decline", { offerId: thread.id });
    setBusy(false);
    if (r.ok) void revalidator.revalidate();
    else setError(r.reason || "Could not send your answer.");
  };
  const withdraw = async () => {
    if (busy) return;
    setBusy(true);
    const r = await post("withdraw", { offerId: thread.id });
    setBusy(false);
    if (r.ok) void revalidator.revalidate();
    else setError(r.reason || "Could not withdraw.");
  };

  return (
    <section className="ma-acct-thread">
      <Link className="ma-acct-back" to={"/archive/account" + query}>← All messages</Link>
      <div className="ma-acct-head">
        {thread.image && <img src={thread.image} alt="" />}
        <div>
          <Link to={`/archive/${thread.handle}${query}`}><strong>{thread.title}</strong></Link>
          <p>
            {owner && <>{thread.who} · </>}List price {money(thread.listCents, currency)}
            {thread.amountCents > 0 && <> · {owner ? "Offer" : "Your offer"} {money(thread.amountCents, currency)}</>}
            {thread.counterCents ? <> · Counter {money(thread.counterCents, currency)}</> : null}
          </p>
          <span className={`ma-acct-chip is-${thread.status}`}>{STATUS[thread.status] ?? thread.status}</span>
        </div>
      </div>

      {!owner && (thread.status === "pending" || thread.status === "chat") && (
        <p className="ma-acct-wait">
          {thread.status === "pending" ? "Offer sent. Waiting for an answer from Mysterious Archive." : "Write to Mysterious Archive here. Your messages stay in this chat."}
          {REPLY_TIME ? ` ${REPLY_TIME}` : ""}
        </p>
      )}
      <div className="ma-acct-msgs">
        {thread.messages.map((m) => (
          <div key={m.id} className={`ma-acct-msg is-${owner ? (m.sender === "owner" ? "customer" : m.sender === "customer" ? "owner" : m.sender) : m.sender}`}>
            <p>{m.body}</p>
            <small>{new Date(m.createdAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</small>
          </div>
        ))}
        {typingNow && <div className="ma-acct-msg is-owner ma-acct-typing" aria-live="polite"><p><i /><i /><i /></p></div>}
        <div ref={end} />
      </div>

      {owner ? (
        (thread.status === "pending" || thread.status === "countered" || expired) ? (
          <div className="ma-acct-owner">
            <button className="ma-acct-primary" onClick={() => ownerAct("owner-accept")} disabled={busy}>{expired ? `Reopen for ${OFFER_HOURS} hours` : `Accept ${money(thread.amountCents, currency)}`}</button>
            <div className="ma-acct-counter">
              <span>$</span>
              <input inputMode="decimal" placeholder={String(Math.round(thread.listCents / 100))} value={counter} onChange={(e) => setCounter(e.target.value.replace(/[^\d.]/g, ""))} aria-label="Counter offer in dollars" />
              <button className="ma-acct-outline" onClick={() => ownerAct("owner-counter", { amount: counter })} disabled={busy || !counter}>Counter offer</button>
            </div>
            <button className="ma-acct-link" type="button" onClick={() => { if (window.confirm("Decline this offer?")) void ownerAct("owner-reject"); }} disabled={busy}>Decline</button>
          </div>
        ) : null
      ) : null}
      {!owner && open && expires !== null && (
        <div className="ma-acct-buy">
          <button className="ma-acct-primary" onClick={buy} disabled={busy}>Buy now at {money(thread.amountCents, currency)}</button>
          <p>Expires in {left(expires - now)} · valid for {OFFER_HOURS} hours, this piece only</p>
          <p>Pay in installments with Klarna, or with Cash App Pay, at checkout.</p>
        </div>
      )}
      {!owner && expired && !thread.purchased && <p className="ma-acct-note">This offer has expired. Message us to reopen it.</p>}
      {thread.status === "accepted" && thread.purchased && <p className="ma-acct-note">Purchased</p>}
      {thread.status === "accepted" && !thread.purchased && thread.available < 1 && <p className="ma-acct-note">This piece has been sold</p>}
      {!owner && thread.status === "countered" && thread.counterCents ? (
        <div className="ma-acct-buy">
          <p style={{ margin: "0 0 10px", textAlign: "center" }}><strong>Counter offer: {money(thread.counterCents, currency)}</strong></p>
          <button className="ma-acct-primary" onClick={() => answerCounter(true)} disabled={busy}>Accept {money(thread.counterCents, currency)}</button>
          <button className="ma-acct-link" style={{ display: "block", margin: "10px auto 0" }} type="button" onClick={() => answerCounter(false)} disabled={busy}>Decline counter offer</button>
        </div>
      ) : null}
      {!owner && thread.status === "pending" && (
        <button className="ma-acct-link" type="button" onClick={withdraw} disabled={busy}>Withdraw offer</button>
      )}

      <form className="ma-acct-composer" onSubmit={(e) => { e.preventDefault(); void send(); }}>
        <textarea
          rows={2}
          maxLength={1500}
          placeholder="Write a message"
          value={body}
          onChange={(e) => {
            setBody(e.target.value);
            if (!owner && e.target.value && Date.now() - lastTyping.current > 3000) {
              lastTyping.current = Date.now();
              void post("typing", { offerId: thread.id });
            }
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void send();
            }
          }}
        />
        <button className="ma-acct-primary" disabled={busy || !body.trim()}>Send</button>
      </form>
      {error && <p className="ma-acct-error" role="alert">{error}</p>}
    </section>
  );
}

export default function Account({ loaderData }: Route.ComponentProps) {
  const { query } = loaderData;
  const [leaving, setLeaving] = useState(false);
  const revalidator = useRevalidator();
  useEffect(() => {
    // Keep the conversation list fresh while the page sits open.
    const t = setInterval(() => {
      if (document.visibilityState === "visible") void revalidator.revalidate();
    }, 15000);
    return () => clearInterval(t);
  }, [revalidator]);
  const signOut = async () => {
    setLeaving(true);
    await post(loaderData.signedIn && loaderData.owner ? "owner-signout" : "signout", {});
    window.location.href = "/archive/account" + query;
  };
  const data = loaderData;
  const listLink = useMemo(
    () => (id: string) => "/archive/account" + (query ? query + "&offer=" : "?offer=") + id,
    [query],
  );

  return (
    <div className="ma">
      <div className="ma-top">A private collection. An independent perspective.</div>
      <header>
        <Link className="ma-logo" to={"/archive" + query}><img src="/archive-logo-script.png" alt="Mysterious Archive" /></Link>
        <div className="ma-header-links">
          <Link to={"/archive/certificates" + query}>Certificates</Link>
          <Link to={"/archive/account" + query}>Messages</Link>
          <Link className="ma-hl-bag" to={"/cart" + query}><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M6 8h12l-1 12H7L6 8z"/><path d="M9 8V6a3 3 0 0 1 6 0v2"/></svg><span>Bag</span></Link>
        </div>
      </header>

      {!data.signedIn ? (
        <SignIn />
      ) : (
        <main className={"ma-acct" + (data.thread ? " ma-acct--thread" : "")}>
          <div className="ma-acct-top">
            <h1>{data.owner ? "Inbox" : "Messages"}</h1>
            <p>{data.owner ? "Owner" : data.email} · <button className="ma-acct-link" type="button" onClick={signOut} disabled={leaving}>Sign out</button></p>
          </div>
          {data.owner && <AppTip />}
          {data.list.length === 0 ? (
            <div className="ma-acct-empty">
              <p>{data.owner ? "No conversations yet. New offers and messages land here." : "No messages yet. Make an offer or start a chat from any piece."}</p>
              {!data.owner && <Link className="ma-acct-primary" to={"/archive" + query}>Browse the archive</Link>}
            </div>
          ) : (
            <div className="ma-acct-grid">
              <ul className="ma-acct-list">
                {data.list.map((c) => (
                  <li key={c.id} className={c.id === data.openId ? "is-open" : ""}>
                    <Link to={listLink(c.id)}>
                      {c.image ? <img src={c.image} alt="" /> : <span className="ma-acct-ph" />}
                      <span className="ma-acct-meta">
                        <strong>{c.title}</strong>
                        {data.owner && <span className="ma-acct-last">{c.who}</span>}
                        <span className="ma-acct-last">{c.last ?? ""}</span>
                        <span className={`ma-acct-chip is-${c.status}`}>
                          {STATUS[c.status] ?? c.status}
                          {c.amountCents > 0 ? ` · ${money(c.amountCents, data.currency)}` : ""}
                        </span>
                      </span>
                      {c.unread && <i className="ma-acct-dot" aria-label="Unread" />}
                    </Link>
                  </li>
                ))}
              </ul>
              {data.thread ? (
                <Thread key={data.thread.id} thread={data.thread} currency={data.currency} query={query} owner={data.owner} />
              ) : (
                <section className="ma-acct-thread ma-acct-pick"><p>Select a conversation.</p></section>
              )}
            </div>
          )}
        </main>
      )}

      <footer>
        <img className="ma-footer-logo" src="/archive-logo-script.png" alt="Mysterious Archive" />
        <p><Link to={"/archive/certificates" + query}>Authenticity &amp; certificates</Link></p>
        <p>Independent archive of collectible pieces.</p>
        <p>Chrome Hearts is a trademark of its respective owner. Mysterious Archive is an independent reseller.</p>
        <small>© {new Date().getFullYear()} Mysterious Archive</small>
      </footer>
    </div>
  );
}
