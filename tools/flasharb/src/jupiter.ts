// Jupiter Metis Swap API v1 client.
// Shapes from sources/jupiter-swap-v1.yaml (github.com/jup-ag/docs openapi-spec/swap/v1/swap.yaml) and live responses.

export class JupiterNoRouteError extends Error {
  constructor(msg: string) {
    super(msg);
    this.name = 'JupiterNoRouteError';
  }
}
export class JupiterRateLimitError extends Error {
  constructor(msg: string) {
    super(msg);
    this.name = 'JupiterRateLimitError';
  }
}
export class JupiterHttpError extends Error {
  constructor(public status: number, msg: string) {
    super(msg);
    this.name = 'JupiterHttpError';
  }
}

export interface QuoteResponse {
  inputMint: string;
  inAmount: string;
  outputMint: string;
  outAmount: string;
  otherAmountThreshold: string;
  swapMode: string;
  slippageBps: number;
  priceImpactPct: string;
  routePlan: { swapInfo: { ammKey: string; label: string; inAmount: string; outAmount: string }; percent: number }[];
  contextSlot: number;
  [k: string]: unknown;
}
export interface JupIx {
  programId: string;
  accounts: { pubkey: string; isSigner: boolean; isWritable: boolean }[];
  data: string; // base64
}
export interface SwapInstructionsResponse {
  computeBudgetInstructions: JupIx[];
  setupInstructions: JupIx[];
  swapInstruction: JupIx;
  cleanupInstruction: JupIx | null;
  otherInstructions: JupIx[];
  addressLookupTableAddresses: string[];
  [k: string]: unknown;
}

export interface QuoteParams {
  inputMint: string;
  outputMint: string;
  amount: bigint;
  dex: string;
  slippageBps: number;
  maxAccounts?: number;
}

type FetchFn = typeof fetch;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export class JupiterClient {
  private nextSlot = 0;
  public calls = 0;
  public rateLimited = 0;
  constructor(
    private base: string,
    private opts: { ratePerMin: number; apiKey?: string; maxRetries?: number; fetchFn?: FetchFn; backoffMs?: number } = {
      ratePerMin: 90,
    },
  ) {}

  /** Client-side pacing so a scan stays under the lite-api limit (header x-ratelimit-remaining started at 99). */
  private async pace() {
    const interval = 60_000 / Math.max(1, this.opts.ratePerMin);
    const now = Date.now();
    const at = Math.max(now, this.nextSlot);
    this.nextSlot = at + interval;
    if (at > now) await sleep(at - now);
  }

  private async request<T>(url: string, init?: RequestInit): Promise<T> {
    const f = this.opts.fetchFn ?? fetch;
    const maxRetries = this.opts.maxRetries ?? 4;
    const backoff = this.opts.backoffMs ?? 2000;
    for (let attempt = 0; ; attempt++) {
      await this.pace();
      this.calls++;
      const headers: Record<string, string> = { 'content-type': 'application/json' };
      if (this.opts.apiKey) headers['x-api-key'] = this.opts.apiKey;
      const res = await f(url, { ...init, headers: { ...headers, ...(init?.headers as any) } });
      if (res.status === 429) {
        this.rateLimited++;
        if (attempt >= maxRetries) throw new JupiterRateLimitError(`Jupiter 429 after ${attempt + 1} attempts`);
        await sleep(backoff * 2 ** attempt);
        continue;
      }
      const text = await res.text();
      let body: any;
      try {
        body = JSON.parse(text);
      } catch {
        throw new JupiterHttpError(res.status, `Jupiter non-JSON ${res.status}: ${text.slice(0, 200)}`);
      }
      if (body?.errorCode === 'NO_ROUTES_FOUND' || body?.errorCode === 'COULD_NOT_FIND_ANY_ROUTE' || /no routes? found/i.test(body?.error ?? ''))
        throw new JupiterNoRouteError(body.error);
      if (!res.ok || body?.error) {
        if (res.status >= 500 && attempt < maxRetries) {
          await sleep(backoff * 2 ** attempt);
          continue;
        }
        throw new JupiterHttpError(res.status, `Jupiter ${res.status}: ${body?.error ?? text.slice(0, 200)}`);
      }
      return body as T;
    }
  }

  async labels(): Promise<Record<string, string>> {
    return this.request(`${this.base}/program-id-to-label`);
  }

  async quote(p: QuoteParams): Promise<QuoteResponse> {
    const q = new URLSearchParams({
      inputMint: p.inputMint,
      outputMint: p.outputMint,
      amount: p.amount.toString(),
      slippageBps: String(p.slippageBps),
      dexes: p.dex,
      swapMode: 'ExactIn',
    });
    if (p.maxAccounts) q.set('maxAccounts', String(p.maxAccounts));
    return this.request(`${this.base}/quote?${q}`);
  }

  /** wrapAndUnwrapSol is false on purpose: SOL stays as wSOL between the two legs (we create the wSOL ATA ourselves). */
  async swapInstructions(quoteResponse: QuoteResponse, userPublicKey: string): Promise<SwapInstructionsResponse> {
    return this.request(`${this.base}/swap-instructions`, {
      method: 'POST',
      body: JSON.stringify({ userPublicKey, quoteResponse, wrapAndUnwrapSol: false }),
    });
  }
}
