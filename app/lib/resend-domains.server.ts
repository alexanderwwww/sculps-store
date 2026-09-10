/**
 * Sender-domain verification through Resend.
 *
 * Receipts sent from an unverified domain land in spam. Resend hands back the
 * exact DNS records (SPF and DKIM) for the domain; this surfaces them in
 * Settings → Notifications with a Verify button that asks Resend to check.
 */

const API = "https://api.resend.com";

export interface DnsRecord {
  record: string;
  name: string;
  type: string;
  value: string;
  /** not_started | pending | verified | failed */
  status: string;
}

export interface ResendDomain {
  id: string;
  name: string;
  /** not_started | pending | verified | failed | temporary_failure */
  status: string;
  records: DnsRecord[];
}

type Result<T> = { ok: true; value: T } | { ok: false; reason: string };

async function call<T>(env: Env, method: string, path: string, body?: unknown): Promise<Result<T>> {
  if (!env.RESEND_API_KEY) return { ok: false, reason: "No Resend API key is set on the Worker." };
  try {
    const response = await fetch(`${API}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const payload = (await response.json()) as T & { message?: string };
    if (!response.ok) return { ok: false, reason: payload.message ?? `Resend returned ${response.status}.` };
    return { ok: true, value: payload };
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : "Resend could not be reached." };
  }
}

export async function createSenderDomain(env: Env, name: string): Promise<Result<ResendDomain>> {
  // Resend refuses a duplicate; find it first so a second click is harmless.
  const list = await call<{ data: { id: string; name: string }[] }>(env, "GET", "/domains");
  if (list.ok) {
    const existing = list.value.data.find((domain) => domain.name === name);
    if (existing) return readSenderDomain(env, existing.id);
  }
  return call<ResendDomain>(env, "POST", "/domains", { name, region: "us-east-1" });
}

export async function readSenderDomain(env: Env, id: string): Promise<Result<ResendDomain>> {
  return call<ResendDomain>(env, "GET", `/domains/${id}`);
}

/** Asks Resend to re-check the records. Verification itself takes minutes. */
export async function verifySenderDomain(env: Env, id: string): Promise<Result<ResendDomain>> {
  const kicked = await call<unknown>(env, "POST", `/domains/${id}/verify`);
  if (!kicked.ok) return kicked;
  return readSenderDomain(env, id);
}
