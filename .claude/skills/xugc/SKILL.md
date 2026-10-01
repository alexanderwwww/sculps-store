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
`tools/xugc` — Electron, x64 (his Mac is Intel), ad-hoc signed. **Build 3** (builds 1-2 were a demo and a Wan engine; both gone). Tabs: Create / Library / Train / MCP / Settings. Engine named **XUGC** (LTX-2.5 underneath). Real icon, small (20px in the header). Render screen: stars streaming from the logo, code rain, scan line, live timer + cost, the GPU's own log lines.
- **Create:** product from a link (`product.js`: JSON-LD then Open Graph), person = Broad (auto) / Pick (maya, jordan, ava, leo, sofia: text descriptions) / Describe, scene, look (Selfie/Unboxing/Demo/Testimonial), length 5/10/15/20 s (121/241/361/481 frames at 24 fps), quality Draft 512x896 / HD 704x1280 / Full 1088x1920. No start frames: he wants video only. The product look comes from words only today (reference-image conditioning is not built).
- **Style Bible (Train tab):** `.md` files in the app's `style` folder, starters in `assets/style/`. Only lines under `## Prompt` go into the video prompt; `## Never` lines become an "Avoid:" sentence. `compose.js` is deterministic (same inputs, same prompt). Toggle, edit, add, or let Claude write them over MCP.
- **Video training:** NOT switched on (the Wan trainer was deleted). The pile (👍 takes + videos he adds) is kept for when an LTX trainer is written (`ltx-trainer` in Lightricks/LTX-2).
- **Engine/money (`engine.js`, `runpod.js`):** rents one H100 80 GB (A100 80 GB fallback) per video via RunPod REST, uploads nothing big (the script only), runs `train/generate.sh`, brings `clip.mp4` home, ALWAYS deletes the pod; the pod also self-deletes at a deadline from the dollar cap at $3.50/h; price ceiling refusal; per-video + daily caps refuse BEFORE renting; one job at a time; failed jobs still count. Estimates are guesses until measured: setup 22 min without a network volume (66 GB model download), 4 min with one; render 1.5/3/5/7 min for 5/10/15/20 s.
- **Keys** (`secrets.js`, Keychain via safeStorage else 0600 file): RunPod key and a Hugging Face READ token (the LTX-2.5 repo is gated: free account, accept terms at huggingface.co/Lightricks/LTX-2.5; community licence is free commercially under $10M revenue).
- **MCP:** Settings-free tab "MCP" shows the connector URL (`https://kerberos.gardenbuddystore.workers.dev/xugc/<key>/mcp`, key in `app/routes/xugc.$.tsx` and `bridge.js`), an On/Off switch, state and a log of what Claude asked. The app polls the worker every 3 s (outbound only). Tools: xugc_status, xugc_generate, xugc_cancel, xugc_result, xugc_style_write/toggle/delete, xugc_share (uploads a finished take so Claude can watch it), xugc_takes. **Deliberately absent: any way to change the app's code, keys or spending limits** (unlike the wand's `runtime` code push). Updates ship as new builds. Every remote order is re-validated in `main.js`; remote videos go through the same caps.
- **PROVEN on a real H100 (2026-10-01, $0.10, 101 s):** pod boot (29 s), proxy upload, `uv sync` of LTX-2, the pipeline's `--help` (flags `--height/--width/--num-frames/--seed/--lora/--image PATH FRAME_IDX STRENGTH/--enhance-prompt/--quantization fp8-cast` exist), pod deleted at the end. `PROBE=1` runs only that part. A real H100 came at $3.49/h, so the ceiling is $4.00/h. `--image` (frame conditioning) and `--lora` exist: product images and trained LoRAs are possible later.
- **Still unproven until a full run:** `train/generate.sh`'s model download and render (written from Lightricks' README: flag names `--height/--width` are probed from `--help`, saved as `out/help.txt`; retries with `--quantization fp8-cast` on failure), the exact RunPod REST fields, the speed and cost estimates, whether the mp4 has sound, whether the pipeline's resolution flags work. Tests prove everything else.
- Tests (`npm test`, 121 checks): `engine.test.mjs`, `runpod.test.mjs` (orchestrator vs the REAL `pod_agent.py` locally), `app.test.mjs` (real screens in Chromium + a stand-in worker with the same URLs). The live worker was smoke-tested with curl and the real `bridge.js`.
- Packed with `electron-builder --mac --dir --x64`, then `rcodesign sign`, zipped, put in R2 under an unguessable name.

## Direction settled with Alex (2026-10-01, after build 2)
- Engine is **self-hosted on rented NVIDIA via RunPod**; he dislikes hosted APIs. Wan 2.2 is out: about 10 min per 5 s clip is unusable. Switch to **LTX-2** (open weights, about 18x faster than Wan on an H100, up to 20 s clips, makes audio too). Generation on an RTX 5090 ($0.99/h), training on an H100 ($2.89/h). Kling/Veo may be added later as OPTIONAL engines for hero shots, never required.
- He wants VIDEO only: product + scene in, video out. Start frames are an internal step the app hides.
- Build 3 scope: product from a link, avatar picker or "broad", length 5/10/15/20 s, quality choice, price shown before Generate, engine named "XUGC" (not the model name), his REAL icon (small) not my drawn eye, a futuristic render animation, MCP bridge so Claude can drive it (may be policy-blocked like the Cursor one), and a **Style Bible** section in Train: he drops .md files (iPhone look, handheld shake, audio, hooks) that are compiled with the product and scene into the shot prompt plus a never-do list. 👍 videos join the training pile, 👎 adds to the never-do list.
- First: one real test clip on LTX-2 with his RunPod key, shown to him BEFORE building the rest. He must create the RunPod account, add $10 and paste a Read & Write key named xugc into XUGC Settings.
