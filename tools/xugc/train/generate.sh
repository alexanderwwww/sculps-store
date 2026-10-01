#!/usr/bin/env bash
# Runs on the rented GPU, started by pod_agent.py. Makes ONE video with LTX-2.5 (picture + sound together).
# Env: PROMPT, HF_TOKEN (a Hugging Face READ token that has accepted the LTX-2.5 terms),
#      FRAMES (8k+1: 121=5s, 241=10s, 361=15s, 481=20s at 24 fps), WIDTH, HEIGHT (multiples of 64), SEED
# Output: /workspace/job/out/clip.mp4 (+ info.txt: what ffprobe saw, including whether there is sound)
#
# NOT proven yet: written from Lightricks' README. The first paid run proves it. If a flag name is wrong,
# the job log shows the pipeline's own --help (also saved as out/help.txt) so the fix is one line.
set -euo pipefail
R="${JOB_ROOT:-/workspace/job}"; OUT="$R/out"; M=/workspace/models/ltx-2.5
: "${PROMPT:?}" "${HF_TOKEN:?}"
FRAMES="${FRAMES:-121}"; WIDTH="${WIDTH:-704}"; HEIGHT="${HEIGHT:-1280}"; SEED="${SEED:-$RANDOM}"
mkdir -p "$OUT" "$M"
cd /workspace
echo "== $(date -u +%T) installing"
command -v ffmpeg >/dev/null || (apt-get update -qq && apt-get install -y -qq ffmpeg >/dev/null)
pip install -q uv "huggingface_hub[cli,hf_transfer]"
[ -d LTX-2 ] || git clone --depth 1 https://github.com/Lightricks/LTX-2.git
(cd LTX-2 && uv sync)
(cd LTX-2 && uv run python -m ltx_pipelines.distilled --help > "$OUT/help.txt" 2>&1 || true)
nvidia-smi > "$OUT/gpu.txt" 2>&1 || true
df -h /workspace >> "$OUT/gpu.txt" 2>&1 || true
if [ "${PROBE:-0}" = "1" ]; then echo "== $(date -u +%T) probe finished (no model downloaded, no video made)"; exit 0; fi
SIZE=""; grep -q -- "--height" "$OUT/help.txt" && SIZE="--height $HEIGHT --width $WIDTH"
FILES="diffusion_models/ltx-2.5-22b-distilled-transformer-bf16.safetensors text_encoders/gemma4-12b-with-proj-ltx-2.5-bf16.safetensors vae/ltx-2.5-video-vae-bf16.safetensors vae/ltx-2.5-audio-vae-bf16.safetensors latent_upscale_models/ltx-2.5-latent-spatial-upscaler-x2-bf16-1.0.safetensors"
if [ ! -f "$M/.complete" ]; then
  echo "== $(date -u +%T) downloading the model (66 GB, once)"
  HF_HUB_ENABLE_HF_TRANSFER=1 HF_TOKEN="$HF_TOKEN" hf download Lightricks/LTX-2.5 $FILES --local-dir "$M"
  touch "$M/.complete"
fi
cd /workspace/LTX-2
run() {
  uv run python -m ltx_pipelines.distilled \
    --transformer-path "$M/diffusion_models/ltx-2.5-22b-distilled-transformer-bf16.safetensors" \
    --text-encoder-path "$M/text_encoders/gemma4-12b-with-proj-ltx-2.5-bf16.safetensors" \
    --video-vae-path "$M/vae/ltx-2.5-video-vae-bf16.safetensors" \
    --audio-vae-path "$M/vae/ltx-2.5-audio-vae-bf16.safetensors" \
    --spatial-upsampler-path "$M/latent_upscale_models/ltx-2.5-latent-spatial-upscaler-x2-bf16-1.0.safetensors" \
    --num-frames "$FRAMES" --seed "$SEED" $SIZE "$@" \
    --output-path "$OUT/clip.mp4" --prompt "$PROMPT"
}
echo "== $(date -u +%T) making the video"
run || { echo "== $(date -u +%T) retrying with 8-bit weights (memory)"; run --quantization fp8-cast; }
echo "== $(date -u +%T) finishing"
ffprobe -v error -show_entries stream=codec_type,width,height,duration -of default=nw=1 "$OUT/clip.mp4" > "$OUT/info.txt" 2>&1 || true
cat "$OUT/info.txt"; ls -la "$OUT"
echo "== $(date -u +%T) done"
