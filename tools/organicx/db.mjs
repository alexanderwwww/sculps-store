/**
 * Its memory.
 *
 * Neon, the same Postgres the stores run on. Not a file on the Mac, for one
 * reason: when it stops at three in the morning, the answer has to be readable
 * from somewhere other than the machine it stopped on.
 *
 * Everything here is small and explicit rather than an ORM. There are eleven
 * tables and about twenty questions to ask of them, and a query you can read
 * is worth more than a layer that saves typing.
 */
import { neon } from "@neondatabase/serverless";

let sql = null;

export function connect(url) {
  if (!url) throw new Error("No DATABASE_URL. OrganicX cannot remember anything without it.");
  sql = neon(url);
  return sql;
}

const db = () => {
  if (!sql) throw new Error("connect() first");
  return sql;
};

/* -------------------------------------------------------------- accounts */

export async function accounts() {
  return db()`select * from ox_accounts order by platform, handle`;
}

export async function accountFor(platform, handle) {
  const [row] = await db()`
    select * from ox_accounts where platform = ${platform} and handle = ${handle} limit 1`;
  return row ?? null;
}

/**
 * Record that a platform is signed in.
 *
 * `connected` means the app SAW a logged-in session, not that it holds one.
 * There is no credential column here and there never will be.
 */
export async function markConnected(platform, handle, profile) {
  const [row] = await db()`
    insert into ox_accounts (platform, handle, profile, connected, connected_at, last_seen_at)
    values (${platform}, ${handle}, ${profile}, true, now(), now())
    on conflict (platform, handle) do update
      set connected = true,
          connected_at = coalesce(ox_accounts.connected_at, now()),
          last_seen_at = now(),
          profile = excluded.profile,
          friction = null,
          friction_at = null
    returning *`;
  return row;
}

/**
 * Park an account for the day.
 *
 * A captcha, a verification prompt, an action block. Nothing retries after
 * this — retrying is how accounts are lost.
 */
export async function park(accountId, why) {
  await db()`
    update ox_accounts set friction = ${why}, friction_at = now() where id = ${accountId}`;
}

/** Whether this account is allowed to do anything right now. */
export async function isParked(accountId) {
  const [row] = await db()`
    select friction, friction_at from ox_accounts where id = ${accountId}`;
  if (!row?.friction_at) return false;
  // Parked for the rest of the day, not for a fixed number of minutes: the
  // point is that the account goes quiet the way a person's would.
  const since = Date.now() - new Date(row.friction_at).getTime();
  return since < 20 * 60 * 60 * 1000;
}

export async function seen(accountId) {
  await db()`update ox_accounts set last_seen_at = now() where id = ${accountId}`;
}

/** A day of warming, counted once per calendar day rather than per session. */
export async function warmedToday(accountId) {
  await db()`
    update ox_accounts
       set warmed_days = warmed_days + 1
     where id = ${accountId}
       and (last_seen_at is null or last_seen_at::date < current_date)`;
}

/* -------------------------------------------------------------- personas */

export async function personaFor(accountId) {
  const [row] = await db()`
    select * from ox_personas where account_id = ${accountId} limit 1`;
  return row ?? null;
}

/**
 * Written once and then kept. A person does not change who they are between
 * Tuesday and Wednesday, so this refuses to overwrite one that exists.
 */
export async function savePersona(accountId, p) {
  const existing = await personaFor(accountId);
  if (existing) return existing;
  const [row] = await db()`
    insert into ox_personas
      (account_id, who, metro, hours, interests, voice, typing, temperament, days_off)
    values (${accountId}, ${p.who}, ${p.metro}, ${JSON.stringify(p.hours)}::jsonb,
            ${JSON.stringify(p.interests)}::jsonb, ${p.voice},
            ${JSON.stringify(p.typing)}::jsonb, ${JSON.stringify(p.temperament)}::jsonb,
            ${JSON.stringify(p.daysOff)}::jsonb)
    returning *`;
  return row;
}

/* --------------------------------------------------------------- actions */

/**
 * Every human thing an account did.
 *
 * Recorded rather than assumed: when the app says "she does not comment
 * much", that is read from what she actually did, not from a config flag.
 */
export async function act(accountId, kind, { targetUrl, dwellMs, text } = {}) {
  await db()`
    insert into ox_actions (account_id, kind, target_url, dwell_ms, text)
    values (${accountId}, ${kind}, ${targetUrl ?? null}, ${dwellMs ?? null}, ${text ?? null})`;
}

/** What this account has already done today, so a budget means something. */
export async function todayCounts(accountId) {
  const rows = await db()`
    select kind, count(*)::int n
      from ox_actions
     where account_id = ${accountId} and at::date = current_date
     group by kind`;
  return Object.fromEntries(rows.map((r) => [r.kind, r.n]));
}

/* ----------------------------------------------------------------- clips */

/** Have we pulled this one before? The row outlives the file on purpose. */
export async function knownClip(sourceUrl) {
  const [row] = await db()`select id from ox_clips where source_url = ${sourceUrl} limit 1`;
  return Boolean(row);
}

export async function saveClip(clip) {
  const [row] = await db()`
    insert into ox_clips
      (platform, source_url, source_handle, posted_at, caption, views, likes, comments,
       file_key, duration_ms, seen, validated, validation_note)
    values (${clip.platform}, ${clip.sourceUrl}, ${clip.sourceHandle ?? null},
            ${clip.postedAt ?? null}, ${clip.caption ?? null}, ${clip.views ?? null},
            ${clip.likes ?? null}, ${clip.comments ?? null}, ${clip.fileKey ?? null},
            ${clip.durationMs ?? null},
            ${clip.seen ? JSON.stringify(clip.seen) : null}::jsonb,
            ${clip.validated ?? null}, ${clip.validationNote ?? null})
    on conflict (source_url) do update
      set seen = excluded.seen,
          validated = excluded.validated,
          validation_note = excluded.validation_note
    returning *`;
  return row;
}

/* ------------------------------------------------------------ the memory */

/**
 * What it has learned, as numbers it reads before choosing.
 *
 * Nudged toward the outcome rather than replaced by it: one good post is not
 * proof, and a weight that swings on a single result is noise with a name.
 */
export async function learn(scope, dimension, value, won) {
  await db()`
    insert into ox_weights (scope, dimension, value, weight, trials, wins)
    values (${scope}, ${dimension}, ${value}, ${won ? 0.1 : -0.05}, 1, ${won ? 1 : 0})
    on conflict (scope, dimension, value) do update
      set trials = ox_weights.trials + 1,
          wins = ox_weights.wins + ${won ? 1 : 0},
          weight = ox_weights.weight + ${won ? 0.1 : -0.05},
          updated_at = now()`;
}

/**
 * What it knows about one dimension, best first.
 *
 * Anything with fewer than three trials is left out: a single win is a
 * coincidence, and acting on it is how a system talks itself into a habit.
 */
export async function weights(scope, dimension) {
  return db()`
    select value, weight, trials, wins
      from ox_weights
     where scope = ${scope} and dimension = ${dimension} and trials >= 3
     order by weight desc`;
}

/** The same thing in sentences, with the evidence attached. */
export async function remember(scope, lesson, evidence, confidence = 0.5) {
  await db()`
    insert into ox_lessons (scope, lesson, evidence, confidence)
    values (${scope}, ${lesson}, ${JSON.stringify(evidence ?? {})}::jsonb, ${confidence})`;
}

export async function lessons(scope, limit = 20) {
  return db()`
    select lesson, evidence, confidence, at
      from ox_lessons where scope = ${scope}
     order by at desc limit ${limit}`;
}

/* ------------------------------------------------------------- the tasks */

/** The work it has set itself, so a run survives the app being closed. */
export async function addTask(kind, payload, notBefore = null) {
  const [row] = await db()`
    insert into ox_tasks (kind, payload, not_before)
    values (${kind}, ${JSON.stringify(payload)}::jsonb, ${notBefore})
    returning *`;
  return row;
}

export async function nextTask() {
  const [row] = await db()`
    update ox_tasks set state = 'doing', attempts = attempts + 1
     where id = (
       select id from ox_tasks
        where state = 'todo' and (not_before is null or not_before <= now())
        order by created_at
        limit 1
        for update skip locked)
    returning *`;
  return row ?? null;
}

export async function finishTask(id, error = null) {
  await db()`
    update ox_tasks
       set state = ${error ? "failed" : "done"},
           last_error = ${error},
           done_at = now()
     where id = ${id}`;
}
