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

/**
 * The pane of frost you wipe.
 *
 * A scratch card, except the thing being scratched is a frozen window — which
 * is the one metaphor this shop has earned, because the machine under it makes
 * its own ice. Drag a finger across and the glass clears where the finger went.
 *
 * The frost is drawn rather than photographed. A picture would be one fixed
 * size, would need downloading before the card could work, and would show its
 * seams on a wide screen; drawn, it is sharp at any size, weighs nothing, and
 * is a different pane every time — which is what real frost is.
 *
 * It degrades to nothing: no canvas, no pointer, reduced motion, or a browser
 * that cannot read the pixels back — the offer is simply already visible. The
 * discount is never behind a game somebody cannot play.
 */
function Frost({ onClear, label }: { onClear: () => void; label: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const done = useRef(false);
  const drew = useRef(false);

  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const ctx = cv.getContext("2d", { willReadFrequently: true });
    if (!ctx) { onClear(); return; }
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) { onClear(); return; }

    const box = cv.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.max(1, Math.round(box.width * dpr));
    const h = Math.max(1, Math.round(box.height * dpr));
    cv.width = w; cv.height = h;

    // The pane: cold glass, brighter where the light comes through it.
    const sky = ctx.createLinearGradient(0, 0, w, h);
    sky.addColorStop(0, "#EAF4FB");
    sky.addColorStop(0.5, "#CFE9F7");
    sky.addColorStop(1, "#DCEEF9");
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, w, h);

    // Crystals. Short pale strokes fanning out from a handful of seeds, which
    // is roughly how frost actually grows across a window — from points, not
    // evenly. Random every time, so no two cards are the same pane.
    const seeds = 14 + Math.floor(Math.random() * 10);
    ctx.lineCap = "round";
    for (let s = 0; s < seeds; s += 1) {
      const cx = Math.random() * w;
      const cy = Math.random() * h;
      const arms = 5 + Math.floor(Math.random() * 6);
      for (let a = 0; a < arms; a += 1) {
        const ang = (Math.PI * 2 * a) / arms + Math.random() * 0.5;
        const len = (12 + Math.random() * 46) * dpr;
        ctx.strokeStyle = `rgba(255,255,255,${0.25 + Math.random() * 0.5})`;
        ctx.lineWidth = (0.6 + Math.random() * 1.5) * dpr;
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(cx + Math.cos(ang) * len, cy + Math.sin(ang) * len);
        ctx.stroke();
        // a branch off each arm, which is what makes it read as ice and not
        // as a starburst
        const bx = cx + Math.cos(ang) * len * 0.55;
        const by = cy + Math.sin(ang) * len * 0.55;
        ctx.beginPath();
        ctx.moveTo(bx, by);
        ctx.lineTo(bx + Math.cos(ang + 0.9) * len * 0.35, by + Math.sin(ang + 0.9) * len * 0.35);
        ctx.stroke();
      }
    }
    // Breath: soft pale blooms so the pane is not evenly speckled.
    for (let i = 0; i < 26; i += 1) {
      const x = Math.random() * w;
      const y = Math.random() * h;
      const r = (10 + Math.random() * 40) * dpr;
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, "rgba(255,255,255,.5)");
      g.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }

    /** How much glass is clear, sampled on a grid rather than pixel by pixel. */
    function cleared(): number {
      try {
        const data = ctx!.getImageData(0, 0, w, h).data;
        let gone = 0, seen = 0;
        const step = 16 * 4;
        for (let i = 3; i < data.length; i += step) {
          seen += 1;
          if (data[i] < 24) gone += 1;
        }
        return seen ? gone / seen : 0;
      } catch {
        // A tainted canvas cannot be read. Rather than trap the offer behind a
        // measurement that will never arrive, treat any wiping as enough.
        return 1;
      }
    }

    let last: { x: number; y: number } | null = null;
    function wipe(e: PointerEvent) {
      if (done.current) return;
      const r = cv!.getBoundingClientRect();
      const x = (e.clientX - r.left) * dpr;
      const y = (e.clientY - r.top) * dpr;
      ctx!.globalCompositeOperation = "destination-out";
      ctx!.lineCap = "round";
      ctx!.lineJoin = "round";
      ctx!.lineWidth = 34 * dpr;
      ctx!.beginPath();
      if (last) { ctx!.moveTo(last.x, last.y); ctx!.lineTo(x, y); } else { ctx!.moveTo(x, y); ctx!.lineTo(x + 0.1, y); }
      ctx!.stroke();
      ctx!.globalCompositeOperation = "source-over";
      last = { x, y };
      drew.current = true;
      if (cleared() > 0.42) {
        // Past the point where they have obviously got it, the rest melts on
        // its own. Making somebody scrub every corner is the part of a scratch
        // card nobody enjoys.
        done.current = true;
        cv!.classList.add("is-gone");
        window.setTimeout(onClear, 420);
      }
    }
    const down = (e: PointerEvent) => { cv.setPointerCapture?.(e.pointerId); last = null; wipe(e); };
    const move = (e: PointerEvent) => { if (e.buttons || e.pointerType === "touch") wipe(e); };
    const up = () => { last = null; };

    cv.addEventListener("pointerdown", down);
    cv.addEventListener("pointermove", move);
    cv.addEventListener("pointerup", up);
    cv.addEventListener("pointercancel", up);
    return () => {
      cv.removeEventListener("pointerdown", down);
      cv.removeEventListener("pointermove", move);
      cv.removeEventListener("pointerup", up);
      cv.removeEventListener("pointercancel", up);
    };
  }, [onClear]);

  return (
    <span className="pp__frost">
      <canvas ref={ref} className="pp__ice" aria-hidden="true" />
      {/* Keyboard and screen readers do not scratch. The button is the same
          door, said plainly, and it is the only thing in here they meet. */}
      <button type="button" className="pp__rub" onClick={onClear}>{label}</button>
    </span>
  );
}

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
  frosted = false,
}: {
  storeParam?: string;
  /** The shop's live discount, so the card can name the amount up front. */
  offer?: { code: string; kind: string; value: number } | null;
  photo?: string | null;
  logo?: string | null;
  productName?: string | null;
  /** Put the offer behind a pane of frost you wipe to read it. */
  frosted?: boolean;
}) {
  const [open, setOpen] = useState(false);
  // Frost only makes sense over a number. With no offer to hide there is
  // nothing to reveal, so the pane never appears.
  const [iced, setIced] = useState(false);
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
    if (frosted && amount) setIced(true);
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
                <span className={`pp__amount${iced ? " pp__amount--iced" : ""}`}>
                  {amount} <em>off</em>
                  {iced ? <Frost onClear={() => setIced(false)} label={`Wipe the glass for ${amount} off`} /> : null}
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
                {/* No autocomplete hint.
                    `autocomplete="email"` tells Safari this is an account
                    being created, which makes it offer Hide My Email — a
                    relay address, on a box whose entire purpose is reaching
                    this person later. Off keeps the keyboard and the
                    validation that `type="email"` gives and drops the chip. */}
                <input
                  ref={input}
                  name="email"
                  type="email"
                  required
                  autoComplete="off"
                  autoCorrect="off"
                  autoCapitalize="off"
                  spellCheck={false}
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
