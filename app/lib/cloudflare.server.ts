/**
 * Domains, for real: the Cloudflare API.
 *
 * Connecting a domain to this Worker is two steps, and both happen here:
 *
 *   1. The domain is added to the Cloudflare account as a zone. Cloudflare
 *      hands back two nameservers; he sets those at his registrar. Until the
 *      registrar change propagates the zone is "pending".
 *   2. Once the zone is active, the hostname is bound to this Worker as a
 *      Workers custom domain. Cloudflare creates the DNS record and issues
 *      the certificate itself — there is nothing else to configure.
 *
 * Everything returns a reason on failure rather than throwing, because the
 * Settings screen has to show him exactly what to fix, most often "add this
 * permission to the API token".
 */

const API = "https://api.cloudflare.com/client/v4";

export interface CloudflareConfig {
  token: string;
  accountId: string;
  /** the Worker's name in wrangler.jsonc */
  service: string;
}

export function cloudflareConfig(env: Env): CloudflareConfig | null {
  if (!env.CLOUDFLARE_API_TOKEN || !env.CLOUDFLARE_ACCOUNT_ID) return null;
  return {
    token: env.CLOUDFLARE_API_TOKEN,
    accountId: env.CLOUDFLARE_ACCOUNT_ID,
    service: env.CLOUDFLARE_WORKER_NAME || "kerberos",
  };
}

type Result<T> = { ok: true; value: T } | { ok: false; reason: string };

async function call<T>(
  config: CloudflareConfig,
  method: string,
  path: string,
  body?: unknown,
): Promise<Result<T>> {
  try {
    const response = await fetch(`${API}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${config.token}`,
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const payload = (await response.json()) as {
      success: boolean;
      result: T;
      errors?: { code: number; message: string }[];
    };
    if (!response.ok || !payload.success) {
      const first = payload.errors?.[0];
      const reason = first
        ? first.code === 10000 || /authentication|permission|authorized/i.test(first.message)
          ? `The Cloudflare API token does not allow this (${first.message}). Edit the token at dash.cloudflare.com → My Profile → API Tokens and add the Zone:Edit, DNS:Edit and Workers Scripts:Edit permissions.`
          : first.message
        : `Cloudflare returned ${response.status}.`;
      return { ok: false, reason };
    }
    return { ok: true, value: payload.result };
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : "Cloudflare could not be reached." };
  }
}

export interface Zone {
  id: string;
  name: string;
  /** active | pending | initializing | moved | deleted */
  status: string;
  name_servers: string[];
}

/** Two-label public suffixes where the registrable domain is three labels. */
const SECOND_LEVEL = new Set([
  "co.uk", "org.uk", "me.uk", "ac.uk", "gov.uk", "com.au", "net.au", "org.au", "co.nz", "org.nz",
  "co.za", "com.br", "com.mx", "co.jp", "co.kr", "com.sg", "com.hk", "co.in", "com.tr", "com.ar",
]);

/** Root domain of a hostname: shop.example.com → example.com, shop.example.co.uk → example.co.uk. */
export function rootDomain(hostname: string): string {
  const parts = hostname.toLowerCase().split(".").filter(Boolean);
  if (parts.length <= 2) return parts.join(".");
  const lastTwo = parts.slice(-2).join(".");
  return SECOND_LEVEL.has(lastTwo) ? parts.slice(-3).join(".") : lastTwo;
}

export async function findZone(config: CloudflareConfig, name: string): Promise<Result<Zone | null>> {
  const result = await call<Zone[]>(config, "GET", `/zones?name=${encodeURIComponent(name)}&account.id=${config.accountId}`);
  if (!result.ok) return result;
  return { ok: true, value: result.value[0] ?? null };
}

/** Adds the domain to the account. Returns the nameservers to set at the registrar. */
export async function createZone(config: CloudflareConfig, name: string): Promise<Result<Zone>> {
  const existing = await findZone(config, name);
  if (existing.ok && existing.value) return { ok: true, value: existing.value };
  return call<Zone>(config, "POST", "/zones", {
    name,
    account: { id: config.accountId },
    type: "full",
  });
}

export interface WorkerDomain {
  id: string;
  hostname: string;
  zone_id: string;
  service: string;
  environment: string;
}

/** Binds the hostname to this Worker. Cloudflare handles DNS and the certificate. */
export async function bindHostname(
  config: CloudflareConfig,
  zoneId: string,
  hostname: string,
): Promise<Result<WorkerDomain>> {
  return call<WorkerDomain>(config, "PUT", `/accounts/${config.accountId}/workers/domains`, {
    zone_id: zoneId,
    hostname,
    service: config.service,
    environment: "production",
  });
}

export async function unbindHostname(config: CloudflareConfig, domainId: string): Promise<Result<null>> {
  return call<null>(config, "DELETE", `/accounts/${config.accountId}/workers/domains/${domainId}`);
}

/**
 * What he has to do at his registrar. Cloudflare's model is nameservers, not
 * A records, so this is the only "DNS record" that exists in the flow — and
 * it is the real pair for his account, not a placeholder.
 */
export function registrarInstructions(zone: Zone | null): { type: string; name: string; value: string }[] {
  if (!zone) return [];
  return zone.name_servers.map((server, index) => ({
    type: "NS",
    name: `nameserver ${index + 1}`,
    value: server,
  }));
}
