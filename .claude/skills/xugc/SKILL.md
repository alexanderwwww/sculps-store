---
name: xugc
description: XUGC — Alex's own UGC video-generation Mac app (a Higgsfield Marketing Studio of his own). Use whenever the work touches XUGC, UGC videos, avatars, product-consistent video, Wan 2.2, RunPod, renting a GPU, or "the UGC app". Name, icon and plan are settled.
---

# XUGC

Alex's own app for making UGC video ads: pick a product, pick an avatar/creator, get a finished 9:16 ad. Like Higgsfield's **Marketing Studio**, in his own style, owned by him.

## Settled (1 Oct 2026)
- **Name: XUGC.** ("Xugc", his word.) Do not suggest other names.
- **Icon:** `design/icons/ugc-icon.png` — neon green (#D7FF1F) glossy tile, black liquid-glass NVIDIA-style eye. Do not mention "golden ratio" to an image model: it made Gemini fail.
- **UI:** a Mac app in the family of Magic Wand / Shop Admin. Liquid glass, neon green + black, laid out like Higgsfield's Marketing Studio. Needs 3-4 screenshots of that screen from Alex before designing — never design blind.
- **No chat box of its own.** Claude is the brain, connected the way the Magic Wand is: a narrow, allow-listed job link, not general control of his Mac.
- **Cheap on purpose.** Rent GPUs by the second; do not buy hardware yet.

## How it works
Mac app (remote control + library) → server (Cloudflare Worker + Neon + R2, already his) → rented GPU on RunPod running an open model → video back to R2 → voice, captions, 9:16 edit.

## Plan, in order — one step at a time with him
1. **Test the artist.** Open-source video model **Wan 2.2** (14B) on one rented H100 (about $2.7-3.5/hr) or a 4090 for light work. Make about 20 clips from his product photo (Haunted Projector first) and judge quality and product consistency. Budget about $10.
2. Build the Mac app: product upload, avatar/creator picker, script, generate, library.
3. Voice, captions, editing so the output is a finished 9:16 ad.
4. Later: LoRA fine-tune toward his own UGC look ("UGC-01"), on a legal dataset (own footage, paid creators with releases, licensed stock — never scraped TikTok or output from closed generators).

## Money, said plainly
The $10 is a prepaid balance, billed by the second; every video costs a little (roughly 15-50 cents per 5-second clip, $1-3 per finished ad — estimates until measured). Auto top-up off. The app must switch the GPU off the moment a job ends.

## Built (1 Oct 2026) — build 1, DEMO MODE
`tools/xugc` — Electron, x64 (his Mac is Intel), ad-hoc signed. **Build 2: the real engine, no demo mode.** Create / Library / Train / Settings. The neon eye (SVG, `#eyesym`) is the logo mark: header, empty stage, and the animated overlay (rings, scan line, live timer + live cost) whenever a GPU job runs.
- `runpod.js` rents ONE pod per job (A100/H100 80 GB, Wan 2.2 14B), uploads inputs in 48 MB chunks to `pod_agent.py` over RunPod's proxy, runs `train.sh`/`generate.sh`, polls, downloads results, and ALWAYS deletes the pod (`finally`, 4 retries). The pod also deletes ITSELF at a deadline computed from the dollar cap at the worst GPU price ($3.50/h). A pod priced above the ceiling is deleted before anything is sent. Cost = real `costPerHr` x real seconds. Startup sweeps leftover `xugc-*` pods; Settings has "Stop every XUGC GPU now".
- Money rules live only in `engine.js`: per-video / per-day / per-training caps refuse BEFORE renting; the job's own cap is enforced while it runs; full training is refused until the cheap TEST RUN (2 videos, 3 clips, 1 epoch, about $2) has produced a model once; one GPU job at a time; a failed job's cost still counts today.
- The key lives in `secrets.js` (Keychain via safeStorage, else a 0600 file), never in the JSON state, the page or the repo. Bad keys are refused and not kept.
- What a take is TODAY: ONE silent 5-second 9:16 clip made from a START FRAME (his picture of a person holding the product) + his prompt + optional trained LoRA. Wan i2v only sees the start frame, so the product must already be in it. Not built: automatic avatar+product compositing, voice, captions burn-in, stitching clips to 15/30 s. The old stock avatar grid was removed on purpose (12 tiny thumbnails, useless as start frames).
- Training: his videos -> `prep_dataset.py` (81-frame 480x832 16 fps clips) -> `caption.py` (Qwen2.5-VL captions where he left them empty; the test run shows them for him to read) -> musubi-tuner Wan 2.2 LoRA. A 👍 take joins the training list. Optional RunPod network volume ID in Settings saves the ~60 GB model download (about 15 GPU minutes) on every video.
- Tests (`npm test`, 100 checks): `engine.test.mjs` (caps, flow, files, demo-leftover cleanup), `runpod.test.mjs` (the orchestrator against the REAL `pod_agent.py` run locally: chunked up/down, cancel, failure, price guard, cap, deadline self-delete, token, bad script, path escape, sweep), `app.test.mjs` (real screens in Chromium under xvfb, fake RunPod client only).
- **UNPROVEN until the first paid run:** `train.sh`, `generate.sh`, `caption.py` (written from musubi-tuner docs, never run on a GPU), the exact RunPod REST fields, the model repo paths, the 12 s/step estimate. The first run is the test run; its job is only to produce a file.
- Packed with `electron-builder --mac --dir --x64`, then `rcodesign sign`, zipped, put in R2 under an unguessable name.

## Open / needs Alex
RunPod account + $10 + API key (Read & Write, named `studio`); Marketing Studio screenshots; Which NVIDIA GPU he saw (he mentioned one, not named).
