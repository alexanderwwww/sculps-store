# 09 — Kling through its official MCP connector (verified 2026-10-02 from `who_am_i`, mcpVersion 1.3.3)

Connected on Alex's account (userId 120628788, membership NORMAL, **0 credits** at the time). Every call is charged; never submit trial jobs; poll `query_tasks`; result URLs expire in 24 h (download at once). Tools: text_to_video, image_to_video, omni_ref_video, motion_control, text_to_image, image_to_image, element_create/get/list/update/delete, file_upload, motion_library_list, query_tasks, query_membership_and_credits, who_am_i.

## image_to_video (inputs: first_image, tail_image; local files go through file_upload first)
| model | notes | duration | res | audio | tail image |
|---|---|---|---|---|---|
| kling-video-v3_0 (default) | multi-shot, elements (max 3), native audio | 3–15 | 720p (std) | enable_audio true/false | yes |
| kling-video-v3_0_turbo | best value for ONE image; no tail, no elements | 3–15 | 720p/1080p | — | no |
| kling-video-v3_0_omni | multi-image refs (image_1..7) + elements, voice-driven characters, aspect_ratio incl. 9:16 | 3–15 | 720p | enable_audio | first/tail + multi ref |
| kling-video-o1 | image_1..7, aspect 9:16 | 3–10 | 720p | — | — |
| kling-video-v2_6 | tail image needs 1080p; audio only at 1080p | 5/10 | 720p/1080p | — | — |
| kling-video-v2_5 | cheap, audio_prompt, music_prompt, enable_asmr | 5/10 | 720p | yes | yes |
- Reference an input image inside the prompt as `图片1`, `图片2` … (that exact token). Elements: write `<<<id>>>` and list `elements` JSON `[{id,bindName}]`.
- v3_0 has no aspect_ratio argument on image_to_video: the ratio follows the first image, so **feed 9:16 frames**.
## text_to_video
Same models, `aspect_ratio` 16:9 / 9:16 / 1:1 (set 9:16 for UGC), default model v3_0_omni, no subjects/elements allowed.
## omni_ref_video
v3_0_omni and o1: up to 7 images + elements (≤4 images if a reference video is given), one reference video (3–10 s, MP4/MOV), `aspect_ratio` auto when images are given; with video_1, `enable_audio` must be false.
## Images on Kling
image_to_image models: gemini-3.1-flash-image (Nano Banana 2, up to 10 refs, **9:16 allowed**, 0.5k–4k), gpt-image2, gemini-3-pro-image, kling-image-v3_0_omni, kling-image-o1, kling-image-v3_0, kling-image-v2_1. Elements (reusable characters/products) can bind to image and video models.
## Credits
Non-members get 720p standard only. Top-up/membership: https://kling.ai/h5-app/membership-agent?r=agent_Claude&type=credit . Free daily credits (if any) are claimed on klingai.com, not via the MCP.
