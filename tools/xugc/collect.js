/**
 * Collect: turns a list of public video links into a pile of short training pieces, on Alex's Mac.
 * link -> download (yt-dlp) -> find the cuts (ffmpeg) -> keep 3-6 s pieces that have real sound -> delete the original.
 * Pieces stay in the app's data folder and never leave the Mac; sources.json says where each piece came from.
 */
const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");

const MAX_PER_VIDEO = 8, MIN_S = 3, MAX_S = 6, MIN_DB = -45; // a piece quieter than this has no real sound

/** "url | platform | creator | category | place | seconds | sound | what happens" lines, or bare urls. */
function parseLinks(text) {
  const out = [], seen = new Set();
  for (const line of String(text || "").split(/\r?\n/)) {
    const p = line.split("|").map((x) => x.trim());
    const m = /^(https?:\/\/\S+)/.exec(p[0] || "");
    if (!m) continue;
    const url = m[1], id = (/\/(?:video|reel|reels|p)\/([A-Za-z0-9_-]+)/.exec(url) || [])[1];
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push({ id, url, platform: p[1] || (/instagram/.test(url) ? "instagram" : "tiktok"), creator: p[2] || "", category: p[3] || "", place: p[4] || "", sound: p[6] || "", note: p[7] || "" });
  }
  return out;
}

function run(bin, args, { signal } = {}) {
  return new Promise((resolve, reject) => {
    const c = spawn(bin, args, { stdio: ["ignore", "pipe", "pipe"] });
    let out = "", err = "";
    c.stdout.on("data", (d) => (out += d)); c.stderr.on("data", (d) => (err += d));
    const stop = () => c.kill("SIGKILL");
    if (signal) signal.addEventListener("abort", stop, { once: true });
    c.on("error", reject);
    c.on("close", (code) => resolve({ code, out, err }));
  });
}

/** Cut times (seconds) of a video: where the picture changes. */
async function sceneCuts(ff, file, dur, o) {
  const r = await run(ff, ["-hide_banner", "-i", file, "-vf", "select='gt(scene,0.35)',showinfo", "-an", "-f", "null", "-"], o);
  const cuts = [...r.err.matchAll(/pts_time:([0-9.]+)/g)].map((m) => Number(m[1])).filter((t) => t > 0.4 && t < dur - 0.4);
  return [0, ...cuts, dur];
}

/** Turn the shots into pieces of MIN_S..MAX_S seconds: long shots are split, short neighbours are not used. */
function planPieces(bounds) {
  const out = [];
  for (let i = 0; i + 1 < bounds.length; i++) {
    let a = bounds[i]; const b = bounds[i + 1];
    while (b - a >= MIN_S) {
      const len = b - a <= MAX_S ? b - a : b - a >= MAX_S + MIN_S ? MAX_S : b - a - MIN_S; // never leave a stub shorter than MIN_S
      out.push({ at: Math.round(a * 100) / 100, len: Math.round(Math.min(len, MAX_S) * 100) / 100 });
      a += Math.min(len, MAX_S);
    }
  }
  return out;
}

async function probe(ff, file, o) {
  const r = await run(ff, ["-hide_banner", "-i", file], o);
  const d = /Duration:\s*(\d+):(\d+):([\d.]+)/.exec(r.err);
  const dur = d ? Number(d[1]) * 3600 + Number(d[2]) * 60 + Number(d[3]) : 0;
  const v = /Video:.*?(\d{2,5})x(\d{2,5})/.exec(r.err);
  return { dur, audio: /Audio:/.test(r.err), w: v ? Number(v[1]) : 0, h: v ? Number(v[2]) : 0 };
}

async function meanDb(ff, file, o) {
  const r = await run(ff, ["-hide_banner", "-i", file, "-vn", "-af", "volumedetect", "-f", "null", "-"], o);
  const m = /mean_volume:\s*(-?[\d.]+) dB/.exec(r.err);
  return m ? Number(m[1]) : -99;
}

class Collector {
  /** @param {{dir: string, ffmpeg: string, ytdlp: string, download?: Function}} o  download(url, outBase, signal) -> file path */
  constructor(o) {
    this.pile = path.join(o.dir, "pile"); this.ff = o.ffmpeg; this.yt = o.ytdlp;
    this.download = o.download || ((u, base, signal) => this.ytdlpDownload(u, base, signal));
    fs.mkdirSync(this.pile, { recursive: true });
  }
  sources() { try { return JSON.parse(fs.readFileSync(path.join(this.pile, "sources.json"), "utf8")); } catch { return []; } }
  saveSources(s) { fs.writeFileSync(path.join(this.pile, "sources.json"), JSON.stringify(s, null, 1)); }
  count() { const s = this.sources(); return { videos: s.length, pieces: s.reduce((n, x) => n + (x.pieces || []).length, 0) }; }
  /** remove one creator's (or one video's) pieces for good, e.g. if a creator asks */
  remove(match) {
    const s = this.sources(), keep = [];
    for (const x of s) { if (x.id === match || x.creator === match) fs.rmSync(path.join(this.pile, x.id), { recursive: true, force: true }); else keep.push(x); }
    this.saveSources(keep); return s.length - keep.length;
  }
  async ytdlpDownload(url, base, signal) {
    const r = await run(this.yt, ["--no-warnings", "-q", "--no-playlist", "-f", "best[height<=1080]/best", "-o", base + ".%(ext)s", url], { signal });
    const f = fs.readdirSync(path.dirname(base)).find((n) => n.startsWith(path.basename(base) + "."));
    if (r.code !== 0 || !f) throw new Error((r.err.split("\n").filter(Boolean).pop() || "download failed").slice(0, 160));
    return path.join(path.dirname(base), f);
  }
  /** one link -> pieces. Returns {ok, pieces} or {ok:false, why}. */
  async one(item, signal) {
    const o = { signal }, tmp = path.join(this.pile, `_tmp-${item.id}`);
    fs.mkdirSync(tmp, { recursive: true });
    let file;
    try {
      file = await this.download(item.url, path.join(tmp, "src"), signal);
      const info = await probe(this.ff, file, o);
      if (!info.dur || info.dur < MIN_S) return { ok: false, why: "too short" };
      if (!info.audio) return { ok: false, why: "no sound" };
      if (info.h && info.w && info.h < info.w) return { ok: false, why: "not vertical" };
      let plan = planPieces(await sceneCuts(this.ff, file, info.dur, o));
      if (plan.length > MAX_PER_VIDEO) plan = Array.from({ length: MAX_PER_VIDEO }, (_, k) => plan[Math.floor((k * plan.length) / MAX_PER_VIDEO)]); // spread, so one long video does not dominate
      const dir = path.join(this.pile, item.id); fs.mkdirSync(dir, { recursive: true });
      const pieces = [];
      for (const p of plan) {
        if (signal && signal.aborted) throw new Error("stopped");
        const name = `${String(pieces.length + 1).padStart(2, "0")}.mp4`, out = path.join(dir, name);
        const r = await run(this.ff, ["-hide_banner", "-y", "-ss", String(p.at), "-i", file, "-t", String(p.len), "-vf", "scale='min(720,iw)':-2,fps=24", "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-c:a", "aac", "-b:a", "128k", "-ar", "44100", out], o);
        if (r.code !== 0) continue;
        const db = await meanDb(this.ff, out, o);
        if (db < MIN_DB) { fs.rmSync(out, { force: true }); continue; } // music-less silence: no real sound to learn
        pieces.push({ file: name, at: p.at, seconds: p.len, db: Math.round(db) });
      }
      if (!pieces.length) { fs.rmSync(dir, { recursive: true, force: true }); return { ok: false, why: "no usable pieces" }; }
      const s = this.sources().filter((x) => x.id !== item.id);
      s.push({ ...item, got: new Date().toISOString(), seconds: Math.round(info.dur), pieces }); this.saveSources(s);
      return { ok: true, pieces: pieces.length };
    } catch (e) { return { ok: false, why: String(e.message || e).slice(0, 160) }; }
    finally { fs.rmSync(tmp, { recursive: true, force: true }); } // the original never stays
  }
  /** @param {object[]} items  @param {(p: object) => void} onProgress */
  async all(items, onProgress, signal) {
    const have = new Set(this.sources().map((x) => x.id)), res = { done: 0, skipped: 0, failed: [], pieces: 0 };
    let n = 0;
    for (const it of items) {
      n++;
      if (signal && signal.aborted) break;
      if (have.has(it.id)) { res.skipped++; onProgress && onProgress({ n, of: items.length, id: it.id, state: "have" }); continue; }
      onProgress && onProgress({ n, of: items.length, id: it.id, creator: it.creator, state: "working" });
      const r = await this.one(it, signal);
      if (r.ok) { res.done++; res.pieces += r.pieces; } else res.failed.push({ id: it.id, url: it.url, why: r.why });
      onProgress && onProgress({ n, of: items.length, id: it.id, creator: it.creator, state: r.ok ? "ok" : "failed", why: r.why, pieces: r.pieces, totals: this.count() });
    }
    return res;
  }
}

module.exports = { Collector, parseLinks, planPieces, MIN_S, MAX_S };
