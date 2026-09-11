/**
 * Bindings this app adds on top of the ones `wrangler types` generates.
 * That file is regenerated from wrangler.jsonc and would lose anything added
 * by hand, so the push keys are declared here instead.
 */
interface Env {
  /** VAPID application server key — public, also shipped to the browser */
  VAPID_PUBLIC_KEY: string;
  /** the matching private key (`d` of the JWK) — a Worker secret */
  VAPID_PRIVATE_KEY: string;
  /** mailto: the push services can contact if a push misbehaves */
  VAPID_SUBJECT: string;
}
