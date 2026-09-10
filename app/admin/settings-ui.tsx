/**
 * The Settings card vocabulary, transliterated from `design/port/settings.html`.
 *
 * Every style string here is copied character for character from the
 * prototype's markup: the card shell, the header with its actions, the note
 * band, the field grid, the toggle rows, the list rows with badges and
 * actions, the DNS table, the numbered steps, the link rows and the cost
 * list. Nothing here invents a value.
 */
import type { CSSProperties, ReactNode } from "react";

export type BadgeKind = "success" | "warning" | "critical" | "info" | "neutral" | "purple";

/** The prototype's row badge — no status dot, unlike the shared list badge. */
export function RowBadge({ kind, children }: { kind: BadgeKind; children: ReactNode }) {
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
      }}
    >
      {children}
    </span>
  );
}

export function SettingsCard({
  title,
  sub,
  actions,
  note,
  children,
}: {
  title: ReactNode;
  sub?: ReactNode;
  actions?: ReactNode;
  note?: ReactNode;
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
        {actions}
      </div>
      {note ? (
        <div style={{ padding: "11px 16px", borderBottom: "1px solid var(--border)", color: "var(--ink-2)", background: "var(--bg)" }}>
          {note}
        </div>
      ) : null}
      {children}
    </div>
  );
}

/** The card-header / save-bar button. */
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
        cursor: "pointer",
        opacity: disabled ? 0.45 : 1,
      }}
    >
      {children}
    </button>
  );
}

/** The list-row / DNS-row button: 26px tall, always outlined. */
export function RowButton({
  children,
  danger,
  disabled,
  type = "submit",
  name,
  value,
  onClick,
  title,
}: {
  children: ReactNode;
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
      className="k-hover"
      style={{
        height: 26,
        padding: "0 10px",
        borderRadius: 8,
        border: "1px solid var(--border)",
        background: "var(--surface)",
        color: danger ? "var(--critical)" : "var(--ink)",
        fontSize: 12,
        fontWeight: 550,
        cursor: "pointer",
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
        gridTemplateColumns: columns === 1 ? "1fr" : "repeat(2,minmax(0,1fr))",
        gap: 12,
      }}
    >
      {children}
    </div>
  );
}

const fieldLabelStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 4,
  fontSize: 12,
  fontWeight: 550,
  color: "var(--ink-2)",
};

const controlStyle: CSSProperties = {
  height: 36,
  padding: "0 12px",
  borderRadius: 8,
  border: "1px solid var(--input-border)",
  background: "var(--input)",
  fontSize: 13,
  color: "var(--ink)",
};

function FieldHelp({ children }: { children: ReactNode }) {
  return <span style={{ fontWeight: 450, color: "var(--ink-3)" }}>{children}</span>;
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
  help?: ReactNode;
  type?: string;
  mono?: boolean;
  span?: boolean;
  readOnly?: boolean;
  required?: boolean;
}) {
  return (
    <label style={{ ...fieldLabelStyle, gridColumn: span ? "1 / -1" : "auto" }}>
      {label}
      <input
        name={name}
        type={type}
        defaultValue={defaultValue ?? ""}
        placeholder={placeholder}
        readOnly={readOnly}
        required={required}
        style={{
          ...controlStyle,
          fontFamily: mono ? "'JetBrains Mono',monospace" : "inherit",
          background: readOnly ? "var(--bg)" : "var(--input)",
        }}
      />
      {help ? <FieldHelp>{help}</FieldHelp> : null}
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
  help?: ReactNode;
}) {
  return (
    <label style={{ ...fieldLabelStyle, gridColumn: "auto" }}>
      {label}
      <select
        name={name}
        defaultValue={defaultValue ?? options[0]?.value}
        style={{
          height: 36,
          borderRadius: 8,
          border: "1px solid var(--input-border)",
          background: "var(--input)",
          padding: "0 8px",
          fontSize: 13,
          color: "var(--ink)",
        }}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      {help ? <FieldHelp>{help}</FieldHelp> : null}
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
    <label style={{ ...fieldLabelStyle, gridColumn: "1 / -1" }}>
      {label}
      <textarea
        name={name}
        defaultValue={defaultValue ?? ""}
        placeholder={placeholder}
        rows={rows}
        style={{
          width: "100%",
          padding: "10px 12px",
          borderRadius: 8,
          border: "1px solid var(--input-border)",
          background: "var(--input)",
          fontSize: 13,
          resize: "vertical",
          color: "var(--ink)",
          fontFamily: "inherit",
        }}
      />
    </label>
  );
}

export const toggleRow: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 12,
  padding: "11px 16px",
  borderBottom: "1px solid var(--border)",
};

/**
 * The design's switch. The prototype toggles React state; here it is a real
 * checkbox underneath the same track so the value posts with its card and
 * works without JavaScript.
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
    <label style={{ ...toggleRow, cursor: "pointer" }}>
      <span style={{ flex: 1, display: "flex", flexDirection: "column", gap: 1 }}>
        <span style={{ fontWeight: 550 }}>{label}</span>
        {help ? <span style={{ fontSize: 12, color: "var(--ink-2)" }}>{help}</span> : null}
      </span>
      <span style={{ width: 38, height: 22, position: "relative", flex: "none" }}>
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
}

export const listRow: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  padding: "11px 16px",
  borderBottom: "1px solid var(--border)",
  flexWrap: "wrap",
};

export const listRowMain: CSSProperties = {
  flex: 1,
  minWidth: 150,
  display: "flex",
  flexDirection: "column",
  gap: 2,
};

export function ListRow({
  name,
  note,
  badges,
  hidden,
  actions,
  extraActions,
  mono,
}: {
  name: string;
  note?: string;
  badges?: { label: string; kind: BadgeKind }[];
  /** hidden inputs shared by every action button in this row */
  hidden?: Record<string, string>;
  actions?: RowAction[];
  /** anything that is not a post — a preview link, say */
  extraActions?: ReactNode;
  mono?: boolean;
}) {
  return (
    <div style={listRow}>
      <span style={listRowMain}>
        <span style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <span style={{ fontWeight: 600, fontFamily: mono ? "'JetBrains Mono',monospace" : undefined }}>{name}</span>
          {badges?.map((badge) => (
            <RowBadge key={badge.label} kind={badge.kind}>
              {badge.label}
            </RowBadge>
          ))}
        </span>
        {note ? <span style={{ fontSize: 12, color: "var(--ink-2)" }}>{note}</span> : null}
      </span>
      {extraActions}
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
          <RowButton danger={action.danger} disabled={action.disabled}>
            {action.label}
          </RowButton>
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
    <RowButton
      type="button"
      onClick={() => {
        navigator.clipboard?.writeText(value).catch(() => undefined);
      }}
      title="Copy"
    >
      Copy
    </RowButton>
  );
}

export function Steps({ steps, current }: { steps: { label: string; help: string }[]; current: number }) {
  return (
    <div style={{ padding: "14px 16px", display: "flex", flexDirection: "column", gap: 0 }}>
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
              <span style={{ flex: 1, width: 1, background: "var(--border)", margin: "2px 0" }} />
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

export const linkRow: CSSProperties = {
  width: "100%",
  display: "flex",
  alignItems: "center",
  gap: 10,
  padding: "11px 16px",
  border: 0,
  borderBottom: "1px solid var(--border)",
  background: "transparent",
  cursor: "pointer",
  textAlign: "left",
  color: "var(--ink)",
};

export function LinkChevron() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="var(--ink-2)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="m6 4 4 4-4 4" />
    </svg>
  );
}

export function LinkLabel({ label, help }: { label: string; help?: string }) {
  return (
    <span style={{ flex: 1, display: "flex", flexDirection: "column", gap: 1 }}>
      <span style={{ fontWeight: 550, color: "var(--link)" }}>{label}</span>
      {help ? <span style={{ fontSize: 12, color: "var(--ink-2)" }}>{help}</span> : null}
    </span>
  );
}

/** The prototype's link row. A real `<a>`, because ours actually navigates. */
export function LinkRow({ label, help, href }: { label: string; help?: string; href: string }) {
  return (
    <a href={href} className="k-hover" style={{ ...linkRow, textDecoration: "none" }}>
      <LinkLabel label={label} help={help} />
      <LinkChevron />
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

export function CostTotal({ children }: { children: ReactNode }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 16px", background: "var(--bg)" }}>
      <span style={{ flex: 1, fontWeight: 650 }}>Estimated total</span>
      <span style={{ fontVariantNumeric: "tabular-nums", fontWeight: 650, fontSize: 16 }}>{children}</span>
    </div>
  );
}

export const saveBar: CSSProperties = {
  padding: "12px 16px",
  borderTop: "1px solid var(--border)",
  display: "flex",
  alignItems: "center",
  gap: 10,
  flexWrap: "wrap",
};
