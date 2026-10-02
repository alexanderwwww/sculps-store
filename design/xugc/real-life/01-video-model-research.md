# Real Life — 01 Video-model research

Author: video-model research scientist. Date: 2026-10-02.
Scope: how frontier video models are built, why they fail, what we can pull, what to skip.

Source status, stated plainly:
- Loaded and read: HunyuanVideo 1.5 report (arXiv 2511.18870), Wan abstract (2503.20314), LTX-2 abstract + GitHub README, Seedance 2.0 arXiv abstract page, Veo 3.1 Gemini API doc.
- The Seedance 2.0 page returned the abstract only. Its training stages, data and model size did NOT load. Nothing below claims them.
- Google has published NO technical report for Veo 3. The only sources are a model card and third-party write-ups (Medium, Scribd). Veo internals below are labelled third-party.
- Kling 3.0: only third-party API pages loaded (Krea, fal, PiAPI, kling.ai quickstart snippet). No Kuaishou paper loaded.
- Failure-mode mechanisms (section 2) combine cited findings with standard diffusion reasoning. Items marked [reasoned] are engineering inference, not a quoted result.

---

## 1. How frontier video models are built

### 1.1 Common skeleton
1. A video VAE compresses pixels into a small latent grid. HunyuanVideo 1.5 uses a causal 3D VAE: 16x spatial, 4x temporal compression, 32 latent channels. (HunyuanVideo 1.5 report.) Wan ships its own "novel VAE" (Wan report).
2. A Diffusion Transformer (DiT) denoises the latent tokens. Text (and image, and audio) conditioning enter as extra tokens or cross-attention.
3. A decoder turns latents back into frames. A separate super-resolution network can then upscale. HunyuanVideo 1.5 has an 8.3B SR model to 1080p trained on 1M clips.

### 1.2 Per-model facts (sourced)
| Model | Architecture | Open? |
|---|---|---|
| Veo 3 / 3.1 | Latent diffusion transformer; diffusion applied jointly to audio latents and video latents (third-party analysis, no official paper). API: 4/6/8 s, 720p/1080p/4k, up to 3 reference images, first+last frame, extension, audio always on, seed "slightly improves" determinism only. | Closed, API only |
| Seedance 2.0 | Unified audio-video joint generation; text, image, audio, video inputs; up to 9 images + 3 video + 3 audio references; 4-15 s; native 480p/720p (arXiv 2604.14148 page). A "Dual-Branch DiT" description comes from Analytics Vidhya, not the paper page. Seedance 1.5 pro paper (2512.13507) is the native audio-visual joint predecessor. | Closed, API only |
| Kling 3.0 | "Unified multimodal architecture"; up to 6 cuts per generation (multi-shot); native audio; "elements" bind a character's look and voice for reuse (third-party API docs). | Closed, API only |
| LTX-2 / 2.5 | Asymmetric dual-stream DiT: 14B video stream + 5B audio stream, bidirectional audio-video cross-attention, modality-aware CFG. Weights and code public. Repo ships `ltx-trainer` (LoRA, full fine-tune, IC-LoRA). Default 1024x1536 @ 24 fps. Two decoders: diffusion decoder (higher quality) or convolutional (lighter). | Open weights, trainable. Repo has several license files; read them before commercial use. |
| Wan 2.1 / 2.2 | Spatio-temporal VAE + DiT. 1.3B and 14B. 2.2 adds a two-expert MoE split by noise level: one expert lays out objects and positions (high noise), the other refines detail (low noise). 1.3B needs 8.19 GB VRAM. | Open, trainable |
| HunyuanVideo 1.5 | 8.3B DiT, selective + sliding tile attention (SSTA), glyph-aware bilingual text encoder, 13.6 GB peak VRAM for 720p. Report says it beats Wan2.2 by 34.9% GSB on T2V, is strong on structural stability, and weaker on aesthetics than some rivals. | Open |

### 1.3 Training stages (the only fully documented recipe is HunyuanVideo 1.5)
1. Image pretraining: 5 billion images selected from a pool over 10 billion, text-to-image at 256p then 512p.
2. Video pretraining: 10+ million hours of raw video, cut into 2-10 s clips by scene detection, filtered on three levels (basic quality; sharpness, detail, noise, dynamic range; aesthetic score). Mixed T2V / I2V / T2I, 256p up to 720p, progressive.
3. Continued training (CT) on premium clips chosen for motion diversity.
4. SFT on clips filtered for aesthetics and smoothness.
5. RLHF: I2V uses online RL with vision-language reward models. T2V uses offline DPO on 10K prompts plus online refinement with a hybrid ODE-SDE solver.
6. SR network for 1080p.

Wan data curation (via Wan 2.2 coverage): OCR/text coverage, NSFW filter, de-duplication, blur and exposure scoring, clustering, expert scoring for visual and motion quality, camera-motion tiers, synthesized captions.

Preference tuning literature (what closed labs most plausibly run, same family of methods): VideoAlign / VideoReward (182k human annotations across visual quality, motion quality, text alignment; NeurIPS 2025), VideoDPO, DenseDPO (segment-level labels, needs about 1/3 the labels), DanceGRPO, Identity-GRPO (multi-human identity), HuDA (human-detector confidence as a reward for human motion; GRPO with it improves complex human motion). The closed labs' own recipes are not published.

### 1.4 What this means
- Realism of closed models comes from scale of curated data, long staged training, and preference tuning against human raters. None of that is reproducible with 100 clips and $4.
- Audio is generated in the same denoising pass as video in Veo 3, Seedance 2.0, Kling 3.0 and LTX-2. Lip-sync and foley are model-native; we do not add a separate TTS-and-lipsync step for these models.

---

## 2. Failure modes and the mechanism behind each

1. Melted / extra-finger hands.
   - Hands are small in frame, high-articulation, and often occluded. Under 16x spatial VAE compression a finger is a fraction of one latent cell, so the decoder invents detail. [reasoned from the compression figures in section 1]
   - Cited: hands and edges are the statistically most likely places for generation errors and temporal inconsistency (Morphic glossary; iMerit). Reward models built on human detection (HuDA) exist because this stays unsolved after pretraining.
   - Worse when the hand moves fast, touches the product, or leaves and re-enters frame.

2. Crowd smear / background people.
   - Many small faces and bodies share the same token budget; each gets few latent cells, and nothing ties each background person to a persistent identity. [reasoned]
   - Our own result: the small LTX LoRA was weak on crowds and hands, consistent with this. 100 clips cannot teach per-person detail the base model never learned.

3. Identity drift (face changes over time or across shots).
   - Cited: temporal layers shift the mean and variance of spatial features, so the model loses its grip on the subject (iMerit). Models keep limited temporal context and rely on compressed latents rather than detailed pixels.
   - Across separate clips there is no memory at all unless a reference is injected. This is why Kling "elements", Veo reference images and Seedance multi-reference exist.

4. The "AI look" (waxy skin, glossy over-sharpened, cinematic lighting, slow smooth motion).
   - Cause chain: SFT and CT stages filter for aesthetics and smoothness (HunyuanVideo 1.5 report), RLHF rewards visual-quality raters, so the model drifts to a polished stock-footage mean. Real iPhone footage is noisy, handheld, auto-exposed, compressed. [last clause reasoned]
   - Cited tradeoff: HunyuanVideo 1.5 is strong on structure but weaker on aesthetics; models differ in where they sit on this axis.
   - The VAE decoder also smooths micro-texture; LTX offers a diffusion decoder that improves quality.

5. Temporal flicker / texture crawl.
   - VAE decode can add inter-frame pixel flicker (cited, DiffCVE). Aggressive compression lowers token count and quality.

6. Short clips, no continuity.
   - Fixed clip lengths: Veo 4/6/8 s, Seedance 4-15 s, Kling multi-shot up to 6 cuts. Veo extension chains 7 s steps at 720p only, total capped at 141 s; each step re-conditions on the tail, which accumulates drift.

7. Audio/lip errors.
   - Joint models fix sync, but speech content depends on prompt phrasing; Veo docs list English as the only fully supported language.

8. Prompt adherence limits.
   - A small number of tokens describe a long scene; the model satisfies the dominant concepts and drops secondary ones (count of objects, exact hand action). [reasoned]

---

## 3. Levers we can pull, with expected effect

Effects are ranked by confidence from the sources, not measured on our pipeline. Measure each before scaling spend.

| Lever | Model(s) | Expected effect |
|---|---|---|
| Reference images (up to 3 Veo; 9 images + video + audio Seedance; Kling elements) | closed | Largest identity and product-consistency gain. Veo forces 8 s when references are used. Use a clean product photo plus a face/outfit reference. |
| First frame / first+last frame | Veo 3.1, Kling, LTX | Pins composition and start look; I2V avoids the model inventing the product. Generate the first frame as a real-looking phone still. |
| Real-photo first frame (not a render) | all | Carries the phone-camera texture into the video; reduces the AI look at its source. [reasoned] |
| Prompt structure | all | Veo doc: subject, action, style, camera, composition, focus/lens, ambiance. Write phone-UGC terms: handheld, selfie distance, auto-exposure, room lighting, no cinematic grade. One action per clip. |
| Fewer people, fewer visible hands | all | Directly avoids failures 1 and 2. Frame to hide fingers (product held low, hand partly out of frame) or keep hands still. |
| Best-of-N with seed search | open models, Veo (seed gives only slight determinism) | The most dependable lever against random hand/face failures. Needs an automatic filter: a hand/face detector check plus a human pick on the shortlist. HuDA shows detector confidence works as a quality signal. |
| Multi-shot (Kling up to 6 cuts, Seedance native multi-shot) | Kling, Seedance | One generation keeps identity across cuts; cheaper than N separate clips plus stitching. |
| Cut length: stay at 4-8 s | all | Shorter windows drift less. Edit shots together in the app. |
| Resolution | closed: 1080p/4k Veo; Seedance native 720p | Higher output resolution adds decode detail, not correct anatomy. Use 1080p for final, 720p for drafts. |
| Upscale / SR pass | open (HunyuanVideo SR), external | Sharpens; does not fix melted hands. Final step only. |
| LoRA on open models (LTX-2.5 `ltx-trainer`, Wan, HunyuanVideo 1.5) | open | Moves texture, color, camera feel toward real phone footage. Does not add anatomy the base model lacks. Our first run showed that. Train on single-person hand-in-frame close clips, not crowds. |
| IC-LoRA (LTX) | LTX | Conditioned transforms (video-to-video, I2V style transfer). Candidate for "make this clip look like phone footage". |
| Diffusion VAE decoder (LTX) | LTX | Higher quality decode at some cost. Turn on for finals. |
| Post: grain, compression, slight shake, phone color | any | Cheap, deterministic fix for the AI look. Apply in the app after generation. |

---

## 4. What NOT to waste money on

1. Training a LoRA to fix crowds or hands. The data and base capacity are not there; our $3.81 run proved the ceiling.
2. Pretraining or full fine-tuning any model. Frontier recipes use billions of images and 10M+ hours of video (HunyuanVideo 1.5 numbers).
3. Chasing 4k Veo output for social ads. Delivery is phone-screen; 4k adds cost and the 8 s cap, not realism.
4. Very long single generations or deep Veo extension chains. Drift accumulates per step.
5. Large best-of-N on closed APIs without an automatic filter. Each sample costs money; filter locally first (draft at low res, pick, then finals).
6. Wan 2.1 1.3B or other small models as a final-quality engine. Use them for drafts and seed scouting only.
7. Image-model "realism" LoRAs for first frames beyond one tested pass. Test one; stop if skin still reads as AI.
8. Treating the seed as a guarantee on Veo. The doc says it only "slightly improves" determinism.
9. Relying on third-party Kling or Seedance wrappers for the shipped product. Use the official APIs as planned; wrappers add price and break.

---

## 5. Sources

Loaded and read:
- HunyuanVideo 1.5 Technical Report: https://arxiv.org/html/2511.18870v2
- Wan: Open and Advanced Large-Scale Video Generative Models (abstract): https://arxiv.org/abs/2503.20314
- LTX-2 (abstract): https://arxiv.org/abs/2601.03233
- LTX-2 repo (trainer, variants, resolution): https://github.com/Lightricks/LTX-2
- Veo 3.1 Gemini API doc: https://ai.google.dev/gemini-api/docs/veo
- Seedance 2.0 arXiv page (abstract only): https://arxiv.org/abs/2604.14148

Search results only (snippets, pages not fetched in full):
- Veo 3 third-party analysis: https://medium.com/google-cloud/deconstructing-veo-3-a-technical-analysis-of-googles-unified-audio-visual-generation-model-6be023888489
- Veo 3 model card (Scribd): https://www.scribd.com/document/878540665/Veo-3-Model-Card
- Seedance 2.0 overview (Dual-Branch DiT claim): https://www.analyticsvidhya.com/blog/2026/02/what-is-seedance-2-0/
- Seedance 1.5 pro: https://arxiv.org/pdf/2512.13507
- Seedance 2.0 launch post: https://seed.bytedance.com/en/blog/official-launch-of-seedance-2-0
- Kling 3.0 API guides: https://www.krea.ai/blog/kling-3-0-api-access-guide-pricing-code-examples-for-multi-shot-ai-video , https://kling.ai/quickstart/klingai-video-3-omni-model-user-guide , https://fal.ai/models/fal-ai/kling-video/v3/standard/text-to-video/api
- Wan 2.2 MoE coverage: https://www.deeplearning.ai/the-batch/alibabas-wan-2-2-video-models-adopt-a-new-architecture-to-sort-noisy-from-less-noisy-inputs , https://www.emergentmind.com/topics/sota-video-diffusion-model-wan-2-2
- Temporal drift: https://imerit.ai/resources/blog/solving-temporal-drift-in-ai-generated-video/
- Visual artifacts glossary: https://morphic.com/ai-glossary/artifacts-(visual)
- Preference/RL for video: https://proceedings.neurips.cc/paper_files/paper/2025/file/76227feb18ea0ee40bd15cf02c33e18e-Paper-Conference.pdf (VideoAlign), https://arxiv.org/pdf/2506.03517 (DenseDPO), https://arxiv.org/pdf/2601.14037 (HuDA), https://arxiv.org/html/2510.14256v3 (Identity-GRPO), https://arxiv.org/html/2505.07818v1 (DanceGRPO)

Not loaded: Kuaishou Kling paper (none found), Google Veo technical report (none exists), Seedance 2.0 full text.
