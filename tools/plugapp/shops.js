/**
 * The two marketplaces, as pages plug can actually drive.
 *
 * Each shop gets its own Electron session, named and persisted:
 *
 *     session.fromPartition("persist:depop")
 *
 * That is the whole sign-in problem solved, and it is worth saying why. On the
 * previous app the browser's cookie jar was derived from the process, so every
 * rebuild was a browser that had never heard of him — he signed in, a fix
 * shipped, and he was signed out again with nothing to explain it. A named
 * partition lives in the app's userData directory under a name WE choose. It
 * does not move when the binary changes, it does not move when the app is
 * rebuilt, and the two shops cannot see each other's cookies.
 *
 * The rule that follows from that: **the partition names below must never
 * change.** Not for a refactor, not for a tidy-up, not for a good reason.
 * Changing one signs him out of that marketplace and nothing on screen will
 * say why.
 */
const { WebContentsView, session } = require("electron");

/** The one route that works, per site, and where a pass starts. */
const SITES = {
  depop: {
    name: "Depop",
    partition: "persist:depop",
    signin: "https://www.depop.com/login/",
    home: "https://www.depop.com/messages/",
  },
  vestiaire: {
    name: "Vestiaire",
    partition: "persist:vestiaire",
    signin: "https://www.vestiairecollective.com/login/",
    home: "https://www.vestiairecollective.com/my-account/",
  },
};

/**
 * Take the two dead buttons off the sign-in sheet, on every page, for good.
 *
 * Continue with Google is refused outright inside an embedded browser, and
 * Continue with Apple hands it to iCloud which hands it back to the login
 * screen — forever, with no error and nothing to click. Leaving them on the
 * page is leaving two doors painted on a wall.
 *
 * Matched on the WORDS Google and Apple, never on the verb: his account is
 * served Greek, where the label is "Συνέχεια με την Google" — accented, which
 * is what defeated the first attempt at this. Short labels only, and Apple Pay
 * is excluded by hand.
 *
 * A MutationObserver keeps it true: both sites are React apps and re-render
 * their sheets, so a one-shot pass misses.
 */
const ONLY_EMAIL = `
(function () {
  if (window.__plugOnlyEmail) return;
  window.__plugOnlyEmail = true;
  function dead(t) {
    var s = (t || "").toLowerCase();
    if (s.indexOf("pay") >= 0) return false;
    return s.indexOf("google") >= 0 || s.indexOf("apple") >= 0;
  }
  function strip() {
    var nodes = document.querySelectorAll("button, a, [role=button]");
    for (var i = 0; i < nodes.length; i++) {
      var n = nodes[i];
      var t = (n.textContent || "").trim();
      if (t.length > 40 || !dead(t)) continue;
      var box = n.closest("li") || n;
      if (box && box.parentNode) box.parentNode.removeChild(box);
    }
  }
  strip();
  new MutationObserver(strip).observe(document.documentElement, { childList: true, subtree: true });
})();
`;

class Shop {
  constructor(id, win) {
    this.id = id;
    this.spec = SITES[id];
    this.win = win;
    this.view = new WebContentsView({
      webPreferences: {
        partition: this.spec.partition,
        contextIsolation: true,
        nodeIntegration: false,
        /* It is a real browsing context for a real site — nothing of ours is
           exposed to it, and nothing of it reaches the rest of the app. */
        sandbox: true,
      },
    });
    this.view.setVisible(false);
    win.contentView.addChildView(this.view);

    const wc = this.view.webContents;
    /* Every frame, not just the top one: both sites put parts of the sign-in
       sheet in iframes, and a script run only on the main document never
       reaches them — which is how a Continue with Google he could see was one
       the app had never touched. */
    const strip = () => {
      wc.executeJavaScript(ONLY_EMAIL).catch(() => {});
      for (const frame of wc.mainFrame?.framesInSubtree ?? []) {
        if (frame !== wc.mainFrame) frame.executeJavaScript(ONLY_EMAIL, true).catch(() => {});
      }
    };
    wc.on("dom-ready", strip);
    wc.on("did-frame-finish-load", strip);

    /*
     * Nothing opens a window he cannot see.
     *
     * A sign-in button that calls window.open in here produces a child window
     * with no chrome, off behind the phone — which is exactly what he
     * described: he pressed a button, something happened somewhere, and on
     * screen nothing moved and nothing was clickable. Popups are refused and
     * the URL is loaded in the same view instead, so every step of a sign-in
     * stays inside the glass.
     */
    wc.setWindowOpenHandler(({ url }) => {
      if (/^https?:/.test(url)) this.go(url).catch(() => {});
      return { action: "deny" };
    });
  }

  /** Put it on screen, inside the phone, below the app's own chrome. */
  show(bounds) {
    this.view.setBounds(bounds);
    this.view.setVisible(true);
    this.win.contentView.addChildView(this.view);
  }

  hide() {
    this.view.setVisible(false);
  }

  async go(url) {
    await this.view.webContents.loadURL(url);
  }

  /** Run something in the page and get the value back. */
  async ask(expression) {
    return this.view.webContents.executeJavaScript(expression, true);
  }

  /**
   * Signed in, in layers, because both sites serve a stranger and an owner
   * much of the same furniture.
   *
   * A password box on screen is a definite no. A seller-only control is a yes.
   * Anything else is UNKNOWN, never false — "probably signed out" is how an
   * app reports an empty shelf for a shop full of stock, and that is the worst
   * lie it can tell him.
   */
  async accountStatus() {
    const shows = this.id === "depop"
      ? ['a[href*="/messages"]', 'a[href="/sell/"]', '[data-testid*="account" i]']
      : ['a[href*="/me/"]', 'a[href*="/sell"]', 'a[href*="/my-orders"]', '[data-testid*="account" i]'];
    const expression = `(function () {
      if (/\\/login|\\/signup|\\/connexion/.test(location.pathname)) return { signedIn: false };
      if (document.querySelector('input[type="password"]')) return { signedIn: false };
      var sel = ${JSON.stringify(shows)};
      for (var i = 0; i < sel.length; i++) {
        try { if (document.querySelector(sel[i])) return { signedIn: true }; } catch (e) {}
      }
      return {};
    })()`;
    const answer = await this.ask(expression).catch(() => ({}));
    return typeof answer?.signedIn === "boolean" ? answer : {};
  }
}

module.exports = { SITES, Shop, ONLY_EMAIL };
