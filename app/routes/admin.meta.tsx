/**
 * Meta.
 *
 * Pixel ID, ad account, and the Conversions API token — stored encrypted.
 * Event counts come from the orders and events tables, so a zero here means
 * zero events, not a broken screen. "Send test event" really posts to the
 * Conversions API and shows what Meta said back.
 */
import { useState } from "react";
import { useFetcher } from "react-router";
import { eq, and, gte, sql } from "drizzle-orm";
import type { Route } from "./+types/admin.meta";
import { requireUser } from "~/lib/auth.server";
import { resolveAdminStore, saveMetaConfig } from "~/lib/admin.server";
import { metaConfig, events, orders } from "~/db/schema";
import { encryptSecret, decryptSecret, encryptionReady, maskSecret } from "~/lib/crypto.server";
import { metaSettings, sendPurchase } from "~/lib/meta.server";
import { card, Empty } from "~/admin/ui";

export function meta() {
  return [{ title: "Meta — Shop Admin" }];
}

export async function loader({ context, request }: Route.LoaderArgs) {
  await requireUser(context.db, request);
  const url = new URL(request.url);
  const { store } = await resolveAdminStore(context.db, url);
  if (!store) return { store: null, config: null, counts: null, encryption: false, tokenMask: "—", hasToken: false };

  const [row] = await context.db
    .select()
    .from(metaConfig)
    .where(eq(metaConfig.storeId, store.id))
    .limit(1);

  const since = new Date(Date.now() - 7 * 86400_000);

  const [browserRows, purchaseRows] = await Promise.all([
    context.db
      .select({ type: events.type, n: sql<number>`cast(count(*) as int)` })
      .from(events)
      .where(and(eq(events.storeId, store.id), gte(events.at, since)))
      .groupBy(events.type),
    context.db
      .select({
        total: sql<number>`cast(count(*) as int)`,
        withEventId: sql<number>`cast(count(${orders.metaEventId}) as int)`,
      })
      .from(orders)
      .where(and(eq(orders.storeId, store.id), gte(orders.createdAt, since))),
  ]);

  const token = await decryptSecret(context.cloudflare.env, row?.capiTokenEnc ?? null);

  return {
    store: { slug: store.slug, name: store.name },
    encryption: encryptionReady(context.cloudflare.env),
    tokenMask: maskSecret(token),
    hasToken: Boolean(row?.capiTokenEnc),
    config: {
      pixelId: row?.pixelId ?? "",
      adAccountId: row?.adAccountId ?? "",
      testEventCode: row?.testEventCode ?? "",
      lastTestAt: row?.lastTestAt ? new Date(row.lastTestAt).toISOString() : null,
    },
    counts: {
      browser: browserRows.map((event) => ({ name: event.type, count: event.n })),
      purchases: purchaseRows[0]?.total ?? 0,
      deduplicated: purchaseRows[0]?.withEventId ?? 0,
    },
  };
}

export async function action({ context, request }: Route.ActionArgs) {
  const user = await requireUser(context.db, request);
  const url = new URL(request.url);
  const { store } = await resolveAdminStore(context.db, url);
  if (!store) return { error: "Create a store first." };

  const form = await request.formData();
  const intent = String(form.get("intent") || "save");

  if (intent === "disconnect") {
    await context.db.delete(metaConfig).where(eq(metaConfig.storeId, store.id));
    return { ok: "Disconnected. The pixel and the stored token are gone from this store." };
  }

  if (intent === "test") {
    const settings = await metaSettings(context.db, context.cloudflare.env, store.id);
    if (!settings) {
      return {
        error:
          "Nothing to send with: this store needs both a pixel ID and a Conversions API token saved before a test event can go out.",
      };
    }
    if (!settings.testEventCode) {
      // Without a test event code Meta would count this as a real purchase.
      return {
        error:
          "Add the test event code from Events Manager first. Without it Meta would treat this as a real purchase.",
      };
    }

    const result = await sendPurchase(settings, {
      eventId: crypto.randomUUID(),
      eventTime: Math.floor(Date.now() / 1000),
      sourceUrl: `https://${store.domain}/`,
      email: user.email,
      valueCents: 0,
      currency: store.currency,
      contents: [],
      userAgent: request.headers.get("User-Agent"),
    });

    if (!result.ok) return { error: `Meta refused the test event: ${result.reason}` };

    await context.db
      .update(metaConfig)
      .set({ lastTestAt: new Date() })
      .where(eq(metaConfig.storeId, store.id));

    return { ok: `Test event accepted with code ${settings.testEventCode}. It shows in Events Manager under Test events.` };
  }

  const pixelId = String(form.get("pixelId") || "").trim() || null;
  const adAccountId = String(form.get("adAccountId") || "").trim() || null;
  const testEventCode = String(form.get("testEventCode") || "").trim() || null;
  const token = String(form.get("capiToken") || "").trim();

  if (pixelId && !/^\d{15,16}$/.test(pixelId)) {
    return { error: "A Meta pixel ID is 15 or 16 digits. Check what you pasted." };
  }

  await saveMetaConfig(context.db, store.id, { pixelId, adAccountId, testEventCode });

  if (token) {
    if (!encryptionReady(context.cloudflare.env)) {
      return {
        error:
          "The token was not saved: no ENCRYPTION_KEY is set on the Worker, and storing an access token unencrypted is not something this will do.",
      };
    }
    const encrypted = await encryptSecret(context.cloudflare.env, token);
    await context.db
      .update(metaConfig)
      .set({ capiTokenEnc: encrypted })
      .where(eq(metaConfig.storeId, store.id));
  }

  return { ok: "Saved." };
}

const fieldLabel: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 4,
  fontSize: 12,
  fontWeight: 550,
  color: "var(--ink-2)",
};

const monoInput: React.CSSProperties = {
  height: 36,
  padding: "0 12px",
  borderRadius: 8,
  border: "1px solid var(--input-border)",
  background: "var(--input)",
  fontSize: 13,
  fontFamily: "'JetBrains Mono',monospace",
  color: "var(--ink)",
};

const cardStyle: React.CSSProperties = {
  background: "var(--surface)",
  border: "1px solid var(--border)",
  borderRadius: 12,
  boxShadow: "var(--shadow)",
  overflow: "hidden",
};

const cardHead: React.CSSProperties = {
  padding: "12px 16px",
  borderBottom: "1px solid var(--border)",
  fontWeight: 650,
};

function pill(kind: string, label: string) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        height: 22,
        padding: "0 9px",
        borderRadius: 8,
        fontSize: 12,
        fontWeight: 550,
        background: `var(--b-${kind}-bg)`,
        color: `var(--b-${kind}-fg)`,
      }}
    >
      <span style={{ width: 6, height: 6, borderRadius: "50%", background: "currentColor", opacity: 0.8 }} />
      {label}
    </span>
  );
}

export default function Meta({ loaderData }: Route.ComponentProps) {
  const { store, config, counts, encryption, tokenMask, hasToken } = loaderData;
  const fetcher = useFetcher<typeof action>();
  const [showToken, setShowToken] = useState(false);

  if (!store || !config || !counts) {
    return (
      <div style={{ maxWidth: 640, margin: "40px auto", ...card }}>
        <Empty title="No store yet" help="Create a store first." />
      </div>
    );
  }

  const result = fetcher.data as { ok?: string; error?: string } | undefined;
  const connected = Boolean(config.pixelId) && hasToken;
  const dot = connected ? "#22C55E" : "var(--ink-3)";

  // What this Worker actually sends server-side is the Purchase, and it is the
  // one with a shared event id. The other CAPI events are not sent, so they are
  // not listed as if they were.
  const serverEvents = [{ name: "Purchase", count: counts.deduplicated }];

  const tested = Boolean(config.lastTestAt);

  return (
    <div style={{ maxWidth: 1100, margin: "0 auto", display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <h1 style={{ margin: 0, fontSize: 20, lineHeight: "28px", fontWeight: 650 }}>Meta · {store.name}</h1>
        {pill(connected ? "success" : "neutral", connected ? "Connected" : "Not connected")}
      </div>

      {result?.error ? (
        <div style={{ background: "var(--b-critical-bg)", color: "var(--b-critical-fg)", borderRadius: 10, padding: "10px 12px", fontSize: 13 }}>
          {result.error}
        </div>
      ) : null}
      {result?.ok ? (
        <div style={{ background: "var(--b-success-bg)", color: "var(--b-success-fg)", borderRadius: 10, padding: "10px 12px", fontSize: 13 }}>
          {result.ok}
        </div>
      ) : null}
      {!encryption ? (
        <div style={{ background: "var(--b-warning-bg)", color: "var(--b-warning-fg)", borderRadius: 10, padding: "10px 12px", fontSize: 13 }}>
          No encryption key is set on the Worker yet, so the Conversions API token cannot be stored.
          Pixel ID and ad account will still save.
        </div>
      ) : null}

      <fetcher.Form method="post" style={cardStyle}>
        <input type="hidden" name="intent" value="save" />
        <div style={cardHead}>Connection</div>
        <div
          style={{
            padding: "14px 16px",
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))",
            gap: 12,
          }}
        >
          <label style={fieldLabel}>
            Pixel ID
            <input name="pixelId" defaultValue={config.pixelId} placeholder="15 or 16 digits" style={monoInput} />
          </label>
          <label style={fieldLabel}>
            Ad account ID
            <input name="adAccountId" defaultValue={config.adAccountId} placeholder="act_…" style={monoInput} />
          </label>
          <label style={fieldLabel}>
            Conversions API token
            <span style={{ display: "flex", gap: 6 }}>
              <input
                name="capiToken"
                type={showToken ? "text" : "password"}
                placeholder={hasToken ? `stored: ${tokenMask}` : "EAAG…"}
                style={{ ...monoInput, flex: 1, minWidth: 0 }}
              />
              <button
                type="button"
                onClick={() => setShowToken((current) => !current)}
                style={{
                  height: 36,
                  padding: "0 10px",
                  borderRadius: 8,
                  border: "1px solid var(--border)",
                  background: "var(--surface)",
                  color: "var(--ink)",
                  fontSize: 12,
                  fontWeight: 550,
                  cursor: "pointer",
                }}
              >
                {showToken ? "Hide" : "Show"}
              </button>
            </span>
          </label>
          {/*
            Not in the prototype's three fields, but "Send test event" cannot be
            real without it: Meta only keeps an event out of the live totals when
            it carries a test event code from Events Manager.
          */}
          <label style={fieldLabel}>
            Test event code
            <input name="testEventCode" defaultValue={config.testEventCode} placeholder="TEST12345" style={monoInput} />
          </label>
        </div>
        <div
          style={{
            padding: "12px 16px",
            borderTop: "1px solid var(--border)",
            display: "flex",
            alignItems: "center",
            gap: 10,
            flexWrap: "wrap",
          }}
        >
          <button
            type="submit"
            style={{
              height: 30,
              padding: "0 12px",
              borderRadius: 8,
              border: "1px solid var(--border)",
              background: "var(--surface)",
              color: "var(--ink)",
              fontSize: 12,
              fontWeight: 550,
              cursor: "pointer",
            }}
          >
            Save
          </button>
          <button
            type="submit"
            name="intent"
            value="test"
            style={{
              height: 30,
              padding: "0 12px",
              borderRadius: 8,
              border: 0,
              background: "var(--accent)",
              color: "var(--accent-ink)",
              fontSize: 12,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Send test event
          </button>
          {pill(tested ? "success" : "neutral", tested ? "Received" : "Not tested")}
          <span style={{ fontSize: 12, color: "var(--ink-2)", flex: 1, minWidth: 200 }}>
            Browser and server events share one event ID, so Meta never counts a purchase twice.
          </span>
          <button
            type="submit"
            name="intent"
            value="disconnect"
            style={{
              height: 30,
              padding: "0 12px",
              borderRadius: 8,
              border: "1px solid var(--border)",
              background: "var(--surface)",
              color: "var(--critical)",
              fontSize: 12,
              fontWeight: 550,
              cursor: "pointer",
            }}
          >
            Disconnect
          </button>
        </div>
      </fetcher.Form>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(2,minmax(0,1fr))", gap: 16 }}>
        <div style={cardStyle}>
          <div style={cardHead}>Browser events</div>
          {counts.browser.length === 0 ? (
            <div style={{ padding: "40px 16px", textAlign: "center", color: "var(--ink-2)" }}>
              <div style={{ fontWeight: 650, color: "var(--ink)", marginBottom: 4 }}>No events yet</div>
              They start when the storefront has visitors.
            </div>
          ) : (
            counts.browser.map((event) => (
              <div
                key={event.name}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "9px 16px",
                  borderBottom: "1px solid var(--border)",
                }}
              >
                <span style={{ width: 7, height: 7, borderRadius: "50%", background: dot }} />
                <span style={{ flex: 1, fontFamily: "'JetBrains Mono',monospace", fontSize: 12 }}>{event.name}</span>
                <span style={{ fontVariantNumeric: "tabular-nums", color: "var(--ink-2)" }}>{event.count}</span>
              </div>
            ))
          )}
        </div>

        <div style={cardStyle}>
          <div style={cardHead}>Server events (CAPI)</div>
          {serverEvents.map((event) => (
            <div
              key={event.name}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "9px 16px",
                borderBottom: "1px solid var(--border)",
              }}
            >
              <span style={{ width: 7, height: 7, borderRadius: "50%", background: dot }} />
              <span style={{ flex: 1, fontFamily: "'JetBrains Mono',monospace", fontSize: 12 }}>{event.name}</span>
              <span style={{ fontVariantNumeric: "tabular-nums", color: "var(--ink-2)" }}>{event.count}</span>
            </div>
          ))}
          {/*
            Event match quality is only known inside Events Manager; there is no
            API reading it here, so the design's neutral state is what shows.
          */}
          <div
            style={{
              padding: "11px 16px",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 10,
            }}
          >
            <span style={{ fontSize: 12, fontWeight: 550, color: "var(--ink-2)" }}>Event match quality</span>
            <span style={{ fontWeight: 650, color: "var(--ink-3)" }}>—</span>
          </div>
        </div>
      </div>

      <div style={cardStyle}>
        <div style={cardHead}>Ad performance</div>
        {/*
          No ad account is read anywhere in this app yet, so the design's own
          empty state stands instead of a table of guessed numbers.
        */}
        <div style={{ padding: "40px 16px", textAlign: "center", color: "var(--ink-2)" }}>
          <div style={{ fontWeight: 650, color: "var(--ink)", marginBottom: 4 }}>No ad data</div>
          Connect an ad account to pull spend, revenue and ROAS in here.
        </div>
      </div>
    </div>
  );
}
