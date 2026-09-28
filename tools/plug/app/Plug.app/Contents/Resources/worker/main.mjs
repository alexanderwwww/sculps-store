/**
 * plug's worker. Brick three.
 *
 * This file does exactly two things and is not allowed to grow past them until
 * each is proved on his real accounts:
 *
 *   1. It knows whether he is signed into each marketplace, and says so.
 *   2. It reads each shelf and reports what is on it.
 *
 * There is no listing, no negotiating and no offering in here yet. Every one of
 * those is a brick, each with a test that drives it, laid only once the brick
 * under it stands. The last app was built by carrying a whole worker across
 * from another app and then finding out which of its assumptions were wrong,
 * one build at a time, on his Mac. Not again.
 *
 * What the window and this file say to each other is small on purpose:
 *   window -> here   {t:"hello"}                 the page is up
 *   here -> window   {t:"window", do:"state"}    what to show
 *   here -> page     ask("read", {what, site})   through the bridge
 */
import { fileURLToPath } from "node:url";
import { startBridge } from "./bridge.mjs";

/*
 * The two shops.
 *
 * `home` is where a pass starts on that site: the screen that proves whether
 * he is in, and the one the shelf reads from. The pane id matches the window's
 * paneSlots, and that is the only thing tying this file to the Swift.
 */
export const SITES = [
  {
    id: "depop",
    name: "Depop",
    home: "https://www.depop.com/messages/",
    shelf: "https://www.depop.com/alleqsh/",
  },
  {
    id: "vestiaire",
    name: "Vestiaire",
    home: "https://www.vestiairecollective.com/my-account/",
    shelf: "https://www.vestiairecollective.com/my-account/products/",
  },
];

/* Long enough for a page to settle, short enough that nothing feels stuck.
   There is no performance of being a person here: what keeps the accounts safe
   is the caps, which are arithmetic, and they arrive with a later brick. */
const SETTLE_MS = Number(process.env.PLUG_SETTLE_MS ?? 600);
const sleep = (ms) => new Promise((go) => setTimeout(go, ms));

/**
 * What one site is doing right now.
 *
 * `signedIn` is deliberately three-valued. Unknown is not false: a shut door
 * and a page that has not answered yet look identical from here, and calling
 * one the other is how an app reports a quiet shop to a man who is locked out.
 */
function blankShop(site) {
  return {
    id: site.id,
    name: site.name,
    signedIn: null,
    who: null,
    listings: [],
    doing: null,
    trouble: null,
  };
}

export function makeState() {
  return { shops: SITES.map(blankShop), at: Date.now() };
}

/**
 * One pass over one site.
 *
 * Returns the shop's state rather than mutating anything, so it can be driven
 * by a test with a fake page and the result read directly. Every failure comes
 * back as `trouble` — a sentence — because a pass that dies quietly is the one
 * failure that tells nobody anything.
 */
export async function passOne(page, site, { settleMs = SETTLE_MS } = {}) {
  const shop = blankShop(site);

  shop.doing = `opening ${site.name}`;
  try {
    await page.ask("goto", { url: site.home, pane: site.id });
    await sleep(settleMs);

    /*
     * Signed in, before anything else means anything.
     *
     * Reading a logged-out page and reporting an empty shelf is the worst lie
     * this app can tell, because a shut door looks exactly like a quiet day.
     */
    const who = await page.ask("read", { what: "accountStatus", pane: site.id });
    /*
     * An answer that does not contain the word is not an answer.
     *
     * The bridge replies {ok:true} to anything it does not recognise, so a
     * renamed act, a page without the site module, or a reader that threw all
     * come back as a perfectly shaped object with no `signedIn` in it. Reading
     * that as false reports him signed OUT of a shop he is signed into — or,
     * worse on a later brick, reports an empty shelf for a shop full of stock.
     * Unknown has to stay unknown.
     */
    if (!who || typeof who !== "object" || typeof who.signedIn !== "boolean") {
      shop.trouble = `${site.name} did not answer`;
      shop.doing = null;
      return shop;
    }
    shop.signedIn = who.signedIn;
    shop.who = who.who ?? null;
    if (!shop.signedIn) {
      shop.doing = null;
      shop.trouble = `not signed into ${site.name} — open me and sign in`;
      return shop;
    }

    shop.doing = `reading the ${site.name} shelf`;
    await page.ask("goto", { url: site.shelf, pane: site.id });
    await sleep(settleMs);
    const rows = await page.ask("read", { what: "listings", pane: site.id });
    shop.listings = Array.isArray(rows) ? rows : [];
    shop.doing = null;
    return shop;
  } catch (error) {
    shop.doing = null;
    shop.trouble = `${site.name}: ${error?.message ?? "something went wrong"}`;
    return shop;
  }
}

/** Both shops, one after the other. One site being shut never stops the other. */
export async function passAll(page, sites = SITES, options = {}) {
  const shops = [];
  for (const site of sites) shops.push(await passOne(page, site, options));
  return { shops, at: Date.now() };
}

/* Everything below only runs when this file is the program, so a test can
   import the pass without starting a bridge or a timer. */
const isProgram = process.argv[1]
  && fileURLToPath(import.meta.url) === process.argv[1];

if (isProgram) {
  let state = makeState();
  let bridge;
  let passing = false;

  const show = () => {
    if (!bridge) return;
    bridge.window("state", { shops: state.shops, at: state.at });
  };

  async function round() {
    if (passing || !bridge) return;
    passing = true;
    try {
      state = await passAll(bridge);
      show();
    } finally {
      passing = false;
    }
  }

  bridge = await startBridge({
    /* fileURLToPath, never `.pathname`: the worker lives in "Application
       Support", and a URL pathname percent-encodes that space — so the bridge
       looked for agent.built.js under "Application%20Support", never found it,
       and answered 500 while listening perfectly well. */
    dir: fileURLToPath(new URL(".", import.meta.url)),
    onMessage(message) {
      /* A greeting is news, never a trigger. The page greets on every load and
         a pass begins with a navigation, so starting work on a greeting is a
         loop that reloads the window about once a second. The timer below is
         the only thing that starts a pass. */
      if (message?.t === "hello") show();
    },
  });

  console.log(`PORT ${bridge.port}`);
  show();

  /* Nothing is awaited at the top level after this point. A top-level await on
     anything that talks to another process takes every timer below it with it
     when it hangs, and the app looks dead while the worker is perfectly alive. */
  round();
  setInterval(round, Number(process.env.PLUG_ROUND_MS ?? 20_000));
}
