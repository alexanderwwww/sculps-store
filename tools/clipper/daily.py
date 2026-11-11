#!/usr/bin/env python3
"""ORAKTYS daily, two steps so Claude writes a headline per clip (Alex 2026-11-10: IGN-style red headline).
  daily.py pick 3                  -> downloads the best fresh GTA clips, prints [{slug, streamer, title, said}]
  daily.py make <slug> "HEADLINE"  -> cuts the Short with the red headline, uploads to R2, marks the clip used, prints {url,...}
GTA 6 clips weigh 8x. Never repeats a clip (list in R2 oraktys-used.json, read via wrangler: the public URL is cached a year)."""
import json, subprocess, sys, os, urllib.request, re
HERE = os.path.dirname(os.path.abspath(__file__)); WORK = "/tmp/oraktys"; os.makedirs(WORK, exist_ok=True)
def sh(*c, **k): return subprocess.run(c, capture_output=True, text=True, **k)
def gql(game, period="LAST_DAY"):
    q = {"query": '{ game(name: "%s") { clips(first: 100, criteria: {period: %s, sort: VIEWS_DESC}) { edges { node { slug title viewCount durationSeconds language broadcaster { login displayName } } } } } }' % (game, period)}
    r = urllib.request.Request("https://gql.twitch.tv/gql", json.dumps(q).encode(), {"Client-Id": "kimne78kx3ncx6brgo4mv6wki5h1ko", "content-type": "application/json"})
    return [e["node"] for e in json.load(urllib.request.urlopen(r, timeout=20))["data"]["game"]["clips"]["edges"]]
def kick(cat):
    try:
        r = urllib.request.Request(f"https://kick.com/api/v2/categories/{cat}/clips?sort=view&time=week", headers={"User-Agent": "Mozilla/5.0"})
        cs = json.load(urllib.request.urlopen(r, timeout=20))["clips"]
    except Exception: return []
    return [{"slug": "kick-" + c["id"], "title": c["title"], "viewCount": c.get("views") or 0, "durationSeconds": c.get("duration") or 0, "six": True,
             "broadcaster": {"login": c["channel"]["slug"], "displayName": c["channel"]["username"]}, "src_url": c["video_url"], "kick": True} for c in cs]
BOOST = {"kaicenat": 4}   # Alex 2026-11-11: "keep posting more Kai" (Kai's reveal crash was the first Short to take off)
WATCH_TWITCH = ["kaicenat", "ishowspeed", "xqcow", "jynxzi", "agent00", "darkviperau"]
WATCH_KICK = ["adinross", "n3on", "xqc"]
def user_clips(login, period="LAST_DAY"):
    q = {"query": '{ user(login: "%s") { clips(first: 20, criteria: {period: %s, sort: VIEWS_DESC}) { edges { node { slug title viewCount durationSeconds language broadcaster { login displayName } } } } } }' % (login, period)}
    try:
        r = urllib.request.Request("https://gql.twitch.tv/gql", json.dumps(q).encode(), {"Client-Id": "kimne78kx3ncx6brgo4mv6wki5h1ko", "content-type": "application/json"})
        return [e["node"] for e in json.load(urllib.request.urlopen(r, timeout=20))["data"]["user"]["clips"]["edges"]]
    except Exception: return []
def kick_user(slug):
    try:
        r = urllib.request.Request(f"https://kick.com/api/v2/channels/{slug}/clips?sort=view&time=day", headers={"User-Agent": "Mozilla/5.0"})
        cs = json.load(urllib.request.urlopen(r, timeout=20))["clips"]
    except Exception: return []
    return [{"slug": "kick-" + c["id"], "title": c["title"], "viewCount": c.get("views") or 0, "durationSeconds": c.get("duration") or 0, "six": True,
             "broadcaster": {"login": c["channel"]["slug"], "displayName": c["channel"]["username"]}, "src_url": c["video_url"], "kick": True} for c in cs]
def gql_all(game, period, pages=4):
    out, cur = [], None
    for _ in range(pages):
        after = (', after: "%s"' % cur) if cur else ""
        q = {"query": '{ game(name: "%s") { clips(first: 100%s, criteria: {period: %s, sort: VIEWS_DESC}) { pageInfo { hasNextPage } edges { cursor node { slug title viewCount durationSeconds language broadcaster { login displayName } } } } } }' % (game, after, period)}
        try:
            r = urllib.request.Request("https://gql.twitch.tv/gql", json.dumps(q).encode(), {"Client-Id": "kimne78kx3ncx6brgo4mv6wki5h1ko", "content-type": "application/json"})
            cl = json.load(urllib.request.urlopen(r, timeout=20))["data"]["game"]["clips"]
        except Exception: break
        if not cl: break
        out += [e["node"] for e in cl["edges"]]
        cur = cl["edges"][-1]["cursor"] if cl["edges"] else None
        if not cl["pageInfo"]["hasNextPage"] or not cur: break   # Twitch returns no cursor for game clips: one page of 100 per period
    return out
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
    # Alex 2026-11-10: trailer + reveal reactions. The GTA VI category holds every big one (Jynxzi, Kai, Speed, xQc...): last week first, then all time.
    six = [dict(c, six=True, src_url="https://clips.twitch.tv/" + c["slug"]) for per in ("LAST_WEEK", "LAST_MONTH", "ALL_TIME") for c in gql_all("Grand Theft Auto VI", per) if (c.get("language") or "").lower() == "en"]
    six += kick("grand-theft-auto-vi")
    five = [dict(c, six=bool(re.search(r"gta ?(6|vi)\b", c["title"], re.I)), src_url="https://clips.twitch.tv/" + c["slug"]) for c in gql("Grand Theft Auto V") if (c.get("language") or "").lower() == "en"]
    ok = lambda c: c["slug"] not in used and c["durationSeconds"] >= 12
    six = sorted([c for c in six + [c for c in five if c["six"]] if ok(c) and c["viewCount"] >= 30], key=lambda c: -c["viewCount"])
    five = sorted([c for c in five if ok(c) and not c["six"] and c["durationSeconds"] >= 20], key=lambda c: -c["viewCount"])
    # Alex 2026-11-10 (later): ONLY GTA 6. No GTA 5 fill. Extra source: big streamers TALKING about GTA 6 in Just Chatting
    # (titles rarely say it, so the top clips are listened to and kept only if the speech is about GTA 6).
    talk = [dict(c, six=True, talk=True, src_url="https://clips.twitch.tv/" + c["slug"]) for c in gql("Just Chatting", "LAST_DAY")[:40]
            if (c.get("language") or "").lower() == "en" and ok(c) and c["durationSeconds"] >= 20]
    # watchlist (research 2026-11-10): the streamers expected to play GTA 6 hardest at launch; their clips count if the speech is about GTA
    for login in WATCH_TWITCH:
        talk += [dict(c, six=True, talk=True, src_url="https://clips.twitch.tv/" + c["slug"]) for per in (("LAST_DAY", "LAST_WEEK", "LAST_MONTH") if login == "kaicenat" else ("LAST_DAY",)) for c in user_clips(login, per) if ok(c) and c["durationSeconds"] >= 15]
    for slug in WATCH_KICK:
        talk += [dict(c, talk=True) for c in kick_user(slug) if ok(c) and c["durationSeconds"] >= 15]
    six = [c for c in six if not c.get("kick") or c["viewCount"] >= 100]   # tiny Kick category clips were junk before launch
    seen = set(); cands = [c for c in sorted(six, key=lambda c: -c["viewCount"] * BOOST.get(c["broadcaster"]["login"].lower(), 1)) + sorted(talk, key=lambda c: -c["viewCount"]) if not (c["slug"] in seen or seen.add(c["slug"]))]
    # Alex 2026-11-11: 80% Kai Cenat, 20% others. Kai first up to 80% of n, then the rest (Kai again if others run out)
    kai = [c for c in cands if c["broadcaster"]["login"].lower() == "kaicenat"]; rest = [c for c in cands if c not in kai]
    k = round(n * 0.8); cands = kai[:k] + rest + kai[k:]
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
            global _W
            _W = globals().get("_W") or WhisperModel("tiny", compute_type="int8")
            segs, info = _W.transcribe(src)
            said = " ".join(x.text.strip() for x in segs)[:400]
            if info.language != "en" or len(said.split()) < (25 if c.get("talk") else 6): continue   # reactions can be mostly screaming   # junk: not English, or nobody talking
            if c.get("talk") and not re.search(r"\bgta\b|grand theft|gta ?(6|six|vi)|rockstar|leonida|vice city|lucia", said, re.I): continue   # not about GTA 6
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
