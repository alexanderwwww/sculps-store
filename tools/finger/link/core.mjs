// finger-link's queue. Plain SQL through one small interface, so the same code runs inside
// the Durable Object (ctx.storage.sql) and in the Node tests (node:sqlite).
//   sql.all(query, ...params) -> array of row objects
// Rules (PLAN decisions 15 and 16):
//   - a command is refused when the Mac's heartbeat is older than 30 s
//   - every command has a lifetime; an expired command is never handed out
//   - a command is handed out once
export const HEARTBEAT_MAX_AGE_MS = 30000;
const KEEP_MS = 60 * 60 * 1000;

export class LinkCore {
  constructor({ sql, now = Date.now }) {
    this.sql = sql;
    this.now = now;
    sql.all(`CREATE TABLE IF NOT EXISTS commands (
      id TEXT PRIMARY KEY, tool TEXT NOT NULL, args TEXT NOT NULL,
      created INTEGER NOT NULL, expires INTEGER NOT NULL,
      state TEXT NOT NULL, result TEXT)`);
    sql.all('CREATE TABLE IF NOT EXISTS kv (k TEXT PRIMARY KEY, v TEXT NOT NULL, t INTEGER NOT NULL)');
    sql.all('CREATE TABLE IF NOT EXISTS journal (n INTEGER PRIMARY KEY AUTOINCREMENT, t INTEGER NOT NULL, row TEXT NOT NULL)');
  }

  // --- the Mac side ---

  heartbeat(body) {
    this.sql.all('INSERT INTO kv (k, v, t) VALUES (?, ?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v, t = excluded.t',
      'heartbeat', JSON.stringify(body), this.now());
    return { ok: true };
  }

  // Hands out queued commands, oldest first, each one only once.
  take() {
    const now = this.now();
    this.expire(now);
    const rows = this.sql.all("SELECT id, tool, args, created, expires FROM commands WHERE state = 'queued' ORDER BY created, id LIMIT 10");
    for (const r of rows) this.sql.all("UPDATE commands SET state = 'taken' WHERE id = ?", r.id);
    return rows.map((r) => ({ id: r.id, tool: r.tool, args: JSON.parse(r.args), createdAt: r.created, expiresAt: r.expires }));
  }

  result(id, body) {
    const rows = this.sql.all('SELECT state FROM commands WHERE id = ?', id);
    if (rows.length === 0) return { ok: false, error: 'no such command' };
    if (rows[0].state === 'done') return { ok: true, already: true };
    this.sql.all("UPDATE commands SET state = 'done', result = ? WHERE id = ?", JSON.stringify(body), id);
    return { ok: true };
  }

  // --- the Claude side ---

  status() {
    const rows = this.sql.all('SELECT v, t FROM kv WHERE k = ?', 'heartbeat');
    if (rows.length === 0) return { online: false, ageMs: null, mac: null };
    const ageMs = this.now() - rows[0].t;
    return { online: ageMs <= HEARTBEAT_MAX_AGE_MS, ageMs, mac: JSON.parse(rows[0].v) };
  }

  enqueue(tool, args, lifetimeMs) {
    const s = this.status();
    if (!s.online) {
      const seen = s.ageMs === null ? 'has never been seen' : `was last seen ${Math.round(s.ageMs / 1000)} s ago`;
      return { ok: false, error: `finger on the Mac is not connected (it ${seen}). Nothing was sent.` };
    }
    const now = this.now();
    this.sql.all('DELETE FROM commands WHERE created < ?', now - KEEP_MS);
    const id = crypto.randomUUID();
    this.sql.all("INSERT INTO commands (id, tool, args, created, expires, state) VALUES (?, ?, ?, ?, ?, 'queued')",
      id, tool, JSON.stringify(args), now, now + lifetimeMs);
    return { ok: true, id };
  }

  expire(now) {
    this.sql.all("UPDATE commands SET state = 'expired' WHERE state = 'queued' AND expires <= ?", now);
  }

  get(id) {
    this.expire(this.now());
    const rows = this.sql.all('SELECT id, tool, state, result FROM commands WHERE id = ?', id);
    if (rows.length === 0) return null;
    return { id: rows[0].id, tool: rows[0].tool, state: rows[0].state, result: rows[0].result ? JSON.parse(rows[0].result) : null };
  }

  journalAdd(row) {
    this.sql.all('INSERT INTO journal (t, row) VALUES (?, ?)', this.now(), JSON.stringify(row));
    return { ok: true };
  }

  journalLast(n) {
    const limit = Math.max(1, Math.min(200, Number(n) || 20));
    return this.sql.all('SELECT t, row FROM journal ORDER BY n DESC LIMIT ?', limit).reverse().map((r) => ({ t: r.t, ...JSON.parse(r.row) }));
  }
}
