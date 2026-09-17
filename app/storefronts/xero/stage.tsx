/**
 * The hero stage.
 *
 * Photographs are what the server renders and what a reader without WebGL
 * keeps. The 3D model is an upgrade applied on top once it has loaded, never a
 * precondition for seeing the bike — so there is no arrangement of failures
 * that leaves this area blank.
 */
import { useEffect, useRef, useState } from "react";
import type { Stage } from "./stage-3d";
import { HERO } from "./copy";

type World = "studio" | "city" | "mars";
const WORLDS: World[] = ["studio", "city", "mars"];

/** A segmented switch with a knob that slides between the options. */
function Pill({
  options, value, onChange, className = "", label,
}: {
  options: readonly { id: string; label: React.ReactNode }[];
  value: string;
  onChange: (id: string) => void;
  className?: string;
  label: string;
}) {
  const i = Math.max(0, options.findIndex((o) => o.id === value));
  return (
    <div className={`x-pill ${className}`} role="radiogroup" aria-label={label}>
      <span
        className="x-pill__knob"
        aria-hidden="true"
        style={{ width: `${100 / options.length}%`, transform: `translateX(${i * 100}%)` }}
      />
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          role="radio"
          aria-checked={o.id === value}
          className={o.id === value ? "is-on" : ""}
          onClick={() => onChange(o.id)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function HeroStage() {
  const [view, setView] = useState<"3d" | "photos">("3d");
  const [night, setNight] = useState(true);
  const [world, setWorld] = useState<World>("studio");
  const [shot, setShot] = useState(0);
  const [spin, setSpin] = useState(false);
  const [ready, setReady] = useState(false);

  const canvas = useRef<HTMLCanvasElement>(null);
  const stage = useRef<Stage | null>(null);

  useEffect(() => {
    const el = canvas.current;
    if (!el) return;
    let dead = false;
    let io: IntersectionObserver | undefined;

    const boot = async () => {
      // Never on the server, and never before the stage is actually looked at.
      try {
        const mod = await import("./stage-3d");
        if (dead) return;
        const s = await mod.mountStage(el, { night, onReady: () => setReady(true) });
        if (dead) { s?.destroy(); return; }
        stage.current = s;
      } catch {
        // The photographs are already on screen. Nothing to do.
      }
    };

    if (typeof IntersectionObserver === "undefined") { void boot(); }
    else {
      io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { io?.disconnect(); void boot(); } }, { threshold: 0.05 });
      io.observe(el);
    }
    return () => { dead = true; io?.disconnect(); stage.current?.destroy(); stage.current = null; };
  }, []);

  useEffect(() => { stage.current?.setNight(night); }, [night]);
  useEffect(() => { stage.current?.setSpin(spin); }, [spin]);

  const has3d = ready && view === "3d";

  return (
    <div className={`x-stage x-stage--${world}${night ? " is-night" : " is-day"}${view === "photos" ? " is-photos" : ""}${has3d ? " is-live" : ""}`}>
      {/* The photographs. Shown until the model is ready, and the whole of the
          Photos view, where the room turns white and they sit on it. */}
      <div className="x-stage__photos" aria-hidden={has3d}>
        {HERO.shots.map((src, i) => (
          <img key={src} src={src} alt="" className={i === shot ? "is-on" : ""} loading={i === 0 ? "eager" : "lazy"} decoding="async" />
        ))}
      </div>

      <canvas ref={canvas} className="x-stage__canvas" aria-label="Rotatable model of the XERO Chiron" />

      <Pill
        className="x-pill--tl"
        label="Stage view"
        value={view}
        onChange={(v) => setView(v as "3d" | "photos")}
        options={[{ id: "3d", label: "3D" }, { id: "photos", label: "Photos" }]}
      />

      {view === "3d" ? (
        <Pill
          className="x-pill--tr"
          label="Lighting"
          value={night ? "night" : "day"}
          onChange={(v) => setNight(v === "night")}
          options={[{ id: "day", label: "DAY" }, { id: "night", label: "NIGHT" }]}
        />
      ) : null}

      {has3d ? (
        <div className="x-ctl">
          <button type="button" onClick={() => stage.current?.nudge(-Math.PI / 6)} aria-label="Turn left">‹</button>
          <button type="button" onClick={() => stage.current?.reset()} aria-label="Reset view">↻</button>
          <button
            type="button"
            className={spin ? "is-on" : ""}
            onClick={() => setSpin((s) => !s)}
            aria-pressed={spin}
            aria-label="Auto-spin"
          >⟳</button>
          <button type="button" onClick={() => stage.current?.nudge(Math.PI / 6)} aria-label="Turn right">›</button>
        </div>
      ) : null}

      <div className="x-stage__foot">
        {has3d ? <span className="x-chip">Drag to rotate</span> : null}
        <Pill
          className="x-pill--worlds"
          label="Scene"
          value={world}
          onChange={(v) => setWorld(v as World)}
          options={WORLDS.map((w) => ({ id: w, label: w.toUpperCase() }))}
        />
        <div className="x-rail">
          {HERO.shots.map((src, i) => (
            <button
              key={src}
              type="button"
              className={i === shot && view === "photos" ? "is-on" : ""}
              aria-label={`View ${i + 1}`}
              onClick={() => { setShot(i); setView("photos"); }}
            >
              <img src={src} alt="" loading="lazy" />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
