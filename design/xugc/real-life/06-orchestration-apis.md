# 06 - Orchestration and APIs (Veo 3.1, Seedance, Kling 3.0)

Author: Inference/Orchestration/ML-Ops engineer. Date: 2026-10-02. No keys used, no money spent.

## 0. Evidence grades (read first)

- **[V] Verified** = read on the official page this session.
- **[S] Secondary** = from a reseller/tutorial page that mirrors the official API. Parameter names are probably right but must be re-checked against the official page before coding.
- **[N] Not verified** = I could not load the official page and have no secondary source. Do not code against it; run the discovery step in section 9.

**Official page load failures (stated plainly):**
- BytePlus ModelArk docs (`https://docs.byteplus.com/en/docs/ModelArk/1520757`, `/1366799`) are a JavaScript app. WebFetch returned only navigation. Request schema NOT read from the official source. Sidebar did confirm that a "Dreamina Seedance 2.5 tutorial" page exists at `/docs/ModelArk/seedance-2-5`, which also did not render.
- Kling official docs (`https://kling.ai/document-api/apiReference/model/textToVideo`, `https://kling.ai/document-api/quickStart/productIntroduction/overview`) returned only the header "KlingAI Open Platform". Not read.
- Google pages loaded fine (`ai.google.dev`), though the summarizer compressed them; exact JSON nesting for reference images should be re-read from the page when coding.

Consequence: Veo is fully specified. Seedance and Kling are specified to the level the secondary sources allow, with gaps listed.

---

## 1. Google Veo 3.1 (Gemini API) - best-documented, build first

Sources: https://ai.google.dev/gemini-api/docs/veo [V], https://ai.google.dev/gemini-api/docs/pricing [V], https://ai.google.dev/gemini-api/docs/video [V, overview only].

| Item | Value |
|---|---|
| Auth | Header `x-goog-api-key: $GEMINI_API_KEY` (key from Google AI Studio) |
| Model IDs | `veo-3.1-generate-preview`, `veo-3.1-fast-generate-preview`, `veo-3.1-lite-generate-preview` |
| Submit | `POST https://generativelanguage.googleapis.com/v1beta/models/{model}:predictLongRunning` |
| Body | `instances[]`: `prompt`, `image` (I2V first frame), `lastFrame`, `referenceImages`, `video` (extension). `parameters`: `aspectRatio`, `resolution`, `durationSeconds`, `personGeneration`, `seed` |
| Durations | `"4"`, `"6"`, `"8"` seconds. 8 is required for 1080p, 4k and when using reference images |
| Resolutions | Veo 3.1 and Fast: 720p, 1080p, 4k. Lite: 720p, 1080p only |
| Aspect ratios | `16:9` (default), `9:16` |
| Reference images | Up to 3, each with `referenceType: "asset"` |
| First/last frame | image as primary input plus `lastFrame` |
| Extension | Input video must be 720p, adds 7 s, Veo 3.1 and Fast only |
| Poll | Response has `.name`; GET the operation until `done: true` |
| Result | `.response.generateVideoResponse.generatedSamples[0].video.uri`; download with the same API key header |
| Retention | "Videos are stored on the server for 2 days" - download immediately |
| Latency | min about 11 s, up to about 6 min at peak |
| Audio | Native audio included in all variants and in the price |
| Watermark | SynthID on every output (invisible, cannot be turned off) |
| personGeneration | Text-to-video: `allow_all` only. Image-based modes: `allow_adult`. EU/UK/CH/MENA: `allow_adult` only |

**Price per second (with audio) [V]:**

| Variant | 720p | 1080p | 4k |
|---|---|---|---|
| Standard | $0.40 | $0.40 | $0.60 |
| Fast | $0.10 | $0.12 | $0.30 |
| Lite | $0.05 | $0.08 | n/a |

An 8 s Standard 1080p take = $3.20. An 8 s Lite 720p take = $0.40 (cheapest test).

**Not found on the pages I read:** numeric rate limits (they are per-project tiers shown in AI Studio; read them from the account, not docs), the exact list of safety rejection reasons (the operation returns `raiMediaFilteredCount` / `raiMediaFilteredReasons` style fields per Google's Veo API; confirm field names from a real rejected response in the test plan), prepaid/postpaid (Gemini API uses a Google Cloud billing account on a paid tier; free tier does not include Veo - confirm in AI Studio).

---

## 2. ByteDance Seedance 2.0 / 2.5 (BytePlus ModelArk)

Official docs (NOT loadable): https://docs.byteplus.com/en/docs/ModelArk/1520757 ("Create a video generation task"). Secondary: https://www.datacamp.com/tutorial/seedance-2-0-api-guide [S], https://anikuku.com/blog/seedance-2-api-pricing-guide-2026 [S], https://kingy.ai/news/byteplus-review-seedance-2-0-turns-byteplus-into-a-serious-ai-video-platform/ [S].

| Item | Value |
|---|---|
| Base URL | `https://ark.ap-southeast.bytepluses.com/api/v3` [S] |
| Auth | `Authorization: Bearer $ARK_API_KEY` [S for env name; Bearer is the Ark convention - confirm]. Keys are isolated by region [S] |
| Model ID | `dreamina-seedance-2-0-260128` [S]. Fast and Mini SKUs exist; their IDs are [N]. Seedance 2.5 tutorial page exists; model ID [N] |
| Submit | `POST {base}/contents/generations/tasks` [N - the Ark SDK/official path; verify] |
| Poll | `GET {base}/contents/generations/tasks/{id}`; status `succeeded` returns a video URL, `failed` returns error [S] |
| Body | `content[]` items: `{"type":"text"}`, `{"type":"image_url"}` with `role` = `reference_image`, `first_frame`, `last_frame` (needs first_frame); `{"type":"video_url","role":"reference_video"}`; `{"type":"audio_url","role":"reference_audio"}` [S]. Options: duration, ratio, resolution, `generate_audio`, `watermark` (boolean), seed [S] |
| Durations | 4-15 s [S] |
| Resolutions | 480p, 720p, 1080p, 4k [S] |
| Ratios | 16:9, 4:3, 1:1, 3:4, 9:16, 21:9 [S] |
| Face rule | Realistic human faces in input images are rejected [S]; public-figure likeness blocked [S]. **This is the biggest risk for a UGC "real person" pipeline: test with a synthetic generated face before relying on Seedance for avatar-conditioned shots.** |
| Billing | Prepaid resource packs, token based: standard $4.30/1M tokens up to $430/100M; fast $3.30/1M [S] |
| Per-second (derived) | 2.0: 480p $0.07, 720p $0.15, 1080p $0.37, 4k $0.78. Fast: 480p $0.06, 720p $0.12. Mini: 480p $0.04, 720p $0.08 [S, dated 2026-09-04]. Video-reference input costs more [S] |
| Watermark | Request flag exists; default and invisible-credential behavior [N] |
| URL expiry / rate limits / task retention | [N] |

---

## 3. Kling 3.0 (official developer API)

Official docs (NOT loadable): https://kling.ai/document-api/apiReference/model/textToVideo. Secondary: https://docs.magnific.com/api-reference/video/kling-v3/overview [S, reseller], https://help.aliyun.com/en/model-studio/kling-video-generation-api-reference/ [S, Alibaba-hosted Kling, different request format], https://www.cloudzero.com/blog/kling-ai-pricing/ [S], search snippets on JWT [S].

| Item | Value |
|---|---|
| Auth | Access Key + Secret Key. Build a JWT, HS256, claims `iss` (access key), `exp`, `nbf`; send `Authorization: Bearer <jwt>` [S]. Regenerate per request or every ~30 min |
| Base URL | `https://api-singapore.klingai.com` (global) [S]; older `https://api.klingai.com` [S]. Paths of the form `/v1/videos/text2video`, `/v1/videos/image2video` [S]; confirm kling-v3 paths |
| Body fields | `model_name`, `prompt`, `negative_prompt`, `duration`, `aspect_ratio`, `mode`, `cfg_scale`, `camera_control`, `callback_url`, `external_task_id` [S]. Kling 3 adds multi-shot (up to 6 scenes, per-shot prompt and duration, 15 s total max), first/end frame, sound on/off [S via Magnific] |
| Durations | 3-15 s [S] |
| Ratios | 16:9, 9:16, 1:1 [S] |
| Modes | `std` 720p, `pro` 1080p, `4k` [S via Alibaba] |
| Prompt | max 2,500 chars [S] |
| Poll | Response `task_id`, `task_status` in `submitted / processing / succeed / failed` [S]; GET the task path for that endpoint; `callback_url` webhook optional |
| Output URL | 30 days on Alibaba-hosted variant [S]; official [N]. Download immediately anyway |
| Billing | Prepaid resource packages $9.80 to $7,560, separate from consumer subscriptions; subscription credits do not transfer [S]. Failed calls not charged [S] |
| Per-second | Std 720p silent about $0.084, with audio $0.112-0.126; Pro 1080p silent $0.112, audio $0.140-0.168; 4K $0.42 [S, aggregator-quoted "official" rates - confirm on the console pricing page] |
| Rate limit / concurrency | [N]. Alibaba-hosted variant: 20 RPS query limit, 15 s polling advised |
| Safety rejection reasons, watermark/credentials | [N] |

---

## 4. Engine interface (Node, Electron main process)

```js
// engines/Engine.js - every engine implements this; the orchestrator never knows vendor details
class Engine {
  id;                     // 'veo31-fast' | 'veo31-std' | 'seedance2' | 'kling3-pro' | 'runpod-wan'
  capabilities;           // { maxSeconds, durations[], resolutions[], ratios[], refImages:n, firstLast:bool, audio:bool, faces:'ok'|'synthetic-only' }
  estimate(shot)          // -> { usdMin, usdMax }  PURE, no network. Uses price table + shot.seconds + resolution. Max = price * seconds, no discount.
  async submit(shot, opts)// -> { jobId, submittedAt }   idempotency key = shot.id + takeIndex
  async poll(jobId)       // -> { state:'queued'|'running'|'done'|'failed'|'rejected', progress?, resultRef?, reason? }
  async download(resultRef, destPath) // streams to disk, returns { path, bytes, sha256 }
  async cancel(jobId)     // best effort
  actualCost(result)      // -> usd, from vendor usage if returned, else estimate
}
```

State is persisted per take in SQLite/JSON (`takes` table: id, shot, engine, jobId, state, estUsd, actualUsd, path) so an app quit mid-job resumes polling, not resubmitting. Veo outputs expire in 2 days, so a resume sweep on launch downloads anything `done` and undownloaded first.

Adapters: `VeoEngine` (REST, `x-goog-api-key`, poll operation name), `SeedanceEngine` (Ark REST, Bearer, task id), `KlingEngine` (JWT signer, task id), `RunpodEngine` (existing orchestrator). Normalize rejections into `rejected` with a vendor reason string so the UI can show "face rejected by Seedance" and the router can fall back to another engine.

## 5. Retry, backoff, errors

- Retry only: HTTP 429, 5xx, network reset, and poll-time 5xx. Exponential backoff with full jitter: 2, 4, 8, 16, 32 s capped 60 s, 5 attempts. Honor `Retry-After`.
- Never auto-retry a `rejected` (safety) or `failed` generation: it costs money and repeats. Surface it; at most one auto re-roll with a different seed if the Approve cap has room, and only if the user enabled it.
- Submit is not idempotent at vendors: on a network error after submit with unknown outcome, do NOT resubmit blindly. For Kling use `external_task_id` to look up; for Veo and Ark record the time and list/inspect before resubmitting. If still unknown, mark `unknown` and count its max cost against the cap.
- Poll cadence: Veo 10 s, Kling 15 s (vendor advice), Seedance 10 s; hard timeout 15 min then mark failed, cancel.

## 6. Money rules and Approve flow for multi-take jobs

1. Plan: shots x engines x takes. `estimate()` each; show a table of min/max USD per engine and a total. Worst case = sum of `usdMax`.
2. Approve screen shows the worst case, not the average. Per-video cap and per-day cap checked against worst case plus already-committed spend today; if over, the job cannot be approved (offer removing the most expensive engine or fewer takes).
3. Reservation ledger: on Approve, write a reservation row per take (engine, usdMax). Reservations count against the daily cap until the take settles to `actualCost`. A crash cannot silently lose committed spend.
4. Staged spend ("cheap scout first"): run all engines on the cheap tier (Veo Lite 720p, Seedance Mini 720p, Kling std) as a preview wave, pick best, then re-render only the winner at full tier. Approve screen shows the two-stage total up front. This is the biggest cost lever: Veo Lite 720p 8 s is $0.40 versus $3.20 for Standard 1080p.
5. One-job-at-a-time stays: the job is the unit; parallelism is inside the job (section 7).
6. Kill switch: Cancel calls `cancel()` on every in-flight take and stops submitting; unfinished takes stay reserved until the vendor confirms.
7. Vendors with prepaid packs (Seedance, Kling): also track pack balance estimate and block when balance < worst case.

## 7. Running N engines in parallel, picking the best

- `Promise.allSettled` over engines for the same shot with a per-vendor concurrency semaphore (start at 2 per vendor; raise only after reading the account's limit). One engine failing never fails the shot.
- Same inputs for all: shared prompt, same reference/first-frame image, 9:16, 8 s where possible (Veo needs 8 for refs/1080p; Seedance and Kling accept other lengths, so cut to a common length in ffmpeg).
- Selection: automatic pre-rank, then human pick on Approve. Pre-rank cheap automated checks: ffprobe (duration, resolution, has audio), blur/black-frame detect (`blackdetect`, `freezedetect`), face-similarity to the avatar reference (embedding distance), lip-sync/audio presence. A vision-LLM judge scoring "looks like real iPhone footage, no artefacts, product visible" can add a score. Final choice is shown to the user as a grid; the system never auto-publishes.
- Persist every take; losing takes kept 7 days for re-use as cutaways.

## 8. Stitching with ffmpeg

All commands run on normalized clips first (step 1), because vendors differ in fps, size and audio layout.

1. Normalize each take: `ffmpeg -i in.mp4 -vf "scale=1080:1920:flags=lanczos,fps=30,format=yuv420p,setsar=1" -c:v libx264 -crf 16 -preset slow -ar 48000 -ac 2 -c:a aac -b:a 192k norm_N.mp4`
2. Hard cuts (preferred for UGC, matches phone-edit feel): concat demuxer with a list file, `-f concat -safe 0 -i list.txt -c copy` (works only after step 1 gives identical params).
3. Crossfade (use sparingly, 0.2-0.3 s): `-filter_complex "[0:v][1:v]xfade=transition=fade:duration=0.25:offset=T0-0.25[v];[0:a][1:a]acrossfade=d=0.25[a]"` where T0 is clip 0 duration.
4. Audio continuity: generated audio differs per take (room tone, level). Loudness-match every clip with `loudnorm=I=-16:TP=-1.5:LRA=11` (two-pass), add a continuous low room-tone bed under cuts, and use 40-80 ms audio fades at each cut. Where the same voice must carry across shots, generate the voiceover once (TTS/clone) and lay it over silent-trimmed video instead of using per-take audio.
5. Upscale: take only the winning shots up. Options: ffmpeg `scale=…:flags=lanczos` (cheap), or vendor 4k tier for the hero shot (Veo Fast 4k $0.30/s, Kling 4k $0.42/s), or the existing RunPod GPU upscaler. Do not upscale rejected takes.
6. Final: burn nothing in; export H.264 High, yuv420p, 30 fps, 1080x1920, `-movflags +faststart`, loudness -14 LUFS for social.
7. Watermarks/credentials: Veo adds SynthID invisibly (survives re-encode mostly; do not claim it can be removed). Seedance has a `watermark` flag: send false only if the BytePlus terms allow it for ads; check. Do not strip C2PA/credential metadata deliberately; platforms may require AI-content labels.

## 9. API keys on a Mac

- Store in the macOS Keychain, not in the repo, `.env` or `electron-store`. Use Electron `safeStorage` (backed by Keychain) for encrypting at rest, or the `keytar` package (service `XUGC`, account per vendor). Kling stores two secrets (access key, secret key) as two entries.
- Keys live only in the Electron main process. The renderer asks main via IPC to "submit"; it never sees a key. Never log headers; redact `x-goog-api-key`, `Authorization`, JWTs.
- The Cloudflare worker should not hold vendor keys unless the user wants a remote queue; if it does, use Worker secrets, not code.
- Veo download URIs need the key header, so download in main and write to disk; never pass signed/keyed URLs to the renderer.
- Setup UI: paste key, "Test" button that calls a free endpoint (Veo: list models; Kling: nothing paid - use JWT sign and a task-list GET; Ark: list tasks), then mask the field.
- Rotate: one-click delete from Keychain.

## 10. Test plan with cheapest settings (spend is a human decision; estimates only)

Order: cheapest first, each step must pass before the next, all 9:16.

| # | Engine | Setting | Est. cost | Proves |
|---|---|---|---|---|
| 1 | Veo 3.1 Lite | 720p, 4 s, T2V | 4 x $0.05 = **$0.20** | auth, submit, poll, download, 2-day expiry handling |
| 2 | Veo 3.1 Lite | 720p, 8 s, I2V with `allow_adult` | $0.40 | image input, person rule, audio present |
| 3 | Veo 3.1 Lite | 8 s with 1-3 reference images | $0.40 | refs need 8 s, consistency |
| 4 | Veo 3.1 Lite | deliberately rejected prompt | $0 expected (verify) | exact rejection field names for the adapter |
| 5 | Seedance 2.0 Mini | 480p, 4 s | 4 x $0.04 = **$0.16** (derived [S]) | real endpoint/field names, task statuses, URL expiry; first read the official schema from console/API explorer |
| 6 | Seedance | same with a real-looking face input | about $0.16 | confirm face rejection behavior and whether synthetic faces pass |
| 7 | Kling 3.0 std | 3 s, 720p, silent | 3 x $0.084 = **$0.25** [S] | JWT, paths, status values, callback; requires a prepaid pack (cheapest listed $9.80) |
| 8 | Kling 3.0 std | 5 s with sound | about $0.63 | audio flag and price |
| 9 | All three | same shot, 1 take each, cheapest tier | about $1 | parallel runner, ledger, selection UI, ffmpeg stitch end to end |
| 10 | Failure drills | kill app mid-poll, bad key, 429 simulation (mock server) | $0 | resume, backoff, no double-submit |

Mock server tests (no money) cover retry, ledger and cap logic first; real calls only start at step 1. Total real-money test budget about $3 plus the Kling pack purchase.

Discovery step before coding Seedance/Kling adapters: someone with a console login opens the official pages above (they need a browser) and copies the exact request schema into this file, replacing every [S]/[N] mark. The BytePlus and Kling console pages also show real rate limits, concurrency, region and account requirements, which I could not read.

## 11. Open items I could not confirm
Seedance 2.5 model ID and price; Seedance and Kling rate limits, concurrency, URL expiry, safety reason codes, regional/account requirements (BytePlus keys are region-isolated [S]; Kling global vs China sites differ); Kling kling-v3 endpoint paths; whether Veo has a per-project video concurrency cap; Seedance default watermark behavior.
