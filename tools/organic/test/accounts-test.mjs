/**
 * The account reader, against stubbed sites.
 *
 * The browser has no network here, so every site is served by a route
 * handler with markup shaped like the real thing. What is being proven:
 * a session cookie reads as connected and its absence does not; Instagram's
 * handle comes from the current_user endpoint; YouTube's handle is never
 * the mailbox address printed on the same page.
 */
import { chromium } from "playwright";
import { signedIn, whoAmI, loginUrl, homeUrl } from "../worker/accounts.mjs";

let bad = 0;
const ok = (n, good, extra = "") => {
  console.log(`${good ? "  ok  " : "FAIL  "}${n}${extra ? " — " + extra : ""}`);
  if (!good) bad++;
};

const html = (body) => `<!doctype html><html><head><meta charset="utf-8"><title>stub</title></head><body>${body}</body></html>`;

const SITES = [
  {
    match: (u) => u.pathname.startsWith("/api/v1/accounts/current_user"),
    reply: { contentType: "application/json", body: JSON.stringify({ user: { username: "blackreaper.us" } }) },
  },
  {
    match: (u) => u.hostname.endsWith("instagram.com") && u.pathname.startsWith("/accounts/login"),
    reply: { contentType: "text/html", body: html('<form><input name="username"><input name="password" type="password"><button>Log In</button></form>') },
  },
  {
    match: (u) => u.hostname.endsWith("instagram.com"),
    reply: { contentType: "text/html", body: html('<nav><svg aria-label="Home"></svg></nav><main>Instagram home</main>') },
  },
  {
    // /profile bounces a signed-in account to its own page. Client-side here:
    // a fulfilled 302 is followed by the browser over the real network, where
    // nothing answers, and the redirected request never reaches the route.
    match: (u) => u.hostname.endsWith("tiktok.com") && u.pathname === "/profile",
    reply: { contentType: "text/html", body: html('<script>location.replace("https://www.tiktok.com/@spooky.home");</script>') },
  },
  {
    match: (u) => u.hostname.endsWith("tiktok.com"),
    reply: { contentType: "text/html", body: html('<div data-e2e="profile-icon"></div><p>For You</p>') },
  },
  {
    match: (u) => u.hostname.endsWith("youtube.com") && u.pathname === "/account",
    reply: {
      contentType: "text/html",
      body: html(
        "<h1>Account</h1><p>Signed in as alex@gmail.com</p><p>Your channel</p><p>Black Reaper</p><p>@blackreaper</p><p>Send feedback to help@youtube.com</p>",
      ),
    },
  },
  {
    match: (u) => u.hostname.endsWith("youtube.com"),
    reply: { contentType: "text/html", body: html('<button id="avatar-btn"></button>') },
  },
  {
    match: (u) => u.hostname === "blank.test",
    reply: { contentType: "text/html", body: html("<p>nothing to see</p>") },
  },
];

async function serve(route) {
  const u = new URL(route.request().url());
  const site = SITES.find((s) => s.match(u));
  if (!site) return route.fulfill({ status: 404, contentType: "text/html", body: html("no stub for " + u.href) });
  return route.fulfill(site.reply);
}

const browser = await chromium.launch({
  executablePath: process.env.ORGANIC_CHROME || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  args: ["--no-sandbox", "--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});

/* Pure bits first. */
ok("loginUrl instagram", loginUrl("instagram") === "https://www.instagram.com/accounts/login/");
ok("loginUrl tiktok", loginUrl("tiktok") === "https://www.tiktok.com/login");
ok("loginUrl youtube", loginUrl("youtube") === "https://accounts.google.com/ServiceLogin?service=youtube&continue=https://www.youtube.com/");
ok("homeUrl", homeUrl("tiktok") === "https://www.tiktok.com/" && homeUrl("nope") === null);

/* Signed out: no cookie. */
{
  const ctx = await browser.newContext();
  await ctx.route("**/*", serve);
  const page = await ctx.newPage();

  await page.goto("https://www.instagram.com/accounts/login/", { waitUntil: "domcontentloaded" });
  const onLogin = await signedIn(page, "instagram");
  ok("instagram on its login page is not connected", onLogin.connected === false && onLogin.friction === null, JSON.stringify(onLogin));

  await page.goto("https://blank.test/", { waitUntil: "domcontentloaded" });
  const unknown = await signedIn(page, "instagram");
  ok("a page that looks like neither state is not connected", unknown.connected === false, JSON.stringify(unknown));
  ok("...and says it could not tell", /could not tell/.test(unknown.friction ?? ""), JSON.stringify(unknown));

  const nav = await signedIn(page, "tiktok", { navigate: true });
  ok("navigate:true lands on the platform home", /tiktok\.com/.test(page.url()), page.url());
  ok("tiktok without a cookie, marker-only, reads connected from the profile icon", nav.connected === true, JSON.stringify(nav));

  ok("unknown platform never throws", (await signedIn(page, "myspace")).connected === false);
  await ctx.close();
}

/* Signed in: the session cookie. */
{
  const ctx = await browser.newContext();
  await ctx.route("**/*", serve);
  await ctx.addCookies([
    { name: "sessionid", value: "1234567890abcdef", domain: ".instagram.com", path: "/" },
    { name: "sid_tt", value: "abcdefghijklmnop", domain: ".tiktok.com", path: "/" },
    { name: "SAPISID", value: "zyxwvutsrqponmlk", domain: ".google.com", path: "/" },
  ]);
  const page = await ctx.newPage();

  await page.goto("https://www.instagram.com/", { waitUntil: "domcontentloaded" });
  const ig = await signedIn(page, "instagram");
  ok("instagram with a sessionid cookie is connected", ig.connected === true && ig.friction === null, JSON.stringify(ig));

  const igHandle = await whoAmI(page, "instagram");
  ok("whoAmI instagram reads the current_user endpoint", igHandle === "@blackreaper.us", String(igHandle));

  const tt = await signedIn(page, "tiktok", { navigate: true });
  ok("tiktok with a sid_tt cookie is connected", tt.connected === true, JSON.stringify(tt));
  const ttHandle = await whoAmI(page, "tiktok");
  ok("whoAmI tiktok reads the handle from /profile's redirect", ttHandle === "@spooky.home", String(ttHandle));

  const yt = await signedIn(page, "youtube", { navigate: true });
  ok("youtube with a SAPISID cookie is connected", yt.connected === true, JSON.stringify(yt));
  const ytHandle = await whoAmI(page, "youtube");
  ok("whoAmI youtube returns the channel handle, not the email", ytHandle === "@blackreaper", String(ytHandle));
  ok("...and the page did contain the address", /alex@gmail\.com/.test(await page.evaluate(() => document.body.innerText)));
  ok("whoAmI leaves the page on the site", /youtube\.com/.test(page.url()), page.url());

  await ctx.close();
}

/* A cookie that is too short to be a session does not count. */
{
  const ctx = await browser.newContext();
  await ctx.route("**/*", serve);
  await ctx.addCookies([{ name: "sessionid", value: "short", domain: ".instagram.com", path: "/" }]);
  const page = await ctx.newPage();
  await page.goto("https://blank.test/", { waitUntil: "domcontentloaded" });
  const r = await signedIn(page, "instagram");
  ok("a stub of a cookie is not a session", r.connected === false, JSON.stringify(r));
  await ctx.close();
}

/* A page that has gone away never throws. */
{
  const ctx = await browser.newContext();
  await ctx.route("**/*", serve);
  const page = await ctx.newPage();
  await page.close();
  const r = await signedIn(page, "instagram");
  ok("signedIn on a closed page returns, does not throw", r.connected === false);
  ok("whoAmI on a closed page returns null", (await whoAmI(page, "instagram")) === null);
  await ctx.close();
}

await browser.close();
console.log(bad ? `\n${bad} failed` : "\nall passed");
process.exit(bad ? 1 : 0);
