/**
 * Meta.
 *
 * Pixel ID, ad account, and the Conversions API token — stored encrypted.
 * Event counts come from the orders and events tables, so a zero here means
 * zero events, not a broken screen.
 */
import { Form, useNavigation } from "react-router";
import type { Route } from "./+types/admin.meta";
import { eq, and, gte, sql } from "drizzle-orm";
import { requireUser } from "~/lib/auth.server";
import { resolveAdminStore, saveMetaConfig } from "~/lib/admin.server";
import { metaConfig, events, orders } from "~/db/schema";
import { encryptSecret, decryptSecret, encryptionReady, maskSecret } from "~/lib/crypto.server";
import { card, cardHeader, Badge, PageTitle, primaryButton, secondaryButton, input, Empty } from "~/admin/ui";

export function meta() {
  return [{ title: "Meta — Shop Admin" }];
}

export async function loader({ context, request }: Route.LoaderArgs) {
  await requireUser(context.db, request);
  const url = new URL(request.url);
  const { store } = await resolveAdminStore(context.db, url);
  if (!store) return { store: null, config: null, counts: null, encryption: false, tokenMask: "—" };

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
      lastTestAt: row?.lastTestAt ?? null,
    },
    counts: {
      browser: browserRows.map((event) => ({ name: event.type, count: event.n })),
      purchases: purchaseRows[0]?.total ?? 0,
      deduplicated: purchaseRows[0]?.withEventId ?? 0,
    },
  };
}

export async function action({ context, request }: Route.ActionArgs) {
  await requireUser(context.db, request);
  const url = new URL(request.url);
  const { store } = await resolveAdminStore(context.db, url);
  if (!store) return { error: "Create a store first." };

  const form = await request.formData();
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

export default function Meta({ loaderData, actionData }: Route.ComponentProps) {
  const { store, config, counts, encryption, tokenMask, hasToken } = loaderData;
  const navigation = useNavigation();
  const busy = navigation.state === "submitting";

  if (!store || !config || !counts) {
    return (
      <div style={{ maxWidth: 640, margin: "40px auto", ...card }}>
        <Empty title="No store yet" help="Create a store first." />
      </div>
    );
  }

  const connected = Boolean(config.pixelId) && hasToken;

  return (
    <div style={{ maxWidth: 1100, margin: "0 auto", display: "flex", flexDirection: "column", gap: 16 }}>
      <PageTitle
        title={`Meta · ${store.name}`}
        actions={
          <Badge kind={connected ? "success" : "warning"}>
            {connected ? "Connected" : config.pixelId ? "Pixel only — no server events" : "Not connected"}
          </Badge>
        }
      />

      {actionData?.error ? (
        <div style={{ background: "var(--b-critical-bg)", color: "var(--b-critical-fg)", borderRadius: 10, padding: "10px 12px", fontSize: 13 }}>
          {actionData.error}
        </div>
      ) : null}
      {actionData?.ok ? (
        <div style={{ background: "var(--b-success-bg)", color: "var(--b-success-fg)", borderRadius: 10, padding: "10px 12px", fontSize: 13 }}>
          {actionData.ok}
        </div>
      ) : null}

      {!encryption ? (
        <div style={{ background: "var(--b-warning-bg)", color: "var(--b-warning-fg)", borderRadius: 10, padding: "10px 12px", fontSize: 13 }}>
          No encryption key is set on the Worker yet, so the Conversions API token cannot be stored.
          Pixel ID and ad account will still save.
        </div>
      ) : null}

      <Form method="post" style={card}>
        <div style={cardHeader}>Connection</div>
        <div style={{ padding: "14px 16px", display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 12 }}>
          <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span style={{ fontSize: 12, fontWeight: 550, color: "var(--ink-2)" }}>Pixel ID</span>
            <input
              name="pixelId"
              defaultValue={config.pixelId}
              placeholder="15 or 16 digits"
              style={{ ...input, fontFamily: "'JetBrains Mono',monospace" }}
            />
          </label>
          <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span style={{ fontSize: 12, fontWeight: 550, color: "var(--ink-2)" }}>Ad account ID</span>
            <input
              name="adAccountId"
              defaultValue={config.adAccountId}
              placeholder="act_…"
              style={{ ...input, fontFamily: "'JetBrains Mono',monospace" }}
            />
          </label>
          <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span style={{ fontSize: 12, fontWeight: 550, color: "var(--ink-2)" }}>
              Conversions API token {hasToken ? `(stored: ${tokenMask})` : ""}
            </span>
            <input
              name="capiToken"
              type="password"
              placeholder={hasToken ? "Leave blank to keep the stored one" : "EAAG…"}
              style={{ ...input, fontFamily: "'JetBrains Mono',monospace" }}
            />
          </label>
          <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span style={{ fontSize: 12, fontWeight: 550, color: "var(--ink-2)" }}>Test event code</span>
            <input name="testEventCode" defaultValue={config.testEventCode} style={input} />
          </label>
        </div>
        <div style={{ padding: "12px 16px", borderTop: "1px solid var(--border)", display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <button type="submit" disabled={busy} style={primaryButton}>
            {busy ? "Saving…" : "Save"}
          </button>
          <span style={{ fontSize: 12, color: "var(--ink-2)", flex: 1, minWidth: 200 }}>
            The browser pixel and the server call share one event ID, so Meta merges them instead of
            counting a purchase twice.
          </span>
        </div>
      </Form>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(320px,1fr))", gap: 16 }}>
        <div style={card}>
          <div style={cardHeader}>Browser events · last 7 days</div>
          {counts.browser.length === 0 ? (
            <div style={{ padding: "24px 16px", textAlign: "center", color: "var(--ink-2)" }}>
              No events recorded yet. They start when the storefront has visitors.
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
                <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#22C55E" }} />
                <span style={{ flex: 1, fontFamily: "'JetBrains Mono',monospace", fontSize: 12 }}>
                  {event.name}
                </span>
                <span style={{ fontVariantNumeric: "tabular-nums", color: "var(--ink-2)" }}>
                  {event.count}
                </span>
              </div>
            ))
          )}
        </div>

        <div style={card}>
          <div style={cardHeader}>Server events (CAPI) · last 7 days</div>
          <Row label="Purchases recorded" value={String(counts.purchases)} />
          <Row label="Carrying a shared event ID" value={String(counts.deduplicated)} />
          <div style={{ padding: "11px 16px", fontSize: 12, color: "var(--ink-2)", lineHeight: "17px" }}>
            {counts.purchases === 0
              ? "Nothing to send yet — these appear once real orders come in."
              : counts.deduplicated === counts.purchases
                ? "Every purchase carries an event ID, so nothing will be double counted."
                : "Some purchases have no event ID. Those can be counted twice by Meta."}
          </div>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "9px 16px",
        borderBottom: "1px solid var(--border)",
      }}
    >
      <span style={{ flex: 1 }}>{label}</span>
      <span style={{ fontVariantNumeric: "tabular-nums", fontWeight: 600 }}>{value}</span>
    </div>
  );
}
