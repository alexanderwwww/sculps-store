"""Word timestamps for captions: faster-whisper re-reads the finished voice track.
usage: python3 words.py <workdir>   (reads voice.wav + lines.json, writes timing.json)"""
import json, os, sys
work = sys.argv[1]
d = json.load(open(os.path.join(work, "lines.json"))); lines, total = d["lines"], d["duration"]
v = {}
from faster_whisper import WhisperModel
wm = WhisperModel(os.environ.get("WHISPER_MODEL", "base.en"), device="cpu", compute_type="int8")
segs, _ = wm.transcribe(os.path.join(work, "voice.wav"), word_timestamps=True, language="en")
words = []
for s in segs:
    for wd in s.words:
        mid = (wd.start + wd.end) / 2
        li = next((l["i"] for l in lines if l["start"] - 0.3 <= mid <= l["end"] + 0.3), None)
        words.append({"w": wd.word.strip().lstrip("-"), "start": round(wd.start, 3), "end": round(wd.end, 3), "line": li})
# whisper splits numbers like "100,000" into "100" + ",000": glue them back together
merged = []
for w in words:
    if merged and w["w"][:1] == "," and w["w"][1:2].isdigit() and merged[-1]["w"][-1:].isdigit():
        merged[-1]["w"] += w["w"]; merged[-1]["end"] = w["end"]
    else:
        merged.append(w)
words = merged
json.dump({"duration": round(total, 3), "lines": lines, "words": words}, open(os.path.join(work, "timing.json"), "w"), indent=1)
print(f"voice {total:.2f}s, {len(words)} words")
