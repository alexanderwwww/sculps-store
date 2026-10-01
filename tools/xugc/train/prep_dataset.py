#!/usr/bin/env python3
"""
Turn a folder of UGC videos into a training set for a Wan 2.2 LoRA.

  python3 prep_dataset.py --src my-videos/ --out dataset/ [--captions captions.json]

What it does, in order:
  1. Cuts every video into clips of exactly 81 frames at 16 fps (about 5.06 s) --
     the length the trainer expects -- cropped and scaled to 480x832 (9:16).
  2. Drops the audio (the model trains on picture only).
  3. Writes one .txt per clip with its caption. A caption comes from captions.json
     ({"video-name.mp4": "what happens"}) if given; otherwise it is left empty
     for caption.py to fill in on the GPU.
  4. Writes dataset.toml for the trainer and manifest.json so every clip can be
     traced back to the video it came from.

A video shorter than one clip is skipped and reported, never padded.
Only videos you own or have written permission to train on belong here.
"""
import argparse, json, math, os, pathlib, re, subprocess, sys

FFMPEG = os.environ.get("FFMPEG", "ffmpeg")
VIDEO_EXT = {".mp4", ".mov", ".m4v", ".webm", ".mkv"}


def duration(path):
    r = subprocess.run([FFMPEG, "-hide_banner", "-i", str(path)], capture_output=True, text=True)
    m = re.search(r"Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)", r.stderr)
    if not m:
        raise RuntimeError(f"could not read the length of {path}")
    h, mi, s = m.groups()
    return int(h) * 3600 + int(mi) * 60 + float(s)


def cut(src, dst, start, seconds, width, height, fps, frames):
    vf = f"fps={fps},scale={width}:{height}:force_original_aspect_ratio=increase,crop={width}:{height}"
    cmd = [FFMPEG, "-hide_banner", "-loglevel", "error", "-y", "-ss", f"{start:.3f}", "-i", str(src),
           "-vf", vf, "-frames:v", str(frames), "-an", "-c:v", "libx264", "-crf", "17", "-pix_fmt", "yuv420p", str(dst)]
    subprocess.run(cmd, check=True)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--src", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--captions")
    ap.add_argument("--width", type=int, default=480)
    ap.add_argument("--height", type=int, default=832)
    ap.add_argument("--fps", type=int, default=16)
    ap.add_argument("--frames", type=int, default=81)
    ap.add_argument("--prefix", default="", help="text put in front of every caption, e.g. 'UGC phone video.'")
    a = ap.parse_args()

    src, out = pathlib.Path(a.src), pathlib.Path(a.out)
    clips_dir = out / "clips"
    clips_dir.mkdir(parents=True, exist_ok=True)
    caps = json.loads(pathlib.Path(a.captions).read_text()) if a.captions else {}
    clip_seconds = a.frames / a.fps

    manifest, skipped = [], []
    videos = sorted(p for p in src.iterdir() if p.suffix.lower() in VIDEO_EXT)
    if not videos:
        sys.exit(f"no videos found in {src}")
    for v in videos:
        d = duration(v)
        n = int(math.floor((d + 0.12) / clip_seconds))  # a 5.06 s clip is stored as 5.06, not 5.0625
        if n < 1:
            skipped.append({"video": v.name, "seconds": round(d, 2), "why": f"shorter than one {clip_seconds:.2f}s clip"})
            continue
        stem = re.sub(r"[^A-Za-z0-9_-]+", "-", v.stem).strip("-") or "video"
        for i in range(n):
            name = f"{stem}-{i:02d}"
            cut(v, clips_dir / f"{name}.mp4", i * clip_seconds, clip_seconds, a.width, a.height, a.fps, a.frames)
            cap = caps.get(v.name, "").strip()
            text = (a.prefix + " " + cap).strip() if (cap or a.prefix) else ""
            (clips_dir / f"{name}.txt").write_text(text)
            manifest.append({"clip": f"{name}.mp4", "source": v.name, "start": round(i * clip_seconds, 3), "caption": text})

    # {{WORK}} is replaced on the GPU with the real folder, so the same dataset works anywhere.
    (out / "dataset.toml").write_text(
        "[general]\n"
        f"resolution = [{a.width}, {a.height}]\n"
        'caption_extension = ".txt"\n'
        "batch_size = 1\n"
        "enable_bucket = false\n\n"
        "[[datasets]]\n"
        'video_directory = "{{WORK}}/clips"\n'
        'cache_directory = "{{WORK}}/cache"\n'
        f"target_frames = [{a.frames}]\n"
        'frame_extraction = "head"\n'
    )
    (out / "manifest.json").write_text(json.dumps({"clips": manifest, "skipped": skipped, "width": a.width, "height": a.height, "fps": a.fps, "frames": a.frames}, indent=2))
    print(f"{len(manifest)} clips from {len(videos) - len(skipped)} videos; skipped {len(skipped)}")
    for s in skipped:
        print("  skipped", s["video"], s["why"])
    if not manifest:
        sys.exit("nothing to train on")
    empty = sum(1 for m in manifest if not m["caption"])
    if empty:
        print(f"{empty} clips have no caption yet: run caption.py on the GPU before training")


if __name__ == "__main__":
    main()
