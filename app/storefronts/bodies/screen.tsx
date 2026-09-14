/**
 * bodies — THE SCREEN.
 *
 * The board's screen, alone and big, with the class UI running inside it in
 * plain HTML and CSS. Four moments (library, class, in class, levels) cycle on
 * a timer with a lime progress line; the tabs above the frame jump between
 * them; hover or focus pauses; reduced-motion switches the timer off and
 * leaves the tabs.
 *
 * Nothing in here is invented: classes, categories, levels and lengths are the
 * programme design from team-copy.md, the categories come from workouts.md,
 * and the only photograph is an existing phone photo, captioned honestly. No
 * instructor names until real ones exist.
 */
import { useEffect, useRef, useState } from "react";

const PHOTO = "/media/bd-a-lilac-top.png";
const PHOTO_ALT = "A customer on the bodies board, lilac colourway, shot on a phone";
const INSTRUCTOR_CAPTION = "Real instructor. Real cues. Not a cartoon, not an AI voice.";

/* The programme design, one array. Edit here, everything follows. */
interface ClassRow { name: string; category: string; level: string; minutes: number; photo: string; }
const CLASSES: ClassRow[] = [
  { name: "First Footwork", category: "Pilates", level: "Beginner", minutes: 20, photo: "/media/bd-a-lilac-top.png" },
  { name: "Bridge & Burn", category: "Glutes", level: "All levels", minutes: 15, photo: "/media/bd-c-matcha-black.png" },
  { name: "Long Arms", category: "Arms", level: "Beginner", minutes: 10, photo: "/media/bd-c-lilac-core.png" },
  { name: "Slow Core", category: "Core", level: "Intermediate", minutes: 20, photo: "/media/bd-d-matcha-stretch.png" },
  { name: "Full Body Flow", category: "Full body", level: "Intermediate", minutes: 30, photo: "/media/bd-c-swan-latina.png" },
  { name: "Sunday Stretch", category: "Recovery", level: "All levels", minutes: 10, photo: "/media/bd-d-bare-rest.png" },
];
/* Next-move slots in the in-class rail: label, length, thumb (reuses library photos). */
const UP_NEXT = [
  { name: "Toe press", time: "1:00", photo: CLASSES[1].photo },
  { name: "Arches", time: "1:00", photo: CLASSES[2].photo },
  { name: "Single leg", time: "2:00", photo: CLASSES[3].photo },
  { name: "Bridging", time: "2:00", photo: CLASSES[4].photo },
];
const FEATURED = CLASSES[0];

/* Three levels, each drawing its classes from the library above. */
const LEVELS = [
  { tag: "L1", name: "Start", line: "Learn the board. Slow, cued, no rush.", classes: CLASSES.filter((c) => c.level === "Beginner").map((c) => c.name), done: 3, of: 8 },
  { tag: "L2", name: "Build", line: "Longer holds, more resistance.", classes: CLASSES.filter((c) => c.level === "Intermediate").map((c) => c.name), done: 1, of: 8 },
  { tag: "L3", name: "Strong", line: "Full sessions, your pace.", classes: CLASSES.filter((c) => c.level === "All levels").map((c) => c.name), done: 0, of: 8 },
];

/* Left navigation from workouts.md ("Screen experience"). */
const NAV = ["Home", "Pilates", "Sculpt", "Strength", "Stretch", "Recovery", "Programs"];
/* In-app tabs from team-copy.md §3. */
const APP_TABS = ["Classes", "Programmes", "For you"];

/* The four moments and their caps labels (team-cd-spec §3). */
const MOMENTS = [
  { key: "library", label: "Library" },
  { key: "class", label: "Class" },
  { key: "inclass", label: "In class" },
  { key: "levels", label: "Levels" },
] as const;

const CYCLE_MS = 4000;

const CSS = `
.bd-scr { background: #fff; color: var(--ink, #0B0C0E); padding-block: clamp(56px, 8vw, 104px); overflow: hidden; }
.bd-scr *, .bd-scr *::before, .bd-scr *::after { box-sizing: border-box; }
.bd-scr__wrap { width: 100%; max-width: 1080px; margin: 0 auto; padding-inline: clamp(16px, 4vw, 40px); }
.bd-scr__head { text-align: center; margin-bottom: clamp(24px, 4vw, 40px); }
.bd-scr__h2 { font-family: var(--sans, Archivo, sans-serif); font-weight: 800; font-stretch: 118%; text-transform: uppercase; margin: 0; font-size: clamp(26px, 3.4vw, 42px); line-height: 1; letter-spacing: -.015em; text-wrap: balance; }
.bd-scr__sub { margin: 12px auto 0; color: var(--ink-2, #4E525B); font-family: var(--body, "Instrument Sans", sans-serif); font-size: 16px; line-height: 1.5; max-width: 60ch; }

/* tabs above the frame */
.bd-scr__tabs { display: flex; gap: 6px; justify-content: flex-start; margin: 0 auto 14px; padding: 0; list-style: none; overflow-x: auto; scrollbar-width: none; -webkit-overflow-scrolling: touch; }
.bd-scr__tabs::-webkit-scrollbar { display: none; }
@media (min-width: 640px) { .bd-scr__tabs { justify-content: center; } }
.bd-scr__tab { flex: 0 0 auto; appearance: none; border: 1.5px solid rgba(11,12,14,.14); background: #fff; color: var(--ink, #0B0C0E); border-radius: 999px; min-height: 36px; padding: 0 16px; font-family: var(--sans, Archivo, sans-serif); font-size: 11px; font-weight: 700; font-stretch: 110%; letter-spacing: .12em; text-transform: uppercase; cursor: pointer; white-space: nowrap; transition: background .16s, border-color .16s; }
.bd-scr__tab:hover { border-color: var(--ink, #0B0C0E); }
.bd-scr__tab[aria-selected="true"] { background: var(--ink, #0B0C0E); color: #fff; border-color: var(--ink, #0B0C0E); }
.bd-scr__tab:focus-visible { outline: 3px solid var(--ink, #0B0C0E); outline-offset: 2px; }

/* the frame */
.bd-scr__stage { position: relative; }
.bd-scr__stage::before { content: ""; position: absolute; left: 50%; top: 50%; width: 120%; height: 120%; transform: translate(-50%, -50%); border-radius: 50%; background: radial-gradient(circle, rgba(217,190,232,.7) 0%, rgba(217,190,232,0) 70%); opacity: .5; pointer-events: none; }
.bd-scr__frame { position: relative; aspect-ratio: 16 / 10; width: 100%; border-radius: 18px; background: #0B0C0E; padding: clamp(6px, 1.1vw, 12px); box-shadow: 0 30px 80px rgba(11,12,14,.22), 0 2px 0 rgba(255,255,255,.06) inset; }
.bd-scr__panel { position: relative; width: 100%; height: 100%; overflow: hidden; border-radius: clamp(8px, 1vw, 10px); background: #121316; color: #fff; font-family: var(--body, "Instrument Sans", sans-serif); font-size: 13px; line-height: 1.35; -webkit-font-smoothing: antialiased; }
.bd-scr__progress { position: absolute; left: 0; right: 0; bottom: 0; height: 3px; background: rgba(255,255,255,.08); z-index: 3; }
.bd-scr__progress i { display: block; height: 100%; width: 100%; background: var(--lime, #C6FF3D); transform-origin: left; transform: scaleX(0); }
.bd-scr__progress i.is-running { animation: bd-scr-fill ${CYCLE_MS}ms linear forwards; }
.bd-scr--paused .bd-scr__progress i.is-running { animation-play-state: paused; }
@keyframes bd-scr-fill { from { transform: scaleX(0); } to { transform: scaleX(1); } }
.bd-scr__hinge { width: 70%; height: 6px; margin: 0 auto; border-radius: 0 0 6px 6px; background: #B78BE0; }
.bd-scr__facts { display: flex; gap: 10px 28px; justify-content: center; flex-wrap: wrap; list-style: none; margin: 26px 0 0; padding: 0; }
.bd-scr__facts li { font-family: var(--sans, Archivo, sans-serif); font-size: 11px; font-weight: 700; letter-spacing: .14em; text-transform: uppercase; color: var(--ink-2, #4E525B); }
.bd-scr__facts li::before { content: ""; display: inline-block; width: 6px; height: 6px; border-radius: 50%; background: var(--lime, #C6FF3D); margin-right: 8px; vertical-align: middle; }

/* moments */
.bd-scr__moment { position: absolute; inset: 0; opacity: 0; transition: opacity .35s; pointer-events: none; }
.bd-scr__moment.is-on { opacity: 1; pointer-events: auto; }
@media (prefers-reduced-motion: reduce) { .bd-scr__moment { transition: none; } .bd-scr__progress i.is-running { animation: none; } }

/* shared UI atoms, inside the screen */
.bd-scr__caps { font-family: var(--sans, Archivo, sans-serif); font-weight: 800; font-stretch: 116%; text-transform: uppercase; letter-spacing: .01em; line-height: 1; }
.bd-scr__eyebrow { font-family: var(--sans, Archivo, sans-serif); font-size: 11px; font-weight: 700; letter-spacing: .16em; text-transform: uppercase; color: rgba(255,255,255,.55); }
.bd-scr__chip { display: inline-flex; align-items: center; min-height: 20px; padding: 0 8px; border-radius: 999px; font-size: 11px; font-weight: 600; letter-spacing: .02em; background: rgba(255,255,255,.1); color: #fff; white-space: nowrap; }
.bd-scr__chip--lilac { background: rgba(183,139,224,.22); color: #D9BEE8; }
.bd-scr__chip--lime { background: rgba(198,255,61,.16); color: var(--lime, #C6FF3D); }
.bd-scr__pill { display: inline-flex; align-items: center; justify-content: center; gap: 6px; min-height: 32px; padding: 0 16px; border-radius: 999px; background: var(--lime, #C6FF3D); color: #0E1600; font-family: var(--sans, Archivo, sans-serif); font-size: 11px; font-weight: 700; letter-spacing: .12em; text-transform: uppercase; }
.bd-scr__pill--ghost { background: transparent; color: #fff; box-shadow: inset 0 0 0 1.5px rgba(255,255,255,.35); }
.bd-scr__meter { height: 4px; border-radius: 999px; background: rgba(255,255,255,.1); overflow: hidden; }
.bd-scr__meter i { display: block; height: 100%; background: var(--lime, #C6FF3D); border-radius: 999px; }
.bd-scr__panel svg { width: 14px; height: 14px; fill: none; stroke: currentColor; stroke-width: 1.6; stroke-linecap: round; stroke-linejoin: round; flex: 0 0 auto; }

/* 1 · library */
.bd-scr__lib { display: grid; grid-template-columns: 22% 1fr; height: 100%; }
.bd-scr__nav { border-right: 1px solid rgba(255,255,255,.08); padding: clamp(10px, 2vw, 22px) clamp(8px, 1.6vw, 18px); display: flex; flex-direction: column; gap: 4px; }
.bd-scr__logo { font-family: var(--sans, Archivo, sans-serif); font-weight: 800; font-stretch: 118%; font-size: 15px; letter-spacing: -.04em; margin-bottom: 14px; }
.bd-scr__nav a { display: flex; align-items: center; gap: 8px; padding: 6px 8px; border-radius: 8px; font-size: 12px; color: rgba(255,255,255,.62); text-decoration: none; }
.bd-scr__nav a.is-on { color: #fff; background: rgba(255,255,255,.06); }
.bd-scr__nav a.is-on::before { content: ""; width: 6px; height: 6px; border-radius: 50%; background: var(--lime, #C6FF3D); }
.bd-scr__main { padding: clamp(10px, 2vw, 22px) clamp(12px, 2.2vw, 26px); display: flex; flex-direction: column; gap: clamp(8px, 1.4vw, 14px); min-width: 0; }
.bd-scr__apptabs { display: flex; gap: 14px; font-size: 12px; color: rgba(255,255,255,.5); }
.bd-scr__apptabs b { color: #fff; font-weight: 600; border-bottom: 2px solid var(--lime, #C6FF3D); padding-bottom: 3px; }
.bd-scr__cont { display: flex; align-items: center; gap: 12px; padding: 8px 12px; border-radius: 10px; background: #1A1B20; border: 1px solid rgba(255,255,255,.06); }
.bd-scr__cont .bd-scr__meter { flex: 1 1 auto; }
.bd-scr__cont small { font-size: 11px; color: rgba(255,255,255,.5); white-space: nowrap; }
.bd-scr__grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: clamp(6px, 1vw, 10px); flex: 1 1 auto; min-height: 0; }
.bd-scr__card { position: relative; display: flex; flex-direction: column; justify-content: space-between; gap: 6px; padding: clamp(8px, 1.2vw, 12px); border-radius: 10px; background: #1A1B20; border: 1px solid rgba(255,255,255,.06); overflow: hidden; min-height: 0; }
.bd-scr__card img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; object-position: center 30%; }
.bd-scr__card::before { content: ""; position: absolute; inset: 0; background: linear-gradient(to top, rgba(11,12,14,.9) 0%, rgba(11,12,14,.45) 45%, rgba(11,12,14,.1) 100%); pointer-events: none; z-index: 1; }
.bd-scr__card > :not(img) { position: relative; z-index: 2; }
.bd-scr__card h4 { margin: 0; font-size: clamp(11px, 1.3vw, 14px); }
.bd-scr__card p { margin: 0; font-size: 11px; color: rgba(255,255,255,.75); }
.bd-scr__card p b { color: #fff; font-weight: 600; }
.bd-scr__card__row { display: flex; align-items: center; justify-content: space-between; gap: 6px; }

/* 2 · class */
.bd-scr__cls { display: grid; grid-template-columns: 46% 1fr; height: 100%; }
.bd-scr__tile { position: relative; margin: 0; overflow: hidden; }
.bd-scr__tile img { width: 100%; height: 100%; object-fit: cover; display: block; }
.bd-scr__tile figcaption { position: absolute; left: 0; right: 0; bottom: 0; padding: clamp(10px, 2vw, 18px); font-size: 11px; color: #fff; background: linear-gradient(to top, rgba(11,12,14,.85), rgba(11,12,14,0)); }
.bd-scr__tile figcaption b { display: block; font-family: var(--sans, Archivo, sans-serif); font-size: 10px; font-weight: 700; letter-spacing: .16em; text-transform: uppercase; color: var(--lime, #C6FF3D); margin-bottom: 4px; }
.bd-scr__detail { padding: clamp(12px, 2.2vw, 28px); display: flex; flex-direction: column; gap: clamp(8px, 1.4vw, 14px); min-width: 0; }
.bd-scr__detail h3 { margin: 0; font-size: clamp(18px, 3vw, 34px); }
.bd-scr__chips { display: flex; gap: 6px; flex-wrap: wrap; }
.bd-scr__need { display: flex; gap: 8px; flex-wrap: wrap; }
.bd-scr__need span { display: inline-flex; align-items: center; gap: 6px; font-size: 11px; color: rgba(255,255,255,.75); padding: 6px 10px; border-radius: 8px; background: #1A1B20; border: 1px solid rgba(255,255,255,.06); }
.bd-scr__detail > p { margin: 0; font-size: 12px; color: rgba(255,255,255,.62); max-width: 40ch; }
.bd-scr__cta { display: flex; gap: 8px; margin-top: auto; flex-wrap: wrap; }

/* 3 · in class */
.bd-scr__live { position: relative; height: 100%; }
.bd-scr__live img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; opacity: .8; }
.bd-scr__live__top { position: absolute; left: 0; right: 0; top: 0; padding: clamp(10px, 1.6vw, 18px) clamp(12px, 2vw, 24px); display: flex; align-items: center; gap: 12px; background: linear-gradient(to bottom, rgba(11,12,14,.75), rgba(11,12,14,0)); }
.bd-scr__live__top .bd-scr__meter { flex: 1 1 auto; background: rgba(255,255,255,.2); }
.bd-scr__live__top time { font-variant-numeric: tabular-nums; font-size: 12px; font-weight: 600; }
.bd-scr__pause { width: 10px; height: 10px; border-radius: 50%; background: var(--lime, #C6FF3D); box-shadow: 0 0 0 4px rgba(198,255,61,.25); }
.bd-scr__live__bot { position: absolute; left: 0; right: 0; bottom: 0; padding: clamp(12px, 2vw, 24px); display: flex; align-items: flex-end; justify-content: space-between; gap: 12px; background: linear-gradient(to top, rgba(11,12,14,.85), rgba(11,12,14,0)); }
.bd-scr__reps { font-family: var(--sans, Archivo, sans-serif); font-weight: 800; font-stretch: 118%; font-size: clamp(30px, 6vw, 68px); line-height: .9; letter-spacing: -.03em; font-variant-numeric: tabular-nums; }
.bd-scr__reps small { font-size: .45em; color: rgba(255,255,255,.6); letter-spacing: 0; }
.bd-scr__cue { display: inline-flex; margin-top: 10px; padding: 7px 12px; border-radius: 999px; background: #fff; color: #0B0C0E; font-family: var(--sans, Archivo, sans-serif); font-size: 11px; font-weight: 800; letter-spacing: .08em; text-transform: uppercase; }
.bd-scr__rail { flex: 0 0 auto; width: clamp(120px, 24%, 200px); padding: 10px 12px; border-radius: 10px; background: rgba(18,19,22,.85); backdrop-filter: blur(6px); border: 1px solid rgba(255,255,255,.08); }
.bd-scr__rail ol { list-style: none; margin: 6px 0 0; padding: 0; display: flex; flex-direction: column; gap: 5px; }
.bd-scr__rail li { display: flex; align-items: center; gap: 8px; font-size: 11px; color: rgba(255,255,255,.7); }
.bd-scr__rail li img { width: 26px; height: 26px; border-radius: 6px; object-fit: cover; flex: 0 0 auto; }
.bd-scr__rail li span { flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.bd-scr__rail li:first-child { color: #fff; font-weight: 600; }
.bd-scr__rail li time { font-variant-numeric: tabular-nums; color: rgba(255,255,255,.5); }

/* 4 · levels */
.bd-scr__lvl { height: 100%; padding: clamp(12px, 2.2vw, 28px); display: flex; flex-direction: column; gap: clamp(8px, 1.4vw, 14px); }
.bd-scr__lvl__head { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; }
.bd-scr__lvl__head h3 { margin: 0; font-size: clamp(16px, 2.4vw, 26px); }
.bd-scr__lvl__rows { display: flex; flex-direction: column; gap: clamp(6px, 1vw, 10px); flex: 1 1 auto; min-height: 0; }
.bd-scr__row { display: grid; grid-template-columns: auto 1fr auto; align-items: center; gap: clamp(10px, 2vw, 22px); padding: clamp(8px, 1.4vw, 14px) clamp(10px, 1.8vw, 18px); border-radius: 10px; background: #1A1B20; border: 1px solid rgba(255,255,255,.06); min-height: 0; }
.bd-scr__row.is-you { border-color: var(--lime, #C6FF3D); box-shadow: 0 0 0 1px var(--lime, #C6FF3D) inset; }
.bd-scr__row__tag { font-family: var(--sans, Archivo, sans-serif); font-weight: 800; font-stretch: 118%; font-size: clamp(16px, 2.4vw, 26px); letter-spacing: -.02em; color: #D9BEE8; }
.bd-scr__row.is-you .bd-scr__row__tag { color: var(--lime, #C6FF3D); }
.bd-scr__row__body { min-width: 0; display: flex; flex-direction: column; gap: 4px; }
.bd-scr__row__body h4 { margin: 0; font-size: clamp(12px, 1.5vw, 15px); }
.bd-scr__row__body p { margin: 0; font-size: 11px; color: rgba(255,255,255,.6); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.bd-scr__row__count { font-size: 11px; color: rgba(255,255,255,.6); white-space: nowrap; font-variant-numeric: tabular-nums; }
.bd-scr__row__count b { color: #fff; font-weight: 600; }
.bd-scr__lvl__foot { display: flex; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
.bd-scr__lvl__foot .bd-scr__caps { font-size: 12px; }

/* phone */
@media (max-width: 640px) {
  .bd-scr__panel { font-size: 12px; }
  .bd-scr__nav { padding: 10px 6px; }
  .bd-scr__nav a { padding: 4px 6px; font-size: 11px; }
  .bd-scr__nav a:nth-child(n+6) { display: none; }
  .bd-scr__logo { font-size: 13px; margin-bottom: 8px; }
  .bd-scr__grid { grid-template-columns: repeat(3, 1fr); gap: 5px; }
  .bd-scr__card { padding: 7px; gap: 3px; }
  .bd-scr__card h4 { font-size: 11px; }
  .bd-scr__card .bd-scr__chip { display: none; }
  .bd-scr__cont { display: none; }
  .bd-scr__apptabs { font-size: 11px; }
  .bd-scr__cls { grid-template-columns: 42% 1fr; }
  .bd-scr__detail > p { display: none; }
  .bd-scr__need span { font-size: 11px; padding: 4px 8px; }
  .bd-scr__pill { min-height: 28px; padding: 0 12px; }
  .bd-scr__tile figcaption { font-size: 11px; padding: 8px; }
  .bd-scr__rail { display: none; }
  .bd-scr__row { gap: 10px; padding: 8px 10px; }
  .bd-scr__row__body p { white-space: normal; overflow: visible; }
  .bd-scr__lvl__foot .bd-scr__caps { font-size: 11px; }
}
`;

/* simple line icons for the kit */
const IcoCable = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12c0-3 2-4 4-4h8c2 0 4 1 4 4s-2 4-4 4H8c-2 0-4-1-4-4Z" /><path d="M8 12h8" /><circle cx="4" cy="12" r="1.5" /><circle cx="20" cy="12" r="1.5" /></svg>
);
const IcoStrap = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 9h14v6H5z" /><path d="M9 9V6h6v3M9 15v3h6v-3" /></svg>
);
const IcoPad = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="8" width="18" height="8" rx="4" /><path d="M7 12h10" /></svg>
);
const IcoPlay = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5l11 7-11 7z" /></svg>
);

export function Screen({ id = "screen" }: { id?: string }) {
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);
  const [reduced, setReduced] = useState(false);
  const [tick, setTick] = useState(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReduced(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  /* one timeout per moment; restarts when the moment changes or pausing ends */
  useEffect(() => {
    if (reduced || paused) return;
    timer.current = setTimeout(() => {
      setActive((a) => (a + 1) % MOMENTS.length);
      setTick((t) => t + 1);
    }, CYCLE_MS);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [active, paused, reduced, tick]);

  const jump = (i: number) => {
    setActive(i);
    setTick((t) => t + 1);
  };

  const running = !reduced;
  const done = LEVELS[0].done;

  return (
    <section id={id} className={`bd-scr${paused ? " bd-scr--paused" : ""}`} aria-labelledby={`${id}-h2`}>
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <div className="bd-scr__wrap">
        <header className="bd-scr__head">
          <h2 id={`${id}-h2`} className="bd-scr__h2">She tells you what to do.</h2>
          <p className="bd-scr__sub">A real instructor on a real screen, built into the board. Press play, follow along.</p>
        </header>

        <div role="tablist" aria-label="Screen moments" className="bd-scr__tabs">
          {MOMENTS.map((m, i) => (
            <button
              key={m.key}
              type="button"
              role="tab"
              id={`${id}-tab-${m.key}`}
              aria-selected={i === active}
              aria-controls={`${id}-m-${m.key}`}
              className="bd-scr__tab"
              onClick={() => jump(i)}
              onFocus={() => setPaused(true)}
              onBlur={() => setPaused(false)}
            >
              {m.label}
            </button>
          ))}
        </div>

        <div
          className="bd-scr__stage"
          onMouseEnter={() => setPaused(true)}
          onMouseLeave={() => setPaused(false)}
        >
          <div className="bd-scr__frame">
            <div className="bd-scr__panel">

              {/* 1 · Library */}
              <div id={`${id}-m-library`} role="tabpanel" aria-labelledby={`${id}-tab-library`} className={`bd-scr__moment${active === 0 ? " is-on" : ""}`} aria-hidden={active !== 0}>
                <div className="bd-scr__lib">
                  <nav className="bd-scr__nav" aria-label="Categories">
                    <div className="bd-scr__logo">bodies</div>
                    {NAV.map((n, i) => (
                      <a key={n} href="#" onClick={(e) => e.preventDefault()} className={i === 0 ? "is-on" : undefined} tabIndex={-1}>{n}</a>
                    ))}
                  </nav>
                  <div className="bd-scr__main">
                    <div className="bd-scr__apptabs">
                      {APP_TABS.map((t, i) => (i === 0 ? <b key={t}>{t}</b> : <span key={t}>{t}</span>))}
                    </div>
                    <div className="bd-scr__cont">
                      <span className="bd-scr__eyebrow">Continue</span>
                      <span style={{ fontWeight: 600 }}>{FEATURED.name}</span>
                      <span className="bd-scr__meter" aria-hidden="true"><i style={{ width: "40%" }} /></span>
                      <small>12 min left</small>
                    </div>
                    <div className="bd-scr__grid">
                      {CLASSES.map((c) => (
                        <article key={c.name} className="bd-scr__card">
                          <img src={c.photo} alt="" aria-hidden="true" loading="lazy" />
                          <div className="bd-scr__card__row">
                            <span className="bd-scr__chip bd-scr__chip--lilac">{c.category}</span>
                          </div>
                          <div>
                            <h4 className="bd-scr__caps">{c.name}</h4>
                            <p><b>{c.minutes} min</b> · {c.level}</p>
                          </div>
                        </article>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              {/* 2 · Class */}
              <div id={`${id}-m-class`} role="tabpanel" aria-labelledby={`${id}-tab-class`} className={`bd-scr__moment${active === 1 ? " is-on" : ""}`} aria-hidden={active !== 1}>
                <div className="bd-scr__cls">
                  <figure className="bd-scr__tile">
                    <img src={PHOTO} alt={PHOTO_ALT} loading="lazy" />
                    <figcaption><b>Your instructor</b>{INSTRUCTOR_CAPTION}</figcaption>
                  </figure>
                  <div className="bd-scr__detail">
                    <span className="bd-scr__eyebrow">{FEATURED.category}</span>
                    <h3 className="bd-scr__caps">{FEATURED.name}</h3>
                    <div className="bd-scr__chips">
                      <span className="bd-scr__chip bd-scr__chip--lime">{FEATURED.minutes} min</span>
                      <span className="bd-scr__chip">{FEATURED.level}</span>
                      <span className="bd-scr__chip">Level 1 · Start</span>
                    </div>
                    <p>Footwork on the board: heels, toes, arches. Slow, cued, every rep counted for you.</p>
                    <div>
                      <div className="bd-scr__eyebrow" style={{ marginBottom: 6 }}>What you'll need</div>
                      <div className="bd-scr__need">
                        <span><IcoCable /> Two cables</span>
                        <span><IcoStrap /> Ankle straps</span>
                        <span><IcoPad /> Both pads</span>
                      </div>
                    </div>
                    <div className="bd-scr__cta">
                      <span className="bd-scr__pill"><IcoPlay /> Start</span>
                      <span className="bd-scr__pill bd-scr__pill--ghost">Add to programme</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* 3 · In class */}
              <div id={`${id}-m-inclass`} role="tabpanel" aria-labelledby={`${id}-tab-inclass`} className={`bd-scr__moment${active === 2 ? " is-on" : ""}`} aria-hidden={active !== 2}>
                <div className="bd-scr__live">
                  <img src={PHOTO} alt="" aria-hidden="true" loading="lazy" />
                  <div className="bd-scr__live__top">
                    <span className="bd-scr__pause" aria-hidden="true" />
                    <span className="bd-scr__caps" style={{ fontSize: 12 }}>{FEATURED.name}</span>
                    <span className="bd-scr__meter" aria-hidden="true"><i style={{ width: "62%" }} /></span>
                    <time>07:42 left</time>
                  </div>
                  <div className="bd-scr__live__bot">
                    <div>
                      <div className="bd-scr__eyebrow">Heel press</div>
                      <div className="bd-scr__reps">8 <small>/ 12</small></div>
                      <div className="bd-scr__cue">Press through the heels</div>
                    </div>
                    <aside className="bd-scr__rail">
                      <span className="bd-scr__eyebrow">Up next</span>
                      <ol>
                        {UP_NEXT.map((n) => (
                          <li key={n.name}><img src={n.photo} alt="" aria-hidden="true" loading="lazy" /><span>{n.name}</span><time>{n.time}</time></li>
                        ))}
                      </ol>
                    </aside>
                  </div>
                </div>
              </div>

              {/* 4 · Levels */}
              <div id={`${id}-m-levels`} role="tabpanel" aria-labelledby={`${id}-tab-levels`} className={`bd-scr__moment${active === 3 ? " is-on" : ""}`} aria-hidden={active !== 3}>
                <div className="bd-scr__lvl">
                  <div className="bd-scr__lvl__head">
                    <h3 className="bd-scr__caps">Your path</h3>
                    <span className="bd-scr__eyebrow">{done} of {LEVELS[0].of} in Level 1</span>
                  </div>
                  <div className="bd-scr__lvl__rows">
                    {LEVELS.map((l, i) => (
                      <div key={l.tag} className={`bd-scr__row${i === 0 ? " is-you" : ""}`}>
                        <span className="bd-scr__row__tag">{l.tag}</span>
                        <div className="bd-scr__row__body">
                          <h4 className="bd-scr__caps">{l.name} <span style={{ fontFamily: "var(--body, 'Instrument Sans', sans-serif)", fontWeight: 400, textTransform: "none", letterSpacing: 0, color: "rgba(255,255,255,.6)", fontSize: "0.85em" }}>— {l.line}</span></h4>
                          <p>{l.classes.join(" · ")}</p>
                          <span className="bd-scr__meter" aria-hidden="true"><i style={{ width: `${Math.round((l.done / l.of) * 100)}%` }} /></span>
                        </div>
                        <span className="bd-scr__row__count"><b>{l.done}</b> / {l.of}</span>
                      </div>
                    ))}
                  </div>
                  <div className="bd-scr__lvl__foot">
                    <span className="bd-scr__caps">Same board. Your pace.</span>
                    <span className="bd-scr__eyebrow">No membership</span>
                  </div>
                </div>
              </div>

              <div className="bd-scr__progress" aria-hidden="true">
                <i key={`${active}-${tick}`} className={running ? "is-running" : undefined} />
              </div>
            </div>
          </div>
          <div className="bd-scr__hinge" aria-hidden="true" />
        </div>

        <ul className="bd-scr__facts">
          <li>Built-in screen</li>
          <li>Instructor-led</li>
          <li>No subscription</li>
        </ul>
      </div>
    </section>
  );
}
