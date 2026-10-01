#!/usr/bin/env bash
# Bake-off candidate: LTX-2.5 FULL two-stage pipeline (dev transformer + distilled LoRA), not the distilled shortcut.
# Env as generate.sh: PROMPT, HF_TOKEN, FRAMES, WIDTH, HEIGHT, SEED, REFS. Output: out/clip.mp4
set -euo pipefail
R="${JOB_ROOT:-/workspace/job}"; OUT="$R/out"; M=/workspace/models/ltx-2.5
: "${PROMPT:?}" "${HF_TOKEN:?}"; FRAMES="${FRAMES:-121}"; WIDTH="${WIDTH:-704}"; HEIGHT="${HEIGHT:-1280}"; SEED="${SEED:-$RANDOM}"
mkdir -p "$OUT" "$M"; cd /workspace
echo "== $(date -u +%T) installing"
command -v ffmpeg >/dev/null || (apt-get update -qq && apt-get install -y -qq ffmpeg >/dev/null)
pip install -q uv "huggingface_hub[cli,hf_transfer]"
[ -d LTX-2 ] || git clone --depth 1 https://github.com/Lightricks/LTX-2.git
(cd LTX-2 && uv sync)
(cd LTX-2 && uv run python -m ltx_pipelines.ti2vid_two_stages --help > "$OUT/help.txt" 2>&1 || true)
nvidia-smi > "$OUT/gpu.txt" 2>&1 || true
[ "${PROBE:-0}" = "1" ] && { echo "probe done"; exit 0; }
FILES="diffusion_models/ltx-2.5-22b-dev-transformer-bf16.safetensors text_encoders/gemma4-12b-with-proj-ltx-2.5-bf16.safetensors vae/ltx-2.5-video-vae-bf16.safetensors vae/ltx-2.5-audio-vae-bf16.safetensors latent_upscale_models/ltx-2.5-latent-spatial-upscaler-x2-bf16-1.0.safetensors loras/ltx-2.5-22b-distilled-lora-450-bf16.safetensors"
echo "== $(date -u +%T) fetching model files (skips what is on disk)"
HF_HUB_ENABLE_HF_TRANSFER=1 HF_TOKEN="$HF_TOKEN" hf download Lightricks/LTX-2.5 $FILES --local-dir "$M"
SIZE=""; grep -q -- "--height" "$OUT/help.txt" && SIZE="--height $HEIGHT --width $WIDTH"
IMG=""
if [ -n "${REFS:-}" ]; then IFS=',' read -ra R_ <<< "$REFS"
  for r_ in "${R_[@]}"; do IFS=':' read -r f_ i_ st_ <<< "$r_"; [ -f "$R/in/$f_" ] && IMG="$IMG --image $R/in/$f_ $i_ $st_"; done; fi
LORAARG=""; [ "${LORA:-0}" = "1" ] && [ -f "$R/in/lora.safetensors" ] && LORAARG="--lora $R/in/lora.safetensors 1.0"
cd /workspace/LTX-2
echo "== $(date -u +%T) making the video"
uv run python -m ltx_pipelines.ti2vid_two_stages \
  --transformer-path "$M/diffusion_models/ltx-2.5-22b-dev-transformer-bf16.safetensors" \
  --text-encoder-path "$M/text_encoders/gemma4-12b-with-proj-ltx-2.5-bf16.safetensors" \
  --video-vae-path "$M/vae/ltx-2.5-video-vae-bf16.safetensors" \
  --audio-vae-path "$M/vae/ltx-2.5-audio-vae-bf16.safetensors" \
  --spatial-upsampler-path "$M/latent_upscale_models/ltx-2.5-latent-spatial-upscaler-x2-bf16-1.0.safetensors" \
  --distilled-lora "$M/loras/ltx-2.5-22b-distilled-lora-450-bf16.safetensors" \
  --guidance-scale 7.5 --num-frames "$FRAMES" --seed "$SEED" $SIZE $IMG $LORAARG --quantization fp8-cast \
  --output-path "$OUT/clip.mp4" --prompt "$PROMPT"
ffprobe -v error -show_entries stream=codec_type,width,height,duration -of default=nw=1 "$OUT/clip.mp4" > "$OUT/info.txt" 2>&1 || true
cat "$OUT/info.txt"; echo "== $(date -u +%T) done"
