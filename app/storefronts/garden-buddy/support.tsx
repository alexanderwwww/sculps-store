/**
 * Support chat and the sticky cart bar.
 *
 * The chat answers from a fixed list of questions and nothing else. It is not
 * a person and it never pretends to be one: the header says so, every answer
 * comes from this file, and anything the list does not cover is handed to the
 * store's real email address. Promising a human and delivering a script is
 * what makes a support widget worse than no support widget.
 *
 * The sticky bar appears once the buy box has scrolled out of view, so the
 * price and the Add are never more than a thumb away on a phone.
 */
import { useEffect, useRef, useState } from "react";
import { formatMoney } from "~/lib/money";
import { useCartDrawer } from "./cart-drawer";

/* --------------------------------------------------------------- the chat */

interface Answer {
  q: string;
  a: string;
}

/** What the chat can answer. The wording is the store's own. */
const ANSWERS: Answer[] = [
  {
    q: "How long does shipping take?",
    a: "Free shipping. It leaves the warehouse in 1–2 business days, and you get a tracking link by email the moment it does.",
  },
  {
    q: "What if it's not for me?",
    a: "Send it back within 30 days and we refund you. No restocking fee, no questions.",
  },
  {
    q: "Is there any assembly?",
    a: "None. Take it out of the box, unfold it, and it's ready to kneel on.",
  },
  {
    q: "How much weight does it hold?",
    a: "The frame is powder-coated steel and the seat holds up to 330 lb (150 kg).",
  },
  {
    q: "Can I pay with PayPal or Apple Pay?",
    a: "Yes — both, plus every major card. You'll see them all on the checkout.",
  },
  {
    q: "Where do you ship from?",
    a: "Orders ship from our warehouse and arrive in plain, unbranded packaging.",
  },
];

type Line = { from: "them" | "you"; text: string };

/** The face from the logo, cropped out of it — not a redrawn lookalike. */
const FACE = "/media/gb-face.png";

export function SupportChat({ email }: { email: string | null }) {
  const [open, setOpen] = useState(false);
  const [lines, setLines] = useState<Line[]>([
    { from: "them", text: "Hi 👋 Pick a question below and I'll answer it straight away." },
  ]);
  const [asked, setAsked] = useState<string[]>([]);
  const endRef = useRef<HTMLDivElement | null>(null);

  // Keep the newest message in view without moving the page behind the panel.
  useEffect(() => {
    if (!open) return;
    endRef.current?.scrollIntoView({ block: "nearest" });
  }, [lines, open]);

  const ask = (item: Answer) => {
    setAsked((was) => [...was, item.q]);
    setLines((was) => [...was, { from: "you", text: item.q }, { from: "them", text: item.a }]);
  };

  const left = ANSWERS.filter((item) => !asked.includes(item.q));

  return (
    <div className="gb-chat">
      {open ? (
        <div className="gb-chat__panel" role="dialog" aria-label="Support">
          <div className="gb-chat__head">
            <img className="gb-chat__face" src={FACE} alt="" width={44} height={44} />
            <span className="gb-chat__title">
              <strong>Garden Buddy help</strong>
              <span>Quick answers, right away</span>
            </span>
            <button type="button" className="gb-chat__x" onClick={() => setOpen(false)} aria-label="Close">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
            </button>
          </div>

          <div className="gb-chat__body">
            {lines.map((line, i) => (
              <div className={`gb-chat__row gb-chat__row--${line.from}`} key={i}>
                {line.from === "them" ? (
                  <img className="gb-chat__pip" src={FACE} alt="" width={28} height={28} loading="lazy" />
                ) : null}
                <p className={`gb-chat__msg gb-chat__msg--${line.from}`}>{line.text}</p>
              </div>
            ))}
            <div ref={endRef} />
          </div>

          <div className="gb-chat__asks">
            {left.length > 0 ? (
              left.map((item) => (
                <button type="button" className="gb-chat__ask" key={item.q} onClick={() => ask(item)}>
                  {item.q}
                </button>
              ))
            ) : (
              <p className="gb-chat__done">
                That's everything I know.{" "}
                {email ? (
                  <>
                    For anything else, email <a href={`mailto:${email}`}>{email}</a> — a person answers.
                  </>
                ) : (
                  "For anything else, use the contact page — a person answers."
                )}
              </p>
            )}
          </div>
        </div>
      ) : null}

      <button
        type="button"
        className="gb-chat__btn"
        onClick={() => setOpen((was) => !was)}
        aria-expanded={open}
        aria-label={open ? "Close support" : "Need help?"}
      >
        {open ? (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
        ) : (
          <>
            <img className="gb-chat__face" src={FACE} alt="" width={36} height={36} />
            <span>Need help?</span>
          </>
        )}
      </button>
    </div>
  );
}

/* --------------------------------------------------------- the sticky cart */

export function StickyCart({
  label,
  priceCents,
  compareAtCents,
  currency,
  variantId,
  /** the element the bar waits for: while it is on screen the bar stays away */
  watch = "#gb-buy",
}: {
  label: string;
  priceCents: number;
  compareAtCents: number | null;
  currency: string;
  variantId: string;
  watch?: string;
}) {
  const drawer = useCartDrawer();
  const [show, setShow] = useState(false);

  useEffect(() => {
    const target = document.querySelector(watch);
    // No buy box to watch — a bar that is always there is just clutter.
    if (!target || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      ([entry]) => setShow(!entry.isIntersecting && entry.boundingClientRect.top < 0),
      { threshold: 0 },
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, [watch]);

  return (
    <div className={`gb-sticky${show ? " gb-sticky--on" : ""}`} aria-hidden={!show}>
      <div className="gb-wrap gb-sticky__in">
        <span className="gb-sticky__body">
          <span className="gb-sticky__name">{label}</span>
          <span className="gb-sticky__price">
            <b>{formatMoney(priceCents, currency)}</b>
            {compareAtCents && compareAtCents > priceCents ? (
              <s>{formatMoney(compareAtCents, currency)}</s>
            ) : null}
          </span>
        </span>
        <button
          type="button"
          className="gb-sticky__add"
          tabIndex={show ? 0 : -1}
          onClick={(event) => {
            if (drawer) {
              drawer.add(variantId, event.currentTarget);
              return;
            }
            // No drawer mounted — the buy box is still the way through.
            document.querySelector(watch)?.scrollIntoView({ behavior: "smooth" });
          }}
        >
          Add to cart
        </button>
      </div>
    </div>
  );
}
