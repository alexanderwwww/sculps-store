import { Screens } from "../worker/screens.mjs";
import { check, failures, testChrome, stubSites, until, sleep } from "./lib.mjs";
import { execSync } from "node:child_process";

const PORT = 9462;
const PROFILE = "/tmp/claude-0/organic-test-2";
execSync(`rm -rf ${PROFILE}`);
const page = `<html><body style="margin:0;background:#fff"><h1 style="font:40px sans-serif;color:#39FF7A">live</h1>
<script>let n=0;setInterval(()=>{document.querySelector('h1').textContent='tick '+(n++)},120)</script></body></html>`;
const guard = setTimeout(() => { console.log("HARD STOP"); process.exit(9); }, 90000);

const { browser } = await testChrome(PORT, PROFILE);
const screens = new Screens(browser, { hosts: { instagram: "ig.test", tiktok: "tt.test", youtube: "yt.test" } });
await stubSites(await screens.context(), { "ig.test": page, "tt.test": page, "yt.test": "<html><body style='background:#fff'><h1>a page that never repaints</h1></body></html>" });
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
check("a frame is base64 jpeg with a size", typeof f.jpeg === "string" && f.jpeg.startsWith("/9j/") && f.w > 0 && f.h > 0, `${f.w}x${f.h}`);
check("grid frames are 640 wide", f.w === 640, String(f.w));

const t0 = Date.now();
const n0 = frames.instagram.length;
await sleep(2000);
const fps = (frames.instagram.length - n0) / ((Date.now() - t0) / 1000);
check("throttled to about 8 fps", fps <= 9.5, fps.toFixed(1));

await screens.focus("instagram");
const big = await until(() => frames.instagram.findLast((x) => x.w > 640), 10000);
check("focus makes the frames full width", big && big.w >= 1000, big ? `${big.w}x${big.h}` : "none");
const small = frames.tiktok.at(-1);
check("the other screen stays small", small.w === 640, String(small.w));

await screens.focus(null);
const backCount = frames.instagram.length;
const back = await until(() => frames.instagram.length > backCount && frames.instagram.at(-1).w === 640, 10000);
check("unfocus returns to 640", Boolean(back));

const cursors = [];
screens.on("cursor", (c) => cursors.push(c));
await screens.cursor("instagram", 640, 450, "Reyna · looking");
check("cursor event is normalized", cursors.length === 1 && Math.abs(cursors[0].x - 0.5) < 0.05 && cursors[0].label === "Reyna · looking", JSON.stringify(cursors[0]));

// A page that has settled paints nothing; the first picture comes from a screenshot instead.
await screens.open("youtube", "http://yt.test/");
await sleep(1500);
check("startStream on a static page", await screens.startStream("youtube"));
const still = await until(() => frames.youtube.length >= 1, 5000);
check("a static page still gets a first frame", Boolean(still) && frames.youtube[0].w === 640, frames.youtube[0] ? `${frames.youtube[0].w}x${frames.youtube[0].h}` : "none");

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
