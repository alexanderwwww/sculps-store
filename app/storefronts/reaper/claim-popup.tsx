/**
 * "CLAIM 50% OFF" — Black Reaper's one pop-up (Alex, 2026-10-19).
 *
 * It replaced the "$31 off" email box, which on the Ghost Projector page was
 * advertising a code the projector cannot use. This one sells the bundle the
 * visitor is already looking at: pressing claim picks that bundle, and the
 * price drops in front of them -- full price, struck through, counted down to
 * the real price, a stamp, a burst -- then it goes in the cart.
 *
 * Every number on it is read from the variant: compare-at is the "before",
 * price is the "after", the difference is the saving. Nothing is invented,
 * so a price change in the admin changes the pop-up with it.
 */
import { useEffect, useRef, useState } from "react";

const KEY = "br_claim50";
const MONTH = 30 * 24 * 60 * 60 * 1000;
const AFTER_MS = 6_000;

export interface ClaimBundle {
  id: string;
  label: string;
  priceCents: number;
  compareAtCents: number;
}

const usd = (c: number) => `$${(c / 100).toFixed(2)}`;

function seen(): boolean {
  try {
    const raw = window.localStorage.getItem(KEY);
    return Boolean(raw && Date.now() - Number(raw) < MONTH);
  } catch {
    return false;
  }
}
function remember() {
  try { window.localStorage.setItem(KEY, String(Date.now())); } catch { /* fine */ }
}

/** The bundle a claim lands on: the page's default if it is discounted, else the biggest saving. */
export function claimBundleFor(
  variants: { id: string; label: string; priceCents: number; compareAtCents: number | null; isDefault: boolean }[],
): ClaimBundle | null {
  const off = variants.filter((v) => v.compareAtCents != null && v.compareAtCents > v.priceCents);
  if (!off.length) return null;
  const pick =
    off.find((v) => v.isDefault) ??
    off.slice().sort((a, b) => (b.compareAtCents! - b.priceCents) - (a.compareAtCents! - a.priceCents))[0]!;
  return { id: pick.id, label: pick.label, priceCents: pick.priceCents, compareAtCents: pick.compareAtCents! };
}

const BITS = Array.from({ length: 22 }, (_, i) => i);

export function ClaimFiftyPopup({
  bundle,
  photo,
  productName,
  onPick,
  onAdd,
}: {
  bundle: ClaimBundle;
  photo: string | null;
  productName: string;
  onPick: (variantId: string) => void;
  onAdd: (variantId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [stage, setStage] = useState<"ask" | "drop" | "won">("ask");
  const [shown, setShown] = useState(bundle.compareAtCents);
  const raf = useRef(0);
  const saved = bundle.compareAtCents - bundle.priceCents;

  useEffect(() => {
    if (seen()) return;
    if (/\/(checkout|thanks)/.test(window.location.pathname)) return;
    // ?claim=1 opens it straight away (used to check it; harmless for anyone else).
    const now = new URLSearchParams(window.location.search).get("claim") === "1";
    const t = window.setTimeout(() => setOpen(true), now ? 300 : AFTER_MS);
    return () => window.clearTimeout(t);
  }, []);

  useEffect(() => () => cancelAnimationFrame(raf.current), []);

  function close() {
    remember();
    setOpen(false);
  }

  function claim() {
    if (stage !== "ask") return;
    remember();
    onPick(bundle.id);
    setStage("drop");
    // The strike lands first (CSS, 350ms), then the number runs down.
    const from = bundle.compareAtCents;
    const to = bundle.priceCents;
    const start = performance.now() + 380;
    const dur = 1150;
    const tick = (now: number) => {
      const k = Math.min(1, Math.max(0, (now - start) / dur));
      const e = 1 - Math.pow(1 - k, 3);
      setShown(Math.round(from - (from - to) * e));
      if (k < 1) raf.current = requestAnimationFrame(tick);
      else {
        setShown(to);
        setStage("won");
        try { navigator.vibrate?.(40); } catch { /* fine */ }
        window.setTimeout(() => {
          setOpen(false);
          onAdd(bundle.id);
        }, 2100);
      }
    };
    raf.current = requestAnimationFrame(tick);
  }

  if (!open) return null;

  return (
    <>
      <div className="c50__veil" onClick={stage === "ask" ? close : undefined} aria-hidden="true" />
      <aside className={`c50 is-${stage}`} role="dialog" aria-label="Claim 50% off">
        {stage === "ask" ? (
          <button className="c50__x" onClick={close} aria-label="Close">×</button>
        ) : null}
        {photo ? (
          <span className="c50__shot" aria-hidden="true"><img src={photo} alt="" /></span>
        ) : null}
        <div className="c50__in">
          <span className="c50__kick">{productName} · {bundle.label}</span>
          <b className="c50__h">CLAIM <em>50% OFF</em></b>
          <span className="c50__kick">ON YOUR SECOND ONE</span>

          <div className="c50__price" aria-live="polite">
            <span className="c50__was">
              {usd(bundle.compareAtCents)}
              <i className="c50__strike" aria-hidden="true" />
            </span>
            <span className="c50__now">{usd(stage === "ask" ? bundle.compareAtCents : shown)}</span>
          </div>

          {stage === "won" ? (
            <div className="c50__stamp" role="status">
              <b>YOU SAVED {usd(saved)}</b>
              <span>2ND ONE 50% OFF · CLAIMED</span>
            </div>
          ) : (
            <button className="c50__go" onClick={claim} disabled={stage !== "ask"}>
              {stage === "ask" ? "CLAIM 50% OFF" : "Claiming…"}
            </button>
          )}
          {stage === "ask" ? (
            <button className="c50__no" onClick={close}>No thanks</button>
          ) : (
            <span className="c50__note">{stage === "won" ? "Added to your cart" : " "}</span>
          )}
        </div>
        {stage === "won" ? (
          <span className="c50__burst" aria-hidden="true">
            {BITS.map((i) => (
              <i key={i} style={{ ["--a" as string]: `${(i * 360) / BITS.length}deg`, ["--d" as string]: `${90 + ((i * 37) % 70)}px` }} />
            ))}
          </span>
        ) : null}
      </aside>
    </>
  );
}
