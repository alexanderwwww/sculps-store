/**
 * Glass panels for the two "connection" screens — Meta and Settings → Payments.
 *
 * These are the only two screens that are a handshake with somebody else's
 * service rather than a form over our own database, and they are the two the
 * owner said felt like blank config files. The material is the one already in
 * `app/admin/admin.css` (`k-ground`, `k-glass`, `k-lift`) — nothing new is
 * invented here, this file only arranges it.
 *
 * Rule that governs every component below: a value with no source renders its
 * empty state (`—` plus the reason), and a control with nothing behind it
 * renders visibly disabled with the reason. Nothing here fabricates a number.
 */
import type { CSSProperties, ReactNode } from "react";

/* ------------------------------------------------------------- ground --- */

/**
 * The wash that gives the blur something to bend. Never used on its own —
 * always behind a group of glass panels.
 */
export function GlassGround({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return (
    <div
      className="k-ground"
      style={{
        borderRadius: 24,
        padding: 20,
        display: "flex",
        flexDirection: "column",
        gap: 16,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

/* -------------------------------------------------------------- panel --- */

export function GlassPanel({
  title,
  sub,
  aside,
  children,
  tight,
  lift,
  style,
}: {
  title?: ReactNode;
  sub?: ReactNode;
  aside?: ReactNode;
  children?: ReactNode;
  tight?: boolean;
  lift?: boolean;
  style?: CSSProperties;
}) {
  return (
    <section
      className={`k-glass${tight ? " k-glass--tight" : ""}${lift ? " k-lift" : ""}`}
      style={{ overflow: "hidden", ...style }}
    >
      {title ? (
        <header
          style={{
            padding: tight ? "14px 16px 0" : "18px 20px 0",
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            gap: 12,
            flexWrap: "wrap",
          }}
        >
          <span style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
            <span style={{ fontSize: 15, fontWeight: 650, lineHeight: "22px" }}>{title}</span>
            {sub ? <span style={{ fontSize: 12, color: "var(--ink-2)", lineHeight: "18px" }}>{sub}</span> : null}
          </span>
          {aside}
        </header>
      ) : null}
      {children}
    </section>
  );
}

export const glassBody: CSSProperties = {
  padding: "16px 20px 20px",
  display: "flex",
  flexDirection: "column",
  gap: 14,
};

/** A hairline that reads as glass rather than as a table border. */
export const glassRule: CSSProperties = {
  height: 1,
  background: "linear-gradient(90deg,rgba(255,255,255,0),rgba(48,48,48,.10),rgba(255,255,255,0))",
  border: 0,
  margin: 0,
};

/* --------------------------------------------------------------- state -- */

export type ConnState = "off" | "connecting" | "on";

const STATE_INK: Record<ConnState, { dot: string; fg: string; bg: string }> = {
  off: { dot: "var(--ink-3)", fg: "var(--b-neutral-fg)", bg: "rgba(227,227,227,.75)" },
  connecting: { dot: "#B99400", fg: "var(--b-warning-fg)", bg: "rgba(255,239,157,.75)" },
  on: { dot: "#22C55E", fg: "var(--b-success-fg)", bg: "rgba(205,254,225,.75)" },
};

/** The state as a badge — the same three states the rail below shows. */
export function StateBadge({ state, label }: { state: ConnState; label: string }) {
  const ink = STATE_INK[state];
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 7,
        height: 26,
        padding: "0 11px",
        borderRadius: 999,
        fontSize: 12,
        fontWeight: 600,
        background: ink.bg,
        color: ink.fg,
        backdropFilter: "blur(8px)",
        WebkitBackdropFilter: "blur(8px)",
      }}
    >
      <span
        style={{
          width: 7,
          height: 7,
          borderRadius: "50%",
          background: ink.dot,
          animation: state === "on" ? "kPulse 2.4s ease-out infinite" : undefined,
        }}
      />
      {label}
    </span>
  );
}

/**
 * The connection as a state, not a text field: three stops, the reached ones
 * filled, the current one named. Every stop is derived from stored facts.
 */
export function StateRail({
  steps,
  current,
}: {
  steps: { key: string; label: string; note: string }[];
  current: number;
}) {
  return (
    <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
      {steps.map((step, index) => {
        const reached = index <= current;
        const active = index === current;
        return (
          <div
            key={step.key}
            style={{
              flex: "1 1 160px",
              minWidth: 150,
              display: "flex",
              flexDirection: "column",
              gap: 6,
              padding: "10px 12px",
              borderRadius: 14,
              background: active ? "rgba(255,255,255,.66)" : "rgba(255,255,255,.32)",
              boxShadow: active ? "inset 0 1px 0 rgba(255,255,255,.95)" : "none",
              transition: "background .22s cubic-bezier(.22,.8,.28,1)",
            }}
          >
            <span
              style={{
                height: 3,
                borderRadius: 2,
                background: reached ? "#22C55E" : "rgba(48,48,48,.14)",
                opacity: active ? 1 : reached ? 0.55 : 1,
                transition: "background .22s ease-out",
              }}
            />
            <span style={{ fontSize: 12, fontWeight: 650, color: reached ? "var(--ink)" : "var(--ink-3)" }}>
              {step.label}
            </span>
            <span style={{ fontSize: 11, lineHeight: "16px", color: "var(--ink-2)" }}>{step.note}</span>
          </div>
        );
      })}
    </div>
  );
}

/* --------------------------------------------------------------- facts -- */

/** A stored fact. `value` null renders the empty state with its reason. */
export function Fact({
  label,
  value,
  mono,
  reason,
}: {
  label: string;
  value?: string | null;
  mono?: boolean;
  reason?: string;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 3, minWidth: 0 }}>
      <span style={{ fontSize: 11, fontWeight: 600, color: "var(--ink-2)", letterSpacing: ".01em" }}>{label}</span>
      {value ? (
        <span
          style={{
            fontSize: 13,
            fontWeight: 600,
            color: "var(--ink)",
            fontFamily: mono ? "'JetBrains Mono',monospace" : undefined,
            overflowWrap: "anywhere",
          }}
        >
          {value}
        </span>
      ) : (
        <span style={{ fontSize: 13, fontWeight: 600, color: "var(--ink-3)" }} title={reason}>
          —
        </span>
      )}
      {!value && reason ? (
        <span style={{ fontSize: 11, lineHeight: "16px", color: "var(--ink-2)" }}>{reason}</span>
      ) : null}
    </div>
  );
}

export function FactGrid({ children }: { children: ReactNode }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 14 }}>
      {children}
    </div>
  );
}

/** A counted number with its label. `value` null renders `—` and the reason. */
export function Metric({
  label,
  value,
  note,
  reason,
}: {
  label: string;
  value: number | null;
  note?: string;
  reason?: string;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
      <span style={{ fontSize: 11, fontWeight: 600, color: "var(--ink-2)" }}>{label}</span>
      <span
        style={{
          fontSize: 26,
          lineHeight: "32px",
          fontWeight: 650,
          fontVariantNumeric: "tabular-nums",
          color: value === null ? "var(--ink-3)" : "var(--ink)",
        }}
      >
        {value === null ? "—" : value.toLocaleString("en-US")}
      </span>
      {value === null && reason ? (
        <span style={{ fontSize: 11, lineHeight: "16px", color: "var(--ink-2)" }}>{reason}</span>
      ) : note ? (
        <span style={{ fontSize: 11, lineHeight: "16px", color: "var(--ink-2)" }}>{note}</span>
      ) : null}
    </div>
  );
}

/* -------------------------------------------------------------- result -- */

/** The real answer from the real service, kept as its own object on the glass. */
export function HandshakeResult({ kind, children }: { kind: "ok" | "error"; children: ReactNode }) {
  const ok = kind === "ok";
  return (
    <div
      style={{
        display: "flex",
        gap: 10,
        alignItems: "flex-start",
        padding: "12px 14px",
        borderRadius: 14,
        fontSize: 13,
        lineHeight: "19px",
        background: ok ? "rgba(205,254,225,.7)" : "rgba(254,218,217,.7)",
        color: ok ? "var(--b-success-fg)" : "var(--b-critical-fg)",
        backdropFilter: "blur(8px)",
        WebkitBackdropFilter: "blur(8px)",
        animation: "kPop .22s cubic-bezier(.22,.8,.28,1)",
      }}
    >
      <span
        style={{
          width: 18,
          height: 18,
          borderRadius: "50%",
          flex: "none",
          marginTop: 1,
          display: "grid",
          placeItems: "center",
          background: "currentColor",
          color: ok ? "var(--b-success-fg)" : "var(--b-critical-fg)",
          fontSize: 11,
          fontWeight: 700,
        }}
      >
        <span style={{ color: "#fff" }}>{ok ? "✓" : "!"}</span>
      </span>
      <span style={{ minWidth: 0 }}>{children}</span>
    </div>
  );
}

/** A soft advisory on the glass — used where the design would show a notice. */
export function GlassNotice({ kind, children }: { kind: "warning" | "critical"; children: ReactNode }) {
  const critical = kind === "critical";
  return (
    <div
      style={{
        padding: "12px 14px",
        borderRadius: 14,
        fontSize: 13,
        lineHeight: "19px",
        background: critical ? "rgba(254,218,217,.7)" : "rgba(255,239,157,.7)",
        color: critical ? "var(--b-critical-fg)" : "var(--b-warning-fg)",
        backdropFilter: "blur(8px)",
        WebkitBackdropFilter: "blur(8px)",
      }}
    >
      {children}
    </div>
  );
}

/* ------------------------------------------------------------ controls -- */

const buttonBase: CSSProperties = {
  height: 38,
  padding: "0 18px",
  borderRadius: 12,
  fontSize: 13,
  fontWeight: 600,
  cursor: "pointer",
  transition: "transform .18s cubic-bezier(.22,.8,.28,1), background .18s ease-out, opacity .18s ease-out",
};

export function PrimaryAction(
  props: React.ButtonHTMLAttributes<HTMLButtonElement> & { children: ReactNode },
) {
  const { style, disabled, ...rest } = props;
  return (
    <button
      {...rest}
      disabled={disabled}
      className="k-lift"
      style={{
        ...buttonBase,
        border: 0,
        background: "var(--accent)",
        color: "var(--accent-ink)",
        boxShadow: "0 8px 22px rgba(20,16,40,.20)",
        opacity: disabled ? 0.45 : 1,
        cursor: disabled ? "not-allowed" : "pointer",
        ...style,
      }}
    />
  );
}

export function QuietAction(
  props: React.ButtonHTMLAttributes<HTMLButtonElement> & { children: ReactNode },
) {
  const { style, disabled, ...rest } = props;
  return (
    <button
      {...rest}
      disabled={disabled}
      style={{
        ...buttonBase,
        height: 34,
        padding: "0 14px",
        border: "1px solid rgba(255,255,255,.8)",
        background: "rgba(255,255,255,.55)",
        color: "var(--ink)",
        opacity: disabled ? 0.45 : 1,
        cursor: disabled ? "not-allowed" : "pointer",
        ...style,
      }}
    />
  );
}

/** An input that sits on glass instead of punching a white hole in it. */
export const glassInput: CSSProperties = {
  height: 38,
  padding: "0 13px",
  borderRadius: 12,
  border: "1px solid rgba(255,255,255,.85)",
  background: "rgba(255,255,255,.72)",
  boxShadow: "inset 0 1px 2px rgba(20,16,40,.06)",
  fontSize: 13,
  fontFamily: "'JetBrains Mono',monospace",
  color: "var(--ink)",
  minWidth: 0,
};

export const glassField: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 5,
  fontSize: 11,
  fontWeight: 600,
  color: "var(--ink-2)",
};

/** A value meant to be copied out of the admin and pasted somewhere else. */
export function CopyValue({ value, label }: { value: string; label?: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
      {label ? <span style={{ fontSize: 11, fontWeight: 600, color: "var(--ink-2)" }}>{label}</span> : null}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "8px 8px 8px 13px",
          borderRadius: 12,
          background: "rgba(255,255,255,.72)",
          border: "1px solid rgba(255,255,255,.85)",
          flexWrap: "wrap",
        }}
      >
        <code
          style={{
            flex: 1,
            minWidth: 0,
            fontFamily: "'JetBrains Mono',monospace",
            fontSize: 12,
            overflowWrap: "anywhere",
          }}
        >
          {value}
        </code>
        <button
          type="button"
          onClick={() => {
            navigator.clipboard?.writeText(value).catch(() => undefined);
          }}
          style={{
            height: 28,
            padding: "0 12px",
            borderRadius: 9,
            border: "1px solid rgba(255,255,255,.9)",
            background: "rgba(255,255,255,.85)",
            color: "var(--ink)",
            fontSize: 12,
            fontWeight: 600,
            cursor: "pointer",
            flex: "none",
          }}
        >
          Copy
        </button>
      </div>
    </div>
  );
}
