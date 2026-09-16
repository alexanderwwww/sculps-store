/**
 * The phone thread: the questions people ask, answered the way a friend
 * answers them, with the photograph as the answer.
 *
 * One component, two themes. The markup is identical and the class prefix is
 * a prop, so Ceiling Buddy keeps its `cb-chat` styling and Garden Buddy gets
 * `gb-chat` in its own palette — no logic living in two files, drifting.
 */
import { useEffect, useRef, useState } from "react";
import type { LoadedSection } from "~/lib/store.server";

const has = (values: Record<string, string>, ...keys: string[]) =>
  keys.every((key) => (values[key] ?? "").trim().length > 0);
const val = (values: Record<string, string>, key: string) => (values[key] ?? "").trim();

export function PhoneChat({
  blocks,
  email,
  brand,
  logo,
  prefix,
}: {
  blocks: LoadedSection["blocks"];
  email: string | null;
  /** The name in the contact header. */
  brand: string;
  /** The avatar beside every reply. */
  logo: string;
  /** Class prefix, so each theme styles the same markup its own way. */
  prefix: string;
}) {
  const c = (name: string) => `${prefix}-chat${name}`;
  // How many messages have landed. Two per exchange: theirs, then ours.
  const total = blocks.length * 2;

  // The server renders the whole thread, so it is in the HTML for a reader with
  // no JavaScript and for a crawler. The browser's first render has to match
  // that markup exactly or React throws away the whole tree and rebuilds it —
  // which cost us working buttons. So the thread starts full here too, and the
  // effect below empties it and plays it back once hydration is done.
  const [shown, setShown] = useState(total);
  const [typing, setTyping] = useState(false);
  const thread = useRef<HTMLDivElement | null>(null);
  const body = useRef<HTMLDivElement | null>(null);

  // The card is a fixed height now, so a message arriving below the fold would
  // never be seen. Follow it down — but only the card, never the page.
  // Follow the thread down when a message lands — but not while the dots are
  // showing, and never once the reader has scrolled up to re-read something.
  // Being yanked back to a typing indicator is the annoying part.
  const stick = useRef(true);
  const onScroll = () => {
    const el = body.current;
    if (!el) return;
    stick.current = el.scrollHeight - el.clientHeight - el.scrollTop < 48;
  };
  useEffect(() => {
    const el = body.current;
    if (!el || shown === 0 || !stick.current) return;
    const overflow = el.scrollHeight - el.clientHeight;
    if (overflow <= 0) return;
    el.scrollTo({ top: overflow, behavior: shown <= 1 ? "auto" : "smooth" });
  }, [shown]);

  useEffect(() => {
    const node = thread.current;
    if (!node) return;
    // Anyone who has asked for less motion, or whose browser has no observer to
    // start the thread with, keeps the finished conversation.
    if (
      window.matchMedia("(prefers-reduced-motion: reduce)").matches ||
      typeof IntersectionObserver === "undefined"
    ) {
      return;
    }
    setShown(0);

    // One scheduler, one timer handle, one cancelled flag. The earlier version
    // chained timeouts and kept its own counter, which meant a second run of
    // this effect — a remount, a fast scroll away and back — could leave an
    // orphaned chain still calling setState against a stale count. Nothing here
    // survives cleanup.
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const wait = (ms: number, then: () => void) => {
      timer = setTimeout(() => { if (!cancelled) then(); }, ms);
    };

    const play = (step: number) => {
      if (cancelled || step >= total) { setTyping(false); return; }
      const ours = step % 2 === 1;
      if (ours) {
        setTyping(true);
        // Longer replies take longer to type, within reason. A fixed pause on
        // a two-line answer reads as a loading spinner rather than a person.
        const block = blocks[(step - 1) / 2];
        const words = (block?.values.answer ?? "").length;
        const sendsPhoto = Boolean((block?.values.image ?? "").trim());
        wait(Math.min(1600, 600 + words * 8 + (sendsPhoto ? 350 : 0)), () => {
          setTyping(false);
          setShown(step + 1);
          wait(480, () => play(step + 1));
        });
      } else {
        setShown(step + 1);
        wait(700, () => play(step + 1));
      }
    };

    let started = false;
    const begin = () => {
      if (started || cancelled) return;
      started = true;
      io.disconnect();
      clearTimeout(failsafe);
      wait(350, () => play(0));
    };

    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) begin();
      },
      // A third of the phone showing is enough to have started reading it.
      { threshold: 0.33 },
    );
    io.observe(node);

    /**
     * Play anyway if nothing has told us we are on screen.
     *
     * The thread is emptied the moment this effect runs and only refills once
     * the observer says it is visible. Inside the theme editor's preview
     * iframe that callback may never come — and the result is a phone-shaped
     * black rectangle with nothing in it, which is exactly what it looked
     * like. Two and a half seconds is long enough for a real scroll to have
     * fired first, and short enough that a stuck one is never seen.
     */
    const failsafe = setTimeout(begin, 2_500);

    return () => {
      cancelled = true;
      io.disconnect();
      clearTimeout(failsafe);
      clearTimeout(timer);
    };
  }, [total, blocks]);

  // Times run backwards from "now" so the thread always reads as last night.
  const at = (i: number) => {
    const start = 23 * 60 + 4;
    const m = (start + i * 3) % (24 * 60);
    const h = Math.floor(m / 60);
    return `${((h + 11) % 12) + 1}:${String(m % 60).padStart(2, "0")} ${h < 12 ? "am" : "pm"}`;
  };

  return (
    <div className={c("")} id="faq" ref={thread}>
      {/* The status bar and the contact header, so the frame reads as the
          phone someone actually asked this on rather than a widget. */}
      <div className={c("__status")}>
        <span>9:41</span>
        <span className={c("__icons")}>
          <svg viewBox="0 0 18 12" aria-hidden="true"><rect x="0" y="7" width="3" height="5" rx="1" /><rect x="5" y="5" width="3" height="7" rx="1" /><rect x="10" y="2.5" width="3" height="9.5" rx="1" /><rect x="15" y="0" width="3" height="12" rx="1" /></svg>
          <svg viewBox="0 0 16 12" aria-hidden="true"><path d="M8 10.6l2.2-2.3a3.1 3.1 0 0 0-4.4 0zM8 6.2a5.9 5.9 0 0 1 4.2 1.8l1.6-1.7a8.2 8.2 0 0 0-11.6 0l1.6 1.7A5.9 5.9 0 0 1 8 6.2z" /></svg>
          <svg viewBox="0 0 26 12" aria-hidden="true"><rect x="0.5" y="0.5" width="21" height="11" rx="3.2" fill="none" stroke="currentColor" opacity=".45" /><rect x="2" y="2" width="16" height="8" rx="2" /><path d="M23 4v4a2 2 0 0 0 0-4z" opacity=".45" /></svg>
        </span>
      </div>

      <div className={c("__head")}>
        <img className={`${c("__av")} ${c("__av--lg")}`} src={logo} alt="" />
        <div className={c("__name")}>{brand}</div>
      </div>

      <div className={c("__body")} ref={body} onScroll={onScroll}>
      <div className={c("__day")}>Last night <b>11:04 PM</b></div>

      {blocks.map((b, i) => {
        const askedYet = shown > i * 2;
        const answered = shown > i * 2 + 1;
        if (!askedYet) return null;
        return (
        <div className={c("__pair")} key={b.id}>
          <p className={c("__q")} data-in="">
            {val(b.values, "question")}
          </p>
          {answered ? (
          <div className={c("__a")} data-in="">
            <img className={c("__av")} src={logo} alt="" />
            <div>
              <p>{val(b.values, "answer")}</p>
              {/* The photograph is the answer; the words above it are the nod
                  before it. Sent as its own bubble, the way a picture arrives
                  in a real thread. */}
              {has(b.values, "image") ? (
                <figure className={c("__photo")}>
                  <img src={val(b.values, "image")} alt="" loading="lazy" />
                </figure>
              ) : null}
              <span className={c("__time")}>{at(i)}</span>
            </div>
          </div>
          ) : null}
        </div>
        );
      })}

      {typing ? (
        <div className={c("__typing")} aria-hidden="true">
          <img className={c("__av")} src={logo} alt="" />
          <span><i /><i /><i /></span>
        </div>
      ) : null}

      </div>

      {/* The compose bar. It is not a form — there is nothing to send to — but
          without it the screen is obviously not a phone. */}
      <div className={c("__foot")}>
        <span className={c("__field")}>
          {email ? <a href={`mailto:${email}`}>Ask us anything…</a> : "Ask us anything…"}
        </span>
        <span className={c("__send")} aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M12 19V5M6 11l6-6 6 6" /></svg>
        </span>
      </div>
    </div>
  );
}
