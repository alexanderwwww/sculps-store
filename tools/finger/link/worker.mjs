// finger-link: the Cloudflare Worker between Claude and finger on the Mac.
// One SQLite Durable Object holds the queue, the Mac's last heartbeat and the journal.
// All behaviour is in mcp.mjs and core.mjs; this file is only the Cloudflare wiring.
//
// NOT DEPLOYED. When it is: `wrangler deploy --config tools/finger/link/wrangler.toml`,
// dry run read first, and the output must say "Uploaded finger-link" (PLAN M1).
import { DurableObject } from 'cloudflare:workers';
import { LinkCore } from './core.mjs';
import { handle } from './mcp.mjs';

export class FingerLink extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    const storage = ctx.storage.sql;
    this.core = new LinkCore({ sql: { all: (query, ...params) => storage.exec(query, ...params).toArray() } });
  }

  fetch(request) {
    return handle(this.core, request, { key: this.env.FINGER_KEY });
  }
}

export default {
  fetch(request, env) {
    return env.LINK.get(env.LINK.idFromName('finger')).fetch(request);
  },
};
