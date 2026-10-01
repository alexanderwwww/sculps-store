#!/usr/bin/env bash
# Bake-off candidate: Wan 2.2 image-to-video (I2V-A14B) on one 80 GB GPU. Output: out/clip.mp4 (no sound).
set -euo pipefail
R="${JOB_ROOT:-/workspace/job}"; OUT="$R/out"; M=/workspace/models/wan22-i2v
: "${PROMPT:?}"; FRAMES="${FRAMES:-121}"; SEED="${SEED:-$RANDOM}"
mkdir -p "$OUT" "$M"; cd /workspace
echo "== $(date -u +%T) installing"
command -v ffmpeg >/dev/null || (apt-get update -qq && apt-get install -y -qq ffmpeg >/dev/null)
pip install -q "huggingface_hub[cli,hf_transfer]"
[ -d Wan2.2 ] || git clone --depth 1 https://github.com/Wan-Video/Wan2.2.git
(cd Wan2.2 && pip install -q -r requirements.txt)
nvidia-smi > "$OUT/gpu.txt" 2>&1 || true
(cd Wan2.2 && python generate.py --help > "$OUT/help.txt" 2>&1 || true)
[ "${PROBE:-0}" = "1" ] && { echo "probe done"; exit 0; }
if [ ! -f "$M/.complete" ]; then
  echo "== $(date -u +%T) downloading the model"
  HF_HUB_ENABLE_HF_TRANSFER=1 hf download Wan-AI/Wan2.2-I2V-A14B --local-dir "$M"
  touch "$M/.complete"
fi
f_=""; [ -n "${REFS:-}" ] && f_="${REFS%%:*}"
[ -n "$f_" ] && [ -f "$R/in/$f_" ] || { echo "Wan needs a start picture (REFS)"; exit 2; }
cd /workspace/Wan2.2
echo "== $(date -u +%T) making the video"
python generate.py --task i2v-A14B --size '704*1280' --ckpt_dir "$M" --image "$R/in/$f_" \
  --frame_num "$((FRAMES<=81?FRAMES:81))" --base_seed "$SEED" --offload_model True --convert_model_dtype \
  --prompt "$PROMPT" --save_file "$OUT/clip.mp4"
ffprobe -v error -show_entries stream=codec_type,width,height,duration -of default=nw=1 "$OUT/clip.mp4" > "$OUT/info.txt" 2>&1 || true
cat "$OUT/info.txt"; echo "== $(date -u +%T) done"
