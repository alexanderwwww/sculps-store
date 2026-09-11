/**
 * Meta.
 *
 * Pixel ID, ad account, and the Conversions API token — stored encrypted.
 * Event counts come from the orders and events tables, so a zero here means
 * zero events, not a broken screen. "Send test event" really posts to the
 * Conversions API and shows what Meta said back.
 */
import { useState, type ReactNode } from "react";
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
  Fact,
  FactGrid,
  Metric,
  PrimaryAction,
  QuietAction,
  glassBody,
  glassRule,
  glassField,
  glassInput,
  CopyValue,
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
    store: { slug: store.slug, name: store.name, domain: store.domain },
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

  if (intent === "golive") {
    await saveMetaConfig(context.db, store.id, { testEventCode: null });
    return { ok: "Live. The test code is cleared, so events now count in your real totals." };
  }

  // Every field is read the way a person actually pastes it — the whole line
  // out of Events Manager, a URL with the id buried in it, a token with a
  // stray quote around it. Only what the form actually carries is written, so
  // saving one step never wipes the step before it.
  const patch: Partial<{ pixelId: string | null; adAccountId: string | null; testEventCode: string | null }> = {};

  if (form.has("pixelId")) {
    const raw = String(form.get("pixelId") || "");
    const pixelId = readPixelId(raw);
    if (raw.trim() && !pixelId) {
      return { error: "No pixel ID in that. It is a run of 15 or 16 digits — paste the whole line from Events Manager if it is easier." };
    }
    patch.pixelId = pixelId;
  }

  if (form.has("adAccountId")) {
    const raw = String(form.get("adAccountId") || "").trim();
    patch.adAccountId = raw ? (raw.startsWith("act_") ? raw : `act_${raw.replace(/\D/g, "")}`) : null;
  }

  if (form.has("testEventCode")) {
    const raw = String(form.get("testEventCode") || "");
    const code = readTestCode(raw);
    if (raw.trim() && !code) {
      return { error: "No test event code in that. It looks like TEST12345 and sits on the Test events tab." };
    }
    patch.testEventCode = code;
  }

  await saveMetaConfig(context.db, store.id, patch);

  if (form.has("capiToken")) {
    const token = readToken(String(form.get("capiToken") || ""));
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
  }

  return { ok: "Saved." };
}

/* ------------------------------------------------------------- parsing --
   Three readers, deliberately forgiving. Someone setting this up is copying
   out of another tab, and a setup screen that rejects "Pixel ID: 123…" for
   having a label on it is a setup screen that wastes an afternoon. */

/** A Meta pixel ID is a run of 15 or 16 digits, wherever it is hiding. */
export function readPixelId(raw: string): string | null {
  const match = raw.replace(/[^\d]+/g, " ").match(/\b\d{15,16}\b/);
  return match ? match[0] : null;
}

/** Conversions API tokens start EAA. Anything else is taken as typed. */
export function readToken(raw: string): string | null {
  const trimmed = raw.trim().replace(/^["'`]|["'`]$/g, "");
  if (!trimmed) return null;
  const match = trimmed.match(/EAA[A-Za-z0-9_-]{20,}/);
  return match ? match[0] : trimmed;
}

/** Test event codes look like TEST12345. */
export function readTestCode(raw: string): string | null {
  const trimmed = raw.trim().replace(/^["'`]|["'`]$/g, "");
  if (!trimmed) return null;
  const match = trimmed.match(/TEST\w+/i);
  return match ? match[0].toUpperCase() : trimmed;
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

/** Meta's own pages, deep-linked so nobody has to go hunting through tabs. */
const EVENTS_MANAGER = "https://business.facebook.com/events_manager2/list/overview";
const datasetSettings = (pixelId: string) =>
  `https://business.facebook.com/events_manager2/list/dataset/${pixelId}/settings`;
const datasetTestEvents = (pixelId: string) =>
  `https://business.facebook.com/events_manager2/list/dataset/${pixelId}/test_events`;
const OWNED_DOMAINS = "https://business.facebook.com/settings/owned-domains";

/** The link out of a step. It looks like a button because it is the step's move. */
function OpenLink({ href, children, disabled, title }: { href: string; children: ReactNode; disabled?: boolean; title?: string }) {
  const body = (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 7,
        height: 38,
        padding: "0 16px",
        borderRadius: 12,
        border: "1px solid rgba(255,255,255,.85)",
        background: disabled ? "rgba(255,255,255,.4)" : "rgba(255,255,255,.72)",
        boxShadow: disabled ? "none" : "0 2px 10px rgba(20,16,40,.08)",
        color: disabled ? "var(--ink-3)" : "var(--ink)",
        fontSize: 13,
        fontWeight: 600,
        cursor: disabled ? "not-allowed" : "pointer",
        transition: "transform .18s cubic-bezier(.22,.8,.28,1), background .18s ease-out",
      }}
    >
      {children}
      <span aria-hidden style={{ fontSize: 12, opacity: 0.6 }}>↗</span>
    </span>
  );
  if (disabled) return <span title={title}>{body}</span>;
  return (
    <a href={href} target="_blank" rel="noreferrer" className="k-lift" style={{ textDecoration: "none" }} title={title}>
      {body}
    </a>
  );
}

/**
 * One stop in the setup.
 *
 * Done steps collapse to a line with the stored value on it, so what is left
 * to do is always the thing that is open. The number turns into a tick — the
 * only reward this screen offers, and it is earned by a stored fact.
 */
function SetupStep({
  index,
  title,
  blurb,
  done,
  doneValue,
  open,
  onOpen,
  children,
}: {
  index: number;
  title: string;
  blurb: string;
  done: boolean;
  doneValue?: string | null;
  open: boolean;
  onOpen: () => void;
  children: ReactNode;
}) {
  return (
    <div
      style={{
        display: "flex",
        gap: 14,
        padding: "14px 16px",
        borderRadius: 16,
        background: open ? "rgba(255,255,255,.55)" : "transparent",
        border: `1px solid ${open ? "rgba(255,255,255,.8)" : "transparent"}`,
        transition: "background .22s ease-out, border-color .22s ease-out",
      }}
    >
      <span
        aria-hidden
        style={{
          flex: "none",
          width: 28,
          height: 28,
          borderRadius: "50%",
          display: "grid",
          placeItems: "center",
          fontSize: 13,
          fontWeight: 700,
          background: done ? "#22C55E" : open ? "var(--accent)" : "rgba(48,48,48,.10)",
          color: done || open ? "#fff" : "var(--ink-3)",
          transition: "background .3s ease-out",
        }}
      >
        {done ? "✓" : index}
      </span>

      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: open ? 10 : 2 }}>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
          <span style={{ fontSize: 14, fontWeight: 650, lineHeight: "20px" }}>{title}</span>
          {done && !open ? (
            <button
              type="button"
              onClick={onOpen}
              style={{ border: 0, background: "none", padding: 0, fontSize: 12, fontWeight: 600, color: "var(--ink-2)", cursor: "pointer" }}
            >
              Change
            </button>
          ) : null}
        </div>

        {open ? (
          <>
            <span style={{ fontSize: 12.5, lineHeight: "19px", color: "var(--ink-2)" }}>{blurb}</span>
            <div style={{ animation: "kFade .22s ease-out", display: "flex", flexDirection: "column", gap: 10 }}>{children}</div>
          </>
        ) : (
          <span
            style={{
              fontSize: 12.5,
              lineHeight: "19px",
              color: done ? "var(--ink)" : "var(--ink-2)",
              fontFamily: done && doneValue ? "'JetBrains Mono',monospace" : undefined,
              overflowWrap: "anywhere",
            }}
          >
            {done ? doneValue : blurb}
          </span>
        )}
      </div>
    </div>
  );
}

/** The four events this store really sends, and which halves send them. */
const SENT_EVENTS: { name: string; when: string; browser: boolean; server: boolean }[] = [
  { name: "ViewContent", when: "Someone opens a product", browser: true, server: true },
  { name: "AddToCart", when: "Something goes in the cart", browser: true, server: true },
  { name: "InitiateCheckout", when: "The checkout page loads", browser: true, server: true },
  { name: "Purchase", when: "An order is paid for", browser: true, server: true },
];

export default function Meta({ loaderData }: Route.ComponentProps) {
  const { store, config, counts, encryption, tokenMask, hasToken } = loaderData;
  const fetcher = useFetcher<typeof action>();
  const [showToken, setShowToken] = useState(false);
  const [advanced, setAdvanced] = useState(false);
  const [editing, setEditing] = useState<number | null>(null);

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
  const hasPixel = Boolean(config.pixelId);
  const hasCode = Boolean(config.testEventCode);
  const hasAny = hasPixel || hasToken;
  const hasBoth = hasPixel && hasToken;
  const tested = Boolean(config.lastTestAt);
  const state: ConnState = hasBoth && tested ? "on" : hasAny ? "connecting" : "off";

  // Which step is open: the first unfinished one, unless a finished one was
  // reopened with Change. Nothing here is a wizard that traps you — every
  // step stays reachable.
  const firstUnfinished = !hasPixel ? 1 : !hasToken ? 2 : !hasCode && !tested ? 3 : 0;
  const openStep = editing ?? firstUnfinished;
  const setupDone = hasBoth && tested;
  const live = hasBoth && tested && !hasCode;

  const browserTotal = counts.browser.reduce((sum, event) => sum + event.count, 0);
  const dedupPercent =
    counts.purchases > 0 ? Math.round((counts.deduplicated / counts.purchases) * 100) : null;

  return (
    <div style={{ maxWidth: 1100, margin: "0 auto", display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <h1 style={{ margin: 0, fontSize: 20, lineHeight: "28px", fontWeight: 650 }}>Meta · {store.name}</h1>
        <StateBadge
          state={state}
          label={live ? "Live" : state === "on" ? "Connected" : state === "connecting" ? "Connecting" : "Not connected"}
        />
      </div>

      <GlassGround>
        {/* ---------------------------------------------------------- setup --
            Three things to copy across, each next to the button that opens the
            exact Meta page it lives on. Nothing is typed twice and nothing is
            hidden behind a developer doc. */}
        <GlassPanel
          title={setupDone ? "Connection" : "Set up Meta"}
          sub={
            setupDone
              ? "Everything Meta needs is stored. Open a step to change what is saved."
              : "Three things to copy across from Meta. Each step opens the exact page its value lives on — paste the whole line if it is easier, this reads the value out of it."
          }
          aside={
            <StateBadge
              state={setupDone ? "on" : hasAny ? "connecting" : "off"}
              label={setupDone ? "Handshake complete" : `${[hasPixel, hasToken, hasCode || tested].filter(Boolean).length} of 3 done`}
            />
          }
        >
          <div style={{ ...glassBody, gap: 4 }}>
            <SetupStep
              index={1}
              title="Your pixel ID"
              blurb="Open Events Manager. If you have no data source yet, press Connect data source → Web and name it after your store. The pixel ID is the long number under its name."
              done={hasPixel}
              doneValue={config.pixelId}
              open={openStep === 1}
              onOpen={() => setEditing(1)}
            >
              <OpenLink href={EVENTS_MANAGER}>Open Events Manager</OpenLink>
              <fetcher.Form method="post" style={{ display: "flex", gap: 8, flexWrap: "wrap" }} onSubmit={() => setEditing(null)}>
                <input type="hidden" name="intent" value="save" />
                <input
                  name="pixelId"
                  defaultValue={config.pixelId}
                  placeholder="Paste the pixel ID"
                  style={{ ...glassInput, flex: "1 1 220px" }}
                />
                <PrimaryAction type="submit" disabled={busy}>
                  {busy ? "Saving…" : "Save"}
                </PrimaryAction>
              </fetcher.Form>
            </SetupStep>

            <SetupStep
              index={2}
              title="Conversions API token"
              blurb="On the same data source, open the Settings tab and scroll to Conversions API → Generate access token. Meta shows it once, so paste it straight in. It is stored encrypted and never shown again."
              done={hasToken}
              doneValue={tokenMask}
              open={openStep === 2}
              onOpen={() => setEditing(2)}
            >
              <OpenLink
                href={hasPixel ? datasetSettings(config.pixelId) : EVENTS_MANAGER}
                disabled={!hasPixel}
                title={hasPixel ? undefined : "Save the pixel ID first and this opens straight to the right page"}
              >
                Open the token page
              </OpenLink>
              {!encryption ? (
                <GlassNotice kind="warning">
                  No encryption key is set on the Worker yet, so the token cannot be stored. Everything else still saves.
                </GlassNotice>
              ) : null}
              <fetcher.Form method="post" style={{ display: "flex", gap: 8, flexWrap: "wrap" }} onSubmit={() => setEditing(null)}>
                <input type="hidden" name="intent" value="save" />
                <input
                  name="capiToken"
                  type={showToken ? "text" : "password"}
                  placeholder={hasToken ? `stored: ${tokenMask}` : "Paste the token"}
                  style={{ ...glassInput, flex: "1 1 220px" }}
                />
                <QuietAction type="button" onClick={() => setShowToken((current) => !current)} style={{ height: 38 }}>
                  {showToken ? "Hide" : "Show"}
                </QuietAction>
                <PrimaryAction type="submit" disabled={busy || !encryption}>
                  {busy ? "Saving…" : "Save"}
                </PrimaryAction>
              </fetcher.Form>
            </SetupStep>

            <SetupStep
              index={3}
              title="Test event code"
              blurb="The Test events tab shows a code like TEST12345. It keeps the next step out of your real numbers — you clear it once the test passes."
              done={hasCode || tested}
              doneValue={config.testEventCode || (tested ? "Tested, code cleared" : null)}
              open={openStep === 3}
              onOpen={() => setEditing(3)}
            >
              <OpenLink
                href={hasPixel ? datasetTestEvents(config.pixelId) : EVENTS_MANAGER}
                disabled={!hasPixel}
                title={hasPixel ? undefined : "Save the pixel ID first and this opens straight to the right page"}
              >
                Open Test events
              </OpenLink>
              <fetcher.Form method="post" style={{ display: "flex", gap: 8, flexWrap: "wrap" }} onSubmit={() => setEditing(null)}>
                <input type="hidden" name="intent" value="save" />
                <input
                  name="testEventCode"
                  defaultValue={config.testEventCode}
                  placeholder="TEST12345"
                  style={{ ...glassInput, flex: "1 1 220px" }}
                />
                <PrimaryAction type="submit" disabled={busy}>
                  {busy ? "Saving…" : "Save"}
                </PrimaryAction>
              </fetcher.Form>
            </SetupStep>

            {result?.error ? <HandshakeResult kind="error">{result.error}</HandshakeResult> : null}
            {result?.ok ? <HandshakeResult kind="ok">{result.ok}</HandshakeResult> : null}
          </div>
        </GlassPanel>

        {/* The handshake. This posts a real Purchase to the Conversions API with
            the stored test event code and shows what Meta actually said back. */}
        <GlassPanel
          title={live ? "Everything is live" : tested ? "Tested — one thing left" : "Prove it works"}
          sub={
            live
              ? "The test code is cleared, so every event from this store counts in your real numbers."
              : tested
                ? "Meta has answered this store. Clear the test code and events start counting for real."
                : "This posts a real Purchase to Meta with your test code and shows Meta's own answer. It stays out of your live totals."
          }
          lift
          aside={
            <StateBadge
              state={live ? "on" : tested ? "connecting" : "off"}
              label={tested ? "Last accepted " + formatWhen(config.lastTestAt as string) : "Never tested"}
            />
          }
        >
          <div style={glassBody}>
            <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
              <fetcher.Form method="post">
                <PrimaryAction
                  type="submit"
                  name="intent"
                  value="test"
                  disabled={busy || !hasBoth || !hasCode}
                  title={!hasBoth ? "Save a pixel ID and a token first" : !hasCode ? "Add the test event code first" : undefined}
                  style={{ height: 44, padding: "0 24px", fontSize: 14 }}
                >
                  {busy ? "Sending…" : tested ? "Test again" : "Run the test"}
                </PrimaryAction>
              </fetcher.Form>

              {hasPixel ? <OpenLink href={datasetTestEvents(config.pixelId)}>Watch it land</OpenLink> : null}

              {tested && hasCode ? (
                <fetcher.Form method="post">
                  <PrimaryAction
                    type="submit"
                    name="intent"
                    value="golive"
                    disabled={busy}
                    style={{ height: 44, padding: "0 24px", fontSize: 14, background: "#0B7A3B" }}
                  >
                    Go live
                  </PrimaryAction>
                </fetcher.Form>
              ) : null}

              <span style={{ fontSize: 12, color: "var(--ink-2)", flex: 1, minWidth: 200, lineHeight: "18px" }}>
                {live
                  ? "Nothing left to do here."
                  : "Meta's answer comes back below, word for word. A failure prints the reason it gave."}
              </span>
            </div>
          </div>
        </GlassPanel>

        {/* What this store actually sends. Read off the code, not aspirational. */}
        <GlassPanel
          title="What Meta gets"
          sub="Both halves send the same event ID, so Meta merges them into one conversion instead of counting the sale twice. Emails are hashed before they leave this server."
          tight
        >
          <div style={{ padding: "12px 16px 16px", display: "flex", flexDirection: "column", gap: 2 }}>
            <div style={{ display: "grid", gridTemplateColumns: "1.1fr 1.4fr auto auto", gap: 10, fontSize: 11, fontWeight: 600, color: "var(--ink-2)", padding: "0 2px 6px" }}>
              <span>Event</span>
              <span>When it fires</span>
              <span style={{ textAlign: "center", width: 62 }}>Browser</span>
              <span style={{ textAlign: "center", width: 62 }}>Server</span>
            </div>
            {SENT_EVENTS.map((event) => (
              <div
                key={event.name}
                style={{
                  display: "grid",
                  gridTemplateColumns: "1.1fr 1.4fr auto auto",
                  gap: 10,
                  alignItems: "center",
                  padding: "8px 2px",
                  borderTop: "1px solid rgba(48,48,48,.07)",
                }}
              >
                <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 12.5, fontWeight: 600 }}>{event.name}</span>
                <span style={{ fontSize: 12.5, color: "var(--ink-2)" }}>{event.when}</span>
                <span style={{ textAlign: "center", width: 62, color: "#0B7A3B", fontWeight: 700 }}>{event.browser ? "✓" : "—"}</span>
                <span style={{ textAlign: "center", width: 62, color: "#0B7A3B", fontWeight: 700 }}>{event.server ? "✓" : "—"}</span>
              </div>
            ))}
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

        {/* Domain verification. Meta drops conversions from iOS traffic on a
            domain nobody has claimed, so it belongs on this screen and not in
            a help article. */}
        <GlassPanel
          title="Verify your domain"
          sub="Meta drops conversions from iOS visitors on a domain nobody has claimed. This is done once, in Meta's Business settings."
          tight
        >
          <div style={{ padding: "12px 16px 16px", display: "flex", flexDirection: "column", gap: 12 }}>
            <CopyValue label="This store's domain" value={store.domain} />
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <OpenLink href={OWNED_DOMAINS}>Open Business settings</OpenLink>
              <span style={{ fontSize: 12, color: "var(--ink-2)", flex: 1, minWidth: 200, lineHeight: "18px" }}>
                Add the domain, choose the DNS TXT method, and send me the record — it goes into Cloudflare in a minute.
              </span>
            </div>
          </div>
        </GlassPanel>

        {/* Everything that is not needed to get started. */}
        <GlassPanel title="Advanced" tight>
          <div style={{ padding: "12px 16px 16px", display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
              <span style={{ fontSize: 12, color: "var(--ink-2)" }}>
                Ad account ID, what is stored, and disconnecting this store from Meta.
              </span>
              <QuietAction type="button" onClick={() => setAdvanced((open) => !open)} aria-expanded={advanced}>
                {advanced ? "Hide" : "Show"}
              </QuietAction>
            </div>

            {advanced ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 14, animation: "kFade .22s ease-out" }}>
                <FactGrid>
                  <Fact label="Pixel ID" value={config.pixelId || null} mono reason="Not saved yet" />
                  <Fact label="Ad account" value={config.adAccountId || null} mono reason="Not saved yet" />
                  <Fact
                    label="Conversions API token"
                    value={hasToken ? tokenMask : null}
                    mono
                    reason={encryption ? "Not saved yet" : "No encryption key on the Worker"}
                  />
                  <Fact
                    label="Test event code"
                    value={config.testEventCode || null}
                    mono
                    reason={tested ? "Cleared — events count for real" : "Not saved yet"}
                  />
                </FactGrid>

                <hr style={glassRule} />

                <fetcher.Form method="post" style={{ display: "flex", gap: 8, alignItems: "flex-end", flexWrap: "wrap" }}>
                  <input type="hidden" name="intent" value="save" />
                  <label style={{ ...glassField, flex: "1 1 220px" }}>
                    Ad account ID
                    <input name="adAccountId" defaultValue={config.adAccountId} placeholder="act_…" style={glassInput} />
                  </label>
                  <PrimaryAction type="submit" disabled={busy}>
                    Save
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
                </fetcher.Form>
              </div>
            ) : null}
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
