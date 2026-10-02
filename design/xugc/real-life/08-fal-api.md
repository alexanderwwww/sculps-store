# 08 — fal.ai API: the one rental key for XUGC

Fetched 2026-10-02. Every fact below comes from the URL next to it. Anything not confirmed is marked **UNVERIFIED**.
Raw OpenAPI schemas saved in `fal-openapi/` (slashes → `__`). Schema URL pattern:
`https://fal.ai/api/openapi/queue/openapi.json?endpoint_id=<id>`. Prices are the `pricingInfoOverride` text on
`https://fal.ai/models/<id>/api`. Endpoint ids discovered via the catalog `https://api.fal.ai/v1/models?q=<term>`.
Programmatic price check exists (`GET https://api.fal.ai/v1/models/pricing?endpoint_id=...`) but needs the key — re-run it once the key exists.

---

## 1. Seedance (ByteDance)

Newest on fal: **2.5** (`bytedance/seedance-2.5/...`, also `/us/` variants). 2.0 has `fast` and `mini` variants. No 2.5 fast/lite listed.

### 1a. `bytedance/seedance-2.5/image-to-video` — https://fal.ai/models/bytedance/seedance-2.5/image-to-video/api
Input (`Seedance25ImageToVideoInput`, required: `image_url`):
| field | type | enum / default |
|---|---|---|
| image_url | string | first frame. JPEG/PNG/WebP, max 30 MB |
| end_image_url | string\|null | last frame (null default) |
| prompt | string\|null | — |
| resolution | string | 480p, 720p, 1080p — default 720p |
| duration | string | auto, 4…30 — default auto |
| aspect_ratio | string | default "auto" — schema says "Always auto for image-to-video" (ratio follows the input image → feed 9:16 frames) |
| generate_audio | bool | default true |
| draft | bool | default false (480p draft, returns draft_id to complete at 1080p within 7 days) |
| codec | string | auto, H264, H265 — default auto |
| bitrate_mode | string | standard, high — default standard |
| end_user_id | string\|null | — |
Output: `video.url` (+ `seed`, `draft_id`).
Price: **$0.2205/s 480p, $0.4730/s 720p, $1.164/s 1080p** (token-based: $0.0214/1k tokens 480/720p).
Supports: first+last frame YES, 9:16 via input image, 480p/720p/1080p, 4–30 s, audio on/off.

### 1b. `bytedance/seedance-2.5/reference-to-video` — https://fal.ai/models/bytedance/seedance-2.5/reference-to-video/api
Fields: `image_urls` (array, refer as @Image1…), `audio_urls`, `video_urls`, `prompt`, `resolution` (480p/720p/1080p, def 720p),
`aspect_ratio` (auto, 21:9, 16:9, 4:3, 1:1, 3:4, **9:16**; def auto), `duration` (auto, 4…30), `task` (reference, editing, extension; def reference),
`generate_audio` (def true), `seed`, `draft`, `codec`, `bitrate_mode`. Max number of reference images: **UNVERIFIED** (no maxItems in schema).
Output `video.url`. Price same as 1a; ×0.6 with video inputs (input video seconds also billed).

### 1c. `bytedance/seedance-2.0/fast/image-to-video` — https://fal.ai/models/bytedance/seedance-2.0/fast/image-to-video/api
Required `prompt`, `image_url`. `end_image_url` (last frame), `resolution` 480p/720p (def 720p), `duration` auto,4…15 (def auto),
`aspect_ratio` auto,21:9,16:9,4:3,1:1,3:4,9:16 (def auto), `generate_audio` (def true), `codec`, `bitrate_mode`, `end_user_id`. Output `video.url`.
Price: **$0.2419/s at 720p** ($0.0112/1k tokens; 480p price not stated as a number → ~$0.11/s by the token formula, **UNVERIFIED**).

### 1d. `bytedance/seedance-2.0/mini/image-to-video` — https://fal.ai/models/bytedance/seedance-2.0/mini/image-to-video/api
Same fields as 1c minus `bitrate_mode`. 480p/720p, 4–15 s, first+last frame, 9:16, audio.
Price: **$0.0721/s 480p, $0.1547/s 720p**.
(2.0 standard `bytedance/seedance-2.0/image-to-video`: $0.3034/s 720p, $0.682/s 1080p — schema not saved.)

## 2. Kling v3 (newest; also o3 line and v3 turbo)

### 2a. `fal-ai/kling-video/v3/pro/image-to-video` — https://fal.ai/models/fal-ai/kling-video/v3/pro/image-to-video/api
Required `start_image_url`. Fields: `end_image_url` (tail frame), `prompt` | `multi_prompt` (not both), `shot_type` (customize, intelligent; def customize),
`duration` string 3…15 (def "5"), `generate_audio` (def true; Chinese/English voice), `elements` (array of {frontal_image_url, reference_image_urls 1–3, video_url, voice_id}),
`negative_prompt` (def "blur, distort, and low quality"), `cfg_scale` (def 0.5). **No aspect_ratio field** → 9:16 comes from the start image (inferred, UNVERIFIED).
Resolution field: none. Output `video.url`.
Price: **$0.112/s audio off, $0.168/s audio on, $0.196/s with voice control**.

### 2b. `fal-ai/kling-video/v3/standard/image-to-video` — https://fal.ai/models/fal-ai/kling-video/v3/standard/image-to-video/api
Same fields as 2a. Price: **$0.084/s off, $0.126/s on, $0.154/s voice control**.

### 2c. `fal-ai/kling-video/v3/turbo/standard/image-to-video` — https://fal.ai/models/fal-ai/kling-video/v3/turbo/standard/image-to-video/api
Required `image_url`; only `prompt`, `multi_prompt`, `duration` 3…15. **No end frame, no audio switch.** $0.112/s.

## 3. Veo 3.1 (standard / fast / lite)

### 3a. First-last frame: `fal-ai/veo3.1/first-last-frame-to-video`, `fal-ai/veo3.1/fast/first-last-frame-to-video`, `fal-ai/veo3.1/lite/first-last-frame-to-video`
Pages: https://fal.ai/models/fal-ai/veo3.1/first-last-frame-to-video/api (and /fast/, /lite/)
Required `prompt`, `first_frame_url`, `last_frame_url`. `duration` 4s, 6s, 8s (def 8s); `aspect_ratio` auto, 16:9, **9:16** (def auto);
`resolution` 720p, 1080p, 4k (lite: 720p, 1080p) def 720p; `generate_audio` def true; `negative_prompt`; `seed`;
`safety_tolerance` "1"…"6" def "4"; `auto_fix` def false. Output `video.url`. No 480p.
Price: standard **$0.20/s no audio, $0.40/s audio** (720p/1080p; 4k $0.40/$0.60) · fast **$0.10 / $0.15** (4k $0.30/$0.35) ·
lite **720p $0.03 no audio / $0.05 audio; 1080p $0.05 / $0.08**.

### 3b. Reference: `fal-ai/veo3.1/reference-to-video`, `fal-ai/veo3.1/fast/reference-to-video` (no lite reference listed)
Required `prompt`, `image_urls` (array; max count **UNVERIFIED**). `aspect_ratio` 16:9, 9:16 (**def 16:9 — must send 9:16**), `duration` (def "8s", enum not in schema — **UNVERIFIED**),
`resolution` 720p/1080p/4k, `generate_audio`, `safety_tolerance`, `auto_fix`. Output `video.url`.
Price: standard $0.20/$0.40 per s; fast $0.10/$0.15 per s.

## 4. Wan (newest on fal is **3.0**, not 2.6)

### 4a. `alibaba/wan-3.0/image-to-video` — https://fal.ai/models/alibaba/wan-3.0/image-to-video/api
Required `start_image_url`. `end_image_url` (last frame), `prompt`, `resolution` 480p/720p/1080p (**def 1080p**), `aspect_ratio` adaptive,16:9,4:3,1:1,3:4,9:16 (def adaptive),
`duration` integer|null (def 5; null = smart duration; range in description truncated — **UNVERIFIED** max), `audio` (def true), `enable_prompt_expansion` (def true),
`enable_thinking` (def false), `enable_safety_checker` (def true), `seed`. Output `video.url`, `duration`, `actual_prompt`.
Price: **$0.05/s 480p, $0.10/s 720p, $0.20/s 1080p** ("subject to change").

### 4b. `fal-ai/wan/v2.7/image-to-video` — https://fal.ai/models/fal-ai/wan/v2.7/image-to-video/api
`image_url`, `end_image_url`, `audio_url` (driving audio), `video_url` (continue), `prompt`, `negative_prompt`, `resolution` 720p/1080p (def 1080p),
`duration` int 2…15 (def 5), `enable_prompt_expansion`, `enable_safety_checker`, `seed`. **No aspect_ratio field.** $0.10/s 720p, $0.15/s 1080p.
(Also listed: `wan/v2.6/image-to-video` and `/flash` — not fetched.)

## 5. Image model for hidden frames

### `fal-ai/nano-banana-2/edit` — https://fal.ai/models/fal-ai/nano-banana-2/edit/api
(identical schema & price: `fal-ai/gemini-3.1-flash-image-preview/edit`)
Required `prompt`. `image_urls` array of strings (several refs; max count **UNVERIFIED**), `aspect_ratio` string|null def "auto" (accepts ratios like 9:16; enum not in schema — 9:16 value **UNVERIFIED** until a run),
`resolution` 0.5K/1K/2K/4K (def 1K), `num_images` (def 1), `output_format` jpeg/png/webp (def png), `safety_tolerance` "1"…"6" def "4",
`seed`, `sync_mode` (def false; true returns data URI), `limit_generations` (def true), `thinking_level` (minimal|high), `enable_web_search`, `system_prompt`, `video_url`/`audio_url`/`pdf_url`.
Output: `images[].url`, `description`. Price: **$0.08/image at 1K**; 2K ×1.5, 4K ×2, 0.5K ×0.75; web search +$0.015; high thinking +$0.002.

## 6. Sending local images (REST, no SDK)
Source: https://fal.ai/docs/documentation/model-apis/fal-cdn.md and the official JS client source `@fal-ai/client@1.10.1` `src/storage.js`, `src/config.js` (unpkg).
- **Data URIs accepted** in `*_url` fields (`"data:image/png;base64,..."`) — docs warn: not recommended above a few KB.
- **CDN upload (recommended)**, exactly as the SDK does it:
  1. `POST https://rest.fal.ai/storage/upload/initiate?storage_type=fal-cdn-v3` with `Authorization: Key $FAL_KEY`, JSON `{"content_type":"image/png","file_name":"x.png"}` → returns `upload_url`, `file_url`.
     (Probed now without key → `401 {"detail":"Authorization header is required"}`, endpoint is live.)
  2. `PUT <upload_url>` with body = file bytes, `Content-Type` = file type.
  3. Use `file_url` in the model input. Files >90 MB use `/storage/upload/initiate-multipart` (not needed).
- Uploaded/generated CDN files are **public by default**; retention configurable via `X-Fal-Object-Lifecycle-Preference` header (https://fal.ai/docs/documentation/model-apis/media-expiration.md).

## 7. Queue flow — https://fal.ai/docs/documentation/model-apis/inference/queue (fetched as docs.fal.ai/model-apis/model-endpoints/queue.md)
- Auth header: `Authorization: Key $FAL_KEY`.
- Submit: `POST https://queue.fal.run/<endpoint-id>` JSON body = model input → `{request_id, response_url, status_url, cancel_url, queue_position}`.
- Status: `GET <status_url>` (`?logs=1` optional) → `status` = `IN_QUEUE` | `IN_PROGRESS` | `COMPLETED`; on failure `COMPLETED` carries `error` and `error_type`.
- Result: `GET <response_url>` (with the auth header). Video path: **`video.url`** (all video endpoints above); image path: **`images[0].url`**.
- Cancel: `PUT <cancel_url>` → 202 `CANCELLATION_REQUESTED` / 400 `ALREADY_COMPLETED`.
- **Gotcha (from SDK source `src/queue.js` + `parseEndpointId`)**: status/result/cancel URLs use only `owner/alias` (e.g. `queue.fal.run/fal-ai/kling-video/requests/<id>/status`), not the full sub-path. **Always use the returned `status_url`/`response_url`**, never build them.
- Errors: model validation = HTTP 422, body `{"detail":[{loc,msg,type,url,ctx?,input?}]}`; `content_policy_violation` is 422, not retryable (https://fal.ai/docs/documentation/model-apis/errors.md). Infra errors = `{detail:"...", error_type:"request_timeout"|"runner_*"|...}` + `X-Fal-Error-Type` header (https://fal.ai/docs/documentation/model-apis/request-errors.md).
- Result file download: CDN URLs (`https://v3b.fal.media/...`) are public, **no auth needed** to download (FAQ https://fal.ai/docs/documentation/model-apis/faq.md), until they expire.
- Billing: only successful outputs billed; HTTP ≥500 never billed; queue wait is free (https://fal.ai/docs/documentation/model-apis/pricing.md).

## 8. Account side
- **Prepaid credits**, drawn down per use (pricing.md). Pay by card or ACH; purchased credits expire after 365 days; below the "lock threshold" the account is locked and requests rejected (faq.md).
- Concurrency starts at **2** simultaneous requests, rises with credit purchases up to 40 (concurrency-limits.md) — XUGC must queue, not fire 10 at once.
- Minimum top-up amount: **UNVERIFIED** (a search snippet says "no minimum spend"; not found in fetched doc text).
- Spend limit / auto top-up setting: **UNVERIFIED** — not in fetched docs. Prepaid itself caps spend at the balance loaded.

---

## Recommended endpoint per job
| Job | Endpoint | Price | Why |
|---|---|---|---|
| Hidden frames (9:16 stills from refs) | `fal-ai/nano-banana-2/edit` | $0.08/img (1K) | multi-ref `image_urls`, aspect_ratio |
| Scout (cheap motion test, first+last) | `fal-ai/veo3.1/lite/first-last-frame-to-video` 720p, audio off | $0.03/s (4 s = $0.12) | cheapest, 9:16 enum, 4/6/8 s |
| Scout alt (480p, longer) | `alibaba/wan-3.0/image-to-video` 480p or `bytedance/seedance-2.0/mini/image-to-video` 480p | $0.05/s · $0.0721/s | first+last, 9:16, up to 15 s |
| Final quality, first+last frame, speech | `fal-ai/kling-video/v3/pro/image-to-video` audio on | $0.168/s | tail frame + native audio, 3–15 s |
| Final alt | `fal-ai/veo3.1/fast/first-last-frame-to-video` 720p audio | $0.15/s | 9:16 explicit, 8 s max |
| Final from references (no frames) | `bytedance/seedance-2.5/reference-to-video` 720p | $0.473/s | refs + 9:16 + up to 30 s |
