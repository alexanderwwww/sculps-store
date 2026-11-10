#!/usr/bin/env python3
"""ORAKTYS daily: top GTA Twitch clips of the last day -> N fresh Shorts in R2. Prints a JSON list for posting.
Never repeats a clip (used slugs kept in R2 at oraktys-used.json). Run from the repo root."""
import json, subprocess, sys, os, urllib.request, tempfile, re
N = int(sys.argv[1]) if len(sys.argv) > 1 else 3
HERE = os.path.dirname(os.path.abspath(__file__)); TMP = tempfile.mkdtemp()
def gql(game):
    q = {"query": '{ game(name: "%s") { clips(first: 40, criteria: {period: LAST_DAY, sort: VIEWS_DESC}) { edges { node { slug title viewCount durationSeconds language broadcaster { login displayName } } } } } }' % game}
    r = urllib.request.Request("https://gql.twitch.tv/gql", json.dumps(q).encode(), {"Client-Id": "kimne78kx3ncx6brgo4mv6wki5h1ko", "content-type": "application/json"})
    return [e["node"] for e in json.load(urllib.request.urlopen(r, timeout=20))["data"]["game"]["clips"]["edges"]]
def sh(*c, **k): return subprocess.run(c, capture_output=True, text=True, **k)
# read straight from R2: the public /media URL is cached for a year, so it would return the first list forever
try: _f = os.path.join(TMP, "used-in.json"); sh("npx", "wrangler", "r2", "object", "get", "gardenbuddy-media/oraktys-used.json", "--file", _f, "--remote", timeout=120); used = set(json.load(open(_f)))
except Exception: used = {"ResourcefulBlazingKumquatPraiseIt-dbnC1oRVhIZpi3Bp"}
cands = [dict(c, six=(g == "Grand Theft Auto VI")) for g in ("Grand Theft Auto VI", "Grand Theft Auto V") for c in gql(g)]
cands = [c for c in cands if c["slug"] not in used and c["durationSeconds"] >= 20 and (c.get("language") or "").lower() == "en"]
cands.sort(key=lambda c: -(c["viewCount"] * (8 if c["six"] or re.search(r"gta ?(6|vi)\b", c["title"], re.I) else 1)))   # Alex 2026-11-10: GTA 6 first (launch Nov 19)
out = []
for c in cands:
    if len(out) >= N: break
    src = os.path.join(TMP, c["slug"][:40] + ".mp4"); dst = src.replace(".mp4", "-short.mp4")
    if sh("yt-dlp", "-q", "-o", src, "https://clips.twitch.tv/" + c["slug"], timeout=300).returncode or not os.path.exists(src): continue
    r = sh("python3", os.path.join(HERE, "clip.py"), src, dst, timeout=900)
    if r.returncode or not os.path.exists(dst): continue
    meta = json.loads([l for l in r.stdout.splitlines() if l.startswith("{")][-1])
    key = "oraktys-" + re.sub(r"[^a-z0-9]+", "-", c["slug"].lower())[:50] + ".mp4"
    if sh("npx", "wrangler", "r2", "object", "put", "gardenbuddy-media/" + key, "--file", dst, "--content-type", "video/mp4", "--remote", timeout=300).returncode: continue
    used.add(c["slug"])
    out.append({"url": "https://blackreaper.us/media/" + key, "streamer": c["broadcaster"]["login"], "name": c["broadcaster"]["displayName"], "title": c["title"], "views": c["viewCount"], "said": meta["text"][:300]})
open(os.path.join(TMP, "used.json"), "w").write(json.dumps(sorted(used)))
sh("npx", "wrangler", "r2", "object", "put", "gardenbuddy-media/oraktys-used.json", "--file", os.path.join(TMP, "used.json"), "--content-type", "application/json", "--remote")
print(json.dumps(out, ensure_ascii=False, indent=1))
