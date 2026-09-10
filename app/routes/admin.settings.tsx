/**
 * Settings: store details, domains and payments.
 *
 * Payment credentials are per store on purpose — one frozen Stripe account
 * must never be able to take the other stores down with it.
 */
import { Form, useNavigation, useSearchParams, Link } from "react-router";
import type { Route } from "./+types/admin.settings";
import { eq } from "drizzle-orm";
import { requireUser } from "~/lib/auth.server";
import {
  resolveAdminStore,
  storeSettings,
  saveStoreSettings,
  addDomain,
  removeDomain,
  setPrimaryDomain,
} from "~/lib/admin.server";
import { paymentProviders } from "~/db/schema";
import { encryptSecret, decryptSecret, encryptionReady, maskSecret } from "~/lib/crypto.server";
import { card, cardHeader, Badge, Empty, PageTitle, primaryButton, secondaryButton, criticalButton, input } from "~/admin/ui";

export function meta() {
  return [{ title: "Settings — Shop Admin" }];
}

const PANES = [
  { key: "general", label: "General" },
  { key: "domains", label: "Domains" },
  { key: "payments", label: "Payments" },
];

export async function loader({ context, request }: Route.LoaderArgs) {
  await requireUser(context.db, request);
  const url = new URL(request.url);
  const { store } = await resolveAdminStore(context.db, url);
  if (!store) return { store: null, pane: "general", settings: null, encryption: false };

  const settings = await storeSettings(context.db, store.id);
  const stripe = settings.providers.find((provider) => provider.provider === "stripe");
  const secret = await decryptSecret(context.cloudflare.env, stripe?.secretKeyEnc ?? null);

  return {
    pane: url.searchParams.get("pane") || "general",
    encryption: encryptionReady(context.cloudflare.env),
    store: {
      id: store.id,
      slug: store.slug,
      name: store.name,
      domain: store.domain,
      currency: store.currency,
      timezone: store.timezone,
      contactEmail: store.contactEmail ?? "",
      statementDescriptor: store.statementDescriptor ?? "",
      emailFrom: store.emailFrom ?? "",
      color: store.color,
      taxRate: store.taxRate,
    },
    settings: {
      domains: settings.domains.map((row) => ({
        id: row.id,
        hostname: row.hostname,
        status: row.status,
        ssl: row.ssl,
        isPrimary: row.isPrimary,
      })),
      stripe: stripe
        ? {
            id: stripe.id,
            accountName: stripe.accountName ?? "",
            publishableKey: stripe.publishableKey ?? "",
            hasSecret: Boolean(stripe.secretKeyEnc),
            secretMask: maskSecret(secret),
            hasWebhookSecret: Boolean(stripe.webhookSecretEnc),
            capture: stripe.capture,
          }
        : null,
    },
  };
}

export async function action({ context, request }: Route.ActionArgs) {
  await requireUser(context.db, request);
  const url = new URL(request.url);
  const { store } = await resolveAdminStore(context.db, url);
  if (!store) return { error: "Create a store first." };

  const form = await request.formData();
  const intent = String(form.get("intent") || "");

  if (intent === "general") {
    const name = String(form.get("name") || "").trim();
    if (!name) return { error: "The store needs a name." };
    const taxRate = Number(form.get("taxRate") || 0);
    if (!Number.isFinite(taxRate) || taxRate < 0 || taxRate > 0.3) {
      return { error: "Tax rate looks wrong. Enter it as a decimal, e.g. 0.0875 for 8.75%." };
    }

    await saveStoreSettings(context.db, store.id, {
      name,
      currency: String(form.get("currency") || "USD"),
      timezone: String(form.get("timezone") || "America/New_York"),
      contactEmail: String(form.get("contactEmail") || "").trim() || null,
      statementDescriptor: String(form.get("statementDescriptor") || "").trim() || null,
      emailFrom: String(form.get("emailFrom") || "").trim() || null,
      color: String(form.get("color") || store.color),
      taxRate,
    });
    return { ok: "Saved." };
  }

  if (intent === "add-domain") {
    const hostname = String(form.get("hostname") || "")
      .trim()
      .toLowerCase()
      .replace(/^https?:\/\//, "")
      .replace(/\/$/, "");
    if (!hostname) return { error: "Type the domain first." };
    try {
      await addDomain(context.db, store.id, hostname);
    } catch {
      return { error: `${hostname} is already connected to a store.` };
    }
    return { ok: `${hostname} added. It stays "pending" until DNS points at this Worker.` };
  }

  if (intent === "remove-domain") {
    await removeDomain(context.db, String(form.get("domainId")));
    return { ok: "Removed." };
  }

  if (intent === "primary-domain") {
    await setPrimaryDomain(context.db, store.id, String(form.get("domainId")));
    return { ok: "Primary domain changed." };
  }

  if (intent === "stripe") {
    const accountName = String(form.get("accountName") || "").trim() || null;
    const publishableKey = String(form.get("publishableKey") || "").trim() || null;
    const secretKey = String(form.get("secretKey") || "").trim();
    const webhookSecret = String(form.get("webhookSecret") || "").trim();
    const capture = String(form.get("capture") || "automatic");

    if (publishableKey && !publishableKey.startsWith("pk_")) {
      return { error: "A Stripe publishable key starts with pk_. Check what you pasted." };
    }
    if (secretKey && !secretKey.startsWith("sk_") && !secretKey.startsWith("rk_")) {
      return { error: "A Stripe secret key starts with sk_ (or rk_). Check what you pasted." };
    }
    if (webhookSecret && !webhookSecret.startsWith("whsec_")) {
      return { error: "A Stripe webhook signing secret starts with whsec_. Check what you pasted." };
    }
    if ((secretKey || webhookSecret) && !encryptionReady(context.cloudflare.env)) {
      return {
        error:
          "The secret key was not saved: no ENCRYPTION_KEY is set on the Worker, and a live payment key will not be stored unencrypted.",
      };
    }

    const settings = await storeSettings(context.db, store.id);
    const existing = settings.providers.find((provider) => provider.provider === "stripe");
    const encrypted = secretKey ? await encryptSecret(context.cloudflare.env, secretKey) : null;
    const encryptedWebhook = webhookSecret
      ? await encryptSecret(context.cloudflare.env, webhookSecret)
      : null;

    if (existing) {
      await context.db
        .update(paymentProviders)
        .set({
          accountName,
          publishableKey,
          capture,
          ...(encrypted ? { secretKeyEnc: encrypted } : {}),
          ...(encryptedWebhook ? { webhookSecretEnc: encryptedWebhook } : {}),
        })
        .where(eq(paymentProviders.id, existing.id));
    } else {
      await context.db.insert(paymentProviders).values({
        storeId: store.id,
        provider: "stripe",
        accountName,
        publishableKey,
        secretKeyEnc: encrypted,
        webhookSecretEnc: encryptedWebhook,
        capture,
        isPrimary: true,
        connectedAt: new Date(),
      });
    }
    return { ok: "Saved." };
  }

  return { error: "Unknown action." };
}

export default function Settings({ loaderData, actionData }: Route.ComponentProps) {
  const { store, settings, pane, encryption } = loaderData;
  const navigation = useNavigation();
  const busy = navigation.state === "submitting";

  if (!store || !settings) {
    return (
      <div style={{ maxWidth: 640, margin: "40px auto", ...card }}>
        <Empty title="No store yet" help="Create a store first." />
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 1000, margin: "0 auto", display: "flex", flexDirection: "column", gap: 16 }}>
      <PageTitle title={`Settings · ${store.name}`} />

      <div style={{ display: "flex", gap: 2, ...card, padding: 6, width: "fit-content", flexWrap: "wrap" }}>
        {PANES.map((item) => (
          <Link
            key={item.key}
            to={`/admin/settings?store=${store.slug}&pane=${item.key}`}
            className="k-hover"
            style={{
              height: 30,
              padding: "0 14px",
              borderRadius: 8,
              background: pane === item.key ? "var(--sel)" : "transparent",
              color: "var(--ink)",
              fontSize: 13,
              fontWeight: 550,
              display: "inline-flex",
              alignItems: "center",
              textDecoration: "none",
            }}
          >
            {item.label}
          </Link>
        ))}
      </div>

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

      {pane === "general" ? (
        <Form method="post" style={card}>
          <input type="hidden" name="intent" value="general" />
          <div style={cardHeader}>Store details</div>
          <div style={{ padding: 16, display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 12 }}>
            <Labelled label="Store name">
              <input name="name" defaultValue={store.name} style={input} />
            </Labelled>
            <Labelled label="Contact email">
              <input name="contactEmail" type="email" defaultValue={store.contactEmail} style={input} />
            </Labelled>
            <Labelled label="Currency">
              <input name="currency" defaultValue={store.currency} style={input} />
            </Labelled>
            <Labelled label="Timezone">
              <input name="timezone" defaultValue={store.timezone} style={input} />
            </Labelled>
            <Labelled label="Card statement descriptor" help="What shows on the customer's bank statement.">
              <input name="statementDescriptor" defaultValue={store.statementDescriptor} style={input} />
            </Labelled>
            <Labelled label="Send email from" help="On this store's own domain, once it is verified.">
              <input name="emailFrom" defaultValue={store.emailFrom} style={input} />
            </Labelled>
            <Labelled label="Sales tax rate" help="A decimal: 0.0875 means 8.75%.">
              <input name="taxRate" defaultValue={String(store.taxRate)} inputMode="decimal" style={input} />
            </Labelled>
            <Labelled label="Switcher dot colour">
              <input name="color" type="color" defaultValue={store.color} style={{ ...input, padding: 4 }} />
            </Labelled>
          </div>
          <div style={{ padding: 16, borderTop: "1px solid var(--border)" }}>
            <button type="submit" disabled={busy} style={primaryButton}>
              {busy ? "Saving…" : "Save"}
            </button>
          </div>
        </Form>
      ) : null}

      {pane === "domains" ? (
        <div style={card}>
          <div style={cardHeader}>Domains</div>
          <Form method="post" style={{ display: "flex", gap: 8, padding: "12px 16px", borderBottom: "1px solid var(--border)", flexWrap: "wrap" }}>
            <input type="hidden" name="intent" value="add-domain" />
            <input name="hostname" placeholder="yourstore.com" style={{ ...input, flex: 1, minWidth: 200 }} />
            <button type="submit" disabled={busy} style={secondaryButton}>
              Add domain
            </button>
          </Form>

          {settings.domains.length === 0 ? (
            <Empty
              title="No domains connected"
              help={`This store currently answers on ${store.domain}. Add the real domain once you own it, then point its DNS at this Worker.`}
            />
          ) : (
            settings.domains.map((domain) => (
              <div
                key={domain.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  padding: "12px 16px",
                  borderBottom: "1px solid var(--border)",
                }}
              >
                <span style={{ flex: 1, fontWeight: 550 }}>{domain.hostname}</span>
                <Badge kind={domain.status === "connected" ? "success" : "warning"}>
                  {domain.status === "connected" ? "Connected" : "Pending DNS"}
                </Badge>
                <Badge kind={domain.ssl === "active" ? "success" : "neutral"}>
                  SSL {domain.ssl}
                </Badge>
                {domain.isPrimary ? (
                  <Badge kind="info">Primary</Badge>
                ) : (
                  <Form method="post">
                    <input type="hidden" name="intent" value="primary-domain" />
                    <input type="hidden" name="domainId" value={domain.id} />
                    <button type="submit" style={secondaryButton}>
                      Make primary
                    </button>
                  </Form>
                )}
                <Form method="post">
                  <input type="hidden" name="intent" value="remove-domain" />
                  <input type="hidden" name="domainId" value={domain.id} />
                  <button type="submit" style={criticalButton}>
                    Remove
                  </button>
                </Form>
              </div>
            ))
          )}
        </div>
      ) : null}

      {pane === "payments" ? (
        <Form method="post" style={card}>
          <input type="hidden" name="intent" value="stripe" />
          <div style={cardHeader}>
            <span>Stripe</span>
            <Badge kind={settings.stripe?.hasSecret ? "success" : "warning"}>
              {settings.stripe?.hasSecret ? "Keys stored" : "Not connected"}
            </Badge>
          </div>

          {!encryption ? (
            <div style={{ margin: 16, background: "var(--b-warning-bg)", color: "var(--b-warning-fg)", borderRadius: 10, padding: "10px 12px", fontSize: 13 }}>
              No encryption key is set on the Worker. The secret key will not be saved until there
              is one — a live payment key is not going in the database in the clear.
            </div>
          ) : null}

          <div style={{ padding: 16, display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 12 }}>
            <Labelled label="Account name" help="Which Stripe account this store bills through.">
              <input name="accountName" defaultValue={settings.stripe?.accountName ?? ""} style={input} />
            </Labelled>
            <Labelled label="Publishable key">
              <input
                name="publishableKey"
                defaultValue={settings.stripe?.publishableKey ?? ""}
                placeholder="pk_live_…"
                style={{ ...input, fontFamily: "'JetBrains Mono',monospace" }}
              />
            </Labelled>
            <Labelled
              label={`Secret key${settings.stripe?.hasSecret ? ` (stored: ${settings.stripe.secretMask})` : ""}`}
            >
              <input
                name="secretKey"
                type="password"
                placeholder={settings.stripe?.hasSecret ? "Leave blank to keep the stored one" : "sk_live_…"}
                style={{ ...input, fontFamily: "'JetBrains Mono',monospace" }}
              />
            </Labelled>
            <Labelled
              label={`Webhook signing secret${settings.stripe?.hasWebhookSecret ? " (stored)" : ""}`}
              help="From Stripe → Developers → Webhooks. Without it, payment confirmations are refused."
            >
              <input
                name="webhookSecret"
                type="password"
                placeholder={settings.stripe?.hasWebhookSecret ? "Leave blank to keep the stored one" : "whsec_…"}
                style={{ ...input, fontFamily: "'JetBrains Mono',monospace" }}
              />
            </Labelled>
            <Labelled label="Capture" help="Automatic takes the money at checkout.">
              <select name="capture" defaultValue={settings.stripe?.capture ?? "automatic"} style={{ ...input, padding: "0 8px" }}>
                <option value="automatic">Automatic</option>
                <option value="manual">Manual</option>
              </select>
            </Labelled>
          </div>

          <div style={{ padding: 16, borderTop: "1px solid var(--border)", display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <button type="submit" disabled={busy} style={primaryButton}>
              {busy ? "Saving…" : "Save"}
            </button>
            <span style={{ fontSize: 12, color: "var(--ink-2)", flex: 1, minWidth: 240 }}>
              Keys are stored per store and encrypted. One frozen account cannot take the others down.
            </span>
          </div>
        </Form>
      ) : null}
    </div>
  );
}

function Labelled({ label, help, children }: { label: string; help?: string; children: React.ReactNode }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <span style={{ fontSize: 12, fontWeight: 550, color: "var(--ink-2)" }}>{label}</span>
      {children}
      {help ? <span style={{ fontSize: 11, color: "var(--ink-3)" }}>{help}</span> : null}
    </label>
  );
}
