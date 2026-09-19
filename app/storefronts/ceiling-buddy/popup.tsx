/**
 * The one pop-up on the site.
 *
 * Every rule here exists because the opposite is what makes people hate
 * these things:
 *
 *   It says what it is worth. The first version said "take the code", which
 *   is not an offer — it is an errand. It leads with the number now, in
 *   dollars, because a saving somebody can picture is the only reason to
 *   give an address to a shop they have known for twenty seconds.
 *
 *   It shows the thing. A photograph of what they are already looking at
 *   costs nothing and stops the card reading as a generic newsletter box
 *   bolted onto any website.
 *
 *   It waits. Nothing appears until somebody has been on the page long
 *   enough to be interested, or has moved to leave.
 *
 *   It asks once. Closing it, or giving an address, is remembered for a
 *   month. Being asked twice is what turns an annoyance into a reason to
 *   leave.
 *
 *   It never blocks the buy button, and it stays away from checkout —
 *   interrupting somebody who is already paying is the only version of this
 *   that can genuinely cost money.
 */
import { useEffect, useRef, useState } from "react";

const KEY = "kb_popup_seen";
const MONTH = 30 * 24 * 60 * 60 * 1000;
/** Long enough to have read something, short enough to still be reading. */
const AFTER_MS = 22_000;

function alreadyAsked(): boolean {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return false;
    return Date.now() - Number(raw) < MONTH;
  } catch {
    // Private windows throw. Erring towards "asked" means the worst case is
    // nobody sees it, rather than everybody seeing it on every page.
    return true;
  }
}

function remember() {
  try {
    window.localStorage.setItem(KEY, String(Date.now()));
  } catch {
    /* the session simply will not remember */
  }
}

export function EmailPopup({
  storeParam = "",
  offer = null,
  photo = null,
  logo = null,
  productName = null,
}: {
  storeParam?: string;
  /** The shop's live discount, so the card can name the amount up front. */
  offer?: { code: string; kind: string; value: number } | null;
  photo?: string | null;
  logo?: string | null;
  productName?: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<"ask" | "sending" | "done" | "error">("ask");
  const [code, setCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);

  const amount =
    offer && offer.kind === "fixed" && offer.value > 0
      ? `$${(offer.value / 100).toFixed(0)}`
      : null;

  useEffect(() => {
    if (alreadyAsked()) return;
    // Somebody in the middle of paying is not interrupted. Ever.
    if (/\/(checkout|thanks)/.test(window.location.pathname)) return;

    let fired = false;
    const show = () => {
      if (fired) return;
      fired = true;
      setOpen(true);
    };

    const timer = window.setTimeout(show, AFTER_MS);
    // Leaving the top of the window is the desktop tell for "about to go".
    const leave = (e: MouseEvent) => {
      if (e.clientY <= 0) show();
    };
    document.addEventListener("mouseout", leave);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("mouseout", leave);
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    input.current?.focus();
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("keydown", key);
    return () => document.removeEventListener("keydown", key);
  }, [open]);

  function close() {
    remember();
    setOpen(false);
  }

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const email = new FormData(e.currentTarget).get("email");
    setState("sending");
    setError(null);
    try {
      const res = await fetch(`/subscribe${storeParam}`, {
        method: "POST",
        body: new URLSearchParams({ email: String(email ?? "") }),
      });
      const json = (await res.json()) as {
        ok: boolean;
        error: string | null;
        code: string | null;
      };
      if (!json.ok) {
        setError(json.error ?? "That did not work. Try again?");
        setState("error");
        return;
      }
      remember();
      setCode(json.code);
      setState("done");
    } catch {
      setError("No connection. Try again?");
      setState("error");
    }
  }

  if (!open) return null;

  return (
    <>
      <div className="pp__veil" onClick={close} aria-hidden="true" />
      <aside className="pp" role="dialog" aria-label={amount ? `${amount} off` : "Offer"}>
        <button className="pp__x" onClick={close} aria-label="Close">×</button>

        {photo ? (
          <span className="pp__shot" aria-hidden="true">
            <img src={photo} alt="" />
          </span>
        ) : null}

        <div className="pp__in">
          {logo ? <img className="pp__logo" src={logo} alt="" /> : null}
          {state === "done" ? (
            <div className="pp__done">
              <b className="pp__h">It is yours.</b>
              {code ? (
                <>
                  <span className="pp__code">{code}</span>
                  <p className="pp__b">
                    Put it in at checkout{amount ? ` and ${amount} comes straight off` : ""}. It is in
                    your inbox too.
                  </p>
                </>
              ) : (
                <p className="pp__b">You are on the list — we will send the next one first.</p>
              )}
              <button className="pp__go" onClick={close}>
                {productName ? `Back to the ${productName}` : "Back to shopping"}
              </button>
            </div>
          ) : (
            <>
              {amount ? (
                <span className="pp__amount">
                  {amount} <em>off</em>
                </span>
              ) : (
                <b className="pp__h">Before you go</b>
              )}
              <p className="pp__b">
                {amount
                  ? "Drop your email and the code is yours. It comes off at checkout — no minimum, no waiting for it to arrive."
                  : "Leave your email and we will send the code straight back."}
              </p>
              <form onSubmit={submit} className="pp__form">
                <input
                  ref={input}
                  name="email"
                  type="email"
                  required
                  autoComplete="email"
                  placeholder="your@email.com"
                  className="pp__field"
                />
                <button type="submit" className="pp__go" disabled={state === "sending"}>
                  {state === "sending" ? "One moment…" : amount ? `Send me the ${amount} code` : "Send me the code"}
                </button>
              </form>
              {error ? <p className="pp__err">{error}</p> : null}
              <button className="pp__no" onClick={close}>No thanks, I will pay full price</button>
            </>
          )}
        </div>
      </aside>
    </>
  );
}
