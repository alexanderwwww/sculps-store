/**
 * The product buy box, built like Vestiaire Collective's: an authentication
 * card, then four full-width buttons (Buy now, Add to bag, Make an offer,
 * Chat). Making an offer or starting a chat needs a signed-in account, so the
 * same dialog signs the buyer in first (email, then a 6-digit code) and then
 * takes the offer. A sticky bar keeps Buy now and Make an offer in reach on
 * phones.
 */
import { useEffect, useRef, useState } from "react";
import { Form, Link } from "react-router";

type Item = {
  variantId: string;
  title: string;
  image: string | null;
  priceCents: number;
  available: number;
  notForSale: boolean;
  currency: string;
};

type Props = {
  item: Item;
  query: string;
  viewerEmail: string | null;
  certImage?: string | null;
  certPdf?: string | null;
};

const money = (cents: number, currency: string) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 0 }).format(cents / 100);

async function post(op: string, fields: Record<string, string>): Promise<{ ok: boolean; reason?: string; offerId?: string; email?: string; signIn?: boolean }> {
  const body = new URLSearchParams(fields);
  try {
    const res = await fetch(`/archive/api/${op}`, { method: "POST", body, credentials: "same-origin", headers: { "content-type": "application/x-www-form-urlencoded" } });
    return await res.json();
  } catch {
    return { ok: false, reason: "Connection problem. Try again." };
  }
}

const ShieldIcon = () => (
  <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M12 3 5 6v5.5c0 4.2 2.8 7.6 7 9.5 4.2-1.9 7-5.3 7-9.5V6z" />
    <path d="m9 12 2.2 2.2L15.5 10" />
  </svg>
);
const ChatIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M20 12a8 8 0 0 1-11.6 7.1L4 20l1-3.9A8 8 0 1 1 20 12z" />
    <path d="M8.5 12h.01M12 12h.01M15.5 12h.01" strokeWidth="2.4" />
  </svg>
);

type Mode = "offer" | "chat";

export default function BuyBox({ item, query, viewerEmail, certImage, certPdf }: Props) {
  const [mode, setMode] = useState<Mode | null>(null);
  const [email, setEmail] = useState(viewerEmail ?? "");
  const [signedIn, setSignedIn] = useState(Boolean(viewerEmail));
  const [codeSent, setCodeSent] = useState(false);
  const [code, setCode] = useState("");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const dialogRef = useRef<HTMLDivElement | null>(null);

  const off = item.available < 1 || item.notForSale;
  const minOffer = Math.ceil(item.priceCents * 0.5);
  const sep = query ? "&" : "?";
  const accountHref = (id?: string) => `/archive/account${query}${id ? `${sep}offer=${id}` : ""}`;

  useEffect(() => {
    if (!mode) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setMode(null);
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [mode]);

  const open = (m: Mode) => {
    setError("");
    setMode(m);
  };

  const sendCode = async () => {
    setBusy(true);
    setError("");
    const r = await post("code", { email });
    setBusy(false);
    if (r.ok) setCodeSent(true);
    else setError(r.reason ?? "Could not send the code.");
  };

  const verify = async (value: string) => {
    setBusy(true);
    setError("");
    const r = await post("verify", { email, code: value });
    setBusy(false);
    if (r.ok) {
      setSignedIn(true);
      setCodeSent(false);
      setCode("");
    } else {
      setError(r.reason ?? "That code is not right.");
      setCode("");
    }
  };

  const submit = async () => {
    setBusy(true);
    setError("");
    const r =
      mode === "offer"
        ? await post("offer", { variantId: item.variantId, amount, note })
        : await post("chat", { variantId: item.variantId, note });
    setBusy(false);
    if (r.ok && r.offerId) {
      window.location.href = accountHref(r.offerId);
    } else if (r.signIn) {
      setSignedIn(false);
    } else if (!r.ok && r.offerId) {
      window.location.href = accountHref(r.offerId);
    } else {
      setError(r.reason ?? "Something went wrong. Try again.");
    }
  };

  const action = (next: boolean) => "/cart/add" + query + (next ? (query ? "&" : "?") + "next=checkout" : "");

  return (
    <>
      <div className="ma-bb-auth">
        <div className="ma-bb-auth-top">
          <span className="ma-bb-shield"><ShieldIcon /></span>
          <strong>Authenticated</strong>
          <Link to={"/archive/certificates" + query} className="ma-bb-info" aria-label="About our certificates">i</Link>
        </div>
        <p>Inspected and authenticated by Mysterious Archive. A printed certificate comes with every order.</p>
        <span className="ma-bb-pill">Included</span>
        {(certImage || certPdf) && (
          <p className="ma-bb-certs">
            {certImage && <a href={certImage} target="_blank" rel="noreferrer">View this piece’s certificate →</a>}
            {certPdf && <a href={certPdf} target="_blank" rel="noreferrer">Certificate (PDF) →</a>}
          </p>
        )}
      </div>

      <p className="ma-bb-pay">Pay in installments with Klarna, or with Cash App Pay, at checkout.</p>

      <div className="ma-bb-actions">
        <Form method="post" action={action(true)}>
          <input type="hidden" name="variantId" value={item.variantId} />
          <button className="ma-bb-btn ma-bb-buy" disabled={off}>{item.notForSale ? "Not for sale" : item.available > 0 ? "Buy now" : "Sold"}</button>
        </Form>
        <Form method="post" action={action(false)}>
          <input type="hidden" name="variantId" value={item.variantId} />
          <button className="ma-bb-btn ma-bb-bag" disabled={off}>Add to bag</button>
        </Form>
        <button type="button" className="ma-bb-btn ma-bb-offer" disabled={off} onClick={() => open("offer")}>Make an offer</button>
        <button type="button" className="ma-bb-btn ma-bb-chat" disabled={item.notForSale} onClick={() => open("chat")}><ChatIcon /> Chat</button>
      </div>

      {!off && (
        <div className="ma-bb-sticky" role="region" aria-label="Buy this piece">
          <div className="ma-bb-sticky-price">{money(item.priceCents, item.currency)}</div>
          <button type="button" className="ma-bb-btn ma-bb-offer" onClick={() => open("offer")}>Make an offer</button>
          <Form method="post" action={action(true)}>
            <input type="hidden" name="variantId" value={item.variantId} />
            <button className="ma-bb-btn ma-bb-buy">Buy now</button>
          </Form>
        </div>
      )}

      {mode && (
        <div className="ma-dlg-back" onMouseDown={(e) => e.target === e.currentTarget && setMode(null)}>
          <div className="ma-dlg" role="dialog" aria-modal="true" aria-label={mode === "offer" ? "Make an offer" : "Chat"} ref={dialogRef}>
            <button type="button" className="ma-dlg-x" onClick={() => setMode(null)} aria-label="Close">×</button>
            <div className="ma-dlg-piece">
              {item.image && <img src={item.image} alt="" />}
              <div>
                <strong>{item.title.replace(/^Chrome Hearts\s*/, "")}</strong>
                <span>Listed at {money(item.priceCents, item.currency)}</span>
              </div>
            </div>

            {!signedIn ? (
              <div className="ma-dlg-body">
                <h2>Sign in to continue</h2>
                <p>Enter your email. We send you a 6-digit code. That is your account.</p>
                {!codeSent ? (
                  <form onSubmit={(e) => { e.preventDefault(); void sendCode(); }}>
                    <input type="email" inputMode="email" autoComplete="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
                    <button className="ma-bb-btn ma-bb-buy" disabled={busy || !email}>{busy ? "Sending…" : "Continue"}</button>
                  </form>
                ) : (
                  <form onSubmit={(e) => { e.preventDefault(); void verify(code); }}>
                    <input
                      className="ma-dlg-code"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      placeholder="6-digit code"
                      maxLength={6}
                      value={code}
                      autoFocus
                      onChange={(e) => {
                        const v = e.target.value.replace(/\D/g, "").slice(0, 6);
                        setCode(v);
                        if (v.length === 6) void verify(v);
                      }}
                    />
                    <p className="ma-dlg-small">Sent to {email}. <button type="button" onClick={() => { setCodeSent(false); setCode(""); }}>Use another email</button></p>
                    <button className="ma-bb-btn ma-bb-buy" disabled={busy || code.length !== 6}>{busy ? "Checking…" : "Sign in"}</button>
                  </form>
                )}
              </div>
            ) : (
              <form className="ma-dlg-body" onSubmit={(e) => { e.preventDefault(); void submit(); }}>
                {mode === "offer" ? (
                  <>
                    <h2>Make an offer</h2>
                    <label>Your offer (USD)
                      <span className="ma-dlg-money"><b>$</b><input inputMode="numeric" placeholder={String(Math.round(minOffer / 100))} value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ""))} required autoFocus /></span>
                    </label>
                    <p className="ma-dlg-small">Offers start at {money(minOffer, item.currency)}. If we accept, you have 6 hours to buy it at your price.</p>
                    <label>Message (optional)
                      <textarea rows={3} maxLength={1500} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Say something about your offer" />
                    </label>
                    <button className="ma-bb-btn ma-bb-buy" disabled={busy || !amount}>{busy ? "Sending…" : "Send offer"}</button>
                  </>
                ) : (
                  <>
                    <h2>Chat with Mysterious Archive</h2>
                    <label>Your message
                      <textarea rows={4} maxLength={1500} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ask about condition, sizing, shipping…" required autoFocus />
                    </label>
                    <button className="ma-bb-btn ma-bb-buy" disabled={busy || !note.trim()}>{busy ? "Sending…" : "Send message"}</button>
                  </>
                )}
                <p className="ma-dlg-small">Signed in as {email || viewerEmail}. <Link to={accountHref()}>Your messages</Link></p>
              </form>
            )}
            {error && <p className="ma-dlg-error" role="alert">{error}</p>}
          </div>
        </div>
      )}
    </>
  );
}
