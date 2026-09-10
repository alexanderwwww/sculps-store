/**
 * The Settings card vocabulary from the design: a card with a header, an
 * optional note band, and any of: a field grid, toggle rows, list rows with
 * badges and actions, a DNS table, a numbered step list, link rows, a cost
 * list. Every pane is composed from these so all twelve look like one screen.
 */
import type { CSSProperties, ReactNode } from "react";
import { Badge, type BadgeKind, input, textarea } from "./ui";

export function SettingsCard({
  title,
  sub,
  actions,
  note,
  children,
}: {
  title: string;
  sub?: string;
  actions?: ReactNode;
  note?: string;
  children?: ReactNode;
}) {
  return (
    <div
      style={{
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: 12,
        boxShadow: "var(--shadow)",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          padding: "12px 16px",
          borderBottom: "1px solid var(--border)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 10,
          flexWrap: "wrap",
        }}
      >
        <span style={{ display: "flex", flexDirection: "column", gap: 1 }}>
          <span style={{ fontWeight: 650 }}>{title}</span>
          {sub ? <span style={{ fontSize: 12, color: "var(--ink-2)" }}>{sub}</span> : null}
        </span>
        {actions ? <span style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>{actions}</span> : null}
      </div>
      {note ? (
        <div style={{ padding: "11px 16px", borderBottom: "1px solid var(--border)", color: "var(--ink-2)", background: "var(--bg)", fontSize: 13, lineHeight: "19px" }}>
          {note}
        </div>
      ) : null}
      {children}
    </div>
  );
}

export function CardButton({
  children,
  primary,
  danger,
  disabled,
  type = "submit",
  name,
  value,
  onClick,
  title,
}: {
  children: ReactNode;
  primary?: boolean;
  danger?: boolean;
  disabled?: boolean;
  type?: "submit" | "button";
  name?: string;
  value?: string;
  onClick?: () => void;
  title?: string;
}) {
  return (
    <button
      type={type}
      name={name}
      value={value}
      onClick={onClick}
      disabled={disabled}
      title={title}
      style={{
        height: 28,
        padding: "0 11px",
        borderRadius: 8,
        border: primary ? 0 : "1px solid var(--border)",
        background: primary ? "var(--accent)" : "var(--surface)",
        color: primary ? "var(--accent-ink)" : danger ? "var(--critical)" : "var(--ink)",
        fontSize: 12,
        fontWeight: primary ? 600 : 550,
        cursor: disabled ? "default" : "pointer",
        opacity: disabled ? 0.45 : 1,
      }}
    >
      {children}
    </button>
  );
}

export function FieldGrid({ children, columns = 2 }: { children: ReactNode; columns?: 1 | 2 }) {
  return (
    <div
      style={{
        padding: "14px 16px",
        display: "grid",
        gridTemplateColumns: columns === 1 ? "1fr" : "repeat(auto-fit,minmax(220px,1fr))",
        gap: 12,
      }}
    >
      {children}
    </div>
  );
}

export function TextField({
  label,
  name,
  defaultValue,
  placeholder,
  help,
  type = "text",
  mono,
  span,
  readOnly,
  required,
}: {
  label: string;
  name: string;
  defaultValue?: string | null;
  placeholder?: string;
  help?: string;
  type?: string;
  mono?: boolean;
  span?: boolean;
  readOnly?: boolean;
  required?: boolean;
}) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 4, gridColumn: span ? "1 / -1" : undefined }}>
      <span style={{ fontSize: 12, fontWeight: 550, color: "var(--ink-2)" }}>{label}</span>
      <input
        name={name}
        type={type}
        defaultValue={defaultValue ?? ""}
        placeholder={placeholder}
        readOnly={readOnly}
        required={required}
        style={{
          ...input,
          height: 36,
          fontFamily: mono ? "'JetBrains Mono',monospace" : undefined,
          background: readOnly ? "var(--bg)" : input.background,
        }}
      />
      {help ? <span style={{ fontSize: 12, color: "var(--ink-3)" }}>{help}</span> : null}
    </label>
  );
}

export function SelectField({
  label,
  name,
  defaultValue,
  options,
  help,
}: {
  label: string;
  name: string;
  defaultValue?: string | null;
  options: { value: string; label: string }[];
  help?: string;
}) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <span style={{ fontSize: 12, fontWeight: 550, color: "var(--ink-2)" }}>{label}</span>
      <select name={name} defaultValue={defaultValue ?? options[0]?.value} style={{ ...input, height: 36, padding: "0 8px" }}>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      {help ? <span style={{ fontSize: 12, color: "var(--ink-3)" }}>{help}</span> : null}
    </label>
  );
}

export function AreaField({
  label,
  name,
  defaultValue,
  placeholder,
  rows = 5,
}: {
  label: string;
  name: string;
  defaultValue?: string | null;
  placeholder?: string;
  rows?: number;
}) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 4, gridColumn: "1 / -1" }}>
      <span style={{ fontSize: 12, fontWeight: 550, color: "var(--ink-2)" }}>{label}</span>
      <textarea name={name} defaultValue={defaultValue ?? ""} placeholder={placeholder} rows={rows} style={textarea} />
    </label>
  );
}

/**
 * A toggle row that submits as a form field. Rendered as a real checkbox
 * styled like the design's switch, so it works without JavaScript and posts
 * with the rest of the card.
 */
export function ToggleRow({
  label,
  help,
  name,
  defaultChecked,
}: {
  label: string;
  help?: string;
  name: string;
  defaultChecked: boolean;
}) {
  return (
    <label style={{ display: "flex", alignItems: "center", gap: 12, padding: "11px 16px", borderBottom: "1px solid var(--border)", cursor: "pointer" }}>
      <span style={{ flex: 1, display: "flex", flexDirection: "column", gap: 1 }}>
        <span style={{ fontWeight: 550 }}>{label}</span>
        {help ? <span style={{ fontSize: 12, color: "var(--ink-2)" }}>{help}</span> : null}
      </span>
      <span style={{ position: "relative", width: 38, height: 22, flex: "none" }}>
        <input
          type="checkbox"
          name={name}
          defaultChecked={defaultChecked}
          className="k-switch"
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", margin: 0, opacity: 0, cursor: "pointer" }}
        />
        <span className="k-switch-track" />
      </span>
    </label>
  );
}

export interface RowAction {
  label: string;
  intent: string;
  danger?: boolean;
  disabled?: boolean;
  confirm?: string;
  primary?: boolean;
}

export function ListRow({
  name,
  note,
  badges,
  hidden,
  actions,
  mono,
}: {
  name: string;
  note?: string;
  badges?: { label: string; kind: BadgeKind }[];
  /** hidden inputs shared by every action button in this row */
  hidden?: Record<string, string>;
  actions?: RowAction[];
  mono?: boolean;
}) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "11px 16px", borderBottom: "1px solid var(--border)", flexWrap: "wrap" }}>
      <span style={{ flex: 1, minWidth: 150, display: "flex", flexDirection: "column", gap: 2 }}>
        <span style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <span style={{ fontWeight: 600, fontFamily: mono ? "'JetBrains Mono',monospace" : undefined }}>{name}</span>
          {badges?.map((badge) => (
            <Badge key={badge.label} kind={badge.kind}>
              {badge.label}
            </Badge>
          ))}
        </span>
        {note ? <span style={{ fontSize: 12, color: "var(--ink-2)" }}>{note}</span> : null}
      </span>
      {actions?.map((action) => (
        <form
          key={action.label}
          method="post"
          onSubmit={(event) => {
            if (action.confirm && !window.confirm(action.confirm)) event.preventDefault();
          }}
        >
          {Object.entries(hidden ?? {}).map(([key, value]) => (
            <input key={key} type="hidden" name={key} value={value} />
          ))}
          <input type="hidden" name="intent" value={action.intent} />
          <CardButton danger={action.danger} disabled={action.disabled} primary={action.primary}>
            {action.label}
          </CardButton>
        </form>
      ))}
    </div>
  );
}

export function EmptyRows({ title, body }: { title: string; body?: string }) {
  return (
    <div style={{ padding: "36px 16px", textAlign: "center", display: "flex", flexDirection: "column", gap: 4 }}>
      <span style={{ fontWeight: 650 }}>{title}</span>
      {body ? <span style={{ color: "var(--ink-2)" }}>{body}</span> : null}
    </div>
  );
}

export function DnsTable({ rows }: { rows: { type: string; name: string; value: string }[] }) {
  if (!rows.length) return null;
  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 520 }}>
        <thead>
          <tr style={{ height: 34, color: "var(--ink-2)", fontSize: 12, fontWeight: 550, textAlign: "left", borderBottom: "1px solid var(--border)" }}>
            <th style={{ padding: "0 16px", fontWeight: 550 }}>Type</th>
            <th style={{ padding: "0 12px", fontWeight: 550 }}>Name</th>
            <th style={{ padding: "0 12px", fontWeight: 550 }}>Value</th>
            <th style={{ width: 80 }} />
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.type + row.name + row.value} style={{ height: 42, borderBottom: "1px solid var(--border)" }}>
              <td style={{ padding: "0 16px", fontFamily: "'JetBrains Mono',monospace", fontSize: 12 }}>{row.type}</td>
              <td style={{ padding: "0 12px", fontFamily: "'JetBrains Mono',monospace", fontSize: 12 }}>{row.name}</td>
              <td style={{ padding: "0 12px", fontFamily: "'JetBrains Mono',monospace", fontSize: 12, wordBreak: "break-all" }}>{row.value}</td>
              <td style={{ padding: "0 16px", textAlign: "right" }}>
                <CopyButton value={row.value} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function CopyButton({ value }: { value: string }) {
  return (
    <CardButton
      type="button"
      onClick={() => {
        navigator.clipboard?.writeText(value).catch(() => undefined);
      }}
      title="Copy"
    >
      Copy
    </CardButton>
  );
}

export function Steps({ steps, current }: { steps: { label: string; help: string }[]; current: number }) {
  return (
    <div style={{ padding: "14px 16px", display: "flex", flexDirection: "column" }}>
      {steps.map((step, index) => {
        const n = index + 1;
        const done = current > n;
        const active = current === n;
        return (
          <div key={step.label} style={{ display: "grid", gridTemplateColumns: "26px 1fr auto", gap: "0 10px" }}>
            <span style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
              <span
                style={{
                  width: 20,
                  height: 20,
                  borderRadius: "50%",
                  background: done ? "var(--success)" : active ? "var(--accent)" : "var(--bg)",
                  color: done || active ? "#fff" : "var(--ink-3)",
                  fontSize: 11,
                  fontWeight: 700,
                  display: "grid",
                  placeItems: "center",
                  flex: "none",
                }}
              >
                {n}
              </span>
              {index < steps.length - 1 ? <span style={{ flex: 1, width: 1, background: "var(--border)", margin: "2px 0" }} /> : null}
            </span>
            <span style={{ paddingBottom: 12, display: "flex", flexDirection: "column", gap: 2 }}>
              <span style={{ fontWeight: 550, color: active ? "var(--ink)" : done ? "var(--ink-2)" : "var(--ink-3)" }}>{step.label}</span>
              <span style={{ fontSize: 12, color: "var(--ink-2)" }}>{step.help}</span>
            </span>
            <span style={{ fontSize: 12, color: "var(--ink-2)", whiteSpace: "nowrap" }}>{done ? "Done" : active ? "In progress" : "Waiting"}</span>
          </div>
        );
      })}
    </div>
  );
}

export function LinkRow({ label, help, href }: { label: string; help?: string; href: string }) {
  return (
    <a
      href={href}
      className="k-hover"
      style={{ display: "flex", alignItems: "center", gap: 10, padding: "11px 16px", borderBottom: "1px solid var(--border)", textDecoration: "none" }}
    >
      <span style={{ flex: 1, display: "flex", flexDirection: "column", gap: 1 }}>
        <span style={{ fontWeight: 550, color: "var(--link)" }}>{label}</span>
        {help ? <span style={{ fontSize: 12, color: "var(--ink-2)" }}>{help}</span> : null}
      </span>
      <span style={{ color: "var(--ink-3)" }}>›</span>
    </a>
  );
}

export function CostRow({ name, note, price, free }: { name: string; note: string; price: string; free?: boolean }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 16px", borderBottom: "1px solid var(--border)" }}>
      <span style={{ flex: 1, display: "flex", flexDirection: "column", gap: 1 }}>
        <span style={{ fontWeight: 550 }}>{name}</span>
        <span style={{ fontSize: 12, color: "var(--ink-2)" }}>{note}</span>
      </span>
      <span style={{ fontVariantNumeric: "tabular-nums", fontWeight: 600, color: free ? "var(--success)" : "var(--ink)" }}>{price}</span>
    </div>
  );
}

export const saveBar: CSSProperties = {
  padding: "12px 16px",
  borderTop: "1px solid var(--border)",
  display: "flex",
  alignItems: "center",
  gap: 10,
};
