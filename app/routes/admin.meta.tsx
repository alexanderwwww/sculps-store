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
import {
  GlassGround,
  GlassPanel,
  GlassNotice,
  HandshakeResult,
  StateBadge,
  StateRail,
  Fact,
  FactGrid,
  Metric,
  PrimaryAction,
  QuietAction,
  glassBody,
  glassRule,
  glassField,
  glassInput,
  type ConnState,
} from "~/admin/connection-glass";

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


/* --------------------------------------------------------------- screen --
   Presentation only below this line. Every value shown is either stored on
   this store or counted from the last seven days by the loader above; where
   there is no source at all the panel keeps its empty state and says why. */

function formatWhen(iso: string) {
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function Meta({ loaderData }: Route.ComponentProps) {
  const { store, config, counts, encryption, tokenMask, hasToken } = loaderData;
  const fetcher = useFetcher<typeof action>();
  const [showToken, setShowToken] = useState(false);
  const [showKeys, setShowKeys] = useState(false);

  if (!store || !config || !counts) {
    return (
      <div style={{ maxWidth: 640, margin: "40px auto", ...card }}>
        <Empty title="No store yet" help="Create a store first." />
      </div>
    );
  }

  const result = fetcher.data as { ok?: string; error?: string } | undefined;
  const busy = fetcher.state !== "idle";

  // The connection is a state, and every stop in it is a stored fact:
  //   off        — nothing saved yet
  //   connecting — some credentials saved, but Meta has never answered us
  //   on         — pixel + token saved and a test event came back accepted
  const hasAny = Boolean(config.pixelId) || hasToken;
  const hasBoth = Boolean(config.pixelId) && hasToken;
  const tested = Boolean(config.lastTestAt);
  const state: ConnState = hasBoth && tested ? "on" : hasAny ? "connecting" : "off";
  const stateIndex = state === "on" ? 2 : state === "connecting" ? 1 : 0;

  // What this Worker actually sends server-side is the Purchase, and it is the
  // one with a shared event id. The other CAPI events are not sent, so they are
  // not listed as if they were.
  const browserTotal = counts.browser.reduce((sum, event) => sum + event.count, 0);
  const dedupPercent =
    counts.purchases > 0 ? Math.round((counts.deduplicated / counts.purchases) * 100) : null;

  return (
    <div style={{ maxWidth: 1100, margin: "0 auto", display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <h1 style={{ margin: 0, fontSize: 20, lineHeight: "28px", fontWeight: 650 }}>Meta · {store.name}</h1>
        <StateBadge
          state={state}
          label={state === "on" ? "Connected" : state === "connecting" ? "Connecting" : "Not connected"}
        />
      </div>

      <GlassGround>
        <GlassPanel
          title="Connection"
          sub="Pixel ID and ad account are stored on this store. The Conversions API token is stored encrypted and never shown again."
          aside={
            <StateBadge
              state={state}
              label={state === "on" ? "Handshake complete" : state === "connecting" ? "Waiting on a test" : "Nothing saved"}
            />
          }
        >
          <div style={glassBody}>
            <StateRail
              current={stateIndex}
              steps={[
                {
                  key: "off",
                  label: "Not connected",
                  note: hasAny ? "Credentials are saved" : "No pixel ID and no token saved yet",
                },
                {
                  key: "connecting",
                  label: "Connecting",
                  note: hasBoth
                    ? "Pixel ID and token are both stored"
                    : hasAny
                      ? "Both a pixel ID and a token are needed"
                      : "Save a pixel ID and a Conversions API token",
                },
                {
                  key: "on",
                  label: "Connected",
                  note: tested
                    ? `Meta accepted a test event on ${formatWhen(config.lastTestAt as string)}`
                    : "Meta has never answered this store",
                },
              ]}
            />

            <FactGrid>
              <Fact label="Pixel ID" value={config.pixelId || null} mono reason="Not saved yet" />
              <Fact label="Ad account" value={config.adAccountId || null} mono reason="Not saved yet" />
              <Fact
                label="Conversions API token"
                value={hasToken ? tokenMask : null}
                mono
                reason={encryption ? "Not saved yet" : "No encryption key on the Worker"}
              />
              <Fact label="Test event code" value={config.testEventCode || null} mono reason="Not saved yet" />
            </FactGrid>

            {!encryption ? (
              <GlassNotice kind="warning">
                No encryption key is set on the Worker yet, so the Conversions API token cannot be stored.
                Pixel ID and ad account will still save.
              </GlassNotice>
            ) : null}

            <hr style={glassRule} />

            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
              <span style={{ fontSize: 12, color: "var(--ink-2)" }}>
                {hasAny ? "Change what is stored for this store" : "Nothing is stored for this store yet"}
              </span>
              <QuietAction type="button" onClick={() => setShowKeys((open) => !open)} aria-expanded={showKeys}>
                {showKeys ? "Hide credentials" : hasAny ? "Edit credentials" : "Add credentials"}
              </QuietAction>
            </div>

            {showKeys || !hasAny ? (
              <fetcher.Form method="post" style={{ display: "flex", flexDirection: "column", gap: 14, animation: "kFade .22s ease-out" }}>
                <input type="hidden" name="intent" value="save" />
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 12 }}>
                  <label style={glassField}>
                    Pixel ID
                    <input name="pixelId" defaultValue={config.pixelId} placeholder="15 or 16 digits" style={glassInput} />
                  </label>
                  <label style={glassField}>
                    Ad account ID
                    <input name="adAccountId" defaultValue={config.adAccountId} placeholder="act_…" style={glassInput} />
                  </label>
                  <label style={glassField}>
                    Conversions API token
                    <span style={{ display: "flex", gap: 6 }}>
                      <input
                        name="capiToken"
                        type={showToken ? "text" : "password"}
                        placeholder={hasToken ? `stored: ${tokenMask}` : "EAAG…"}
                        style={{ ...glassInput, flex: 1 }}
                      />
                      <QuietAction type="button" onClick={() => setShowToken((current) => !current)} style={{ height: 38 }}>
                        {showToken ? "Hide" : "Show"}
                      </QuietAction>
                    </span>
                  </label>
                  {/*
                    Not in the prototype's three fields, but "Send test event" cannot be
                    real without it: Meta only keeps an event out of the live totals when
                    it carries a test event code from Events Manager.
                  */}
                  <label style={glassField}>
                    Test event code
                    <input name="testEventCode" defaultValue={config.testEventCode} placeholder="TEST12345" style={glassInput} />
                  </label>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                  <PrimaryAction type="submit" disabled={busy}>
                    {busy ? "Saving…" : "Save"}
                  </PrimaryAction>
                  <span style={{ flex: 1 }} />
                  <QuietAction
                    type="submit"
                    name="intent"
                    value="disconnect"
                    disabled={!hasAny}
                    title={hasAny ? undefined : "Nothing is stored for this store yet"}
                    style={{ color: "var(--critical)" }}
                  >
                    Disconnect
                  </QuietAction>
                </div>
              </fetcher.Form>
            ) : null}
          </div>
        </GlassPanel>

        {/* The handshake. This posts a real Purchase to the Conversions API with
            the stored test event code and shows what Meta actually said back. */}
        <GlassPanel
          title="Send test event"
          sub="Posts a real Purchase to the Conversions API with your test event code. Meta's own answer comes back below."
          lift
          aside={
            <StateBadge
              state={tested ? "on" : "off"}
              label={tested ? "Last accepted " + formatWhen(config.lastTestAt as string) : "Never tested"}
            />
          }
        >
          <div style={glassBody}>
            <fetcher.Form method="post" style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
              <PrimaryAction
                type="submit"
                name="intent"
                value="test"
                disabled={busy}
                style={{ height: 44, padding: "0 24px", fontSize: 14 }}
              >
                {busy ? "Sending…" : "Send test event"}
              </PrimaryAction>
              <span style={{ fontSize: 12, color: "var(--ink-2)", flex: 1, minWidth: 220, lineHeight: "18px" }}>
                It appears in Events Manager under Test events, and stays out of your live totals because it carries
                the test event code.
              </span>
            </fetcher.Form>

            {result?.error ? <HandshakeResult kind="error">{result.error}</HandshakeResult> : null}
            {result?.ok ? <HandshakeResult kind="ok">{result.ok}</HandshakeResult> : null}
          </div>
        </GlassPanel>

        {/* The two halves of the funnel, shown as a pair. */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(280px,1fr))", gap: 16 }}>
          <GlassPanel title="Browser pixel" sub="Counted on this store over the last 7 days" tight lift>
            <div style={{ ...glassBody, padding: "14px 16px 16px" }}>
              <Metric label="Events" value={browserTotal} note="All pixel events fired by the storefront" />
              {counts.browser.length === 0 ? (
                <span style={{ fontSize: 12, color: "var(--ink-2)", lineHeight: "18px" }}>
                  No events yet. They start when the storefront has visitors.
                </span>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {counts.browser.map((event) => {
                    const share = browserTotal > 0 ? (event.count / browserTotal) * 100 : 0;
                    return (
                      <div key={event.name} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                        <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <span style={{ flex: 1, fontFamily: "'JetBrains Mono',monospace", fontSize: 12 }}>{event.name}</span>
                          <span style={{ fontVariantNumeric: "tabular-nums", fontSize: 12, fontWeight: 600 }}>{event.count}</span>
                        </span>
                        <span style={{ height: 4, borderRadius: 2, background: "rgba(48,48,48,.10)", overflow: "hidden" }}>
                          <span
                            style={{
                              display: "block",
                              height: "100%",
                              width: `${share}%`,
                              borderRadius: 2,
                              background: "#2E7DFF",
                              transition: "width .55s cubic-bezier(.22,.8,.28,1)",
                            }}
                          />
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </GlassPanel>

          <GlassPanel title="Server · Conversions API" sub="Counted on this store over the last 7 days" tight lift>
            <div style={{ ...glassBody, padding: "14px 16px 16px" }}>
              <Metric
                label="Purchase events sent"
                value={counts.deduplicated}
                note="Purchase is the only event this Worker sends server-side"
              />
              <hr style={glassRule} />
              {/*
                Event match quality is only known inside Events Manager; there is no
                API reading it here, so the design's neutral state is what shows.
              */}
              <Metric
                label="Event match quality"
                value={null}
                reason="Only Events Manager knows this score. Nothing here reads it, so nothing is shown."
              />
            </div>
          </GlassPanel>
        </div>

        {/* Deduplication. The only evidence that exists is orders carrying a
            shared metaEventId, so that is exactly what is counted. */}
        <GlassPanel title="Deduplication" sub="Orders in the last 7 days carrying one shared event ID across browser and server" tight>
          <div style={{ ...glassBody, padding: "14px 16px 16px", flexDirection: "row", flexWrap: "wrap", gap: 24, alignItems: "flex-end" }}>
            <Metric label="Orders" value={counts.purchases} note="Placed in the last 7 days" />
            <Metric label="Carrying a shared event ID" value={counts.deduplicated} note="Meta cannot count these twice" />
            <Metric
              label="Covered"
              value={dedupPercent}
              note={dedupPercent === null ? undefined : "Of orders in the window"}
              reason="No orders in the last 7 days, so there is nothing to deduplicate yet."
            />
            <span style={{ flex: "1 1 220px", fontSize: 12, lineHeight: "18px", color: "var(--ink-2)" }}>
              An order without a shared event ID can be counted once by the pixel and once by the server. Every order
              placed through this checkout gets one.
            </span>
          </div>
        </GlassPanel>

        {/*
          No ad account is read anywhere in this app yet, so the design's own
          empty state stands instead of a table of guessed numbers.
        */}
        <GlassPanel title="Ad performance" tight>
          <div style={{ padding: "34px 16px 38px", textAlign: "center", color: "var(--ink-2)", fontSize: 13 }}>
            <div style={{ fontWeight: 650, color: "var(--ink)", marginBottom: 4 }}>No ad data</div>
            Spend, revenue and ROAS come from the Marketing API, which nothing here calls yet. No number is shown rather
            than a guessed one.
          </div>
        </GlassPanel>
      </GlassGround>
    </div>
  );
}
