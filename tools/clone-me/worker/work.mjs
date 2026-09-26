/**
 * Clone Me's judgement: which jobs this machine can honestly finish.
 *
 * The rule the whole file exists to enforce is Fiverr's, not mine: a seller
 * may use AI to do the work, and may not run an account that accepts and
 * delivers on its own. So this scans and shortlists. Taking the job is a tap,
 * and the tap is Alex's.
 *
 * The second rule is ours, and it matters more for the account than the first:
 * never shortlist work we cannot actually do well. One late delivery or one
 * refund on a new seller account costs more than the job paid, because the
 * rating is the only asset a new seller has.
 */

/**
 * What this machine can genuinely finish, unsupervised, to a standard somebody
 * would pay for and not dispute.
 *
 * Each entry is deliberately narrow. "Writing" is not a capability; "rewrite a
 * product description" is. The narrow ones are the ones that come back clean.
 */
export const CAN_DO = [
  {
    id: "product-copy",
    label: "Product descriptions and listing copy",
    wants: ["product description", "product copy", "listing", "amazon listing", "etsy listing", "shopify description", "bullet points", "seo description"],
    minutes: 25,
  },
  {
    id: "ad-copy",
    label: "Ad copy and hooks",
    wants: ["facebook ad", "meta ad", "google ad", "ad copy", "ad script", "hooks", "headlines", "tiktok script", "ugc script"],
    minutes: 30,
  },
  {
    id: "email",
    label: "Email sequences and newsletters",
    wants: ["email sequence", "welcome email", "abandoned cart email", "newsletter", "klaviyo flow", "cold email"],
    minutes: 45,
  },
  {
    id: "translation-el",
    label: "English ↔ Greek translation",
    // "to greek" rather than "translate to greek": the job that started this
    // read "Translate 2000 words to Greek", which the longer phrase missed —
    // a shortlist that drops work we can plainly do is the expensive failure
    // here, not the other way round.
    wants: ["to greek", "greek translation", "from greek", "greek to english", "ελληνικ", "greek subtitle"],
    minutes: 30,
  },
  {
    id: "web-fix",
    label: "Small website and Shopify fixes",
    wants: ["shopify", "liquid", "css fix", "html fix", "landing page", "fix my website", "speed up", "responsive"],
    minutes: 90,
  },
  {
    id: "data",
    label: "Data entry, scraping, spreadsheets",
    wants: ["data entry", "web scraping", "scrape", "spreadsheet", "excel", "google sheets", "csv", "lead list"],
    minutes: 60,
  },
  {
    id: "seo",
    label: "SEO articles and blog posts",
    wants: ["blog post", "seo article", "article writing", "content writing", "keyword"],
    minutes: 60,
  },
];

/**
 * Work we refuse on sight, because taking it is how the account dies.
 *
 * Two kinds. The first is work the machine cannot do at all and where a buyer
 * would rightly dispute — anything sold as a human body, voice or face. The
 * second is work that breaks Fiverr's rules whoever does it.
 */
export const REFUSE = [
  { re: /\b(voice ?over|voiceover|record my|human voice|real voice)\b/i, why: "sold as a human voice" },
  { re: /\b(on ?camera|talking head|film yourself|your face|selfie video)\b/i, why: "needs a real person on camera" },
  { re: /\b(review|rating|upvote|follower|like)s?\s*(for sale|buy|boost|farm)/i, why: "fake engagement — banned" },
  { re: /\b(essay|dissertation|thesis|exam|homework|assignment)\b/i, why: "academic work — banned" },
  { re: /\b(certif\w+|notari|legal advice|medical advice|diagnos)/i, why: "needs a licensed human" },
  { re: /\b(logo|brand identity)\b.*\b(hand ?drawn|by hand|original artwork)\b/i, why: "sold as handmade" },
  { re: /\bnda\b.*\bsign\b|\bconfidential\b.*\bcontract\b/i, why: "needs a signature, not a tap" },
];

/** A job is worth the hour it takes, or it is not worth taking. */
const FLOOR_PER_HOUR_CENTS = 1500;

/**
 * Score one job. Returns what it is, what it pays per hour, and — when we are
 * not taking it — the reason, in words Alex can disagree with.
 *
 * `null` is never returned. Every job gets a verdict, because a silent skip is
 * indistinguishable from a bug.
 */
export function scoreJob(job) {
  const text = [job?.title, job?.brief, job?.line].filter(Boolean).join(" ").toLowerCase();
  const cents = Number.isFinite(job?.priceCents) ? job.priceCents : null;

  if (!text.trim()) {
    return { take: false, why: "nothing to read on this row", skill: null, perHourCents: null };
  }

  for (const rule of REFUSE) {
    if (rule.re.test(text)) {
      return { take: false, why: rule.why, skill: null, perHourCents: null };
    }
  }

  let best = null;
  for (const skill of CAN_DO) {
    const hits = skill.wants.filter((w) => text.includes(w));
    if (!hits.length) continue;
    if (!best || hits.length > best.hits.length) best = { skill, hits };
  }
  if (!best) {
    return { take: false, why: "outside what this machine does well", skill: null, perHourCents: null };
  }

  // Price is often absent on a brief. Absent is not free — it is unknown, and
  // an unknown price is still worth shortlisting so Alex can name one.
  if (cents == null) {
    return {
      take: true,
      why: "no price stated — worth quoting",
      skill: best.skill.id,
      label: best.skill.label,
      minutes: best.skill.minutes,
      perHourCents: null,
    };
  }

  const perHourCents = Math.round((cents / best.skill.minutes) * 60);
  if (perHourCents < FLOOR_PER_HOUR_CENTS) {
    return {
      take: false,
      why: `pays about $${(perHourCents / 100).toFixed(0)}/hour`,
      skill: best.skill.id,
      label: best.skill.label,
      minutes: best.skill.minutes,
      perHourCents,
    };
  }

  return {
    take: true,
    why: `$${(perHourCents / 100).toFixed(0)}/hour`,
    skill: best.skill.id,
    label: best.skill.label,
    minutes: best.skill.minutes,
    perHourCents,
  };
}

/**
 * The shortlist, best first.
 *
 * Sorted by what it pays per hour, with the unpriced ones after the priced —
 * a job worth quoting is worth less of his attention than one already worth
 * taking.
 */
export function shortlist(jobs) {
  const scored = (jobs ?? []).map((job) => ({ job, verdict: scoreJob(job) }));
  const take = scored.filter((s) => s.verdict.take);
  take.sort((a, b) => (b.verdict.perHourCents ?? -1) - (a.verdict.perHourCents ?? -1));
  return { take, skip: scored.filter((s) => !s.verdict.take) };
}
