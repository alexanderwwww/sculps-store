/**
 * The phone, as the crew holds it.
 *
 * One window, one page, one thing happening at a time — so this is a small
 * flat surface rather than a browser API: go somewhere, scroll, tap, type,
 * read, say who is working. Every call goes through the bridge and every call
 * comes back, even when the answer is "no".
 *
 * The rhythm is not decided here. `human.mjs` says how long a person looks at
 * something and how fast they type; this only carries it out.
 */
import { keystrokes, between, around } from "./human.mjs";

export class Phone {
  constructor(bridge) {
    this.bridge = bridge;
    this.where = null;     // the url the page last reported
    this.platform = null;  // instagram | tiktok | youtube | market | null
    this.signedIn = false;
    this.handle = null;
    this.stopped = false;
  }

  /** What the page said about itself the last time it loaded. */
  sawPage({ url, platform, signedIn, handle }) {
    this.where = url ?? this.where;
    this.platform = platform ?? this.platform;
    this.signedIn = Boolean(signedIn);
    this.handle = handle ?? null;
  }

  /**
   * Put the window on an account's own cookie jar, and open a page in it.
   *
   * Two accounts sharing one jar are one account, so this is what makes a
   * second Instagram a second Instagram. The window rebuilds its view on that
   * jar, the crew is injected again, and the page loads into it.
   */
  async profile(profileId, url) {
    if (!profileId) return this.goto(url);
    this.bridge.window("profile", { id: profileId, url });
    // The view is rebuilt, so the page says hello again when it is ready.
    await new Promise((r) => setTimeout(r, 1200));
    return { ok: true };
  }

  async goto(url, { ms = 30000 } = {}) {
    // The window owns navigation: Swift calls load() so a page that refuses
    // to be scripted is still reachable.
    this.bridge.window("load", { url });
    const landed = await this.bridge.ask("goto", { url }, { ms });
    return landed;
  }

  /** A human scroll: bursts and pauses, never one jump. */
  async scroll(px, { pace = "read" } = {}) {
    if (this.stopped) return { ok: false, error: "stopped" };
    return this.bridge.ask("scroll", { px, pace }, { ms: 30000 });
  }

  /**
   * Press something the page found for us.
   *
   * `what` is a recipe name the crew's code knows — "like", "comment",
   * "next", "profile" — or a point. The page moves the cursor there first,
   * which is the part Alex watches.
   */
  async tap(what, { who = null, ms = 15000 } = {}) {
    if (this.stopped) return { ok: false, error: "stopped" };
    return this.bridge.ask("tap", typeof what === "string" ? { target: what, who } : { at: what, who }, { ms });
  }

  /**
   * Type like a person: the delays and the typos come from the persona, and
   * they are sent with the text so the page does not invent a rhythm of its
   * own.
   */
  async type(text, { into = "comment", persona = null, who = null } = {}) {
    if (this.stopped) return { ok: false, error: "stopped" };
    const strokes = keystrokes(String(text), persona ?? {});
    return this.bridge.ask("type", { into, strokes, who }, { ms: 60000 });
  }

  /**
   * Open a supplier conversation by the exact name the list printed.
   *
   * No fuzzy matching: a thread is about to receive a real message under his
   * name, so if the page cannot find that exact supplier it says so.
   */
  async openThread(name, { site = null, ms = 30000 } = {}) {
    if (this.stopped) return { ok: false, error: "stopped" };
    return this.bridge.ask("openThread", { name: String(name), site }, { ms });
  }

  /**
   * Press send on a message that is already typed.
   *
   * Deliberately separate from `type`: the brain only reaches this after the
   * outbox has released an approved draft, and nothing here can compose text
   * of its own.
   */
  async send({ site = null, to = null, ms = 30000 } = {}) {
    if (this.stopped) return { ok: false, error: "stopped" };
    return this.bridge.ask("send", { site, to }, { ms });
  }

  /** Read something out of the page. `what` is a reader the crew's code has. */
  async read(what, args = {}) {
    const answer = await this.bridge.ask("read", { what, ...args }, { ms: 15000 });
    return answer?.ok ? answer.result : null;
  }

  /** Watch something for a while, with the cursor breathing where it is. */
  async dwell(ms) {
    return this.bridge.ask("dwell", { ms }, { ms: ms + 5000 });
  }

  /** Who is working, in the phone's own ticker. */
  async say(who, what) {
    return this.bridge.ask("say", { who, what }, { ms: 5000 });
  }

  /** Move the cursor somewhere without pressing anything. */
  async cursor(x, y, label) {
    return this.bridge.ask("cursor", { x, y, label }, { ms: 8000 });
  }

  /** The sheet inside the glass. */
  async panel(show, state = {}) {
    return this.bridge.ask("panel", { show, ...state }, { ms: 8000 });
  }

  /** Everything stops now: the page drops what it is doing mid-action. */
  async stop() {
    this.stopped = true;
    return this.bridge.ask("stop", {}, { ms: 5000 });
  }

  resume() {
    this.stopped = false;
  }

  /** A pause a person would take, from human.mjs rather than a constant. */
  async beat(lo = 700, hi = 2400) {
    await new Promise((r) => setTimeout(r, around((lo + hi) / 2, (hi - lo) / 3, lo, hi)));
  }

  async pause(lo, hi) {
    await new Promise((r) => setTimeout(r, between(lo, hi)));
  }
}
