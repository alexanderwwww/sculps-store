/**
 * Settings — the twelve panes from the design.
 *
 * Profile · General · Domains · Payments · Notifications · Taxes · Shipping ·
 * Checkout · Policies · Branding · Plan & billing · Data export.
 *
 * Every pane is a form that posts to this route with an `intent`. Where a
 * pane talks to an outside service (Cloudflare for domains, Stripe for the
 * connection test, Resend for the sender domain) the real call is made and
 * the real answer shown — nothing on this screen pretends.
 */
import { Form, Link, useNavigation } from "react-router";
import type { Route } from "./+types/admin.settings";
import { eq } from "drizzle-orm";
import { requireUser } from "~/lib/auth.server";
import {
  resolveAdminStore,
  storeSettings,
  saveStoreSettings,
  storeDomain,
  addDomain,
  removeDomain,
  setPrimaryDomain,
  listTaxRates,
  upsertTaxRate,
  removeTaxRate,
  updateUserPrefs,
  signOutOtherSessions,
  deleteStore,
  policyPages,
  savePolicies,
} from "~/lib/admin.server";
import { paymentProviders, domains as domainsTable, users, sessions as sessionsTable } from "~/db/schema";
import { encryptSecret, decryptSecret, encryptionReady, maskSecret } from "~/lib/crypto.server";
import { providerForStore, PaymentsNotConfigured } from "~/lib/payments.server";
import {
  cloudflareConfig,
  createZone,
  findZone,
  bindHostname,
  unbindHostname,
  rootDomain,
} from "~/lib/cloudflare.server";
import { createSenderDomain, readSenderDomain, verifySenderDomain } from "~/lib/resend-domains.server";
import { emailReady, sendOrderConfirmation, sendShippingNotice, sendRefundNotice } from "~/lib/email.server";
import { centsFromInput, centsToInput } from "~/lib/money";
import { input } from "~/admin/ui";
import {
  SettingsCard,
  CardButton,
  RowButton,
  RowBadge,
  FieldGrid,
  TextField,
  SelectField,
  AreaField,
  ToggleRow,
  toggleRow,
  ListRow,
  listRow,
  listRowMain,
  EmptyRows,
  DnsTable,
  CopyButton,
  Steps,
  LinkRow,
  linkRow,
  LinkLabel,
  LinkChevron,
  CostRow,
  CostTotal,
  saveBar,
} from "~/admin/settings-ui";

export function meta() {
  return [{ title: "Settings — Shop Admin" }];
}

const PANES = [
  ["profile", "Profile"],
  ["general", "General"],
  ["domains", "Domains"],
  ["payments", "Payments"],
  ["notifications", "Notifications"],
  ["taxes", "Taxes"],
  ["shipping", "Shipping"],
  ["checkout", "Checkout"],
  ["policies", "Policies"],
  ["branding", "Branding"],
  ["billing", "Plan & billing"],
  ["data", "Data export"],
] as const;

type Pane = (typeof PANES)[number][0];

const CURRENCIES = [
  { value: "USD", label: "USD $" },
  { value: "CAD", label: "CAD $" },
  { value: "EUR", label: "EUR €" },
  { value: "GBP", label: "GBP £" },
  { value: "AUD", label: "AUD $" },
];

const TIMEZONES = [
  { value: "America/New_York", label: "(GMT−05:00) Eastern Time" },
  { value: "America/Chicago", label: "(GMT−06:00) Central Time" },
  { value: "America/Denver", label: "(GMT−07:00) Mountain Time" },
  { value: "America/Los_Angeles", label: "(GMT−08:00) Pacific Time" },
  { value: "Europe/London", label: "(GMT+00:00) London" },
  { value: "Europe/Berlin", label: "(GMT+01:00) Central Europe" },
];

const TRANSFER_STEPS = [
  { label: "Unlock the domain at your current registrar", help: "Turn off the transfer lock in its dashboard" },
  { label: "Turn off WHOIS privacy", help: "Registrars block transfers while privacy is on" },
  { label: "Get the authorisation (EPP) code", help: "Your registrar emails it to the owner address" },
  { label: "Start the transfer at Cloudflare", help: "Cloudflare → Domain Registration → Transfer, paste the code there" },
  { label: "Approve the confirmation email", help: "Sent to the domain owner address on file" },
  { label: "Wait 5–7 days", help: "ICANN holds every transfer for this window" },
];

/**
 * A tax rate typed by a person: "8.75", "8.75%" and "0.0875" all mean the
 * same thing. Anything above 1 is read as a percentage; 30% is the ceiling.
 */
function parseRate(raw: string): number | null {
  if (!raw.trim()) return null;
  const n = Number(raw.replace("%", "").trim());
  if (!Number.isFinite(n) || n < 0) return null;
  // 8.75 and 1 are percentages; 0.0875 is a decimal. 30% is the ceiling.
  const rate = n >= 1 || raw.includes("%") ? n / 100 : n;
  return rate > 0.3 ? null : rate;
}

const STRIPE_EVENTS = "payment_intent.succeeded, payment_intent.payment_failed, charge.refunded, charge.dispute.created";

const US_STATES = ["AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA","KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ","NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT","VA","WA","WV","WI","WY","DC"];

export async function loader({ context, request }: Route.LoaderArgs) {
  const user = await requireUser(context.db, request);
  const url = new URL(request.url);
  const { store } = await resolveAdminStore(context.db, url);
  const pane = (PANES.some(([key]) => key === url.searchParams.get("pane")) ? url.searchParams.get("pane") : "general") as Pane;
  const env = context.cloudflare.env;

  const [userRow] = await context.db.select().from(users).where(eq(users.id, user.id)).limit(1);
  const sessionCount = (await context.db.select().from(sessionsTable).where(eq(sessionsTable.userId, user.id))).length;

  const profile = {
    name: userRow?.name ?? "",
    email: user.email,
    sessions: sessionCount,
    notifyEveryOrder: userRow?.notifyEveryOrder ?? true,
    notifyChargebacks: userRow?.notifyChargebacks ?? true,
    notifyWeekly: userRow?.notifyWeekly ?? false,
  };

  if (!store) return { pane, store: null, profile, settings: null, env: null };

  const settings = await storeSettings(context.db, store.id);
  const stripe = settings.providers.find((provider) => provider.provider === "stripe");
  const secret = await decryptSecret(env, stripe?.secretKeyEnc ?? null);
  const taxes = await listTaxRates(context.db, store.id);
  const policies = await policyPages(context.db, store.id);

  // Sender domain state comes from Resend, live, when a domain is registered.
  let sender: { status: string; records: { type: string; name: string; value: string; status: string; record: string }[] } | null = null;
  if (store.resendDomainId && env.RESEND_API_KEY) {
    const read = await readSenderDomain(env, store.resendDomainId);
    if (read.ok) sender = { status: read.value.status, records: read.value.records };
  }

  return {
    pane,
    profile,
    env: {
      cloudflare: Boolean(cloudflareConfig(env)),
      resend: emailReady(env),
      encryption: encryptionReady(env),
      adminOrigin: env.ADMIN_ORIGIN || null,
    },
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
      legalName: store.legalName ?? "",
      address1: store.address1 ?? "",
      city: store.city ?? "",
      region: store.region ?? "",
      postalCode: store.postalCode ?? "",
      phone: store.phone ?? "",
      taxMode: store.taxMode,
      pricesIncludeTax: store.pricesIncludeTax,
      taxOnShipping: store.taxOnShipping,
      shipFlat: centsToInput(store.shipFlatCents),
      shipFreeOver: centsToInput(store.shipFreeOverCents),
      shipEstimate: store.shipEstimate ?? "",
      shipAlwaysFree: store.shipAlwaysFree,
      shipEtaOnProduct: store.shipEtaOnProduct,
      checkoutNameMode: store.checkoutNameMode,
      checkoutPhoneMode: store.checkoutPhoneMode,
      checkoutCompanyMode: store.checkoutCompanyMode,
      checkoutConsent: store.checkoutConsent,
      checkoutCaptureAbandoned: store.checkoutCaptureAbandoned,
      checkoutTip: store.checkoutTip,
      logoUrl: store.logoUrl ?? "",
      faviconUrl: store.faviconUrl ?? "",
      brandColor: store.brandColor ?? "",
      accentColor: store.accentColor ?? "",
      resendDomainId: store.resendDomainId,
    },
    settings: {
      taxes: taxes.map((row) => ({ id: row.id, region: row.region, rate: row.rate })),
      policies,
      sender,
      domains: settings.domains.map((row) => ({
        id: row.id,
        hostname: row.hostname,
        status: row.status,
        ssl: row.ssl,
        isPrimary: row.isPrimary,
        transferStep: row.transferStep,
        nameservers: (row.nameservers as string[]) ?? [],
        lastError: row.lastError,
        zone: Boolean(row.cloudflareZoneId),
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
            connectedAt: stripe.connectedAt,
            submitDisputeEvidence: stripe.submitDisputeEvidence,
            emailOnFailedPayment: stripe.emailOnFailedPayment,
            isBackup: stripe.isBackup,
          }
        : null,
    },
  };
}

export async function action({ context, request }: Route.ActionArgs) {
  const user = await requireUser(context.db, request);
  const url = new URL(request.url);
  const env = context.cloudflare.env;
  const form = await request.formData();
  const intent = String(form.get("intent") || "");
  const on = (name: string) => form.get(name) === "on";
  const text = (name: string) => String(form.get(name) || "").trim();

  /* ---------------------------------------------------------- profile */
  if (intent === "profile") {
    await updateUserPrefs(context.db, user.id, { name: text("name") || null });
    return { ok: "Saved." };
  }
  if (intent === "notify-prefs") {
    await updateUserPrefs(context.db, user.id, {
      notifyEveryOrder: on("notifyEveryOrder"),
      notifyChargebacks: on("notifyChargebacks"),
      notifyWeekly: on("notifyWeekly"),
    });
    return { ok: "Saved." };
  }
  if (intent === "sign-out-others") {
    const cookie = request.headers.get("Cookie") ?? "";
    const raw = cookie.split(";").map((p) => p.trim()).find((p) => p.startsWith("kerberos_session="))?.slice("kerberos_session=".length) ?? "";
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(decodeURIComponent(raw)));
    const keep = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
    const n = await signOutOtherSessions(context.db, user.id, keep);
    return { ok: n ? `Signed out ${n} other device${n === 1 ? "" : "s"}.` : "No other devices were signed in." };
  }

  const { store } = await resolveAdminStore(context.db, url);
  if (!store) return { error: "Create a store first." };

  /* ---------------------------------------------------------- general */
  if (intent === "general") {
    const name = text("name");
    if (!name) return { error: "The store needs a name." };
    await saveStoreSettings(context.db, store.id, {
      name,
      contactEmail: text("contactEmail") || null,
      currency: text("currency") || "USD",
      timezone: text("timezone") || "America/New_York",
      legalName: text("legalName") || null,
      address1: text("address1") || null,
      city: text("city") || null,
      region: text("region") || null,
      postalCode: text("postalCode") || null,
      phone: text("phone") || null,
    });
    return { ok: "Saved." };
  }

  /* ---------------------------------------------------------- domains */
  if (intent === "add-domain" || intent === "add-subdomain") {
    let hostname = text("hostname").toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "").replace(/^www\./, "");
    if (intent === "add-subdomain") {
      const existing = await storeSettings(context.db, store.id);
      const base = existing.domains.find((d) => d.isPrimary) ?? existing.domains[0];
      if (!base) return { error: "Connect a root domain first." };
      const typed = text("subdomain") || "shop";
      hostname = `${typed.replace(/[^a-z0-9-]/gi, "").toLowerCase()}.${rootDomain(base.hostname)}`;
      if (existing.domains.some((d) => d.hostname === hostname)) return { error: `${hostname} is already on this store.` };
    }
    if (!hostname || !hostname.includes(".")) return { error: "Type the domain, like yourstore.com — no http:// and no www." };

    let row;
    try {
      row = await addDomain(context.db, store.id, hostname);
    } catch {
      return { error: `${hostname} is already connected to a store.` };
    }

    // Step one at Cloudflare: make the zone, get the nameservers.
    const config = cloudflareConfig(env);
    if (!config) {
      await context.db.update(domainsTable).set({ lastError: "Cloudflare API is not configured on the Worker." }).where(eq(domainsTable.id, row.id));
      return { ok: `${hostname} added. Cloudflare is not connected yet, so the nameservers cannot be fetched.` };
    }
    const zone = await createZone(config, rootDomain(hostname));
    if (!zone.ok) {
      await context.db.update(domainsTable).set({ lastError: zone.reason }).where(eq(domainsTable.id, row.id));
      return { error: `${hostname} was added, but Cloudflare said: ${zone.reason}` };
    }
    await context.db
      .update(domainsTable)
      .set({ cloudflareZoneId: zone.value.id, nameservers: zone.value.name_servers, lastError: null, status: zone.value.status === "active" ? "connected" : "pending" })
      .where(eq(domainsTable.id, row.id));
    return { ok: `${hostname} added. Set the two nameservers shown at your registrar, then press Verify connection.` };
  }

  if (intent === "verify-domain") {
    const id = text("domainId");
    const row = await storeDomain(context.db, store.id, id);
    if (!row) return { error: "That domain is not on this store." };
    const config = cloudflareConfig(env);
    if (!config) return { error: "Cloudflare API is not configured on the Worker, so nothing can be verified yet." };

    const zone = row.cloudflareZoneId
      ? await findZone(config, rootDomain(row.hostname))
      : await createZone(config, rootDomain(row.hostname));
    if (!zone.ok || !zone.value) {
      await context.db.update(domainsTable).set({ lastError: zone.ok ? "Zone not found." : zone.reason }).where(eq(domainsTable.id, id));
      return { error: zone.ok ? "Cloudflare has no zone for this domain." : zone.reason };
    }
    if (zone.value.status !== "active") {
      await context.db
        .update(domainsTable)
        .set({ cloudflareZoneId: zone.value.id, nameservers: zone.value.name_servers, status: "pending", lastError: null })
        .where(eq(domainsTable.id, id));
      return { error: `Not yet — Cloudflare still sees the domain as "${zone.value.status}". Nameserver changes take up to 24 hours. The two nameservers to set are listed below.` };
    }

    // Step two: bind the hostname to this Worker. Cloudflare issues the cert.
    const bound = await bindHostname(config, zone.value.id, row.hostname);
    if (!bound.ok) {
      await context.db.update(domainsTable).set({ lastError: bound.reason }).where(eq(domainsTable.id, id));
      return { error: bound.reason };
    }
    await context.db
      .update(domainsTable)
      .set({ cloudflareZoneId: zone.value.id, cloudflareDomainId: bound.value.id, status: "connected", ssl: "active", verifiedAt: new Date(), lastError: null })
      .where(eq(domainsTable.id, id));
    // The storefront answers on the primary hostname.
    if (row.isPrimary) await saveStoreSettings(context.db, store.id, { domain: row.hostname });
    return { ok: `${row.hostname} is connected. Cloudflare is issuing the certificate — usually a minute or two.` };
  }

  if (intent === "primary-domain") {
    const row = await storeDomain(context.db, store.id, text("domainId"));
    if (!row) return { error: "That domain is not on this store." };
    await setPrimaryDomain(context.db, store.id, row.id);
    if (row.status === "connected") {
      await saveStoreSettings(context.db, store.id, { domain: row.hostname });
      return { ok: `The storefront now answers on ${row.hostname}.` };
    }
    return { ok: `${row.hostname} is primary, but it is not connected yet — the storefront still answers on ${store.domain} until you verify it.` };
  }

  if (intent === "remove-domain") {
    const row = await storeDomain(context.db, store.id, text("domainId"));
    if (!row) return { error: "That domain is not on this store." };
    if (row.cloudflareDomainId) {
      const config = cloudflareConfig(env);
      if (config) await unbindHostname(config, row.cloudflareDomainId);
    }
    await removeDomain(context.db, store.id, row.id);

    // Never leave the store answering on a hostname that is no longer bound.
    if (row.isPrimary) {
      const rest = (await storeSettings(context.db, store.id)).domains;
      const next = rest.find((d) => d.status === "connected") ?? rest[0];
      if (next) {
        await setPrimaryDomain(context.db, store.id, next.id);
        if (next.status === "connected") await saveStoreSettings(context.db, store.id, { domain: next.hostname });
        return { ok: `Removed. ${next.hostname} is the primary domain now.` };
      }
    }
    return { ok: "Removed. The storefront no longer answers on it." };
  }

  if (intent === "start-transfer") {
    const hostname = text("hostname").toLowerCase().replace(/^www\./, "");
    if (!hostname.includes(".")) return { error: "Type the domain you are transferring." };
    let row;
    try {
      row = await addDomain(context.db, store.id, hostname);
    } catch {
      return { error: `${hostname} is already on a store.` };
    }
    await context.db.update(domainsTable).set({ transferStep: 1 }).where(eq(domainsTable.id, row.id));
    return { ok: "Transfer started. Work through the steps; this tracks where you are." };
  }
  if (intent === "advance-transfer") {
    const id = text("domainId");
    const row = await storeDomain(context.db, store.id, id);
    if (!row) return { error: "That domain is not on this store." };
    const next = Math.min(7, (row.transferStep ?? 1) + 1);
    await context.db.update(domainsTable).set({ transferStep: next }).where(eq(domainsTable.id, id));
    return { ok: next > 6 ? "Transfer recorded as complete. Press Verify connection to bind it." : `Step ${next - 1} done.` };
  }
  if (intent === "cancel-transfer") {
    await removeDomain(context.db, store.id, text("domainId"));
    return { ok: "Transfer cancelled." };
  }

  /* ---------------------------------------------------------- payments */
  if (intent === "stripe") {
    const accountName = text("accountName") || null;
    const statementDescriptor = text("statementDescriptor") || null;
    const publishableKey = text("publishableKey") || null;
    const secretKey = text("secretKey");
    const webhookSecret = text("webhookSecret");

    if (publishableKey && !publishableKey.startsWith("pk_")) return { error: "A Stripe publishable key starts with pk_." };
    if (secretKey && !/^(sk|rk)_/.test(secretKey)) return { error: "A Stripe secret key starts with sk_ (or rk_)." };
    if (webhookSecret && !webhookSecret.startsWith("whsec_")) return { error: "A webhook signing secret starts with whsec_." };
    if ((secretKey || webhookSecret) && !encryptionReady(env)) {
      return { error: "Not saved: no ENCRYPTION_KEY is set on the Worker, and a live payment key will not be stored unencrypted." };
    }

    const encrypted = secretKey ? await encryptSecret(env, secretKey) : null;
    const encryptedWebhook = webhookSecret ? await encryptSecret(env, webhookSecret) : null;
    const existing = (await storeSettings(context.db, store.id)).providers.find((p) => p.provider === "stripe");
    if (existing) {
      await context.db
        .update(paymentProviders)
        .set({ accountName, publishableKey, ...(encrypted ? { secretKeyEnc: encrypted } : {}), ...(encryptedWebhook ? { webhookSecretEnc: encryptedWebhook } : {}) })
        .where(eq(paymentProviders.id, existing.id));
    } else {
      await context.db.insert(paymentProviders).values({
        storeId: store.id,
        provider: "stripe",
        accountName,
        publishableKey,
        secretKeyEnc: encrypted,
        webhookSecretEnc: encryptedWebhook,
        isPrimary: true,
      });
    }
    if (statementDescriptor !== null) await saveStoreSettings(context.db, store.id, { statementDescriptor });
    return { ok: "Saved. Press Test connection to prove the key works." };
  }

  if (intent === "stripe-test") {
    try {
      const provider = await providerForStore(context.db, env, store.id);
      const result = await provider.testConnection();
      if (!result.ok) return { error: `Stripe refused the key: ${result.reason}` };
      const existing = (await storeSettings(context.db, store.id)).providers.find((p) => p.provider === "stripe");
      if (existing) await context.db.update(paymentProviders).set({ connectedAt: new Date() }).where(eq(paymentProviders.id, existing.id));
      return { ok: `Connected. Stripe answered for a ${result.account} account.` };
    } catch (error) {
      return { error: error instanceof PaymentsNotConfigured ? error.message : "Stripe could not be reached." };
    }
  }

  if (intent === "payment-handling") {
    const existing = (await storeSettings(context.db, store.id)).providers.find((p) => p.provider === "stripe");
    if (existing) {
      await context.db
        .update(paymentProviders)
        .set({
          capture: text("capture") === "manual" ? "manual" : "automatic",
          submitDisputeEvidence: on("submitDisputeEvidence"),
          emailOnFailedPayment: on("emailOnFailedPayment"),
        })
        .where(eq(paymentProviders.id, existing.id));
    }
    return { ok: "Saved." };
  }

  if (intent === "stripe-remove") {
    const existing = (await storeSettings(context.db, store.id)).providers.find((p) => p.provider === "stripe");
    if (existing) await context.db.delete(paymentProviders).where(eq(paymentProviders.id, existing.id));
    return { ok: "Stripe removed from this store. Checkout will refuse until a provider is connected again." };
  }

  /* ----------------------------------------------------- notifications */
  if (intent === "sender") {
    const from = text("emailFrom").toLowerCase();
    if (from && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(from)) return { error: "That does not look like an email address." };
    await saveStoreSettings(context.db, store.id, { emailFrom: from || null });

    if (from && emailReady(env)) {
      const domain = from.split("@")[1];
      const created = await createSenderDomain(env, domain);
      if (!created.ok) return { error: `Saved, but Resend said: ${created.reason}` };
      await saveStoreSettings(context.db, store.id, { resendDomainId: created.value.id });
      return { ok: `Saved. Add the DNS records below at your DNS provider, then press Verify.` };
    }
    return { ok: from ? "Saved. Email is not configured on the Worker yet, so the domain cannot be verified." : "Saved." };
  }
  if (intent === "verify-sender") {
    if (!store.resendDomainId) return { error: "Save a from address first." };
    const result = await verifySenderDomain(env, store.resendDomainId);
    if (!result.ok) return { error: result.reason };
    return {
      ok:
        result.value.status === "verified"
          ? "Verified. Receipts now go out from your own domain."
          : `Resend is checking — status is "${result.value.status}". DNS changes can take a while; try again in a few minutes.`,
    };
  }
  if (intent === "send-test-email") {
    if (!emailReady(env)) return { error: "Email is not configured on the Worker yet." };
    const kind = text("kind");
    const to = user.email;
    const common = { to, customerName: "Test Customer", storeName: store.name, fromAddress: store.emailFrom, replyTo: store.contactEmail, orderNumber: 1001 };
    const probe = "settings-test";
    let ok = false;
    if (kind === "confirmation") {
      ok = await sendOrderConfirmation(context.db, env, probe, { ...common, currency: store.currency, lines: [{ label: "Example bundle", quantity: 1, lineTotalCents: 12900 }], subtotalCents: 12900, taxCents: 0, shippingCents: 0, totalCents: 12900 }).catch(() => false);
    } else if (kind === "shipping") {
      ok = await sendShippingNotice(context.db, env, probe, { ...common, tracking: "9400 1000 0000 0000 0000 00", carrier: "USPS" }).catch(() => false);
    } else if (kind === "refund") {
      ok = await sendRefundNotice(context.db, env, probe, { ...common, amountCents: 12900, currency: store.currency, full: true }).catch(() => false);
    }
    return ok ? { ok: `Test ${kind} email sent to ${to}.` } : { error: "The test email could not be sent. Check the Resend key and the from address." };
  }

  /* ------------------------------------------------------------ taxes */
  if (intent === "taxes") {
    const rate = parseRate(text("taxRate"));
    if (rate === null) return { error: "Default rate looks wrong. Type it like 8.75 (percent) or 0.0875." };
    await saveStoreSettings(context.db, store.id, {
      taxMode: text("taxMode") === "automatic" ? "automatic" : "manual",
      taxRate: rate,
      pricesIncludeTax: on("pricesIncludeTax"),
      taxOnShipping: on("taxOnShipping"),
    });
    return { ok: "Saved." };
  }
  if (intent === "add-tax-rate") {
    const region = text("region").toUpperCase();
    const rate = parseRate(text("rate"));
    if (!US_STATES.includes(region)) return { error: "Pick a state." };
    if (rate === null) return { error: "Rate looks wrong. Type it like 8.75 (percent) or 0.0875." };
    await upsertTaxRate(context.db, store.id, region, rate);
    return { ok: `${region} rate saved.` };
  }
  if (intent === "remove-tax-rate") {
    await removeTaxRate(context.db, store.id, text("rateId"));
    return { ok: "Removed." };
  }

  /* --------------------------------------------------------- shipping */
  if (intent === "shipping") {
    const flat = centsFromInput(text("shipFlat") || "0");
    const freeOver = text("shipFreeOver") ? centsFromInput(text("shipFreeOver")) : null;
    if (flat === null) return { error: "Flat rate must be a price like 4.99." };
    if (text("shipFreeOver") && freeOver === null) return { error: "Free-shipping threshold must be a price like 50." };
    await saveStoreSettings(context.db, store.id, {
      shipFlatCents: flat,
      shipFreeOverCents: freeOver,
      shipEstimate: text("shipEstimate") || null,
      shipAlwaysFree: on("shipAlwaysFree"),
      shipEtaOnProduct: on("shipEtaOnProduct"),
    });
    return { ok: "Saved. Cart and checkout use these from the next page load." };
  }

  /* --------------------------------------------------------- checkout */
  if (intent === "checkout") {
    await saveStoreSettings(context.db, store.id, {
      checkoutNameMode: text("checkoutNameMode") === "last" ? "last" : "full",
      checkoutPhoneMode: ["optional", "required", "hidden"].includes(text("checkoutPhoneMode")) ? text("checkoutPhoneMode") : "optional",
      checkoutCompanyMode: ["hidden", "optional", "required"].includes(text("checkoutCompanyMode")) ? text("checkoutCompanyMode") : "hidden",
      checkoutConsent: on("checkoutConsent"),
      checkoutCaptureAbandoned: on("checkoutCaptureAbandoned"),
      checkoutTip: on("checkoutTip"),
    });
    return { ok: "Saved." };
  }

  /* --------------------------------------------------------- policies */
  if (intent === "policies" || intent === "publish-policies") {
    await savePolicies(
      context.db,
      store.id,
      {
        "refund-policy": String(form.get("refund-policy") || ""),
        "privacy-policy": String(form.get("privacy-policy") || ""),
        "terms-of-service": String(form.get("terms-of-service") || ""),
        "shipping-policy": String(form.get("shipping-policy") || ""),
      },
      intent === "publish-policies",
    );
    return { ok: intent === "publish-policies" ? `Published. Empty policies stay hidden; written ones are live at ${store.domain}/pages/…` : "Saved as drafts." };
  }

  /* --------------------------------------------------------- branding */
  if (intent === "branding") {
    const colour = (value: string) => (/^#[0-9a-f]{6}$/i.test(value) ? value : null);
    await saveStoreSettings(context.db, store.id, {
      logoUrl: text("logoUrl") || null,
      faviconUrl: text("faviconUrl") || null,
      brandColor: colour(text("brandColor")),
      accentColor: colour(text("accentColor")),
    });
    return { ok: "Saved." };
  }

  /* ------------------------------------------------------------- data */
  if (intent === "delete-store") {
    if (text("confirmName") !== store.name) return { error: `Type the store name exactly — ${store.name} — to confirm.` };
    const result = await deleteStore(context.db, store.id);
    if (!result.ok) return { error: result.reason };
    return new Response(null, { status: 302, headers: { Location: "/admin" } });
  }

  return { error: "Unknown action." };
}

export default function Settings({ loaderData, actionData }: Route.ComponentProps) {
  const { pane, store, settings, profile, env } = loaderData;
  const navigation = useNavigation();
  const busy = navigation.state === "submitting";
  const suffix = store ? `?store=${store.slug}` : "";

  return (
    <div style={{ maxWidth: 1160, margin: "0 auto", display: "flex", flexDirection: "column", gap: 16 }}>
      <h1 style={{ margin: 0, fontSize: 20, lineHeight: "28px", fontWeight: 650 }}>Settings</h1>

      {actionData?.error ? <Notice kind="critical">{actionData.error}</Notice> : null}
      {actionData?.ok ? <Notice kind="success">{actionData.ok}</Notice> : null}

      <div style={{ display: "grid", gridTemplateColumns: "208px minmax(0,1fr)", gap: 16, alignItems: "start" }}>
        <nav
          style={{
            background: "var(--surface)",
            border: "1px solid var(--border)",
            borderRadius: 12,
            boxShadow: "var(--shadow)",
            padding: 6,
            display: "flex",
            flexDirection: "column",
            gap: 1,
          }}
        >
          {PANES.map(([key, label]) => (
            <Link
              key={key}
              to={`/admin/settings${suffix}${suffix ? "&" : "?"}pane=${key}`}
              className="k-hover"
              style={{
                display: "flex",
                alignItems: "center",
                height: 32,
                padding: "0 10px",
                border: 0,
                borderRadius: 8,
                background: pane === key ? "var(--accent-soft)" : "transparent",
                color: "var(--ink)",
                fontSize: 13,
                fontWeight: pane === key ? 600 : 450,
                cursor: "pointer",
                textAlign: "left",
                textDecoration: "none",
              }}
            >
              {label}
            </Link>
          ))}
        </nav>

        <div style={{ minWidth: 0, display: "flex", flexDirection: "column", gap: 16 }}>
          {pane === "profile" ? (
            <ProfilePane profile={profile} busy={busy} />
          ) : !store || !settings || !env ? (
            <SettingsCard title="Pick a store" note="These settings belong to a single store — each one has its own domain, payment account and email sender, so a problem on one store can never touch the others. Create a store first." />
          ) : pane === "general" ? (
            <GeneralPane store={store} busy={busy} />
          ) : pane === "domains" ? (
            <DomainsPane store={store} domains={settings.domains} cloudflare={env.cloudflare} adminOrigin={env.adminOrigin} busy={busy} />
          ) : pane === "payments" ? (
            <PaymentsPane store={store} stripe={settings.stripe} encryption={env.encryption} adminOrigin={env.adminOrigin} busy={busy} />
          ) : pane === "notifications" ? (
            <NotificationsPane store={store} sender={settings.sender} resend={env.resend} busy={busy} profileEmail={profile.email} onCloudflare={settings.domains.some((d) => d.zone && store.emailFrom.endsWith(`@${d.hostname}`))} />
          ) : pane === "taxes" ? (
            <TaxesPane store={store} taxes={settings.taxes} busy={busy} />
          ) : pane === "shipping" ? (
            <ShippingPane store={store} busy={busy} />
          ) : pane === "checkout" ? (
            <CheckoutPane store={store} busy={busy} />
          ) : pane === "policies" ? (
            <PoliciesPane store={store} policies={settings.policies} busy={busy} />
          ) : pane === "branding" ? (
            <BrandingPane store={store} busy={busy} />
          ) : pane === "billing" ? (
            <BillingPane domains={settings.domains.length} />
          ) : (
            <DataPane store={store} busy={busy} />
          )}
        </div>
      </div>
    </div>
  );
}

/* ================================================================ panes */

type Store = NonNullable<Route.ComponentProps["loaderData"]["store"]>;
type SettingsData = NonNullable<Route.ComponentProps["loaderData"]["settings"]>;

function Notice({ kind, children }: { kind: "critical" | "success"; children: React.ReactNode }) {
  return (
    <div style={{ background: `var(--b-${kind}-bg)`, color: `var(--b-${kind}-fg)`, borderRadius: 10, padding: "10px 12px", fontSize: 13, lineHeight: "19px" }}>
      {children}
    </div>
  );
}

/** A control that is deliberately not wired up, shown off and explained. */
function DeadRow({ label, help }: { label: string; help: string }) {
  return (
    <div style={{ ...toggleRow, opacity: 0.6 }}>
      <span style={{ flex: 1, display: "flex", flexDirection: "column", gap: 1 }}>
        <span style={{ fontWeight: 550 }}>{label}</span>
        <span style={{ fontSize: 12, color: "var(--ink-2)" }}>{help}</span>
      </span>
      <span style={{ width: 38, height: 22, position: "relative", flex: "none" }}>
        <span className="k-switch-track" style={{ background: "var(--border-strong)" }} />
      </span>
    </div>
  );
}

function SaveRow({ busy, label = "Save", extra }: { busy: boolean; label?: string; extra?: React.ReactNode }) {
  return (
    <div style={saveBar}>
      <CardButton primary disabled={busy}>
        {busy ? "Saving…" : label}
      </CardButton>
      {extra}
    </div>
  );
}

function ProfilePane({ profile, busy }: { profile: Route.ComponentProps["loaderData"]["profile"]; busy: boolean }) {
  return (
    <>
      <Form method="post">
        <input type="hidden" name="intent" value="profile" />
        <SettingsCard title="Your account">
          <FieldGrid>
            <TextField label="Name" name="name" defaultValue={profile.name} placeholder="Your name" />
            <TextField label="Email" name="email" defaultValue={profile.email} readOnly help="Sign-in is through Google, so the address is Google's." />
          </FieldGrid>
          <SaveRow busy={busy} />
        </SettingsCard>
      </Form>

      <SettingsCard title="Security" sub={`${profile.sessions} device${profile.sessions === 1 ? "" : "s"} signed in`}>
        <div style={toggleRow}>
          <span style={{ flex: 1, display: "flex", flexDirection: "column", gap: 1 }}>
            <span style={{ fontWeight: 550 }}>Two-factor authentication</span>
            <span style={{ fontSize: 12, color: "var(--ink-2)" }}>Handled by your Google account. Turn it on at myaccount.google.com → Security.</span>
          </span>
          <RowBadge kind="info">via Google</RowBadge>
        </div>
        <Form method="post">
          <input type="hidden" name="intent" value="sign-out-others" />
          <button type="submit" className="k-hover" style={linkRow}>
            <LinkLabel label="Sign out of all devices" help="Ends every session except this one" />
            <LinkChevron />
          </button>
        </Form>
      </SettingsCard>

      <Form method="post">
        <input type="hidden" name="intent" value="notify-prefs" />
        <SettingsCard title="Notification preferences">
          <ToggleRow label="Email me on every order" help="Goes to the store's contact email in Settings → General" name="notifyEveryOrder" defaultChecked={profile.notifyEveryOrder} />
          <SaveRow busy={busy} />
        </SettingsCard>
      </Form>

      <SettingsCard title="Not built yet" note="Switched off because nothing sends them yet.">
        <DeadRow label="Email me on chargebacks" help="The chargeback lands on the order timeline; no email goes out" />
        <DeadRow label="Weekly summary" help="Needs a scheduled job, which the Worker does not have yet" />
      </SettingsCard>

    </>
  );
}

function GeneralPane({ store, busy }: { store: Store; busy: boolean }) {
  return (
    <Form method="post">
      <input type="hidden" name="intent" value="general" />
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <SettingsCard title="Store details">
          <FieldGrid>
            <TextField label="Store name" name="name" defaultValue={store.name} required />
            <TextField label="Contact email" name="contactEmail" type="email" defaultValue={store.contactEmail} placeholder={`support@${store.domain}`} help="Where customer replies go, and where you are told about new orders." />
            <SelectField label="Currency" name="currency" defaultValue={store.currency} options={CURRENCIES} help="Changing this relabels existing prices — it does not convert them." />
            <SelectField label="Timezone" name="timezone" defaultValue={store.timezone} options={TIMEZONES} />
          </FieldGrid>
        </SettingsCard>
        <SettingsCard title="Business address" sub="Used on invoices and for tax calculation">
          <FieldGrid>
            <TextField label="Legal business name" name="legalName" defaultValue={store.legalName} />
            <TextField label="Street" name="address1" defaultValue={store.address1} />
            <TextField label="City" name="city" defaultValue={store.city} />
            <TextField label="State" name="region" defaultValue={store.region} />
            <TextField label="ZIP" name="postalCode" defaultValue={store.postalCode} />
            <TextField label="Phone" name="phone" defaultValue={store.phone} />
          </FieldGrid>
          <SaveRow busy={busy} />
        </SettingsCard>
      </div>
    </Form>
  );
}

function DomainsPane({
  store,
  domains,
  cloudflare,
  adminOrigin,
  busy,
}: {
  store: Store;
  domains: SettingsData["domains"];
  cloudflare: boolean;
  adminOrigin: string | null;
  busy: boolean;
}) {
  const transferring = domains.find((d) => d.transferStep != null);

  return (
    <>
      {!cloudflare ? (
        <Notice kind="critical">
          Cloudflare is not connected to this Worker yet (CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID). Domains can be listed but not connected until it is.
        </Notice>
      ) : null}

      <SettingsCard
        title={`Domains · ${store.name}`}
        sub={domains.length ? `${domains.length} domain${domains.length === 1 ? "" : "s"}` : "None connected"}
        actions={
          <Form method="post" style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <input type="hidden" name="intent" value="add-subdomain" />
            <input name="subdomain" placeholder="shop" style={{ ...input, height: 28, width: 90 }} />
            <CardButton disabled={!domains.length || busy}>Add subdomain</CardButton>
          </Form>
        }
      >
        {domains.length === 0 ? (
          <EmptyRows title="No domains connected" body={`The storefront answers on ${store.domain} today. Connect a domain you already own, or transfer its registration here.`} />
        ) : (
          domains.map((domain) => (
            <div key={domain.id}>
              <ListRow
                name={domain.hostname}
                note={
                  domain.transferStep != null
                    ? `Registration transferring in — step ${Math.min(domain.transferStep, 6)} of 6`
                    : domain.lastError
                      ? `Cloudflare: ${domain.lastError}`
                      : domain.status === "connected"
                        ? "Bound to this Worker · Cloudflare manages DNS and the certificate"
                        : domain.zone
                          ? "Waiting for the nameservers to point at Cloudflare"
                          : "Pointing here via DNS"
                }
                badges={[
                  { label: domain.status === "connected" ? "Connected" : domain.transferStep != null ? "Transferring" : "Pending", kind: domain.status === "connected" ? "success" : domain.transferStep != null ? "info" : "warning" },
                  { label: `SSL ${domain.ssl === "active" ? "Active" : "Pending"}`, kind: domain.ssl === "active" ? "success" : "neutral" },
                  ...(domain.isPrimary ? [{ label: "Primary", kind: "info" as const }] : []),
                ]}
                hidden={{ domainId: domain.id }}
                actions={[
                  { label: "Verify connection", intent: "verify-domain", disabled: busy || domain.transferStep != null },
                  { label: "Set as primary", intent: "primary-domain", disabled: domain.isPrimary || busy },
                  { label: "Remove", intent: "remove-domain", danger: true, confirm: `Remove ${domain.hostname}? The storefront stops answering on it immediately.` },
                ]}
              />
              {domain.nameservers.length && domain.status !== "connected" ? (
                <div style={{ padding: "0 16px 12px" }}>
                  <div style={{ fontSize: 12, color: "var(--ink-2)", padding: "8px 0 6px" }}>
                    Set these two nameservers for <strong>{domain.hostname}</strong> at your registrar:
                  </div>
                  <DnsTable rows={domain.nameservers.map((server, index) => ({ type: "NS", name: `nameserver ${index + 1}`, value: server }))} />
                </div>
              ) : null}
            </div>
          ))
        )}
      </SettingsCard>

      <SettingsCard
        title="Connect an existing domain"
        sub="The domain stays at your registrar and simply points here"
        note="Add the domain, and Cloudflare gives you two nameservers to set at your registrar. Then press Verify connection on the domain above. Status moves Pending → Connected → SSL Active. Nameserver changes can take up to 24 hours."
      >
        <div style={{ margin: 16, background: "var(--b-warning-bg)", color: "var(--b-warning-fg)", borderRadius: 10, padding: "12px 14px", fontSize: 13, lineHeight: "19px" }}>
          <strong>Before you change nameservers, read this.</strong> Changing them moves <em>everything</em> about that domain to
          Cloudflare — including your email. If you receive mail on this domain (Google Workspace, Outlook, anything), your email
          stops working until those MX records are re-added at Cloudflare. If mail runs on the domain, ask me first and I will
          copy the records across before you switch.
        </div>
        <Form method="post">
          <input type="hidden" name="intent" value="add-domain" />
          <FieldGrid columns={1}>
            <TextField label="Domain" name="hostname" placeholder="yourstore.com" help="No http:// and no www — www is added for you once it is connected." span />
          </FieldGrid>
          <SaveRow busy={busy} label="Add domain" />
        </Form>
      </SettingsCard>

      <SettingsCard
        title="Transfer a domain in"
        sub={transferring ? `${transferring.hostname} · step ${Math.min(transferring.transferStep ?? 1, 6)} of 6` : "Move the registration itself to Cloudflare"}
        note="The domain must be more than 60 days old and not transferred in the last 60 days — ICANN blocks it otherwise. This tracks your progress; the transfer itself is done at Cloudflare → Domain Registration → Transfer."
      >
        <Steps steps={TRANSFER_STEPS} current={transferring?.transferStep ?? 0} />
        {transferring ? (
          <div style={saveBar}>
            <Form method="post">
              <input type="hidden" name="intent" value="advance-transfer" />
              <input type="hidden" name="domainId" value={transferring.id} />
              <CardButton primary disabled={busy}>
                {(transferring.transferStep ?? 1) >= 6 ? "Mark transfer complete" : "Next step done"}
              </CardButton>
            </Form>
            <Form method="post" onSubmit={(e) => { if (!confirm("Cancel this transfer record?")) e.preventDefault(); }}>
              <input type="hidden" name="intent" value="cancel-transfer" />
              <input type="hidden" name="domainId" value={transferring.id} />
              <CardButton danger disabled={busy}>Cancel transfer</CardButton>
            </Form>
          </div>
        ) : (
          <Form method="post">
            <input type="hidden" name="intent" value="start-transfer" />
            <FieldGrid>
              <TextField label="Domain to transfer" name="hostname" placeholder="yourstore.com" />
            </FieldGrid>
            <SaveRow busy={busy} label="Start transfer" />
          </Form>
        )}
      </SettingsCard>

      <SettingsCard
        title="Admin domain"
        note={
          adminOrigin
            ? `This admin runs on ${adminOrigin.replace(/^https?:\/\//, "")} — its own address, separate from every storefront. Removing a store domain never affects your access here.`
            : "This admin has its own address, separate from every storefront. Removing a store domain never affects your access here."
        }
      />
    </>
  );
}

function PaymentsPane({
  store,
  stripe,
  encryption,
  adminOrigin,
  busy,
}: {
  store: Store;
  stripe: SettingsData["stripe"];
  encryption: boolean;
  adminOrigin: string | null;
  busy: boolean;
}) {
  // Never show a webhook URL guessed from whatever host he happens to be on:
  // pasting a preview URL into Stripe means payments silently never confirm.
  const webhookUrl = adminOrigin ? `${adminOrigin}/webhooks/stripe` : null;
  return (
    <>
      <SettingsCard title={`Payments · ${store.name}`} note={`${store.name} has its own payment account. If this account is ever frozen, your other stores keep taking money — nothing is shared between them.`} />

      {!encryption ? (
        <Notice kind="critical">No encryption key is set on the Worker. Secret keys will not be saved until there is one — a live payment key is not going in the database in the clear.</Notice>
      ) : null}

      {stripe?.hasSecret && !stripe.hasWebhookSecret ? (
        <Notice kind="critical">
          No webhook signing secret yet. Cards will be charged at Stripe, but this admin will never learn that they were paid —
          orders would sit as "pending" forever. Finish the webhook step below before taking a real order.
        </Notice>
      ) : null}

      <Form method="post">
        <input type="hidden" name="intent" value="stripe" />
        <SettingsCard title={`Stripe${stripe?.accountName ? ` · ${stripe.accountName}` : ""} (primary)`} sub={stripe?.connectedAt ? "Connected" : "Not connected"}>
          <FieldGrid>
            <TextField label="Account name" name="accountName" defaultValue={stripe?.accountName} placeholder="Legal entity on the account" />
            <TextField label="Statement descriptor" name="statementDescriptor" defaultValue={store.statementDescriptor} placeholder="What buyers see on their card" />
            <TextField label="Publishable key" name="publishableKey" defaultValue={stripe?.publishableKey} placeholder="pk_live_…" mono />
            <TextField label="Secret key" name="secretKey" type="password" placeholder={stripe?.hasSecret ? "Leave blank to keep the stored one" : "sk_live_…"} mono help={stripe?.hasSecret ? `Stored encrypted · ${stripe.secretMask}` : undefined} />
            <TextField label="Webhook signing secret" name="webhookSecret" type="password" placeholder={stripe?.hasWebhookSecret ? "Leave blank to keep the stored one" : "whsec_…"} mono help={stripe?.hasWebhookSecret ? "Stored encrypted" : undefined} />
          </FieldGrid>
          <SaveRow busy={busy} />
        </SettingsCard>
      </Form>

      <SettingsCard title="Connection">
        <ListRow
          name={stripe?.connectedAt ? "Connection verified" : "Not connected"}
          note={stripe?.connectedAt ? `Stripe answered on ${new Date(stripe.connectedAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}` : "Add the keys above, then test the connection"}
          badges={[{ label: stripe?.connectedAt ? "Connected" : "Not connected", kind: stripe?.connectedAt ? "success" : "neutral" }, ...(stripe?.isBackup ? [{ label: "Backup", kind: "info" as const }] : [])]}
          actions={[
            { label: "Test connection", intent: "stripe-test", disabled: !stripe?.hasSecret || busy },
            { label: "Remove", intent: "stripe-remove", danger: true, disabled: !stripe, confirm: "Remove Stripe from this store? Checkout will refuse payments until a provider is connected again." },
          ]}
        />
        <div style={{ padding: "12px 16px", fontSize: 13, lineHeight: "19px", color: "var(--ink-2)" }}>
          <div style={{ fontWeight: 600, color: "var(--ink)", marginBottom: 6 }}>Webhook — set this up once in Stripe</div>
          <div style={{ marginBottom: 6 }}>In Stripe: Developers → Webhooks → Add endpoint.</div>
          {webhookUrl ? (
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6, flexWrap: "wrap" }}>
              <code style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 12, background: "var(--bg)", padding: "3px 8px", borderRadius: 4 }}>{webhookUrl}</code>
              <CopyButton value={webhookUrl} />
            </div>
          ) : (
            <div style={{ background: "var(--b-critical-bg)", color: "var(--b-critical-fg)", borderRadius: 8, padding: "8px 10px", marginBottom: 6 }}>
              The admin's own address is not set on the Worker (ADMIN_ORIGIN), so the exact webhook URL cannot be shown. Set it before creating the endpoint — a URL guessed from the page you happen to be on will silently never confirm a payment.
            </div>
          )}
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6, flexWrap: "wrap" }}>
            <span>Select these four events:</span>
            <code style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 12 }}>{STRIPE_EVENTS}</code>
            <CopyButton value={STRIPE_EVENTS} />
          </div>
          Then paste the signing secret it shows (whsec_…) into the field above.
          <div style={{ marginTop: 6, fontWeight: 600, color: "var(--ink)" }}>
            Check the endpoint says Live, not Test — a test-mode webhook never confirms a real order.
          </div>
        </div>
      </SettingsCard>

      <SettingsCard
        title="Add a payment provider"
        sub="A second account can take over if the first is frozen"
        actions={
          <span style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            <CardButton type="button" disabled title="Stripe is provider one. A second Stripe account is the next thing to add here.">Add Stripe account</CardButton>
            <CardButton type="button" disabled title="Not built yet. Payments are behind an interface so this does not touch orders or checkout when it arrives.">Add PayPal</CardButton>
            <CardButton type="button" disabled title="Not built yet.">Add manual method</CardButton>
          </span>
        }
        note="Greyed out means not built yet — not broken. It says so rather than pretending."
      />

      <Form method="post">
        <input type="hidden" name="intent" value="payment-handling" />
        <SettingsCard title="Payment handling">
          <FieldGrid>
            <SelectField
              label="Payment capture"
              name="capture"
              defaultValue="automatic"
              options={[{ value: "automatic", label: "Automatic — charge at checkout" }]}
              help="Manual capture is not built yet, so it is not offered — choosing it would authorise money you could not collect."
            />
          </FieldGrid>
          <ToggleRow label="Submit dispute evidence automatically" help="Tracking, delivery scans and emails filed with Stripe when a chargeback opens" name="submitDisputeEvidence" defaultChecked={stripe?.submitDisputeEvidence ?? true} />
          <ToggleRow label="Email me on every failed payment" help="Card declines and webhook failures" name="emailOnFailedPayment" defaultChecked={stripe?.emailOnFailedPayment ?? false} />
          <LinkRow label="Export all payment records" help="CSV of every order with its payment reference, refunds and status" href={`/admin/orders/export?store=${store.slug}`} />
          <SaveRow busy={busy} />
        </SettingsCard>
      </Form>
    </>
  );
}

function NotificationsPane({
  store,
  sender,
  resend,
  busy,
  profileEmail,
  onCloudflare,
}: {
  store: Store;
  sender: SettingsData["sender"];
  resend: boolean;
  busy: boolean;
  profileEmail: string;
  onCloudflare: boolean;
}) {
  const domain = store.emailFrom.split("@")[1];
  const spf = sender?.records.find((r) => r.record === "SPF");
  const dkim = sender?.records.find((r) => r.record === "DKIM");
  const verified = sender?.status === "verified";

  return (
    <>
      {!resend ? <Notice kind="critical">Email is not configured on the Worker (RESEND_API_KEY). Nothing can be sent or verified until it is.</Notice> : null}

      <Form method="post">
        <input type="hidden" name="intent" value="sender" />
        <SettingsCard title="Sender" sub={domain ? `Sending from ${domain}` : "Set a from address on your own domain"}>
          <FieldGrid columns={1}>
            <TextField
              label="From address"
              name="emailFrom"
              type="email"
              defaultValue={store.emailFrom}
              placeholder={`orders@${store.domain}`}
              help="Must be on your own domain so mail lands in inboxes, not spam."
              span
            />
          </FieldGrid>
          <SaveRow busy={busy} />
        </SettingsCard>
      </Form>

      <SettingsCard
        title="Sender domain records"
        sub={sender ? `Resend says: ${sender.status.replace(/_/g, " ")}` : "Save a from address to fetch the records"}
        note={
          onCloudflare
            ? "This domain's DNS is on Cloudflare, so add these at Cloudflare → your domain → DNS → Records. Adding them at your old registrar will do nothing, because it is no longer authoritative."
            : "Add these at whoever hosts this domain's DNS, then press Verify. If you later move the domain onto Cloudflare nameservers, they have to be re-added there."
        }
      >
        <ListRow
          name="SPF"
          note={spf ? `${spf.type} record on ${domain}` : domain ? "Save the address to fetch the record" : "No sender domain yet"}
          badges={[{ label: spf?.status === "verified" ? "Verified" : "Not verified", kind: spf?.status === "verified" ? "success" : "neutral" }]}
          actions={[{ label: "Verify", intent: "verify-sender", disabled: !store.resendDomainId || busy }]}
        />
        <ListRow
          name="DKIM"
          note="Signs every message so it is not marked as spam"
          badges={[{ label: dkim?.status === "verified" ? "Verified" : "Not verified", kind: dkim?.status === "verified" ? "success" : "neutral" }]}
          actions={[{ label: "Verify", intent: "verify-sender", disabled: !store.resendDomainId || busy }]}
        />
        {sender ? <DnsTable rows={sender.records.map((r) => ({ type: r.type, name: r.name, value: r.value }))} /> : null}
        {!verified && store.emailFrom ? (
          <div style={{ padding: "10px 16px", fontSize: 12, color: "var(--ink-3)" }}>
            Until this says Verified, receipts go out from a shared address and are far more likely to land in spam.
          </div>
        ) : null}
      </SettingsCard>

      <SettingsCard title="Customer emails" sub={`Tests go to ${profileEmail}`}>
        {[
          ["confirmation", "Order confirmation", "Sent the moment payment is captured"],
          ["shipping", "Shipping confirmation", "Sent when you add a tracking number"],
          ["refund", "Refund notification", "Sent when you issue a refund"],
        ].map(([kind, name, note]) => (
          <div key={kind} style={listRow}>
            <span style={listRowMain}>
              <span style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <span style={{ fontWeight: 600 }}>{name}</span>
                <RowBadge kind="success">Active</RowBadge>
              </span>
              <span style={{ fontSize: 12, color: "var(--ink-2)" }}>{note}</span>
            </span>
            <a href={`/admin/settings/email-preview?store=${store.slug}&kind=${kind}`} target="_blank" rel="noreferrer">
              <RowButton type="button">Preview</RowButton>
            </a>
            <Form method="post">
              <input type="hidden" name="intent" value="send-test-email" />
              <input type="hidden" name="kind" value={kind} />
              <RowButton disabled={!resend || busy}>Send test</RowButton>
            </Form>
          </div>
        ))}
        <div style={{ padding: "10px 16px", fontSize: 12, color: "var(--ink-3)" }}>
          The wording of these is written in code. Tell me what you want them to say and I will change it.
        </div>
      </SettingsCard>
    </>
  );
}

function TaxesPane({ store, taxes, busy }: { store: Store; taxes: SettingsData["taxes"]; busy: boolean }) {
  return (
    <>
      <Form method="post">
        <input type="hidden" name="intent" value="taxes" />
        <SettingsCard title="US sales tax">
          <FieldGrid>
            <SelectField
              label="Calculation"
              name="taxMode"
              defaultValue={store.taxMode}
              options={[
                { value: "manual", label: "Manual — I set the rates" },
                { value: "automatic", label: "Automatic — rates by destination" },
              ]}
              help="Automatic needs a tax service connected. Until then it behaves like manual."
            />
            <TextField label="Default rate" name="taxRate" defaultValue={`${(store.taxRate * 100).toFixed(2)}%`} help="Used when no state rate matches" />
          </FieldGrid>
          <ToggleRow label="Prices include tax" help="Show tax-inclusive prices on the storefront" name="pricesIncludeTax" defaultChecked={store.pricesIncludeTax} />
          <ToggleRow label="Charge tax on shipping" name="taxOnShipping" defaultChecked={store.taxOnShipping} />
          <SaveRow busy={busy} />
        </SettingsCard>
      </Form>

      <SettingsCard title="Manual state rates" note="A state listed here is charged its own rate at checkout. Everywhere else pays the default rate above.">
        {taxes.length === 0 ? (
          <EmptyRows title="No manual state rates" body="Add a rate for every state where you have nexus." />
        ) : (
          taxes.map((row) => (
            <ListRow key={row.id} name={`${row.region} · ${(row.rate * 100).toFixed(2)}%`} note="Manual rate" hidden={{ rateId: row.id }} actions={[{ label: "Remove", intent: "remove-tax-rate", danger: true }]} />
          ))
        )}
        <Form method="post">
          <input type="hidden" name="intent" value="add-tax-rate" />
          <FieldGrid>
            <SelectField label="State" name="region" options={US_STATES.map((code) => ({ value: code, label: code }))} />
            <TextField label="Rate" name="rate" placeholder="8.75%" />
          </FieldGrid>
          <SaveRow busy={busy} label="Add state rate" />
        </Form>
      </SettingsCard>
    </>
  );
}

function ShippingPane({ store, busy }: { store: Store; busy: boolean }) {
  return (
    <Form method="post">
      <input type="hidden" name="intent" value="shipping" />
      <SettingsCard title="Rates">
        <FieldGrid>
          <TextField label="Flat rate" name="shipFlat" defaultValue={store.shipFlat} placeholder="0.00" />
          <TextField label="Free shipping over" name="shipFreeOver" defaultValue={store.shipFreeOver} placeholder="0.00" help="Leave blank for no threshold" />
          <TextField label="Delivery estimate shown at checkout" name="shipEstimate" defaultValue={store.shipEstimate} placeholder="e.g. 5–9 business days" span />
        </FieldGrid>
        <ToggleRow label="Free shipping on every order" help="Overrides the flat rate" name="shipAlwaysFree" defaultChecked={store.shipAlwaysFree} />
        <div style={{ padding: "11px 16px", fontSize: 12, color: "var(--ink-3)", borderBottom: "1px solid var(--border)" }}>
          One rate, every destination. Checkout ships to the countries listed in its country box — there are no per-country zones yet.
        </div>
        <SaveRow busy={busy} />
      </SettingsCard>
    </Form>
  );
}

function CheckoutPane({ store, busy }: { store: Store; busy: boolean }) {
  return (
    <Form method="post">
      <input type="hidden" name="intent" value="checkout" />
      <SettingsCard title="Customer information">
        <FieldGrid>
          <SelectField label="Full name" name="checkoutNameMode" defaultValue={store.checkoutNameMode} options={[{ value: "full", label: "Require first and last name" }, { value: "last", label: "Require last name only" }]} />
          <SelectField label="Phone number" name="checkoutPhoneMode" defaultValue={store.checkoutPhoneMode} options={[{ value: "optional", label: "Optional" }, { value: "required", label: "Required" }, { value: "hidden", label: "Hidden" }]} />
          <SelectField label="Company name" name="checkoutCompanyMode" defaultValue={store.checkoutCompanyMode} options={[{ value: "hidden", label: "Hidden" }, { value: "optional", label: "Optional" }, { value: "required", label: "Required" }]} />
        </FieldGrid>
        <ToggleRow label="Email marketing consent checkbox" help="Never pre-ticked — several states forbid it. Consent is recorded on the order." name="checkoutConsent" defaultChecked={store.checkoutConsent} />
        <SaveRow busy={busy} />
      </SettingsCard>

      <SettingsCard title="Not built yet" note="These are switched off because nothing behind them exists. They will turn on when they do — they are not broken, and switching them would change nothing.">
        <DeadRow label="Capture abandoned checkouts" help="Needs the abandoned-checkout email, which needs a scheduled job" />
        <DeadRow label="Tip field" help="No tipping at checkout" />
        <DeadRow label="Express wallets (Apple Pay, Google Pay)" help="Stripe supports them; the checkout does not offer them yet" />
        <DeadRow label="Discount codes" help="Deliberately out of scope for now" />
      </SettingsCard>
    </Form>
  );
}

function PoliciesPane({ store, policies, busy }: { store: Store; policies: SettingsData["policies"]; busy: boolean }) {
  return (
    <Form method="post">
      <SettingsCard
        title="Store policies"
        note="These publish to your storefront and are linked in the footer and at checkout. Stripe and Meta both check that a refund policy and a way to contact you exist."
        actions={
          <span style={{ display: "flex", gap: 6 }}>
            {policies.map((policy) => (
              <RowBadge key={policy.handle} kind={policy.visible ? "success" : "neutral"}>
                {policy.title.split(" ")[0]} {policy.visible ? "live" : "hidden"}
              </RowBadge>
            ))}
          </span>
        }
      >
        <FieldGrid columns={1}>
          {policies.map((policy) => (
            <AreaField key={policy.handle} label={policy.title} name={policy.handle} defaultValue={policy.body} placeholder={`Paste or write your ${policy.title.toLowerCase()}…`} rows={6} />
          ))}
        </FieldGrid>
        <div style={saveBar}>
          <CardButton primary name="intent" value="publish-policies" disabled={busy}>
            Publish policies
          </CardButton>
          <CardButton name="intent" value="policies" disabled={busy}>
            Save as drafts
          </CardButton>
          <span style={{ fontSize: 12, color: "var(--ink-3)" }}>Live at {store.domain}/pages/refund-policy etc.</span>
        </div>
      </SettingsCard>
    </Form>
  );
}

function BrandingPane({ store, busy }: { store: Store; busy: boolean }) {
  return (
    <Form method="post">
      <input type="hidden" name="intent" value="branding" />
      <SettingsCard
        title="Branding"
        sub="Stored, but nothing reads these yet"
        note="Being straight with you: these four are saved and used nowhere. The storefront's look is written in code, and the emails use their own plain layout. They will be read when email and checkout branding is built. The favicon that does work is in Online Store → Preferences."
      >
        <FieldGrid>
          <TextField label="Logo URL" name="logoUrl" defaultValue={store.logoUrl} placeholder="https://…" />
          <TextField label="Favicon URL" name="faviconUrl" defaultValue={store.faviconUrl} placeholder="https://…" />
          <TextField label="Brand colour" name="brandColor" defaultValue={store.brandColor} placeholder="#000000" mono />
          <TextField label="Accent colour" name="accentColor" defaultValue={store.accentColor} placeholder="#000000" mono />
        </FieldGrid>
        <SaveRow busy={busy} />
      </SettingsCard>
    </Form>
  );
}

function BillingPane({ domains }: { domains: number }) {
  // These are the published prices of the services this actually runs on.
  const costs: [string, string, string, boolean?][] = [
    ["Hosting & CDN", "Cloudflare Workers · free plan, 100k requests/day", "$0.00", true],
    ["Database", "Neon Postgres · free tier", "$0.00", true],
    ["Object storage", "Cloudflare R2 · first 10 GB free", "$0.00", true],
    ["Email sending", "Resend · 3,000 emails/month free", "$0.00", true],
    ["Domains", `${domains} connected · about $10/year each at Cloudflare Registrar`, domains ? `~$${(domains * 10 / 12).toFixed(2)}` : "$0.00"],
    ["Stripe fees", "2.9% + 30¢ per charge · usage", "Usage"],
    ["Meta CAPI", "Free", "Free", true],
  ];
  return (
    <>
      <SettingsCard title="What this platform costs you" sub="Your own infrastructure — there is no subscription to anyone">
        {costs.map(([name, note, price, free]) => (
          <CostRow key={name} name={name} note={note} price={price} free={free} />
        ))}
        <CostTotal>{domains ? `~$${((domains * 10) / 12).toFixed(2)}` : "$0.00"} / month + Stripe usage</CostTotal>
        <div style={{ padding: "10px 16px", fontSize: 12, color: "var(--ink-3)" }}>Free tiers hold for a one-product store doing a few hundred orders a month. When you outgrow one, that service bills you directly.</div>
      </SettingsCard>
      <SettingsCard title="Payment method for infrastructure">
        <EmptyRows title="No card on file here" body="Each service bills you directly — Cloudflare, Neon and Resend each have their own billing page. There is nothing to consolidate yet." />
      </SettingsCard>
    </>
  );
}

function DataPane({ store, busy }: { store: Store; busy: boolean }) {
  return (
    <>
      <SettingsCard title="Data export" note="Every export is a CSV download. Exporting never deletes anything. The orders file is the one a payment processor asks for in a review — it carries the payment reference, refunds, tracking and the ad each order came from.">
        <LinkRow label="Export orders" help="Every order with its payment reference, refunds, tracking and attribution" href={`/admin/orders/export?store=${store.slug}`} />
        <LinkRow label="Export visitor events" help="Raw views, carts, checkouts and purchases with locations" href={`/admin/events/export?store=${store.slug}`} />
      </SettingsCard>
      <SettingsCard title="Danger zone">
        <Form method="post" onSubmit={(e) => { if (!confirm(`Delete ${store.name}? This removes its products, pages, themes and settings.`)) e.preventDefault(); }}>
          <input type="hidden" name="intent" value="delete-store" />
          <FieldGrid columns={1}>
            <TextField label={`Type the store name to confirm: ${store.name}`} name="confirmName" placeholder={store.name} span help="A store that has taken orders cannot be deleted — orders are permanent." />
          </FieldGrid>
          <div style={saveBar}>
            <CardButton danger disabled={busy}>Delete this store</CardButton>
          </div>
        </Form>
      </SettingsCard>
    </>
  );
}
