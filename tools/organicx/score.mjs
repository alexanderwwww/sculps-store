/**
 * What is worth pulling, and what it is worth pulling FOR.
 *
 * The first version of this had one bar — viral or nothing — and that was
 * wrong in a way that would have starved the accounts. Five proven clips a
 * week is not enough to farm an account with. An account that posts twice a
 * week is not warming, it is idling, and the algorithm files it accordingly.
 *
 * So there are two lanes, and a clip is judged for the lane it is in:
 *
 *   PROVEN        it already travelled. Real velocity, real engagement, and
 *                 comments that read like people who want to buy it. These
 *                 are the ones that might actually sell, and there are never
 *                 many of them.
 *
 *   PRESENTATION  it did not travel, but the product looks good in it — clean
 *                 framing, the product is the hero, lit properly, vertical,
 *                 no watermark to crop around. Nobody expects it to explode.
 *                 It feeds the account, keeps the grid alive, and reaches
 *                 people, which is the thing that makes the proven ones land
 *                 on a warm account instead of a cold one.
 *
 * A clip can qualify for both, and the better lane wins. A clip that
 * qualifies for neither is deleted within seconds of being pulled — the row
 * stays so it is never pulled twice, the file does not.
 */

/* --------------------------------------------------------- the arithmetic */

/**
 * The numbers half. Milliseconds, no model, no cost.
 *
 * Velocity rather than total, because 400k in two days beats 2M over a year
 * and a raw view count cannot tell them apart. Everything here comes off the
 * listing page with the download, so it costs nothing to compute on every
 * candidate before deciding which ones are worth looking at.
 */
export function numbers({ views, likes, comments, saves, postedAt, now = Date.now() }) {
  const hours = Math.max(1, (now - new Date(postedAt ?? now).getTime()) / 3_600_000);
  const v = Math.max(0, views ?? 0);
  const engagement = v > 0 ? ((likes ?? 0) + (comments ?? 0) + (saves ?? 0)) / v : 0;

  return {
    hours,
    views: v,
    /** Views per hour. The one number that survives comparing across ages. */
    velocity: v / hours,
    engagement,
    /**
     * Comments per like. High means people are arguing in the replies, which
     * is reach without money behind it — the controversy trap.
     */
    argueRatio: (likes ?? 0) > 0 ? (comments ?? 0) / likes : 0,
    /**
     * Saves per view. The best purchase-intent signal on Reels: a save is
     * somebody putting it aside to come back to, which is what a person does
     * before they buy something.
     */
    saveRate: v > 0 ? (saves ?? 0) / v : 0,
  };
}

/**
 * Is it viral by the numbers?
 *
 * Deliberately blunt, and deliberately a gate rather than a score: the point
 * of this step is to throw away the ninety percent that are not worth looking
 * at, cheaply, before anything touches a model or the disk.
 */
export function isProven(n) {
  if (n.views < 50_000) return false;
  // Old and slow is not viral, whatever the total says.
  if (n.velocity < 1_000) return false;
  if (n.engagement < 0.02) return false;
  // Arguing in the comments is reach, not intent.
  if (n.argueRatio > 0.35) return false;
  return true;
}

/* -------------------------------------------------------------- the eyes */

/**
 * What the app saw in the frames, scored.
 *
 * `look` is whatever the vision pass returned — the shape is fixed here so a
 * change in how the frames are read cannot silently change what gets posted.
 * Every field is a plain fact about the picture, not an opinion about it.
 *
 *   isOurProduct    the actual unit we sell, not a lookalike or last year's
 *   productShare    roughly how much of the frame it occupies, 0..1
 *   hookAtOneSecond something is happening by 1s — not a logo, not a title card
 *   vertical        shot 9:16, not a letterboxed landscape
 *   watermark       'none' | 'corner' | 'across' — 'across' cannot be cropped
 *   litWell         the product is actually visible rather than a dark blob
 *   steady          not unwatchably shaky
 *   faces           people in it, which lifts everything on every platform
 */
export function presentation(look) {
  if (!look) return { score: 0, why: ["nothing was seen"] };
  const why = [];
  let score = 0;

  if (look.isOurProduct) score += 40;
  else why.push("not our product");

  if (look.productShare >= 0.25) score += 15;
  else if (look.productShare >= 0.12) score += 8;
  else why.push("product is a prop, not the subject");

  if (look.litWell) score += 12;
  else why.push("too dark to see it");

  if (look.vertical) score += 10;
  else why.push("not vertical");

  if (look.steady) score += 8;
  else why.push("too shaky");

  if (look.hookAtOneSecond) score += 10;
  else why.push("nothing happens in the first second");

  if (look.faces) score += 5;

  if (look.watermark === "none") score += 10;
  else if (look.watermark === "corner") score += 4;
  else why.push("watermark across the frame — cannot be cropped out");

  return { score: Math.max(0, Math.min(100, score)), why };
}

/* -------------------------------------------------------------- the lanes */

/** The bar for the presentation lane. Below this it is not worth the disk. */
const LOOKS_GOOD = 62;

/**
 * Which lane, if any.
 *
 * The two hard refusals apply to both lanes and are not scores: it has to be
 * our product, and the watermark has to be croppable. A beautiful clip of
 * somebody else's projector is worse than nothing — it is an ad for them —
 * and a watermark across the middle is a strike waiting to happen.
 */
export function lane({ n, look, comments = [] }) {
  const p = presentation(look);

  if (!look?.isOurProduct) {
    return { lane: null, score: p.score, why: "not our product" };
  }
  if (look.watermark === "across") {
    return { lane: null, score: p.score, why: "watermark across the frame — that is a strike, not a crop" };
  }

  if (isProven(n)) {
    const intent = buyingIntent(comments);
    if (intent.laughing) {
      // The controversy trap: it travelled because it is funny, and funny
      // does not convert. It can still feed the account if it looks good.
      const ok = look.litWell && look.productShare >= 0.12 && look.vertical && look.steady;
      return ok && p.score >= LOOKS_GOOD
        ? { lane: "presentation", score: p.score, why: "travelled, but the comments are laughing — posting it to feed the account, not to sell" }
        : { lane: null, score: p.score, why: "travelled, but they are laughing rather than buying" };
    }
    return {
      lane: "proven",
      score: Math.round(p.score * 0.5 + 50),
      why: intent.asking
        ? "travelled, and people are asking where to buy it"
        : "travelled, and the engagement is real",
    };
  }

  /*
   * The presentation lane has requirements, not just a total.
   *
   * A score alone let a clip through where the product was three percent of
   * the frame, unlit, with nothing happening in the first second: forty
   * points for being our product plus a few for being vertical and steady
   * cleared the bar on its own. But "the product looks good in it" is the
   * entire definition of this lane — a clip that fails it is not a weaker
   * example of it, it is a different thing.
   */
  const presentable =
    look.litWell && look.productShare >= 0.12 && look.vertical && look.steady;
  if (presentable && p.score >= LOOKS_GOOD) {
    return {
      lane: "presentation",
      score: p.score,
      why: "did not travel, but the product looks good in it — this is what keeps the account fed",
    };
  }
  if (p.score >= LOOKS_GOOD && !presentable) {
    return { lane: null, score: p.score, why: p.why[0] ?? "the product does not look good enough in it" };
  }

  return { lane: null, score: p.score, why: p.why[0] ?? "nothing here" };
}

/* ----------------------------------------------------------- the comments */

/**
 * Reading the replies, which is the part no score computes.
 *
 * "where do i get this" is a buy signal. "lol this is so fake" is a view with
 * nothing behind it. This distinction is the whole of Desmond's job and it is
 * the one thing that separates a product that will sell from a clip that
 * merely travelled.
 */
const ASKING = [
  /where (can i|do i|to) (get|buy|find)/i,
  /link\??$/i,
  /what('| i)s (it|this) called/i,
  /how much/i,
  /need this/i,
  /(just )?(ordered|bought) (one|it|mine)/i,
  /dropping the link/i,
];

const LAUGHING = [
  /\bfake\b/i,
  /\bcringe\b/i,
  /\bai\b.*\b(made|generated|slop)\b/i,
  /this is (so )?(dumb|stupid|bad)/i,
  /^(lmao|lol|💀+|😭+)$/i,
  /who (would|is) (buy|buying)/i,
];

export function buyingIntent(comments) {
  const texts = (comments ?? []).map((c) => String(c?.text ?? c ?? ""));
  if (!texts.length) return { asking: 0, laughing: false, sampled: 0 };

  let asking = 0;
  let laughing = 0;
  for (const t of texts) {
    if (ASKING.some((re) => re.test(t))) asking++;
    if (LAUGHING.some((re) => re.test(t))) laughing++;
  }
  return {
    asking,
    /* More mockery than interest, on a decent sample, is the trap. */
    laughing: texts.length >= 8 && laughing > asking * 2 && laughing / texts.length > 0.2,
    sampled: texts.length,
  };
}

/* ------------------------------------------------------------- the mix */

/**
 * How much of each lane an account should post.
 *
 * Mostly presentation, because that is what keeps a grid alive and an
 * algorithm interested; the proven ones are rare and are spent where they
 * count. A feed of nothing but bangers is not a person's account either —
 * real accounts post ordinary things most of the time.
 *
 * The ramp matters here too: a new account leans harder on presentation,
 * because it has nothing to lose and everything to teach the platform about
 * who it is for.
 */
export function mixFor(warmedDays) {
  if (warmedDays < 7) return { presentation: 0.85, proven: 0.15 };
  if (warmedDays < 21) return { presentation: 0.7, proven: 0.3 };
  return { presentation: 0.6, proven: 0.4 };
}
