/**
 * The part that makes an account a person instead of a billboard.
 *
 * Everything in this file exists because platforms do not catch automation by
 * reading your code — they catch it by noticing that nobody watches forty
 * clips for exactly 3.0 seconds each, likes precisely every twentieth one,
 * and does it again at the same minute tomorrow. A tool that posts on a cron
 * and does nothing else is legible from the first week.
 *
 * So none of the numbers here are constants. They are distributions, drawn
 * per persona, and the persona is written once and kept — a person does not
 * change who they are between Tuesday and Wednesday.
 *
 * This file is deliberately pure: no browser, no network, no database. It
 * decides WHAT a person would do; `browser.mjs` does it. That split is what
 * makes the behaviour testable without opening Chrome, which matters, because
 * the failure mode here is silent — behaviour that looks fine in a log and
 * reads as a bot to the platform.
 */

/* ------------------------------------------------------------- randomness */

/** Uniform in [lo, hi). */
export const between = (lo, hi) => lo + Math.random() * (hi - lo);

/** Uniform integer in [lo, hi]. */
export const intBetween = (lo, hi) => Math.floor(between(lo, hi + 1));

/** True with probability p. */
export const chance = (p) => Math.random() < p;

/** One of them, evenly. */
export const pick = (list) => list[Math.floor(Math.random() * list.length)];

/**
 * A normal-ish draw, clamped.
 *
 * Human timings are not uniform — most watches cluster around a typical
 * length with a long tail of "kept watching". A uniform draw produces a flat
 * histogram, which is itself a tell.
 */
export function around(mean, spread, lo = 0, hi = Infinity) {
  // Box-Muller, one side of it.
  const u = Math.max(Number.EPSILON, Math.random());
  const v = Math.random();
  const z = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  return Math.min(hi, Math.max(lo, mean + z * spread));
}

/* ---------------------------------------------------------------- the day */

/**
 * Is this persona even around right now?
 *
 * Three things have to be true: it is not one of their days off, the clock is
 * inside one of their waking windows, and they have not already done their
 * sessions for today. An account that is available twenty-four hours a day is
 * not a person in any timezone.
 */
export function isAwake(persona, now = new Date()) {
  if (persona.daysOff?.includes(now.getDay())) return false;
  const minutes = now.getHours() * 60 + now.getMinutes();
  return (persona.hours ?? []).some(({ start, end }) => {
    const from = toMinutes(start);
    const to = toMinutes(end);
    // A window that wraps midnight is two windows.
    return from <= to ? minutes >= from && minutes < to : minutes >= from || minutes < to;
  });
}

function toMinutes(hhmm) {
  const [h, m] = String(hhmm).split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

/**
 * How many sessions today, and how long each one runs.
 *
 * Three to six short sessions, with real variance: some are ninety seconds
 * standing at the kettle, one is twenty minutes on the sofa. Some days are
 * thin — one session and two likes. Some days are nothing at all, and that is
 * not a bug to be fixed.
 */
export function planDay(persona, warmedDays) {
  if (chance(0.08)) return []; // a day where they simply did not open it

  const ramp = rampFactor(warmedDays);
  const thin = chance(0.18);
  const count = thin ? 1 : Math.max(1, Math.round(around(4.5, 1.1, 1, 6) * ramp));

  const sessions = [];
  for (let i = 0; i < count; i++) {
    // Most are short. One tends to be the long evening one.
    const long = i === count - 1 && !thin && chance(0.55);
    const seconds = long
      ? around(900, 320, 300, 1800) // the sofa session
      : around(180, 120, 60, 480); // standing about
    sessions.push({ seconds: Math.round(seconds), long });
  }
  return sessions;
}

/**
 * How much of full behaviour a given account is allowed today.
 *
 * A two-day-old account that behaves like a two-month-old one is the clearest
 * signal there is. Week one does a fraction of week four, and the curve is
 * smooth rather than a step, because a step is also a signal.
 */
export function rampFactor(warmedDays) {
  if (warmedDays <= 0) return 0.25;
  if (warmedDays >= 28) return 1;
  return 0.25 + 0.75 * (warmedDays / 28);
}

/**
 * The gaps between sessions, spread across the persona's waking windows with
 * jitter, so it is never the same times two days running.
 */
export function scatterAcrossDay(persona, sessions, now = new Date()) {
  const windows = persona.hours ?? [];
  if (!windows.length || !sessions.length) return [];
  const out = [];
  for (const session of sessions) {
    const w = pick(windows);
    const from = toMinutes(w.start);
    const to = toMinutes(w.end);
    const span = to > from ? to - from : 24 * 60 - from + to;
    const at = new Date(now);
    const minute = (from + Math.floor(between(0, span))) % (24 * 60);
    at.setHours(Math.floor(minute / 60), minute % 60, intBetween(0, 59), 0);
    out.push({ ...session, at });
  }
  return out.sort((a, b) => a.at - b.at);
}

/* ------------------------------------------------------------- the scroll */

/**
 * How long this clip gets watched.
 *
 * Watch time follows interest, not a script: some to the end, some abandoned
 * in half a second, a few rewatched. The `interesting` flag is the caller's
 * judgement — usually "is this in the persona's niche" — and it shifts the
 * distribution rather than setting the number.
 */
export function watchMs(clipMs, interesting) {
  if (!interesting && chance(0.42)) return Math.round(between(300, 1200)); // thumbed past
  const full = Math.max(1000, clipMs || 15000);
  if (interesting && chance(0.16)) {
    // Watched it round again. People do this and bots never do.
    return Math.round(full * between(1.4, 2.6));
  }
  const share = interesting ? around(0.78, 0.22, 0.1, 1) : around(0.35, 0.25, 0.05, 1);
  return Math.round(full * share);
}

/**
 * Occasionally the thumb just stops.
 *
 * The video loops twice, nobody does anything, and then they carry on. It is
 * the single cheapest thing to add and one of the least imitated.
 */
export function shouldRest() {
  return chance(0.07);
}

/** Scroll speed drifts inside a session: people slow down when absorbed. */
export function scrollPauseMs(absorbed) {
  return Math.round(absorbed ? around(2600, 900, 600, 7000) : around(1100, 500, 250, 3500));
}

/* ---------------------------------------------------------- what they do */

/**
 * Decide the reaction to one clip, from the persona's own ratios.
 *
 * Ratios, not rules. A real person likes a small fraction of what they see —
 * 3 to 8 percent — saves a handful a week, shares rarely and to nobody in
 * particular, comments a few times a week rather than a few times an hour.
 *
 * `budget` is what remains for the day, so a persona cannot suddenly become a
 * different person because the feed was good.
 */
export function react(persona, { interesting, budget, ramp = 1 }) {
  const t = persona.temperament ?? {};
  const scale = (interesting ? 1.7 : 0.5) * ramp;

  const out = { like: false, save: false, share: false, comment: false, follow: false };
  if (budget.like > 0 && chance((t.likeRate ?? 0.05) * scale)) out.like = true;
  // A save or a share without a like almost never happens.
  if (out.like && budget.save > 0 && chance((t.saveRate ?? 0.01) * scale)) out.save = true;
  if (out.like && budget.share > 0 && chance((t.shareRate ?? 0.004) * scale)) out.share = true;
  if (out.like && budget.comment > 0 && chance((t.commentRate ?? 0.006) * scale)) out.comment = true;
  if (budget.follow > 0 && interesting && chance((t.followRate ?? 0.004) * scale)) out.follow = true;
  return out;
}

/**
 * What is left for today.
 *
 * Follows are clustered on purpose: people binge-follow six accounts in one
 * sitting and then none for four days. So the daily follow budget is usually
 * zero and occasionally several, rather than one a day every day — which is
 * a pattern no human has ever produced.
 */
export function dayBudget(persona, warmedDays) {
  const ramp = rampFactor(warmedDays);
  const bingeing = chance(0.22);
  return {
    like: Math.round(around(26, 10, 3, 60) * ramp),
    save: chance(0.3 * ramp) ? intBetween(1, 2) : 0,
    share: chance(0.12 * ramp) ? 1 : 0,
    comment: chance(0.35 * ramp) ? intBetween(1, 2) : 0,
    follow: bingeing ? Math.round(intBetween(3, 7) * ramp) : 0,
  };
}

/* ------------------------------------------------------------- the typing */

/**
 * Turn text into the keystrokes a person would actually produce.
 *
 * Returns a list of {key, delayMs} — including the wrong letters, the
 * backspaces that fix some of them, and the pauses mid-sentence. Instant
 * paste into a comment box is one of the loudest automation signals there is,
 * and it is also the easiest to avoid.
 *
 * Not every typo gets fixed. That is the point: a comment with a typo left
 * standing reads as a person, and a comment that is always perfect does not.
 */
const NEIGHBOURS = {
  a: "qwsz", b: "vghn", c: "xdfv", d: "serfcx", e: "wsdr", f: "drtgvc",
  g: "ftyhbv", h: "gyujnb", i: "ujko", j: "huikmn", k: "jiolm", l: "kop",
  m: "njk", n: "bhjm", o: "iklp", p: "ol", q: "wa", r: "edft", s: "awedxz",
  t: "rfgy", u: "yhji", v: "cfgb", w: "qase", x: "zsdc", y: "tghu", z: "asx",
};

export function keystrokes(text, persona) {
  const typing = persona?.typing ?? {};
  const cpsMin = typing.cpsMin ?? 4.5;
  const cpsMax = typing.cpsMax ?? 9;
  const typoRate = typing.typoRate ?? 0.035;

  const out = [];
  const gap = () => Math.round(1000 / between(cpsMin, cpsMax));

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];

    // A pause to think, more likely after a space than mid-word.
    if (ch === " " && chance(0.06)) out.push({ key: "", delayMs: Math.round(between(400, 1800)) });

    if (/[a-z]/i.test(ch) && chance(typoRate)) {
      const near = NEIGHBOURS[ch.toLowerCase()];
      if (near) {
        const wrong = pick(near.split(""));
        out.push({ key: ch === ch.toUpperCase() ? wrong.toUpperCase() : wrong, delayMs: gap() });
        // Most typos get noticed. Some do not, and those are the good ones.
        if (chance(0.72)) {
          out.push({ key: "Backspace", delayMs: Math.round(between(180, 700)) });
          out.push({ key: ch, delayMs: gap() });
        }
        continue;
      }
    }
    out.push({ key: ch, delayMs: gap() });
  }
  return out;
}

/**
 * Is this comment safe to send?
 *
 * The highest-risk behaviour, and the one that most looks like a bot when it
 * is done badly. Generic praise is the signature of automation, and pitching
 * your own product under somebody else's video is how an account gets
 * reported rather than recommended.
 *
 * Returns null when it is fine, or the reason to drop it.
 */
const GENERIC = [
  /^love this!?$/i,
  /^so cool\s*🔥?$/i,
  /^amazing!?$/i,
  /^nice!?$/i,
  /^😍+$/,
  /^🔥+$/,
  /^this is everything!?$/i,
  /^need this!?$/i,
  /^obsessed!?$/i,
];

export function commentProblem(text, { ownDomains = [], competitorNames = [] } = {}) {
  const trimmed = String(text ?? "").trim();
  if (!trimmed) return "empty";
  if (GENERIC.some((re) => re.test(trimmed))) return "generic — that is the signature of a bot";
  if (/https?:\/\//i.test(trimmed)) return "a link in a comment reads as spam";
  for (const domain of ownDomains) {
    if (trimmed.toLowerCase().includes(String(domain).toLowerCase())) {
      return "never pitch our own product under somebody else's video";
    }
  }
  for (const name of competitorNames) {
    if (trimmed.toLowerCase().includes(String(name).toLowerCase())) {
      return `names a competitor (${name})`;
    }
  }
  if (trimmed.length > 220) return "too long to be a comment somebody typed on a phone";
  return null;
}

/* ------------------------------------------------------------- the brakes */

/**
 * Everything that means stop, in the words each platform actually uses.
 *
 * Pushing through any one of these is how accounts are lost, so the account
 * parks for the day and says why. There is no retry here on purpose.
 */
/*
 * Each of these has to be specific enough not to fire on ordinary page text.
 *
 * "try again later" on its own matched a signed-out TikTok page and reported
 * an action block on a perfectly healthy account — which in the farming loop
 * would have parked it for twenty hours over nothing. A false positive here
 * is not a harmless extra caution: it silently stops an account working, and
 * the only symptom is that nothing happens.
 *
 * So every pattern names the thing the platform actually says, not a fragment
 * that could appear anywhere.
 */
const FRICTION = [
  { re: /action blocked/i, why: "action blocked" },
  { re: /(you'?re|you are) temporarily blocked/i, why: "temporarily blocked" },
  { re: /try again later.{0,80}(blocked|limit|restrict)/is, why: "action blocked" },
  { re: /(blocked|limit|restrict).{0,80}try again later/is, why: "action blocked" },
  { re: /we restrict certain activity/i, why: "activity restricted" },
  { re: /(confirm|verify) (your identity|it'?s you|that it'?s you)/i, why: "asked to confirm it is them" },
  { re: /we detected unusual (activity|login)/i, why: "unusual-activity notice" },
  { re: /suspicious (login|activity) (attempt|detected)/i, why: "suspicious-login notice" },
  { re: /are you a robot|verify you are human|complete the captcha/i, why: "captcha" },
  { re: /your account has been (suspended|disabled)/i, why: "account suspended" },
  { re: /too many (requests|attempts)/i, why: "rate limited" },
];

export function frictionIn(pageText) {
  const text = String(pageText ?? "");
  for (const { re, why } of FRICTION) if (re.test(text)) return why;
  return null;
}

/* ---------------------------------------------------------- the recovery */

/**
 * The day for an account Instagram has stopped recommending.
 *
 * There is no switch for this and nobody outside Instagram can flip one. What
 * Instagram does say, in Account Status, is whether an account is eligible to
 * be recommended — and what moves that is time plus an account that reads as
 * a person rather than a tool: far more watching than acting, no bursts, no
 * comments for a while, and nothing at all outside the persona's own hours.
 *
 * So a recovery day is a normal day with the acting cut down hard and the
 * watching left alone. It opens up slowly — a quarter of the usual ceiling on
 * day one, back to normal after about ten clean days.
 */
export function recoveryBudget(budget, daysIn = 0) {
  const open = Math.min(1, 0.22 + Math.max(0, daysIn) * 0.08);
  return {
    // A handful of likes, never a run of them.
    like: Math.max(1, Math.min(Math.round(26 * open), Math.round(budget.like * open))),
    save: budget.save > 0 && daysIn >= 3 ? 1 : 0,
    share: 0,
    // Comments are the loudest thing a watched account can do. Not yet.
    comment: daysIn >= 10 ? Math.min(1, budget.comment) : 0,
    follow: daysIn >= 7 ? Math.min(2, budget.follow) : 0,
  };
}

/** How long to sit with one clip while recovering: watched, not skimmed. */
export function recoveryDwellMs(base) {
  return Math.round(Math.min(45000, base * between(1.6, 2.4)));
}
