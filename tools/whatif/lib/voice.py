"""Voice + word timings for a WHAT IF short.

usage: python3.13 voice.py <script.json> <workdir> <model.onnx>
Writes <workdir>/voice.wav (all lines, with gaps) and <workdir>/lines.json; words.py adds word timings.
  {"duration": s, "lines": [{"i","start","end","text"}], "words": [{"w","start","end","line"}]}
Piper speaks each line; faster-whisper re-reads the finished voice track so the
caption words land on what is actually heard, not on an estimate.
"""
import json, sys, wave, os
from piper import PiperVoice, SynthesisConfig

script = json.load(open(sys.argv[1]))
work, model = sys.argv[2], sys.argv[3]
os.makedirs(work, exist_ok=True)
v = script.get("voice", {})
voice = PiperVoice.load(model)
cfg = SynthesisConfig(length_scale=v.get("length_scale", 0.92), noise_scale=0.6, noise_w_scale=0.7)
lead, gap = v.get("lead_in", 0.25), v.get("gap", 0.38)

frames, rate, lines, t = [], None, [], lead
for i, line in enumerate(script["lines"]):
    p = os.path.join(work, f"line{i}.wav")
    with wave.open(p, "wb") as w:
        voice.synthesize_wav(line["text"], w, syn_config=cfg)
    with wave.open(p, "rb") as r:
        rate = r.getframerate()
        data = r.readframes(r.getnframes())
    dur = len(data) / 2 / rate
    lines.append({"i": i, "start": round(t, 3), "end": round(t + dur, 3), "text": line["text"]})
    frames.append((t, data))
    t += dur + line.get("pause", gap)
total = t + v.get("tail", 1.6)

buf = bytearray(int(total * rate) * 2)
for start, data in frames:
    o = int(start * rate) * 2
    buf[o:o + len(data)] = data
with wave.open(os.path.join(work, "voice.wav"), "wb") as w:
    w.setnchannels(1); w.setsampwidth(2); w.setframerate(rate); w.writeframes(bytes(buf))

json.dump({"duration": round(total, 3), "lines": lines}, open(os.path.join(work, "lines.json"), "w"), indent=1)
print(f"voice {total:.2f}s")
