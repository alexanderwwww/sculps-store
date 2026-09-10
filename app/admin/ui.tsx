/**
 * Small pieces the admin screens share.
 *
 * Styles are inline and copied from the approved prototype on purpose: the
 * design is the specification, and keeping the values next to the markup makes
 * a drift from it visible in review rather than buried in a stylesheet.
 */
import type { ReactNode, CSSProperties } from "react";

export const card: CSSProperties = {
  background: "var(--surface)",
  border: "1px solid var(--border)",
  borderRadius: 12,
  boxShadow: "var(--shadow)",
  overflow: "hidden",
};

export const cardHeader: CSSProperties = {
  padding: "12px 16px",
  fontWeight: 650,
  borderBottom: "1px solid var(--border)",
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 12,
};

export type BadgeKind = "success" | "warning" | "critical" | "info" | "neutral" | "purple";

export function Badge({ kind, children }: { kind: BadgeKind; children: ReactNode }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
        height: 20,
        padding: "0 8px",
        borderRadius: 8,
        fontSize: 12,
        fontWeight: 550,
        background: `var(--b-${kind}-bg)`,
        color: `var(--b-${kind}-fg)`,
        whiteSpace: "nowrap",
      }}
    >
      <span
        style={{ width: 6, height: 6, borderRadius: "50%", background: "currentColor", opacity: 0.8 }}
      />
      {children}
    </span>
  );
}

export function PageTitle({ title, actions }: { title: string; actions?: ReactNode }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
        flexWrap: "wrap",
      }}
    >
      <h1 style={{ margin: 0, fontSize: 20, lineHeight: "28px", fontWeight: 650 }}>{title}</h1>
      {actions ? <div style={{ display: "flex", gap: 8 }}>{actions}</div> : null}
    </div>
  );
}

export const primaryButton: CSSProperties = {
  height: 28,
  padding: "0 12px",
  borderRadius: 8,
  border: "1px solid var(--accent)",
  background: "var(--accent)",
  color: "var(--accent-ink)",
  fontSize: 12,
  fontWeight: 600,
  cursor: "pointer",
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
};

export const secondaryButton: CSSProperties = {
  height: 28,
  padding: "0 12px",
  borderRadius: 8,
  border: "1px solid var(--border)",
  background: "var(--surface)",
  color: "var(--ink)",
  fontSize: 12,
  fontWeight: 550,
  cursor: "pointer",
  boxShadow: "var(--shadow)",
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
};

export const criticalButton: CSSProperties = {
  ...secondaryButton,
  color: "var(--critical)",
  borderColor: "var(--critical-bg)",
};

export const input: CSSProperties = {
  height: 32,
  width: "100%",
  padding: "0 10px",
  borderRadius: 8,
  border: "1px solid var(--input-border)",
  background: "var(--input)",
  color: "var(--ink)",
  fontSize: 13,
};

export const textarea: CSSProperties = {
  ...input,
  height: "auto",
  minHeight: 80,
  padding: "8px 10px",
  lineHeight: "20px",
  resize: "vertical",
};

export const fieldLabel: CSSProperties = {
  display: "block",
  fontSize: 12,
  fontWeight: 550,
  color: "var(--ink-2)",
  marginBottom: 4,
};

/**
 * The empty state. Every list screen uses it, and it always says what would
 * put something here — never filler pretending the screen has content.
 */
export function Empty({
  title,
  help,
  action,
}: {
  title: string;
  help: string;
  action?: ReactNode;
}) {
  return (
    <div
      style={{
        padding: "36px 16px",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 6,
        textAlign: "center",
      }}
    >
      <span
        style={{
          width: 40,
          height: 40,
          borderRadius: 10,
          background: "var(--bg)",
          display: "grid",
          placeItems: "center",
          color: "var(--ink-3)",
          marginBottom: 2,
        }}
      >
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round">
          <path d="M4 3h12v14l-2-1.5L12 17l-2-1.5L8 17l-2-1.5L4 17z" />
        </svg>
      </span>
      <div style={{ fontWeight: 600 }}>{title}</div>
      <div style={{ color: "var(--ink-2)", maxWidth: 420 }}>{help}</div>
      {action ? <div style={{ marginTop: 10 }}>{action}</div> : null}
    </div>
  );
}

export function Field({
  label: text,
  help,
  children,
}: {
  label: string;
  help?: string;
  children: ReactNode;
}) {
  return (
    <div>
      <label style={fieldLabel}>{text}</label>
      {children}
      {help ? (
        <div style={{ fontSize: 12, color: "var(--ink-2)", marginTop: 4 }}>{help}</div>
      ) : null}
    </div>
  );
}
