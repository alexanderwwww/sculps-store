/**
 * Research, done where it cannot cost an account.
 *
 * This is the single most important safety decision in the app, and it is a
 * structural one rather than a careful one.
 *
 * Every piece of research runs in a SEPARATE, SIGNED-OUT browser context.
 * No cookies, no session, no storage shared with the accounts. Scrolling a
 * hashtag four hundred times, opening two hundred profiles, hammering the ad
 * library — none of it can get @spookyhome action-blocked, because none of it
 * happens as @spookyhome. The worst case is a rate limit on an anonymous
 * session, and the fix for that is to wait.
 *
 * The logged-in contexts exist for exactly two things: posting, and the
 * ordinary human behaviour that makes an account look like a person. Nothing
 * else ever touches them.
 *
 * Meta's Ad Library is the best example of why this matters. It is genuinely
 * public — no login, no account, it is published because the law requires it
 * to be — so reading it from a signed-out context carries no account risk at
 * all. Reading the same pages while signed in as one of the accounts would
 * tie that browsing to it for nothing.
 */
import { attach, say, sleep, scroll, checkFriction } from "./browser.mjs";
import { between, around, chance } from "./human.mjs";

/**
 * A context with nothing in it.
 *
 * Made fresh and thrown away, so nothing accumulates that could link one
 * research run to the next, or to an account.
 */
export async function anonymous(browser) {
  const context = await browser.newContext({
    // No storage state on purpose: this must not inherit a session.
    storageState: undefined,
    viewport: { width: 1440, height: 900 },
    locale: "en-US",
  });
  context.__anonymous = true;
  return context;
}

/**
 * The guard.
 *
 * Every research call goes through here, and it refuses a context that
 * carries a session. This is a structural check rather than a convention,
 * because the failure it prevents is silent: research done from a logged-in
 * context works perfectly and costs an account three weeks later.
 */
function mustBeAnonymous(context) {
  if (!context?.__anonymous) {
    throw new Error(
      "research must run in a signed-out context — never from an account's browser",
    );
  }
}

/* ------------------------------------------------------------ ad library */

/**
 * Meta's Ad Library: what competitors are actually paying to show people.
 *
 * Public by law, readable without an account, and the closest thing to
 * ground truth about what is selling right now — an ad that has been running
 * for six weeks is an ad that is making money, because nobody keeps paying
 * for one that is not.
 *
 * What is read here is the creative and how long it has run. Nothing is
 * downloaded from it and nothing is reposted from it: competitor ad creative
 * belongs to the competitor, and Eli would refuse it at the gate anyway. It
 * is research into what works, which is what the library is for.
 */
export async function adLibrary(context, { query, country = "US", limit = 40 }) {
  mustBeAnonymous(context);
  const page = await context.newPage();
  await attach(page);
  await say(page, `ad library — ${query}`);

  const url =
    "https://www.facebook.com/ads/library/?active_status=active&ad_type=all" +
    `&country=${encodeURIComponent(country)}&q=${encodeURIComponent(query)}&search_type=keyword_unordered`;
  await page.goto(url, { waitUntil: "domcontentloaded" }).catch(() => {});
  await sleep(between(3000, 5000));

  // A cookie wall or a rate limit, said plainly rather than returning an
  // empty list that reads as "nobody is advertising this".
  const friction = await checkFriction(page);
  if (friction) {
    await page.close();
    return { ads: [], stopped: friction };
  }

  const ads = [];
  for (let pass = 0; pass < 8 && ads.length < limit; pass++) {
    const batch = await page
      .evaluate(() => {
        const out = [];
        // The library renders every ad card with its start date in plain
        // text. Reading the visible text is more durable than a class name,
        // which changes the week after you depend on it.
        for (const el of document.querySelectorAll('[role="article"], div[class*="_99s5"]')) {
          const text = el.innerText ?? "";
          if (!/Started running on/i.test(text)) continue;
          const started = /Started running on ([^\n·]+)/i.exec(text)?.[1]?.trim() ?? null;
          const advertiser = text.split("\n").find((l) => l.trim() && !/^Sponsored$/i.test(l))?.trim() ?? null;
          const img = el.querySelector("img")?.src ?? null;
          const video = el.querySelector("video")?.src ?? null;
          out.push({ advertiser, started, img, video, text: text.slice(0, 400) });
        }
        return out;
      })
      .catch(() => []);

    for (const ad of batch) {
      if (!ads.some((a) => a.text === ad.text)) ads.push(ad);
    }

    await scroll(page, { absorbed: chance(0.4) });
    await sleep(around(1800, 700, 700, 4000));
  }

  await page.close();
  return { ads: ads.slice(0, limit), stopped: null };
}

/**
 * How long an ad has been running, in days, from the library's own wording.
 *
 * The number that matters. Six weeks is a winner; four days is somebody
 * testing, the same as we are.
 */
export function runningDays(started, now = new Date()) {
  if (!started) return null;
  const when = new Date(started);
  if (Number.isNaN(when.getTime())) return null;
  return Math.max(0, Math.round((now - when) / 86_400_000));
}

/** An ad that has been paying for itself for a month is telling you something. */
export function proven(ad, now = new Date()) {
  const days = runningDays(ad.started, now);
  return days != null && days >= 28;
}

/* ------------------------------------------------------- the open feeds */

/**
 * A hashtag or a search, read signed out.
 *
 * TikTok and Instagram both serve a usable amount without a session, and
 * what they hold back is not worth an account. YouTube holds back nothing.
 */
const FEEDS = {
  tiktok: (tag) => `https://www.tiktok.com/tag/${encodeURIComponent(tag)}`,
  instagram: (tag) => `https://www.instagram.com/explore/tags/${encodeURIComponent(tag)}/`,
  youtube: (tag) => `https://www.youtube.com/results?search_query=${encodeURIComponent(tag)}&sp=EgIYAQ%253D%253D`,
};

export async function hashtag(context, platform, tag, { passes = 6 } = {}) {
  mustBeAnonymous(context);
  const make = FEEDS[platform];
  if (!make) throw new Error(`no such platform: ${platform}`);

  const page = await context.newPage();
  await attach(page);
  await say(page, `${platform} — #${tag}`);
  await page.goto(make(tag), { waitUntil: "domcontentloaded" }).catch(() => {});
  await sleep(between(2500, 4500));

  const friction = await checkFriction(page);
  // "Logged out" is the expected state here, not a problem.
  if (friction && friction !== "logged out") {
    await page.close();
    return { links: [], stopped: friction };
  }

  const links = new Set();
  for (let i = 0; i < passes; i++) {
    const found = await page
      .evaluate(() =>
        [...document.querySelectorAll("a[href]")]
          .map((a) => a.href)
          .filter((h) => /\/video\/|\/reel\/|\/p\/|watch\?v=|\/shorts\//.test(h)),
      )
      .catch(() => []);
    found.forEach((h) => links.add(h));
    await scroll(page, { absorbed: chance(0.35) });
    await sleep(around(1600, 600, 600, 3600));
  }

  await page.close();
  return { links: [...links], stopped: null };
}
