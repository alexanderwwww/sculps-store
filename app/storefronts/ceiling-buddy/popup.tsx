/**
 * The one pop-up on the site.
 *
 * Every rule here exists because the opposite is what makes people hate
 * these things:
 *
 *   It waits. Nothing appears until somebody has been on the page long
 *   enough to be interested, or has moved to leave. A pop-up that lands
 *   before the page has been read is an interruption with nothing behind it.
 *
 *   It asks once. Closing it, or giving an address, is remembered in the
 *   browser for a month. Being asked twice is what turns a small annoyance
 *   into a reason to go somewhere else.
 *
 *   It never blocks the buy button. It is a card in the corner on a desktop
 *   and a sheet at the bottom on a phone, not a sheet of glass over the
 *   product, and Escape or a click outside closes it.
 *
 *   It gives the code straight back. Somebody typing an address into a box
 *   on a product page wants the thing and is looking for a reason. A code
 *   that arrives tomorrow is no reason at all.
 *
 *   It stays away from checkout. Interrupting somebody who is already
 *   paying is the only version of this that can actually cost money.
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
    // Private windows throw on localStorage. Erring towards "asked" means the
    // worst case is nobody sees it, rather than everybody seeing it forever.
    return true;
  }
}

function remember() {
  try {
    window.localStorage.setItem(KEY, String(Date.now()));
  } catch {
    /* nothing to do; the session will simply not remember */
  }
}

export function EmailPopup({
  heading = "Before you go",
  body = "Take the code and it comes off at checkout.",
  storeParam = "",
}: {
  heading?: string;
  body?: string;
  storeParam?: string;
}) {
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<"ask" | "sending" | "done" | "error">("ask");
  const [code, setCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (alreadyAsked()) return;
    // Checkout is somebody in the middle of paying. Nothing interrupts that.
    if (/\/(checkout|thanks)/.test(window.location.pathname)) return;

    let done = false;
    const show = () => {
      if (done) return;
      done = true;
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
      const json = (await res.json()) as { ok: boolean; error: string | null; code: string | null };
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
      <aside className="pp" role="dialog" aria-label={heading}>
        <button className="pp__x" onClick={close} aria-label="Close">×</button>
        {state === "done" ? (
          <div className="pp__done">
            <b>Here it is.</b>
            {code ? (
              <>
                <span className="pp__code">{code}</span>
                <p>Enter it at checkout. It is already on your email too.</p>
              </>
            ) : (
              <p>You are on the list — we will send the next one first.</p>
            )}
            <button className="pp__go" onClick={close}>Back to shopping</button>
          </div>
        ) : (
          <>
            <b className="pp__h">{heading}</b>
            <p className="pp__b">{body}</p>
            <form onSubmit={submit} className="pp__form">
              <input
                ref={input}
                name="email"
                type="email"
                required
                autoComplete="email"
                placeholder="your@email.com"
                className="pp__in"
              />
              <button type="submit" className="pp__go" disabled={state === "sending"}>
                {state === "sending" ? "One moment…" : "Send me the code"}
              </button>
            </form>
            {error ? <p className="pp__err">{error}</p> : null}
            <button className="pp__no" onClick={close}>No thanks</button>
          </>
        )}
      </aside>
    </>
  );
}
