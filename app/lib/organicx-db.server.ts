/**
 * OrganicX's memory, answered from the Worker.
 *
 * The Mac app used to open Neon directly, which meant it needed the database
 * URL on the machine — a hand-made .env file that the app refused to start
 * without, and a live credential for every store's data sitting in a folder
 * on a laptop. Both are wrong. An app that drives a browser has no business
 * holding a database password, and a setup step that says "put this file
 * here" is a step somebody will get wrong.
 *
 * So the app asks this, and this asks Neon. The Worker already holds the
 * URL; the Mac never sees it. One operation per name, a fixed list, the same
 * SQL the app used to run itself — nothing here takes a query from the
 * caller, only a name and its arguments.
 */
import { neon } from "@neondatabase/serverless";

type Sql = ReturnType<typeof neon>;
type Row = Record<string, unknown>;
/* The driver's return type is a union that includes a full-results shape;
   every query here is a plain array of rows, so say so once. */
const rows = (r: unknown) => r as Row[];

/** Every operation the app may ask for. A name not in here is refused. */
export const OPS = [
  "accounts",
  "accountFor",
  "markConnected",
  "park",
  "isParked",
  "seen",
  "warmedToday",
  "personaFor",
  "savePersona",
  "act",
  "todayCounts",
  "knownClip",
  "saveClip",
  "learn",
  "weights",
  "remember",
  "lessons",
  "addTask",
  "nextTask",
  "finishTask",
] as const;
export type Op = (typeof OPS)[number];

const s = (v: unknown) => (v == null ? null : String(v));
const j = (v: unknown) => JSON.stringify(v ?? null);

export async function runOp(databaseUrl: string, op: string, a: Record<string, unknown>) {
  if (!(OPS as readonly string[]).includes(op)) {
    return { ok: false as const, error: `not an operation: ${op}` };
  }
  const sql: Sql = neon(databaseUrl);
  try {
    const result = await dispatch(sql, op as Op, a ?? {});
    return { ok: true as const, result };
  } catch (error) {
    return { ok: false as const, error: (error as Error)?.message ?? String(error) };
  }
}

async function dispatch(sql: Sql, op: Op, a: Record<string, unknown>) {
  switch (op) {
    /* ---------------------------------------------------------- accounts */
    case "accounts":
      return sql`select * from ox_accounts order by platform, handle`;

    case "accountFor": {
      const [row] = rows(await sql`
        select * from ox_accounts where platform = ${s(a.platform)} and handle = ${s(a.handle)} limit 1`);
      return row ?? null;
    }

    /*
     * `connected` means the app SAW a logged-in session, not that it holds
     * one. There is no credential column here and there never will be.
     */
    case "markConnected": {
      const [row] = rows(await sql`
        insert into ox_accounts (platform, handle, profile, connected, connected_at, last_seen_at)
        values (${s(a.platform)}, ${s(a.handle)}, ${s(a.profile)}, true, now(), now())
        on conflict (platform, handle) do update
          set connected = true,
              connected_at = coalesce(ox_accounts.connected_at, now()),
              last_seen_at = now(),
              profile = excluded.profile,
              friction = null,
              friction_at = null
        returning *`);
      return row;
    }

    /* Parked for the day. Nothing retries after this. */
    case "park":
      await sql`update ox_accounts set friction = ${s(a.why)}, friction_at = now() where id = ${s(a.accountId)}`;
      return true;

    case "isParked": {
      const [row] = rows(await sql`select friction, friction_at from ox_accounts where id = ${s(a.accountId)}`);
      if (!row?.friction_at) return false;
      // The rest of the day, not a fixed number of minutes: the account goes
      // quiet the way a person's would.
      return Date.now() - new Date(row.friction_at as string).getTime() < 20 * 60 * 60 * 1000;
    }

    case "seen":
      await sql`update ox_accounts set last_seen_at = now() where id = ${s(a.accountId)}`;
      return true;

    /* Once per calendar day, not once per session. */
    case "warmedToday":
      await sql`
        update ox_accounts
           set warmed_days = warmed_days + 1
         where id = ${s(a.accountId)}
           and (last_seen_at is null or last_seen_at::date < current_date)`;
      return true;

    /* ---------------------------------------------------------- personas */
    case "personaFor": {
      const [row] = rows(await sql`select * from ox_personas where account_id = ${s(a.accountId)} limit 1`);
      return row ?? null;
    }

    /* Written once and kept. A person does not change who they are between
       Tuesday and Wednesday, so an existing one is returned, not replaced. */
    case "savePersona": {
      const [existing] = rows(await sql`select * from ox_personas where account_id = ${s(a.accountId)} limit 1`);
      if (existing) return existing;
      const p = (a.persona ?? {}) as Record<string, unknown>;
      const [row] = rows(await sql`
        insert into ox_personas
          (account_id, who, metro, hours, interests, voice, typing, temperament, days_off)
        values (${s(a.accountId)}, ${s(p.who)}, ${s(p.metro)}, ${j(p.hours)}::jsonb,
                ${j(p.interests)}::jsonb, ${s(p.voice)}, ${j(p.typing)}::jsonb,
                ${j(p.temperament)}::jsonb, ${j(p.daysOff)}::jsonb)
        returning *`);
      return row;
    }

    /* ----------------------------------------------------------- actions */
    case "act":
      await sql`
        insert into ox_actions (account_id, kind, target_url, dwell_ms, text)
        values (${s(a.accountId)}, ${s(a.kind)}, ${s(a.targetUrl)}, ${a.dwellMs == null ? null : Number(a.dwellMs)}, ${s(a.text)})`;
      return true;

    case "todayCounts": {
      const counts = rows(await sql`
        select kind, count(*)::int n from ox_actions
         where account_id = ${s(a.accountId)} and at::date = current_date
         group by kind`);
      return Object.fromEntries(counts.map((r) => [r.kind as string, r.n as number]));
    }

    /* ------------------------------------------------------------- clips */
    case "knownClip": {
      const [row] = rows(await sql`select id from ox_clips where source_url = ${s(a.sourceUrl)} limit 1`);
      return Boolean(row);
    }

    case "saveClip": {
      const c = (a.clip ?? {}) as Record<string, unknown>;
      const [row] = rows(await sql`
        insert into ox_clips
          (platform, source_url, source_handle, posted_at, caption, views, likes, comments,
           file_key, duration_ms, seen, validated, validation_note)
        values (${s(c.platform)}, ${s(c.sourceUrl)}, ${s(c.sourceHandle)}, ${s(c.postedAt)},
                ${s(c.caption)}, ${c.views == null ? null : Number(c.views)},
                ${c.likes == null ? null : Number(c.likes)}, ${c.comments == null ? null : Number(c.comments)},
                ${s(c.fileKey)}, ${c.durationMs == null ? null : Number(c.durationMs)},
                ${c.seen ? j(c.seen) : null}::jsonb,
                ${c.validated == null ? null : Boolean(c.validated)}, ${s(c.validationNote)})
        on conflict (source_url) do update
          set seen = excluded.seen, validated = excluded.validated, validation_note = excluded.validation_note
        returning *`);
      return row;
    }

    /* ------------------------------------------------------------ memory */
    /* Nudged toward the outcome, never replaced by it: one good post is not
       proof, and a weight that swings on a single result is noise with a name. */
    case "learn": {
      const won = Boolean(a.won);
      await sql`
        insert into ox_weights (scope, dimension, value, weight, trials, wins)
        values (${s(a.scope)}, ${s(a.dimension)}, ${s(a.value)}, ${won ? 0.1 : -0.05}, 1, ${won ? 1 : 0})
        on conflict (scope, dimension, value) do update
          set trials = ox_weights.trials + 1,
              wins = ox_weights.wins + ${won ? 1 : 0},
              weight = ox_weights.weight + ${won ? 0.1 : -0.05},
              updated_at = now()`;
      return true;
    }

    /* Under three trials is left out: a single win is a coincidence. */
    case "weights":
      return sql`
        select value, weight, trials, wins from ox_weights
         where scope = ${s(a.scope)} and dimension = ${s(a.dimension)} and trials >= 3
         order by weight desc`;

    case "remember":
      await sql`
        insert into ox_lessons (scope, lesson, evidence, confidence)
        values (${s(a.scope)}, ${s(a.lesson)}, ${j(a.evidence ?? {})}::jsonb, ${Number(a.confidence ?? 0.5)})`;
      return true;

    case "lessons":
      return sql`
        select lesson, evidence, confidence, at from ox_lessons
         where scope = ${s(a.scope)} order by at desc limit ${Number(a.limit ?? 20)}`;

    /* ------------------------------------------------------------- tasks */
    case "addTask": {
      const [row] = rows(await sql`
        insert into ox_tasks (kind, payload, not_before)
        values (${s(a.kind)}, ${j(a.payload)}::jsonb, ${s(a.notBefore)})
        returning *`);
      return row;
    }

    case "nextTask": {
      const [row] = rows(await sql`
        update ox_tasks set state = 'doing', attempts = attempts + 1
         where id = (
           select id from ox_tasks
            where state = 'todo' and (not_before is null or not_before <= now())
            order by created_at limit 1 for update skip locked)
        returning *`);
      return row ?? null;
    }

    case "finishTask":
      await sql`
        update ox_tasks
           set state = ${a.error ? "failed" : "done"}, last_error = ${s(a.error)}, done_at = now()
         where id = ${s(a.id)}`;
      return true;
  }
}
