#!/usr/bin/env python3
"""clipper: one long video in -> the best 20-40 s moment out, as a 9:16 Short with burned word captions.
Brain v1: every window is scored on loudness (hype), speech density and GTA keywords; the best one wins.
usage: clip.py SRC.mp4 OUT.mp4 [--min 20 --max 40]"""
import sys, json, subprocess, re, math, argparse, os
p = argparse.ArgumentParser(); p.add_argument("src"); p.add_argument("out"); p.add_argument("--min", type=float, default=20); p.add_argument("--max", type=float, default=40)
p.add_argument("--model", default="small"); p.add_argument("--headline", default=""); a = p.parse_args()
KEY = re.compile(r"gta|vice|leonida|lucia|jason|trailer|rockstar|map|leak|release|2026|insane|crazy|no way|bro|what|oh my", re.I)

def run(*c): return subprocess.run(c, capture_output=True, text=True, check=True).stdout
dur = float(run("ffprobe","-v","error","-show_entries","format=duration","-of","csv=p=0",a.src))
# loudness per second
raw = subprocess.run(["ffmpeg","-v","error","-i",a.src,"-ac","1","-ar","8000","-f","s16le","-"],capture_output=True).stdout
import array; s = array.array("h", raw); sr = 8000
loud = [math.sqrt(sum(x*x for x in s[i:i+sr])/max(1,len(s[i:i+sr]))) for i in range(0, len(s), sr)]
mx = max(loud) or 1; loud = [x/mx for x in loud]
# words
from faster_whisper import WhisperModel
segs, _ = WhisperModel(a.model, compute_type="int8").transcribe(a.src, word_timestamps=True)
words = [(w.start, w.end, w.word.strip()) for sg in segs for w in (sg.words or []) if w.word.strip()]
best = None
for L in range(int(a.min), int(a.max)+1, 5):
  for st in range(0, max(1, int(dur - L)+1)):
    ws = [w for w in words if w[0] >= st and w[1] <= st+L]
    if not ws: continue
    lo = sum(loud[st:st+L])/L; dens = len(ws)/L; kw = sum(1 for w in ws if KEY.search(w[2]))
    sc = lo*2 + min(dens, 3)/3 + kw*0.15 - (0.3 if ws[0][0]-st > 1.5 else 0)
    if not best or sc > best[0]: best = (sc, st, L, ws)
sc, st, L, ws = best
# start on the first word, end on the last word of the window
t0 = max(0, ws[0][0]-0.15); t1 = min(dur, ws[-1][1]+0.4)
def ts(t): h=int(t//3600); m=int(t%3600//60); return f"{h}:{m:02d}:{t%60:05.2f}"
ass = ["[Script Info]","PlayResX: 1080","PlayResY: 1920","[V4+ Styles]",
 "Format: Name, Fontname, Fontsize, PrimaryColour, OutlineColour, BackColour, Bold, BorderStyle, Outline, Shadow, Alignment, MarginV",
 "Style: W,Arial Black,92,&H00FFFFFF,&H00000000,&H64000000,1,1,7,2,2,560",
 "Style: H,Arial Black,64,&H00FFFFFF,&H001010D8,&H00000000,1,3,14,0,8,250","[Events]","Format: Layer, Start, End, Style, Text"]
# IGN-style red headline box on top for the whole Short (Alex 2026-11-10)
if a.headline: ass.append(f"Dialogue: 1,{ts(0)},{ts(t1-t0+1)},H,{a.headline.upper()}")
grp = [ws[i:i+3] for i in range(0, len(ws), 3)]
for g in grp:
  for j, w in enumerate(g):
    txt = " ".join(("{\\c&H00E1FF&}" + x[2].upper() + "{\\c&HFFFFFF&}") if k == j else x[2].upper() for k, x in enumerate(g))
    gi = grp.index(g); nxt = grp[gi+1][0][0] if gi+1 < len(grp) else 1e9
    e = min(g[j+1][0] if j+1 < len(g) else w[1], nxt)   # never overlap the next caption
    ass.append(f"Dialogue: 0,{ts(w[0]-t0)},{ts(max(e, w[0]+0.05)-t0)},W,{txt}")
open(a.out + ".ass", "w").write("\n".join(ass))
vf = ("split[a][b];[a]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,boxblur=30[bg];"
      "[b]scale=1080:-2[fg];[bg][fg]overlay=(W-w)/2:(H-h)/2-120,ass=" + a.out + ".ass")
subprocess.run(["ffmpeg","-v","error","-y","-ss",f"{t0:.2f}","-to",f"{t1:.2f}","-i",a.src,"-filter_complex",vf,"-c:v","libx264","-preset","veryfast","-crf","20","-c:a","aac","-b:a","160k",a.out], check=True)
print(json.dumps({"start": round(t0,2), "end": round(t1,2), "score": round(sc,3), "text": " ".join(w[2] for w in ws)}, ensure_ascii=False))
