/**
 * Everything below the hero.
 *
 * Two contracts hold across every section here.
 *
 * Nothing is parked at opacity:0. A section arrives with `data-in` already set
 * by the server; the reveal effect only takes it off and puts it back so the
 * transition can run. If the script never runs, or an observer never fires,
 * the page is still whole — which is the failure the brief calls out by name.
 *
 * A card with no image renders nothing rather than an empty frame. The
 * reference build filtered on a nested property, matched nothing, and drew
 * every card including the blank ones.
 */
import { useEffect, useRef, useState } from "react";
import {
  ASTRA, BOX, FAQ, FILMS, FILM_FOOTNOTE, GALLERY, IPHONE_KEY,
  REELS, SECURITY, SPECS, TRACK, UPDATES, VIBES, VISUALS,
} from "./copy";

/* ------------------------------------------------------------------ reveal */

/**
 * Adds the class that plays a section in when it comes on screen.
 *
 * Starts on. An element that is already visible cannot be hidden by a failed
 * observer, and that is the whole point.
 */
function useReveal<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    if (
      typeof IntersectionObserver === "undefined" ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) return;
    node.dataset.in = "";
    const io = new IntersectionObserver(
      ([e]) => { if (e.isIntersecting) { node.dataset.in = "1"; io.disconnect(); } },
      { threshold: 0.12 },
    );
    io.observe(node);
    // If nothing has said we are on screen within a second and a half, show it
    // anyway. Inside an editor preview that signal may never come at all.
    const failsafe = setTimeout(() => { node.dataset.in = "1"; io.disconnect(); }, 1500);
    return () => { io.disconnect(); clearTimeout(failsafe); };
  }, []);
  return ref;
}

function Section({ id, className = "", children }: { id?: string; className?: string; children: React.ReactNode }) {
  const ref = useReveal<HTMLElement>();
  return (
    <section id={id} ref={ref} data-in="1" className={`x-sec xero-night ${className}`}>
      {children}
    </section>
  );
}

/* ----------------------------------------------------------------- gallery */

export function Gallery() {
  const shots = GALLERY.shots.filter(Boolean);
  if (!shots.length) return null;
  return (
    <Section className="x-gal">
      <h2 className="x-h2">{GALLERY.heading}</h2>
      <div className="x-gal__grid">
        {shots.map((src, i) => (
          <figure key={src} className={i === 0 ? "x-gal__big" : ""}>
            <img src={src} alt="" loading="lazy" decoding="async" />
          </figure>
        ))}
      </div>
    </Section>
  );
}

/* -------------------------------------------------------------- iphone key */

export function IPhoneKey() {
  return (
    <Section id="key" className="x-key">
      <p className="x-kick">{IPHONE_KEY.eyebrow}</p>
      <h2 className="x-h2">{IPHONE_KEY.heading}</h2>
      <p className="x-lede">{IPHONE_KEY.sub}</p>
      <ol className="x-steps">
        {IPHONE_KEY.steps.map((s, i) => (
          <li key={s.title}>
            {s.image ? (
              <figure><img src={s.image} alt="" loading="lazy" decoding="async" /></figure>
            ) : null}
            <span className="x-steps__n">{String(i + 1).padStart(2, "0")}</span>
            <h3>{s.title}</h3>
            <p>{s.body}</p>
          </li>
        ))}
      </ol>
      <p className="x-payoff">{IPHONE_KEY.payoff}</p>
      <a className="x-btn x-btn--inline" href={IPHONE_KEY.cta.href}>{IPHONE_KEY.cta.label}</a>
      {/* Mandatory wherever iPhone is named as a feature. */}
      <p className="x-legal">{IPHONE_KEY.disclaimer}</p>
    </Section>
  );
}

/* -------------------------------------------------------------------- reel */

/** A vertical clip that starts when it is on screen, muted, tap to unmute. */
function Clip({ src, poster, className = "" }: { src: string; poster?: string; className?: string }) {
  const video = useRef<HTMLVideoElement>(null);
  const [muted, setMuted] = useState(true);
  useEffect(() => {
    const v = video.current;
    if (!v || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(
      ([e]) => { if (e.isIntersecting) v.play().catch(() => undefined); else v.pause(); },
      { threshold: 0.4 },
    );
    io.observe(v);
    return () => io.disconnect();
  }, []);
  return (
    <div className={`x-clip ${className}`}>
      <video
        ref={video}
        src={src}
        poster={poster}
        muted={muted}
        loop
        playsInline
        preload="none"
        onClick={() => setMuted((m) => !m)}
      />
      <button type="button" className="x-clip__sound" onClick={() => setMuted((m) => !m)}>
        {muted ? "Tap for sound" : "Mute"}
      </button>
    </div>
  );
}

export function Reel({ index }: { index: 0 | 1 }) {
  const r = REELS[index];
  if (!r?.video) return null;
  return (
    <Section className="x-reel">
      <div className="x-reel__words">
        <p className="x-kick">{r.kicker}</p>
        <h2 className="x-h2">{r.heading}</h2>
        <p className="x-lede">{r.sub}</p>
        <p className="x-legal">{FILM_FOOTNOTE}</p>
      </div>
      <Clip src={r.video} poster={r.poster} />
    </Section>
  );
}

/* ------------------------------------------------------------------- specs */

/** Counts a number up when the panel arrives. The final value is the initial
 *  render, so a reader with no script sees the figure, not a zero. */
function Counter({ value }: { value: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const node = ref.current;
    if (!node || typeof IntersectionObserver === "undefined") return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const target = Number(value.replace(/,/g, ""));
    if (!Number.isFinite(target)) return;
    const decimals = (value.split(".")[1] ?? "").length;
    const io = new IntersectionObserver(([e]) => {
      if (!e.isIntersecting) return;
      io.disconnect();
      const t0 = performance.now();
      const tick = (now: number) => {
        const p = Math.min(1, (now - t0) / 900);
        const eased = 1 - Math.pow(1 - p, 3);
        node.textContent = (target * eased).toLocaleString("en-US", {
          minimumFractionDigits: decimals, maximumFractionDigits: decimals,
        });
        if (p < 1) requestAnimationFrame(tick); else node.textContent = value;
      };
      requestAnimationFrame(tick);
    }, { threshold: 0.4 });
    io.observe(node);
    return () => io.disconnect();
  }, [value]);
  return <span ref={ref}>{value}</span>;
}

export function Specs() {
  return (
    <Section id="specs" className="x-specs">
      <p className="x-kick">{SPECS.kicker}</p>
      <h2 className="x-h2">{SPECS.heading}</h2>
      <p className="x-lede">{SPECS.sub}</p>
      <div className="x-specs__grid">
        {SPECS.groups.map((g) => (
          <div key={g.name} className="x-specs__grp">
            <h3>{g.name}</h3>
            <dl>
              {g.rows.map((r) => (
                <div key={r.label}>
                  <dt>{r.label}</dt>
                  <dd><Counter value={r.value} />{r.unit ? <i> {r.unit}</i> : null}</dd>
                </div>
              ))}
            </dl>
          </div>
        ))}
      </div>
      <p className="x-legal">{SPECS.footnote}</p>
    </Section>
  );
}

/* --------------------------------------------------------------------- box */

export function Box() {
  const shots = BOX.images.filter(Boolean);
  return (
    <Section className="x-box">
      <p className="x-kick">{BOX.kicker}</p>
      <h2 className="x-h2">{BOX.heading}</h2>
      <p className="x-lede">{BOX.sub}</p>
      {shots.length ? (
        <div className="x-box__row">
          {shots.map((src) => (
            <figure key={src}><img src={src} alt="" loading="lazy" decoding="async" /></figure>
          ))}
        </div>
      ) : null}
      <div className="x-card">
        {BOX.card.image ? (
          <figure><img src={BOX.card.image} alt="" loading="lazy" decoding="async" /></figure>
        ) : null}
        <div>
          <h3>{BOX.card.heading}</h3>
          <p>{BOX.card.body}</p>
          <a className="x-btn x-btn--inline" href={BOX.card.cta.href}>{BOX.card.cta.label}</a>
        </div>
      </div>
    </Section>
  );
}

/* ------------------------------------------------------------------- astra */

export function Astra() {
  return (
    <Section className="x-astra">
      <h2 className="x-h2">{ASTRA.heading}</h2>
      {ASTRA.image ? <figure className="x-astra__shot"><img src={ASTRA.image} alt="" loading="lazy" /></figure> : null}
      <div className="x-astra__stats">
        {ASTRA.stats.map((s) => (
          <div key={s.label}><strong>{s.value}</strong><span>{s.label}</span></div>
        ))}
      </div>
    </Section>
  );
}

/* ------------------------------------------------------------------- vibes */

export function Vibes() {
  const shots = VIBES.shots.filter((s) => s.image);
  if (!shots.length) return null;
  return (
    <Section className="x-vibes">
      <h2 className="x-h2">{VIBES.heading}</h2>
      <div className="x-vibes__row">
        {shots.map((s) => (
          <figure key={s.image}>
            <img src={s.image} alt="" loading="lazy" decoding="async" />
            <figcaption>{s.caption}</figcaption>
          </figure>
        ))}
      </div>
    </Section>
  );
}

/* --------------------------------------------------------------------- faq */

export function Faq() {
  return (
    <Section id="faq" className="x-faq">
      <h2 className="x-h2">{FAQ.heading}</h2>
      <div className="x-faq__row">
        <div className="x-faq__list">
          {FAQ.rows.map(([q, a]) => (
            <details key={q}>
              <summary>{q}</summary>
              <p>{a}</p>
            </details>
          ))}
        </div>
        {FAQ.video ? <Clip src={FAQ.video} poster={FAQ.poster} className="x-faq__clip" /> : null}
      </div>
    </Section>
  );
}

/* -------------------------------------------------------------------- film */

export function Film({ index }: { index: 0 | 1 }) {
  const f = FILMS[index];
  if (!f?.video) return null;
  return (
    <section className="x-film xero-night">
      <Clip src={f.video} poster={f.poster} className="x-film__clip" />
      <p className="x-legal x-film__note">{FILM_FOOTNOTE}</p>
    </section>
  );
}

/* ---------------------------------------------------------------- security */

export function Security() {
  return (
    <Section className="x-sek">
      <p className="x-kick">{SECURITY.kicker}</p>
      <h2 className="x-h2">{SECURITY.heading}</h2>
      <p className="x-lede">{SECURITY.sub}</p>
      <div className="x-sek__locks">
        {SECURITY.locks.map((l) => (
          <div key={l.title}><h3>{l.title}</h3><p>{l.body}</p></div>
        ))}
      </div>
      <div className="x-sek__find">
        <h3>{SECURITY.findMy.heading}</h3>
        <p>{SECURITY.findMy.body}</p>
      </div>
      <p className="x-payoff">{SECURITY.payoff}</p>
    </Section>
  );
}

/* ---------------------------------------------------------------- visuals */

export function Visuals() {
  const shots = VISUALS_SHOTS();
  const [dot, setDot] = useState(0);
  const rail = useRef<HTMLDivElement>(null);
  if (!shots.length) return null;
  return (
    <Section className="x-vis">
      <p className="x-kick">{VISUALS.kicker}</p>
      <h2 className="x-h2">{VISUALS.heading}</h2>
      {/* Required label: these are renders, and must never read as owner photos. */}
      <p className="x-lede">{VISUALS.sub}</p>
      <div
        className="x-vis__rail"
        ref={rail}
        onScroll={(e) => {
          const el = e.currentTarget;
          setDot(Math.round((el.scrollLeft / Math.max(1, el.scrollWidth - el.clientWidth)) * (shots.length - 1)));
        }}
      >
        {shots.map((src) => (
          <figure key={src}><img src={src} alt="" loading="lazy" decoding="async" /></figure>
        ))}
      </div>
      <div className="x-vis__dots" aria-hidden="true">
        {shots.map((src, i) => <i key={src} className={i === dot ? "is-on" : ""} />)}
      </div>
    </Section>
  );
}
/** Only cards that actually have a picture. An empty frame is a bug, not a slot. */
function VISUALS_SHOTS() { return VISUALS.shots.filter(Boolean); }

/* ----------------------------------------------------------------- updates */

export function Updates() {
  return (
    <Section className="x-upd">
      <p className="x-kick">{UPDATES.kicker}</p>
      <h2 className="x-h2">{UPDATES.heading}</h2>
      <p className="x-lede">{UPDATES.body}</p>
    </Section>
  );
}

/* ------------------------------------------------------------------- track */

export function Track() {
  const [id, setId] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  // Nothing is seeded here. There is no roster of invented riders to look up,
  // so the only honest answer to an unknown ID is that we have no record of it.
  const ok = /^XR-[A-Z0-9]{4}-[A-Z0-9]{4}$/i.test(id.trim());
  return (
    <Section id="track" className="x-trk">
      <p className="x-kick">{TRACK.eyebrow}</p>
      <h2 className="x-h2">{TRACK.heading}</h2>
      <ul className="x-trk__feats">
        {TRACK.features.map((f) => <li key={f}>{f}</li>)}
      </ul>
      <form
        className="x-trk__form"
        onSubmit={(e) => {
          e.preventDefault();
          setMsg(ok ? "No build is registered against that ID yet." : "That is not a XERO ID. It reads XR-XXXX-XXXX.");
        }}
      >
        <input
          value={id}
          onChange={(e) => setId(e.currentTarget.value)}
          placeholder="XR-XXXX-XXXX"
          aria-label="Client ID"
          spellCheck={false}
        />
        <button type="submit" className="x-btn">{TRACK.cta}</button>
      </form>
      <p className="x-legal">{msg ?? TRACK.hint}</p>
    </Section>
  );
}
