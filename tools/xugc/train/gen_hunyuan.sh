#!/usr/bin/env bash
# Bake-off candidate: HunyuanVideo 1.5 image-to-video on one GPU. Same env contract as generate.sh.
# Env: PROMPT, FRAMES (121), REFS (first file used as the start picture), SEED. Output: out/clip.mp4
set -euo pipefail
R="${JOB_ROOT:-/workspace/job}"; OUT="$R/out"; M=/workspace/models/hunyuan15
: "${PROMPT:?}"; FRAMES="${FRAMES:-121}"; SEED="${SEED:-$RANDOM}"
mkdir -p "$OUT" "$M"; cd /workspace
echo "== $(date -u +%T) installing"
command -v ffmpeg >/dev/null || (apt-get update -qq && apt-get install -y -qq ffmpeg >/dev/null)
pip install -q "huggingface_hub[cli,hf_transfer]"
[ -d HunyuanVideo-1.5 ] || git clone --depth 1 https://github.com/Tencent-Hunyuan/HunyuanVideo-1.5.git
(cd HunyuanVideo-1.5 && pip install -q -r requirements.txt)
nvidia-smi > "$OUT/gpu.txt" 2>&1 || true
(cd HunyuanVideo-1.5 && python generate.py --help > "$OUT/help.txt" 2>&1 || true)
[ "${PROBE:-0}" = "1" ] && { echo "probe done"; exit 0; }
if [ ! -f "$M/.complete" ]; then
  echo "== $(date -u +%T) downloading the model"
  HF_HUB_ENABLE_HF_TRANSFER=1 hf download tencent/HunyuanVideo-1.5 --local-dir "$M"
  touch "$M/.complete"
fi
IMG=""; if [ -n "${REFS:-}" ]; then f_="${REFS%%:*}"; [ -f "$R/in/$f_" ] && IMG="--image_path $R/in/$f_"; fi
cd /workspace/HunyuanVideo-1.5
echo "== $(date -u +%T) making the video"
torchrun --nproc_per_node=1 generate.py --prompt "$PROMPT" $IMG --resolution 720p --aspect_ratio 9:16 \
  --video_length "$FRAMES" --seed "$SEED" --offloading true --output_path "$OUT/clip.mp4" --model_path "$M"
ffprobe -v error -show_entries stream=codec_type,width,height,duration -of default=nw=1 "$OUT/clip.mp4" > "$OUT/info.txt" 2>&1 || true
cat "$OUT/info.txt"; echo "== $(date -u +%T) done"
