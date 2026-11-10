#!/usr/bin/env python3
"""ORAKTYS daily, two steps so Claude writes a headline per clip (Alex 2026-11-10: IGN-style red headline).
  daily.py pick 3                  -> downloads the best fresh GTA clips, prints [{slug, streamer, title, said}]
  daily.py make <slug> "HEADLINE"  -> cuts the Short with the red headline, uploads to R2, marks the clip used, prints {url,...}
GTA 6 clips weigh 8x. Never repeats a clip (list in R2 oraktys-used.json, read via wrangler: the public URL is cached a year)."""
import json, subprocess, sys, os, urllib.request, re
HERE = os.path.dirname(os.path.abspath(__file__)); WORK = "/tmp/oraktys"; os.makedirs(WORK, exist_ok=True)
def sh(*c, **k): return subprocess.run(c, capture_output=True, text=True, **k)
def gql(game, period="LAST_DAY"):
    q = {"query": '{ game(name: "%s") { clips(first: 40, criteria: {period: %s, sort: VIEWS_DESC}) { edges { node { slug title viewCount durationSeconds language broadcaster { login displayName } } } } } }' % (game, period)}
    r = urllib.request.Request("https://gql.twitch.tv/gql", json.dumps(q).encode(), {"Client-Id": "kimne78kx3ncx6brgo4mv6wki5h1ko", "content-type": "application/json"})
    return [e["node"] for e in json.load(urllib.request.urlopen(r, timeout=20))["data"]["game"]["clips"]["edges"]]
def kick(cat):
    try:
        r = urllib.request.Request(f"https://kick.com/api/v2/categories/{cat}/clips?sort=view&time=week", headers={"User-Agent": "Mozilla/5.0"})
        cs = json.load(urllib.request.urlopen(r, timeout=20))["clips"]
    except Exception: return []
    return [{"slug": "kick-" + c["id"], "title": c["title"], "viewCount": c.get("views") or 0, "durationSeconds": c.get("duration") or 0, "six": True,
             "broadcaster": {"login": c["channel"]["slug"], "displayName": c["channel"]["username"]}, "src_url": c["video_url"], "kick": True} for c in cs]
def used_get():
    f = os.path.join(WORK, "used-in.json"); sh("npx", "wrangler", "r2", "object", "get", "gardenbuddy-media/oraktys-used.json", "--file", f, "--remote", timeout=120)
    try: return set(json.load(open(f)))
    except Exception: return {"ResourcefulBlazingKumquatPraiseIt-dbnC1oRVhIZpi3Bp"}
def used_put(u):
    f = os.path.join(WORK, "used.json"); open(f, "w").write(json.dumps(sorted(u)))
    return sh("npx", "wrangler", "r2", "object", "put", "gardenbuddy-media/oraktys-used.json", "--file", f, "--content-type", "application/json", "--remote", timeout=120).returncode == 0
def pick(n):
    used = used_get()
    # Alex 2026-11-10: 80% GTA 6, 20% GTA 5. GTA 6 = Twitch + Kick "GTA VI" categories (week, 30+ views) or a GTA 6 title.
    six = [dict(c, six=True, src_url="https://clips.twitch.tv/" + c["slug"]) for c in gql("Grand Theft Auto VI", "LAST_WEEK") if (c.get("language") or "").lower() == "en"]
    six += kick("grand-theft-auto-vi")
    five = [dict(c, six=bool(re.search(r"gta ?(6|vi)\b", c["title"], re.I)), src_url="https://clips.twitch.tv/" + c["slug"]) for c in gql("Grand Theft Auto V") if (c.get("language") or "").lower() == "en"]
    ok = lambda c: c["slug"] not in used and c["durationSeconds"] >= 15
    six = sorted([c for c in six + [c for c in five if c["six"]] if ok(c) and c["viewCount"] >= 30], key=lambda c: -c["viewCount"])
    five = sorted([c for c in five if ok(c) and not c["six"] and c["durationSeconds"] >= 20], key=lambda c: -c["viewCount"])
    want6 = max(1, round(n * 0.8)) if n > 1 else 1
    cands = six[:want6] + five + six[want6:]   # GTA 6 first; GTA 5 fills whatever GTA 6 cannot
    out = []
    for c in cands:
        if len(out) >= n: break
        src = os.path.join(WORK, c["slug"] + ".mp4")
        if not os.path.exists(src):
            dl = ["yt-dlp", "-q", "-o", src, c["src_url"]] if "twitch" in c["src_url"] else ["ffmpeg", "-v", "error", "-y", "-i", c["src_url"], "-c", "copy", src]
            if sh(*dl, timeout=300).returncode or not os.path.exists(src): continue
        json.dump(c, open(src + ".json", "w"))
        said = ""
        try:
            from faster_whisper import WhisperModel
            segs, info = WhisperModel("tiny", compute_type="int8").transcribe(src)
            said = " ".join(x.text.strip() for x in segs)[:400]
            if info.language != "en" or len(said.split()) < 25: continue   # junk: not English, or nobody talking
        except Exception: pass
        out.append({"slug": c["slug"], "streamer": c["broadcaster"]["login"], "title": c["title"], "views": c["viewCount"], "gta6": c["six"], "platform": "kick" if c.get("kick") else "twitch", "said": said})   # write the headline from what is SAID
    print(json.dumps(out, ensure_ascii=False, indent=1))
def make(slug, headline):
    src = os.path.join(WORK, slug + ".mp4"); c = json.load(open(src + ".json")); dst = src.replace(".mp4", "-short.mp4")
    r = sh("python3", os.path.join(HERE, "clip.py"), src, dst, "--headline", headline, timeout=900)
    if r.returncode or not os.path.exists(dst): sys.exit("clip failed: " + r.stderr[-500:])
    meta = json.loads([l for l in r.stdout.splitlines() if l.startswith("{")][-1])
    key = "oraktys-" + re.sub(r"[^a-z0-9]+", "-", slug.lower())[:50] + ".mp4"
    if sh("npx", "wrangler", "r2", "object", "put", "gardenbuddy-media/" + key, "--file", dst, "--content-type", "video/mp4", "--remote", timeout=300).returncode: sys.exit("upload failed")
    u = used_get(); u.add(slug); used_put(u)
    print(json.dumps({"url": "https://blackreaper.us/media/" + key, "credit": ("kick.com/" if c.get("kick") else "twitch.tv/") + c["broadcaster"]["login"], "streamer": c["broadcaster"]["login"], "title": c["title"], "said": meta["text"][:300]}, ensure_ascii=False))
if __name__ == "__main__":
    if sys.argv[1] == "pick": pick(int(sys.argv[2]) if len(sys.argv) > 2 else 3)
    elif sys.argv[1] == "make": make(sys.argv[2], sys.argv[3])
