"""SkiiMaskTimmy Content Rewards clips: python3 timmy.py N  -> renders N new Shorts, uploads to R2, prints JSON lines.
Rules met: his Twitch clips only, full clip (>=7 s), facecam kept (whole frame on blurred 9:16), red title,
purple twitch.tv/skiimasktimmy overlay. Used slugs live in /tmp/oraktys/timmy-used.txt and R2 oraktys-timmy-used.txt."""
import sys, os, json, re, subprocess
HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, HERE)
import daily
W = daily.WORK; USED = os.path.join(W, "timmy-used.txt"); KEY = "oraktys-timmy-used.txt"
sh = lambda *c, **k: subprocess.run(c, capture_output=True, text=True, **k)
def used():
    sh("npx", "wrangler", "r2", "object", "get", "gardenbuddy-media/" + KEY, "--file", USED, "--remote", timeout=120)
    return set(open(USED).read().split()) if os.path.exists(USED) else set()
def title(t):
    t = re.sub(r"[^\w\s!?'.,-]", "", t).strip().upper()[:34]
    return t.replace("'", "") or "TIMMY CANT BELIEVE THIS"
n = int(sys.argv[1]) if len(sys.argv) > 1 else 3
u = used(); seen = set(); clips = []
for per in ("LAST_WEEK", "LAST_MONTH", "ALL_TIME"):
    for c in daily.user_clips("skiimasktimmy", per):
        if c["slug"] not in u and c["slug"] not in seen and (c.get("durationSeconds") or 0) >= 8 and (c.get("language") or "").upper() in ("EN", ""):
            seen.add(c["slug"]); clips.append(c)
F = sh("fc-match", "-f", "%{file}", "DejaVu Sans:bold").stdout
done = 0
for c in clips:
    if done >= n: break
    s = c["slug"]; src = os.path.join(W, s + ".mp4"); out = os.path.join(W, s + "-final.mp4"); h = title(c["title"])
    if sh("yt-dlp", "-q", "-o", src, "https://clips.twitch.tv/" + s, timeout=300).returncode: continue
    vf = ("[0:v]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,boxblur=20:2[bg];[0:v]scale=1080:-2[fg];"
          f"[bg][fg]overlay=(W-w)/2:(H-h)/2,drawtext=fontfile={F}:text='{h}':fontcolor=white:fontsize=60:box=1:boxcolor=0xE50914@0.95:boxborderw=22:x=(w-text_w)/2:y=330,"
          f"drawtext=fontfile={F}:text='twitch.tv/skiimasktimmy':fontcolor=white:fontsize=46:box=1:boxcolor=0x9146FF@0.9:boxborderw=14:x=(w-text_w)/2:y=h-300")
    if sh("ffmpeg", "-v", "error", "-y", "-i", src, "-filter_complex", vf, "-c:v", "libx264", "-preset", "veryfast", "-crf", "21", "-c:a", "aac", "-b:a", "160k", "-movflags", "+faststart", out, timeout=600).returncode: continue
    k = "oraktys-timmy-" + re.sub(r"[^a-z0-9]+", "-", s.lower())[:40] + ".mp4"
    if sh("npx", "wrangler", "r2", "object", "put", "gardenbuddy-media/" + k, "--file", out, "--content-type", "video/mp4", "--remote", timeout=300).returncode: continue
    u.add(s); open(USED, "w").write("\n".join(sorted(u)))
    sh("npx", "wrangler", "r2", "object", "put", "gardenbuddy-media/" + KEY, "--file", USED, "--content-type", "text/plain", "--remote", timeout=120)
    done += 1
    print(json.dumps({"url": "https://blackreaper.us/media/" + k, "title": c["title"], "views": c["viewCount"], "secs": c["durationSeconds"]}, ensure_ascii=False), flush=True)
