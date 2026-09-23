import { Screens } from "../worker/screens.mjs";
import { check, failures, testChrome, stubSites, until, sleep } from "./lib.mjs";
import { execSync } from "node:child_process";

const PORT = 9462;
const PROFILE = "/tmp/claude-0/organic-test-2";
execSync(`rm -rf ${PROFILE}`);
const page = `<html><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body style="margin:0;background:#fff"><h1 style="font:40px sans-serif;color:#39FF7A">live</h1>
<script>let n=0;setInterval(()=>{document.querySelector('h1').textContent='tick '+(n++)},120)</script></body></html>`;
const guard = setTimeout(() => { console.log("HARD STOP"); process.exit(9); }, 90000);

const { browser } = await testChrome(PORT, PROFILE);
const screens = new Screens(browser, { hosts: { instagram: "ig.test", tiktok: "tt.test", youtube: "yt.test" } });
await stubSites(await screens.context(), { "ig.test": page, "tt.test": page, "yt.test": "<html><head><meta name='viewport' content='width=device-width, initial-scale=1'></head><body style='background:#fff'><h1>a page that never repaints</h1></body></html>" });
await screens.adopt();
await screens.open("instagram", "http://ig.test/");
await screens.open("tiktok", "http://tt.test/");

const frames = { instagram: [], tiktok: [], youtube: [] };
screens.on("frame", (f) => frames[f.id]?.push(f));
check("startStream", await screens.startStream("instagram", { width: 640, quality: 40, fps: 8 }));
check("startStream (second screen)", await screens.startStream("tiktok"));

await until(() => frames.instagram.length >= 3 && frames.tiktok.length >= 3, 15000);
check("frames arrive for both screens", frames.instagram.length >= 3 && frames.tiktok.length >= 3, `${frames.instagram.length}/${frames.tiktok.length}`);
const f = frames.instagram.at(-1);
const g = frames.tiktok.at(-1);
// Every account screen is an iPhone now: 390 CSS pixels wide, and the
// screencast hands over CSS pixels, so that is the frame — asking for more
// cannot invent any. A phone drawn at phone size is exactly 1:1.
check("a phone screen streams at phone size", g.w === 390 && g.h === 844, `${g.w}x${g.h}`);
check("a frame is base64 jpeg with a size", typeof f.jpeg === "string" && f.jpeg.startsWith("/9j/") && f.w > 0 && f.h > 0, `${f.w}x${f.h}`);
check("asking for a wider frame does not stretch the phone", f.w === 390, String(f.w));

const t0 = Date.now();
const n0 = frames.instagram.length;
await sleep(2000);
const fps = (frames.instagram.length - n0) / ((Date.now() - t0) / 1000);
check("throttled to about 8 fps", fps <= 9.5, fps.toFixed(1));

await screens.focus("instagram");
const beforeFocus = frames.instagram.length;
const focused = await until(() => frames.instagram.length > beforeFocus && frames.instagram.at(-1), 10000);
check("the focused screen keeps streaming", Boolean(focused) && focused.w === 390, focused ? `${focused.w}x${focused.h}` : "none");
// Nobody is looking at the others while one fills the window, so they stop
// streaming entirely — those frames are what the focused one needs.
const tiktokBefore = frames.tiktok.length;
await sleep(1200);
check("the other screens stop streaming while one is focused", frames.tiktok.length === tiktokBefore, `${frames.tiktok.length - tiktokBefore} extra`);

await screens.focus(null);
const backCount = frames.instagram.length;
const back = await until(() => frames.instagram.length > backCount && frames.instagram.at(-1).w === 390, 10000);
check("unfocus keeps it a phone", Boolean(back));
const resumed = await until(() => frames.tiktok.length > tiktokBefore, 10000);
check("and the other screens start again", Boolean(resumed));

const cursors = [];
screens.on("cursor", (c) => cursors.push(c));
await screens.cursor("instagram", 195, 422, "Reyna · looking"); // the middle of a 390x844 phone
check("cursor event is normalized", cursors.length === 1 && Math.abs(cursors[0].x - 0.5) < 0.05 && Math.abs(cursors[0].y - 0.5) < 0.05 && cursors[0].label === "Reyna · looking", JSON.stringify(cursors[0]));

// A page that has settled paints nothing; the first picture comes from a screenshot instead.
await screens.open("youtube", "http://yt.test/");
await sleep(1500);
check("startStream on a static page", await screens.startStream("youtube"));
const still = await until(() => frames.youtube.length >= 1, 5000);
check("a static page still gets a first frame", Boolean(still) && frames.youtube[0].w === 390, frames.youtube[0] ? `${frames.youtube[0].w}x${frames.youtube[0].h}` : "none");

await screens.stopStream("instagram");
const stoppedAt = frames.instagram.length;
await sleep(700);
check("stopStream stops frames", frames.instagram.length === stoppedAt);

clearTimeout(guard);
await screens.dispose();
await browser.close().catch(() => {});
execSync(`fuser -k ${PORT}/tcp 2>/dev/null || true`);
console.log(failures() ? `\n${failures()} FAILED` : "\nall passed");
process.exit(failures() ? 1 : 0);
