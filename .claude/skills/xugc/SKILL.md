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

## Open / needs Alex
RunPod account + $10 + API key (Read & Write, named `studio`); Marketing Studio screenshots; Which NVIDIA GPU he saw (he mentioned one, not named).
