/**
 * Organic's memory, answered from the Worker.
 *
 * The same arrangement OrganicX settled on, for the same reasons: the Mac app
 * drives a browser and has no business holding a database password, so it
 * asks this and this asks Neon. One operation per name, a fixed list, every
 * query parameterized — nothing here takes SQL from the caller, only a name
 * and its arguments.
 *
 * Nothing is shared with OrganicX. These are the `og_*` tables, and the app
 * that fills them is a different app with a different brief shape.
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
  "disconnect",
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
  "saveFinding",
  "findings",
  "learn",
  "weights",
  "remember",
  "lessons",
  "addTask",
  "nextTask",
  "finishTask",
] as const;
export type Op = (typeof OPS)[number];

/** What a finding can be. Anything else is refused before it reaches SQL. */
const FINDING_KINDS = ["ad", "clip", "seller", "product"] as const;

const s = (v: unknown) => (v == null ? null : String(v));
const j = (v: unknown) => JSON.stringify(v ?? null);
const n = (v: unknown) => (v == null || v === "" ? null : Number(v));

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
      return sql`select * from og_accounts order by platform, handle`;

    case "accountFor": {
      const [row] = rows(await sql`
        select * from og_accounts where platform = ${s(a.platform)} and handle = ${s(a.handle)} limit 1`);
      return row ?? null;
    }

    /*
     * `connected` means the app SAW a logged-in session and READ a handle,
     * not that it holds anything. There is no credential column here and
     * there never will be. A connection with no handle is not a connection,
     * so an empty handle is refused rather than stored.
     */
    case "markConnected": {
      const handle = String(a.handle ?? "").trim();
      if (!handle) throw new Error("a connection with no readable handle is not a connection");
      const [row] = rows(await sql`
        insert into og_accounts (platform, handle, connected, connected_at, last_seen_at)
        values (${s(a.platform)}, ${handle}, true, now(), now())
        on conflict (platform, handle) do update
          set connected = true,
              connected_at = coalesce(og_accounts.connected_at, now()),
              last_seen_at = now(),
              friction = null,
              friction_at = null
        returning *`);
      return row;
    }

    /* The session is gone: signed out, or the cookies no longer answer. */
    case "disconnect": {
      const [row] = rows(await sql`
        update og_accounts set connected = false
         where id = ${s(a.accountId)}
        returning *`);
      return row ?? null;
    }

    /* Parked for the day. Nothing retries after this. */
    case "park":
      await sql`update og_accounts set friction = ${s(a.why)}, friction_at = now() where id = ${s(a.accountId)}`;
      return true;

    case "isParked": {
      const [row] = rows(await sql`select friction, friction_at from og_accounts where id = ${s(a.accountId)}`);
      if (!row?.friction_at) return false;
      // The rest of the day, not a fixed number of minutes: the account goes
      // quiet the way a person's would.
      return Date.now() - new Date(row.friction_at as string).getTime() < 20 * 60 * 60 * 1000;
    }

    case "seen":
      await sql`update og_accounts set last_seen_at = now() where id = ${s(a.accountId)}`;
      return true;

    /* Once per calendar day, not once per session. */
    case "warmedToday":
      await sql`
        update og_accounts
           set warmed_days = warmed_days + 1
         where id = ${s(a.accountId)}
           and (last_seen_at is null or last_seen_at::date < current_date)`;
      return true;

    /* ---------------------------------------------------------- personas */
    case "personaFor": {
      const [row] = rows(await sql`select * from og_personas where account_id = ${s(a.accountId)} limit 1`);
      return row ?? null;
    }

    /* Written once and kept. A person does not change who they are between
       Tuesday and Wednesday, so an existing one is returned, not replaced. */
    case "savePersona": {
      const [existing] = rows(await sql`select * from og_personas where account_id = ${s(a.accountId)} limit 1`);
      if (existing) return existing;
      const p = (a.persona ?? {}) as Record<string, unknown>;
      const [row] = rows(await sql`
        insert into og_personas
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
        insert into og_actions (account_id, kind, target_url, dwell_ms, text)
        values (${s(a.accountId)}, ${s(a.kind)}, ${s(a.targetUrl)}, ${n(a.dwellMs)}, ${s(a.text)})`;
      return true;

    case "todayCounts": {
      const counts = rows(await sql`
        select kind, count(*)::int n from og_actions
         where account_id = ${s(a.accountId)} and at::date = current_date
         group by kind`);
      return Object.fromEntries(counts.map((r) => [r.kind as string, r.n as number]));
    }

    /* ------------------------------------------------------------- clips */
    case "knownClip": {
      const [row] = rows(await sql`select id from og_clips where source_url = ${s(a.sourceUrl)} limit 1`);
      return Boolean(row);
    }

    case "saveClip": {
      const c = (a.clip ?? {}) as Record<string, unknown>;
      const [row] = rows(await sql`
        insert into og_clips
          (platform, source_url, source_handle, posted_at, caption, views, likes, comments,
           file_key, duration_ms, seen, validated, validation_note)
        values (${s(c.platform)}, ${s(c.sourceUrl)}, ${s(c.sourceHandle)}, ${s(c.postedAt)},
                ${s(c.caption)}, ${n(c.views)}, ${n(c.likes)}, ${n(c.comments)},
                ${s(c.fileKey)}, ${n(c.durationMs)},
                ${c.seen ? j(c.seen) : null}::jsonb,
                ${c.validated == null ? null : Boolean(c.validated)}, ${s(c.validationNote)})
        on conflict (source_url) do update
          set views = coalesce(excluded.views, og_clips.views),
              likes = coalesce(excluded.likes, og_clips.likes),
              comments = coalesce(excluded.comments, og_clips.comments),
              seen = coalesce(excluded.seen, og_clips.seen),
              validated = coalesce(excluded.validated, og_clips.validated),
              validation_note = coalesce(excluded.validation_note, og_clips.validation_note)
        returning *`);
      return row;
    }

    /* ---------------------------------------------------------- findings */
    /*
     * What the market screen and the research passes turn up: an ad in the
     * Ad Library, a clip under a hashtag, a seller, a product. One row per
     * (kind, url); seeing it again refreshes the numbers rather than adding
     * a second row, so "how many ads is this seller running" stays honest.
     */
    case "saveFinding": {
      const f = (a.finding ?? a) as Record<string, unknown>;
      const kind = String(f.kind ?? "");
      if (!(FINDING_KINDS as readonly string[]).includes(kind)) {
        throw new Error(`not a finding kind: ${kind || "(none)"} — one of ${FINDING_KINDS.join(", ")}`);
      }
      const url = String(f.url ?? "").trim();
      if (!url) throw new Error("a finding needs a url");
      const [row] = rows(await sql`
        insert into og_findings
          (kind, product, query, platform, url, who, title, metrics, started_at, note)
        values (${kind}, ${s(f.product)}, ${s(f.query)}, ${s(f.platform)}, ${url}, ${s(f.who)},
                ${s(f.title)}, ${f.metrics ? j(f.metrics) : null}::jsonb, ${s(f.startedAt)}, ${s(f.note)})
        on conflict (kind, url) do update
          set product = coalesce(excluded.product, og_findings.product),
              query = coalesce(excluded.query, og_findings.query),
              platform = coalesce(excluded.platform, og_findings.platform),
              who = coalesce(excluded.who, og_findings.who),
              title = coalesce(excluded.title, og_findings.title),
              metrics = coalesce(excluded.metrics, og_findings.metrics),
              started_at = coalesce(excluded.started_at, og_findings.started_at),
              note = coalesce(excluded.note, og_findings.note),
              seen_at = now()
        returning *`);
      return row;
    }

    case "findings": {
      const limit = Math.max(1, Math.min(500, Number(a.limit ?? 50) || 50));
      const product = s(a.product);
      const kind = s(a.kind);
      /* Both filters optional. A null on either side means "any". */
      return sql`
        select * from og_findings
         where (${product}::text is null or product = ${product})
           and (${kind}::text is null or kind = ${kind})
         order by seen_at desc
         limit ${limit}`;
    }

    /* ------------------------------------------------------------ memory */
    /* Nudged toward the outcome, never replaced by it: one good result is not
       proof, and a weight that swings on a single result is noise with a name. */
    case "learn": {
      const won = Boolean(a.won);
      await sql`
        insert into og_weights (scope, dimension, value, weight, trials, wins)
        values (${s(a.scope)}, ${s(a.dimension)}, ${s(a.value)}, ${won ? 0.1 : -0.05}, 1, ${won ? 1 : 0})
        on conflict (scope, dimension, value) do update
          set trials = og_weights.trials + 1,
              wins = og_weights.wins + ${won ? 1 : 0},
              weight = og_weights.weight + ${won ? 0.1 : -0.05},
              updated_at = now()`;
      return true;
    }

    /* Under three trials is left out: a single win is a coincidence. */
    case "weights":
      return sql`
        select value, weight, trials, wins from og_weights
         where scope = ${s(a.scope)} and dimension = ${s(a.dimension)} and trials >= 3
         order by weight desc`;

    case "remember":
      await sql`
        insert into og_lessons (scope, lesson, evidence, confidence)
        values (${s(a.scope)}, ${s(a.lesson)}, ${j(a.evidence ?? {})}::jsonb, ${Number(a.confidence ?? 0.5)})`;
      return true;

    case "lessons":
      return sql`
        select lesson, evidence, confidence, at from og_lessons
         where scope = ${s(a.scope)} order by at desc limit ${Math.max(1, Math.min(200, Number(a.limit ?? 20) || 20))}`;

    /* ------------------------------------------------------------- tasks */
    case "addTask": {
      const [row] = rows(await sql`
        insert into og_tasks (kind, payload, not_before)
        values (${s(a.kind)}, ${j(a.payload)}::jsonb, ${s(a.notBefore)})
        returning *`);
      return row;
    }

    case "nextTask": {
      const [row] = rows(await sql`
        update og_tasks set state = 'doing', attempts = attempts + 1
         where id = (
           select id from og_tasks
            where state = 'todo' and (not_before is null or not_before <= now())
            order by created_at limit 1 for update skip locked)
        returning *`);
      return row ?? null;
    }

    case "finishTask":
      await sql`
        update og_tasks
           set state = ${a.error ? "failed" : "done"}, last_error = ${s(a.error)}, done_at = now()
         where id = ${s(a.id)}`;
      return true;
  }
}
