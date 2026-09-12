/**
 * Payments.
 *
 * Its own screen rather than a panel buried in Settings, because it is the
 * part of the shop that decides whether money arrives — and because there is
 * more than one provider now. Stripe takes the cards and the wallets; PayPal
 * takes the people who will not type a card into a shop they have not heard
 * of, and brings Pay Later and Venmo with it at no extra cost.
 *
 * Both are presented the same way: what is stored, a real connection test
 * against the provider's own API, and nothing claimed that has not been
 * answered by them.
 */
import { useState } from "react";
import { useFetcher } from "react-router";
import { and, eq } from "drizzle-orm";
import type { Route } from "./+types/admin.payments";
import { requireUser } from "~/lib/auth.server";
import { resolveAdminStore } from "~/lib/admin.server";
import { paymentProviders } from "~/db/schema";
import { encryptSecret, encryptionReady, maskSecret, decryptSecret } from "~/lib/crypto.server";
import { providerForStore, PaymentsNotConfigured } from "~/lib/payments.server";
import { paypalFor } from "~/lib/paypal.server";
import { card, Empty } from "~/admin/ui";
import {
  GlassGround,
  GlassPanel,
  GlassNotice,
  HandshakeResult,
  StateBadge,
  Fact,
  FactGrid,
  PrimaryAction,
  QuietAction,
  glassBody,
  glassRule,
  glassField,
  glassInput,
  type ConnState,
} from "~/admin/connection-glass";

export function meta() {
  return [{ title: "Payments — Shop Admin" }];
}

export async function loader({ context, request }: Route.LoaderArgs) {
  await requireUser(context.db, request);
  const url = new URL(request.url);
  const { store } = await resolveAdminStore(context.db, url);
  if (!store) return { store: null, stripe: null, paypal: null, encryption: false };

  const rows = await context.db
    .select()
    .from(paymentProviders)
    .where(eq(paymentProviders.storeId, store.id));

  const stripeRow = rows.find((row: typeof rows[number]) => row.provider === "stripe") ?? null;
  const paypalRow = rows.find((row: typeof rows[number]) => row.provider === "paypal") ?? null;

  const stripeSecret = await decryptSecret(context.cloudflare.env, stripeRow?.secretKeyEnc ?? null);
  const paypalSecret = await decryptSecret(context.cloudflare.env, paypalRow?.secretKeyEnc ?? null);

  return {
    store: { slug: store.slug, name: store.name, currency: store.currency },
    encryption: encryptionReady(context.cloudflare.env),
    stripe: {
      publishableKey: stripeRow?.publishableKey ?? "",
      secretMask: maskSecret(stripeSecret),
      hasSecret: Boolean(stripeRow?.secretKeyEnc),
      hasWebhook: Boolean(stripeRow?.webhookSecretEnc),
      connectedAt: stripeRow?.connectedAt ? new Date(stripeRow.connectedAt).toISOString() : null,
    },
    paypal: {
      clientId: paypalRow?.publishableKey ?? "",
      secretMask: maskSecret(paypalSecret),
      hasSecret: Boolean(paypalRow?.secretKeyEnc),
      mode: paypalRow?.accountName === "sandbox" ? "sandbox" : "live",
      connectedAt: paypalRow?.connectedAt ? new Date(paypalRow.connectedAt).toISOString() : null,
    },
  };
}

export async function action({ context, request }: Route.ActionArgs) {
  await requireUser(context.db, request);
  const url = new URL(request.url);
  const { store } = await resolveAdminStore(context.db, url);
  if (!store) return { error: "Create a store first." };

  const env = context.cloudflare.env;
  const form = await request.formData();
  const intent = String(form.get("intent") || "");
  const text = (name: string) => String(form.get(name) || "").trim();

  const rowFor = async (provider: string) => {
    const [row] = await context.db
      .select()
      .from(paymentProviders)
      .where(and(eq(paymentProviders.storeId, store.id), eq(paymentProviders.provider, provider)))
      .limit(1);
    return row ?? null;
  };

  /* ------------------------------------------------------------- stripe */
  if (intent === "stripe-save") {
    const publishableKey = text("publishableKey") || null;
    const secretKey = text("secretKey");
    const webhookSecret = text("webhookSecret");

    if (publishableKey && !publishableKey.startsWith("pk_")) return { error: "A Stripe publishable key starts with pk_." };
    if (secretKey && !/^(sk|rk)_/.test(secretKey)) return { error: "A Stripe secret key starts with sk_ (or rk_)." };
    if (webhookSecret && !webhookSecret.startsWith("whsec_")) return { error: "A webhook signing secret starts with whsec_." };
    if ((secretKey || webhookSecret) && !encryptionReady(env)) {
      return { error: "Not saved: no ENCRYPTION_KEY is on the Worker, and a live payment key will not be stored unencrypted." };
    }

    const encrypted = secretKey ? await encryptSecret(env, secretKey) : null;
    const encryptedWebhook = webhookSecret ? await encryptSecret(env, webhookSecret) : null;
    const existing = await rowFor("stripe");

    if (existing) {
      await context.db
        .update(paymentProviders)
        .set({
          publishableKey,
          ...(encrypted ? { secretKeyEnc: encrypted } : {}),
          ...(encryptedWebhook ? { webhookSecretEnc: encryptedWebhook } : {}),
        })
        .where(eq(paymentProviders.id, existing.id));
    } else {
      await context.db.insert(paymentProviders).values({
        storeId: store.id,
        provider: "stripe",
        publishableKey,
        secretKeyEnc: encrypted,
        webhookSecretEnc: encryptedWebhook,
        isPrimary: true,
      });
    }
    return { ok: "Saved. Press Test connection to prove the key works." };
  }

  if (intent === "stripe-test") {
    try {
      const provider = await providerForStore(context.db, env, store.id);
      const result = await provider.testConnection();
      if (!result.ok) return { error: `Stripe refused the key: ${result.reason}` };
      const existing = await rowFor("stripe");
      if (existing) {
        await context.db
          .update(paymentProviders)
          .set({ connectedAt: new Date() })
          .where(eq(paymentProviders.id, existing.id));
      }
      return { ok: `Connected. Stripe answered for a ${result.account} account.` };
    } catch (error) {
      return { error: error instanceof PaymentsNotConfigured ? error.message : "Stripe could not be reached." };
    }
  }

  if (intent === "stripe-remove") {
    const existing = await rowFor("stripe");
    if (existing) await context.db.delete(paymentProviders).where(eq(paymentProviders.id, existing.id));
    return { ok: "Stripe removed. Checkout will refuse card payments until it is connected again." };
  }

  /* ------------------------------------------------------------- paypal */
  if (intent === "paypal-save") {
    const clientId = text("clientId") || null;
    const secret = text("secret");
    const mode = text("mode") === "sandbox" ? "sandbox" : "live";

    if (clientId && clientId.length < 20) return { error: "That does not look like a PayPal client ID — they are long." };
    if (secret && !encryptionReady(env)) {
      return { error: "Not saved: no ENCRYPTION_KEY is on the Worker, and a live secret will not be stored unencrypted." };
    }

    const encrypted = secret ? await encryptSecret(env, secret) : null;
    const existing = await rowFor("paypal");

    if (existing) {
      await context.db
        .update(paymentProviders)
        .set({ publishableKey: clientId, accountName: mode, ...(encrypted ? { secretKeyEnc: encrypted } : {}) })
        .where(eq(paymentProviders.id, existing.id));
    } else {
      await context.db.insert(paymentProviders).values({
        storeId: store.id,
        provider: "paypal",
        accountName: mode,
        publishableKey: clientId,
        secretKeyEnc: encrypted,
        isPrimary: false,
      });
    }
    return { ok: "Saved. Press Test connection and PayPal will answer for itself." };
  }

  if (intent === "paypal-test") {
    const client = await paypalFor(context.db, env, store.id);
    if (!client) return { error: "Save a client ID and a secret first." };
    const result = await client.testConnection();
    if (!result.ok) return { error: `PayPal refused the credentials: ${result.reason}` };
    const existing = await rowFor("paypal");
    if (existing) {
      await context.db
        .update(paymentProviders)
        .set({ connectedAt: new Date() })
        .where(eq(paymentProviders.id, existing.id));
    }
    return { ok: `Connected. PayPal answered — ${result.account}` };
  }

  if (intent === "paypal-remove") {
    const existing = await rowFor("paypal");
    if (existing) await context.db.delete(paymentProviders).where(eq(paymentProviders.id, existing.id));
    return { ok: "PayPal removed from this store." };
  }

  return { error: "Unknown action." };
}

/* --------------------------------------------------------------- screen */

function when(iso: string | null) {
  if (!iso) return null;
  return new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

export default function Payments({ loaderData }: Route.ComponentProps) {
  const { store, stripe, paypal, encryption } = loaderData;
  const fetcher = useFetcher<typeof action>();
  const [editStripe, setEditStripe] = useState(false);
  const [editPaypal, setEditPaypal] = useState(false);
  const [showSecret, setShowSecret] = useState(false);

  if (!store || !stripe || !paypal) {
    return (
      <div style={{ maxWidth: 640, margin: "40px auto", ...card }}>
        <Empty title="No store yet" help="Create a store first." />
      </div>
    );
  }

  const result = fetcher.data as { ok?: string; error?: string } | undefined;
  const busy = fetcher.state !== "idle";

  const stripeState: ConnState = stripe.connectedAt ? "on" : stripe.hasSecret ? "connecting" : "off";
  const paypalState: ConnState = paypal.connectedAt ? "on" : paypal.hasSecret ? "connecting" : "off";
  const live = stripeState === "on" || paypalState === "on";

  return (
    <div style={{ maxWidth: 1100, margin: "0 auto", display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <h1 style={{ margin: 0, fontSize: 20, lineHeight: "28px", fontWeight: 650 }}>Payments · {store.name}</h1>
        <StateBadge state={live ? "on" : "off"} label={live ? "Taking money" : "Not taking money"} />
      </div>

      <GlassGround>
        {!encryption ? (
          <GlassNotice kind="critical">
            No encryption key is set on this Worker, so no secret key can be stored. Nothing here will save until it is.
          </GlassNotice>
        ) : null}

        {result?.error ? <HandshakeResult kind="error">{result.error}</HandshakeResult> : null}
        {result?.ok ? <HandshakeResult kind="ok">{result.ok}</HandshakeResult> : null}

        {/* ---------------------------------------------------------- stripe */}
        <GlassPanel
          title="Stripe"
          sub="Cards, Apple Pay, Google Pay and Link. The secret key is stored encrypted and never shown again."
          aside={
            <StateBadge
              state={stripeState}
              label={stripe.connectedAt ? `Connected ${when(stripe.connectedAt)}` : stripe.hasSecret ? "Saved, never tested" : "Not connected"}
            />
          }
        >
          <div style={glassBody}>
            <FactGrid>
              <Fact label="Publishable key" value={stripe.publishableKey || null} mono reason="Not saved yet" />
              <Fact label="Secret key" value={stripe.hasSecret ? stripe.secretMask : null} mono reason="Not saved yet" />
              <Fact label="Webhook secret" value={stripe.hasWebhook ? "Stored" : null} reason="Not saved yet" />
              <Fact label="Currency" value={store.currency} />
            </FactGrid>

            <hr style={glassRule} />

            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <fetcher.Form method="post">
                <PrimaryAction type="submit" name="intent" value="stripe-test" disabled={busy || !stripe.hasSecret}>
                  {busy ? "Testing…" : "Test connection"}
                </PrimaryAction>
              </fetcher.Form>
              <QuietAction type="button" onClick={() => setEditStripe((open) => !open)}>
                {editStripe ? "Hide keys" : stripe.hasSecret ? "Change keys" : "Add keys"}
              </QuietAction>
              <span style={{ flex: 1 }} />
              <fetcher.Form method="post">
                <QuietAction type="submit" name="intent" value="stripe-remove" disabled={busy || !stripe.hasSecret} style={{ color: "var(--critical)" }}>
                  Disconnect
                </QuietAction>
              </fetcher.Form>
            </div>

            {editStripe ? (
              <fetcher.Form method="post" style={{ display: "flex", flexDirection: "column", gap: 12, animation: "kFade .22s ease-out" }}>
                <input type="hidden" name="intent" value="stripe-save" />
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(240px,1fr))", gap: 12 }}>
                  <label style={glassField}>
                    Publishable key
                    <input name="publishableKey" defaultValue={stripe.publishableKey} placeholder="pk_live_…" style={glassInput} />
                  </label>
                  <label style={glassField}>
                    Secret key
                    <input name="secretKey" type="password" placeholder={stripe.hasSecret ? `stored: ${stripe.secretMask}` : "sk_live_…"} style={glassInput} />
                  </label>
                  <label style={glassField}>
                    Webhook signing secret
                    <input name="webhookSecret" type="password" placeholder={stripe.hasWebhook ? "stored" : "whsec_…"} style={glassInput} />
                  </label>
                </div>
                <div>
                  <PrimaryAction type="submit" disabled={busy || !encryption}>Save</PrimaryAction>
                </div>
              </fetcher.Form>
            ) : null}
          </div>
        </GlassPanel>

        {/* ---------------------------------------------------------- paypal */}
        <GlassPanel
          title="PayPal"
          sub="The button people already trust. Brings Pay Later and Venmo with it at no extra cost — the only buy-now-pay-later this store can offer US customers."
          aside={
            <StateBadge
              state={paypalState}
              label={paypal.connectedAt ? `Connected ${when(paypal.connectedAt)}` : paypal.hasSecret ? "Saved, never tested" : "Not connected"}
            />
          }
        >
          <div style={glassBody}>
            <FactGrid>
              <Fact label="Client ID" value={paypal.clientId ? `${paypal.clientId.slice(0, 22)}…` : null} mono reason="Not saved yet" />
              <Fact label="Secret" value={paypal.hasSecret ? paypal.secretMask : null} mono reason="Not saved yet" />
              <Fact label="Mode" value={paypal.mode === "sandbox" ? "Sandbox — test money" : "Live — real money"} />
              <Fact label="Currency" value={store.currency} />
            </FactGrid>

            {paypal.mode === "sandbox" && paypal.hasSecret ? (
              <GlassNotice kind="warning">
                These are sandbox credentials. Nothing charged with them is real money.
              </GlassNotice>
            ) : null}

            <hr style={glassRule} />

            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <fetcher.Form method="post">
                <PrimaryAction type="submit" name="intent" value="paypal-test" disabled={busy || !paypal.hasSecret}>
                  {busy ? "Testing…" : "Test connection"}
                </PrimaryAction>
              </fetcher.Form>
              <QuietAction type="button" onClick={() => setEditPaypal((open) => !open)}>
                {editPaypal ? "Hide credentials" : paypal.hasSecret ? "Change credentials" : "Add credentials"}
              </QuietAction>
              <span style={{ flex: 1 }} />
              <fetcher.Form method="post">
                <QuietAction type="submit" name="intent" value="paypal-remove" disabled={busy || !paypal.hasSecret} style={{ color: "var(--critical)" }}>
                  Disconnect
                </QuietAction>
              </fetcher.Form>
            </div>

            {editPaypal ? (
              <fetcher.Form method="post" style={{ display: "flex", flexDirection: "column", gap: 12, animation: "kFade .22s ease-out" }}>
                <input type="hidden" name="intent" value="paypal-save" />
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(240px,1fr))", gap: 12 }}>
                  <label style={glassField}>
                    Client ID
                    <input name="clientId" defaultValue={paypal.clientId} placeholder="From developer.paypal.com → Apps &amp; Credentials" style={glassInput} />
                  </label>
                  <label style={glassField}>
                    Secret
                    <span style={{ display: "flex", gap: 6 }}>
                      <input
                        name="secret"
                        type={showSecret ? "text" : "password"}
                        placeholder={paypal.hasSecret ? `stored: ${paypal.secretMask}` : "Secret key 1"}
                        style={{ ...glassInput, flex: 1 }}
                      />
                      <QuietAction type="button" onClick={() => setShowSecret((s) => !s)} style={{ height: 38 }}>
                        {showSecret ? "Hide" : "Show"}
                      </QuietAction>
                    </span>
                  </label>
                  <label style={glassField}>
                    Mode
                    <select name="mode" defaultValue={paypal.mode} style={{ ...glassInput, fontFamily: "inherit" }}>
                      <option value="live">Live — real money</option>
                      <option value="sandbox">Sandbox — testing only</option>
                    </select>
                  </label>
                </div>
                <p style={{ margin: 0, fontSize: 12, lineHeight: "18px", color: "var(--ink-2)" }}>
                  developer.paypal.com → switch the toggle to <strong>Live</strong> → Apps &amp; Credentials → your app.
                  The client ID is public; the secret is stored encrypted here and never shown again.
                </p>
                <div>
                  <PrimaryAction type="submit" disabled={busy || !encryption}>Save</PrimaryAction>
                </div>
              </fetcher.Form>
            ) : null}
          </div>
        </GlassPanel>
      </GlassGround>
    </div>
  );
}
