#!/usr/bin/env bash
# Runs on the rented GPU. Trains ONE "XUGC Real Life" LoRA from the uploaded pieces.
# Env: MODEL = ltx | hunyuan | wan ; STEPS / EPOCHS (optional) ; HF_TOKEN (ltx) ; TRIGGER (default xugciphone) ; DRY=1 = tiny run to prove it works
# Input: $JOB_ROOT/in/cNNN.mp4 + cNNN.json (the collector's notes). Output: out/lora.safetensors, out/train.log
# NOT proven on a GPU yet: written from the trainers' own docs. The first dry run proves it; if a flag is wrong the log shows the trainer's --help.
set -euo pipefail
R="${JOB_ROOT:-/workspace/job}"; OUT="$R/out"; IN="$R/in"; W=/workspace
: "${MODEL:?}"; TRIGGER="${TRIGGER:-xugciphone}"; DRY="${DRY:-0}"
mkdir -p "$OUT"; cd "$W"
echo "== $(date -u +%T) installing"
command -v ffmpeg >/dev/null || (apt-get update -qq && apt-get install -y -qq ffmpeg >/dev/null)
pip install -q uv "huggingface_hub[cli,hf_transfer]"
# captioning helpers are optional: if one fails to install, captions fall back to plain ones and the run goes on
pip install -q faster-whisper qwen-vl-utils "transformers>=4.49,<5" accelerate pillow || echo "== $(date -u +%T) caption helpers did not all install; plain captions will be used"
nvidia-smi > "$OUT/gpu.txt" 2>&1 || true
NCLIPS=$(ls "$IN"/c*.mp4 2>/dev/null | wc -l); echo "clips: $NCLIPS"
[ "$NCLIPS" -ge 1 ] || { echo "no clips uploaded"; exit 2; }
if [ "$DRY" = "1" ]; then  # dry run: 3 clips only
  for f in $(ls "$IN"/c*.mp4 | tail -n +4); do rm -f "$f" "${f%.mp4}.json"; done
fi

echo "== $(date -u +%T) writing captions"
TRIGGER="$TRIGGER" HF_HUB_ENABLE_HF_TRANSFER=1 python3 "$IN/caption_clips.py" "$IN" 2>&1 | tee "$OUT/caption.log" | tail -n 8 || echo "== $(date -u +%T) the captioner stopped; using plain captions for what is missing"
for f in "$IN"/c*.mp4; do b="${f%.mp4}"; [ -s "$b.txt" ] || echo "$TRIGGER. [VISUAL] A person films a product video on a phone, handheld, real room light. [SPEECH] No speech. [SOUNDS] close phone-microphone voice, faint room tone. [TEXT] None." > "$b.txt"; done

# Time box: a budgeted run trains until shortly before the pod's own deadline (the money limit), saves checkpoints as it goes,
# and a STOP file (the app's "Stop and keep") ends the trainer early. Whatever was saved last is what comes home.
BUDGET="${BUDGET:-0}"; rm -f "$R/STOP"
trainrun() {
  local left ts
  left=$(python3 -c "import os,time;print(int(float(os.environ.get('MAX_MINUTES','180'))*60-(time.time()-float(os.environ.get('AGENT_BOOT',str(time.time()))))))")
  ts=$((left-600)); [ "$ts" -lt 180 ] && ts=180
  echo "== $(date -u +%T) training for up to $((ts/60)) minutes"
  ( while [ ! -f "$R/STOP" ]; do sleep 5; done; pkill -INT -f "ltx-trainer|train.py|wan_train_network|hv_1_5_train_network" || true ) &
  local watcher=$!
  timeout -s INT -k 90 "${ts}s" "$@" 2>&1 | tee -a "$OUT/train.log" || true
  kill "$watcher" 2>/dev/null || true
}
case "$MODEL" in
ltx)
  : "${HF_TOKEN:?}"; M=$W/models/ltx-2.5; mkdir -p "$M"
  [ -d LTX-2 ] || git clone --depth 1 https://github.com/Lightricks/LTX-2.git
  (cd LTX-2 && uv sync)
  FILES="diffusion_models/ltx-2.5-22b-dev-transformer-bf16.safetensors text_encoders/gemma4-12b-with-proj-ltx-2.5-bf16.safetensors vae/ltx-2.5-video-vae-bf16.safetensors vae/ltx-2.5-audio-vae-bf16.safetensors"
  HF_HUB_ENABLE_HF_TRANSFER=1 HF_TOKEN="$HF_TOKEN" hf download Lightricks/LTX-2.5 $FILES --local-dir "$M"
  python3 - "$IN" <<'PY'
import json, glob, os, sys
d = sys.argv[1]; rows = []
for f in sorted(glob.glob(d + "/c*.mp4")):
    c = f[:-4] + ".txt"
    if os.path.exists(c):
        rows.append({"caption": open(c).read(), "video": os.path.basename(f)})
json.dump(rows, open(d + "/dataset.json", "w"), indent=1)
print(len(rows), "rows")
PY
  cd LTX-2
  ls packages 2>/dev/null | tee "$OUT/layout.txt"
  uv run python packages/ltx-trainer/scripts/process_dataset.py --help > "$OUT/help.txt" 2>&1 || true
  # Flags below are from the trainer's own source (packages/ltx-trainer/scripts/process_dataset.py): the model, text encoder and both VAEs are FILES of the split pack.
  TX="$M/diffusion_models/ltx-2.5-22b-dev-transformer-bf16.safetensors"; TE="$M/text_encoders/gemma4-12b-with-proj-ltx-2.5-bf16.safetensors"
  VV="$M/vae/ltx-2.5-video-vae-bf16.safetensors"; AV="$M/vae/ltx-2.5-audio-vae-bf16.safetensors"
  uv run python packages/ltx-trainer/scripts/process_dataset.py "$IN/dataset.json" --resolution-buckets "544x960x49" \
    --model-path "$TX" --text-encoder-path "$TE" --video-vae-path "$VV" --audio-vae-path "$AV" --output-dir "$W/pre" --lora-trigger "$TRIGGER" --overwrite 2>&1 | tee -a "$OUT/train.log"
  if [ "$DRY" = "1" ]; then ST=60; else ST="${STEPS:-2000}"; fi
  SCHED=linear; CK=250; if [ "$BUDGET" = "1" ]; then SCHED=constant; CK=100; ST=4000; fi
  cat > "$W/ltx_lora.yaml" <<YML
model:
  model_path: "$TX"
  text_encoder_path: "$TE"
  video_vae_path: "$VV"
  audio_vae_path: "$AV"
  training_mode: "lora"
lora:
  rank: 32
  alpha: 32
  dropout: 0.0
  target_modules: ["to_k", "to_q", "to_v", "to_out.0"]
training_strategy:
  name: "flexible"
  video: {is_generated: true, latents_dir: "latents"}
  audio: {is_generated: true, latents_dir: "audio_latents"}
optimization:
  learning_rate: 1e-4
  steps: $ST
  batch_size: 1
  gradient_accumulation_steps: 1
  max_grad_norm: 1.0
  optimizer_type: "adamw"
  scheduler_type: "$SCHED"
  enable_gradient_checkpointing: true
acceleration:
  mixed_precision_mode: "bf16"
  quantization: null
  load_text_encoder_in_8bit: false
data:
  preprocessed_data_root: "$W/pre"
  num_dataloader_workers: 2
checkpoints:
  interval: $CK
  keep_last_n: 3
output_dir: "$OUT/ckpt"
YML
  trainrun uv run python packages/ltx-trainer/scripts/train.py "$W/ltx_lora.yaml"
  ;;
hunyuan|wan)
  # pinned to the exact musubi-tuner commit whose flags, loaders and dependencies were read (2026-10-02); a newer one could change them
  MUSUBI=f8a1b03794a49239a3539015075f5123d6c07d66
  [ -d musubi-tuner ] || { mkdir musubi-tuner && (cd musubi-tuner && git init -q && git remote add origin https://github.com/kohya-ss/musubi-tuner.git && git fetch -q --depth 1 origin "$MUSUBI" && git checkout -q FETCH_HEAD); }
  # musubi-tuner README: install PyTorch for the CUDA version FIRST (2.6.0 or later is required: its transformers 5.x
  # switches PyTorch off below 2.5, which is exactly how the first Wan run died). The pod image is CUDA 12.4 / Python 3.11 / torch 2.4.
  pip install -q torch==2.6.0 torchvision==0.21.0 --index-url https://download.pytorch.org/whl/cu124
  (cd musubi-tuner && pip install -q -e .)
  # fail in a minute, before the big model download, if the trainer cannot see PyTorch or the GPU
  if ! python3 -c "import torch, transformers; from transformers.utils import is_torch_available as ok; assert ok(), 'transformers cannot use torch ' + torch.__version__; assert torch.cuda.is_available(), 'no GPU visible'; print('preflight ok: torch', torch.__version__, 'transformers', transformers.__version__, torch.cuda.get_device_name(0))" >> "$OUT/train.log" 2>&1; then
    tail -n 5 "$OUT/train.log"; echo "preflight failed: stopping before any model download"; exit 4
  fi
  D="$W/ds"; mkdir -p "$D"; find "${D:?}" -mindepth 1 -delete
  for f in "$IN"/c*.mp4; do
    b=$(basename "$f" .mp4); [ -f "$IN/$b.txt" ] || continue
    if [ "$MODEL" = wan ]; then
      ffmpeg -loglevel error -y -i "$f" -an -vf "scale=544:960:force_original_aspect_ratio=increase,crop=544:960,fps=16" -frames:v 81 "$D/$b.mp4"
    else
      ffmpeg -loglevel error -y -i "$f" -an -vf "scale=480:848:force_original_aspect_ratio=increase,crop=480:848,fps=24" -frames:v 65 "$D/$b.mp4"
    fi
    cp "$IN/$b.txt" "$D/$b.txt"
  done
  if [ "$DRY" = "1" ]; then EP=2; elif [ "$BUDGET" = "1" ]; then EP=200; else EP="${EPOCHS:-16}"; fi
  if [ "$MODEL" = wan ]; then
    M=$W/models/wan22; mkdir -p "$M"
    HF_HUB_ENABLE_HF_TRANSFER=1 hf download Comfy-Org/Wan_2.2_ComfyUI_Repackaged --include "split_files/diffusion_models/wan2.2_t2v_low_noise_14B_fp16.safetensors" "split_files/diffusion_models/wan2.2_t2v_high_noise_14B_fp16.safetensors" "split_files/vae/wan_2.1_vae.safetensors" --local-dir "$M" 2>&1 | tail -2
    # musubi-tuner loads Wan's OWN T5 file (docs/wan.md; wan/modules/t5.py loads it strict); Comfy's umt5 file has different key names
    HF_HUB_ENABLE_HF_TRANSFER=1 hf download Wan-AI/Wan2.1-T2V-14B models_t5_umt5-xxl-enc-bf16.pth --local-dir "$M/t5" 2>&1 | tail -2
    cat > "$W/ds.toml" <<T
[general]
resolution = [544, 960]
caption_extension = ".txt"
batch_size = 1
enable_bucket = true
[[datasets]]
video_directory = "$D"
cache_directory = "$W/cache"
target_frames = [45]
frame_extraction = "head"
T
    cd musubi-tuner
    python src/musubi_tuner/wan_cache_latents.py --dataset_config "$W/ds.toml" --vae "$M/split_files/vae/wan_2.1_vae.safetensors" 2>&1 | tee -a "$OUT/train.log"
    python src/musubi_tuner/wan_cache_text_encoder_outputs.py --dataset_config "$W/ds.toml" --t5 "$M/t5/models_t5_umt5-xxl-enc-bf16.pth" --batch_size 4 2>&1 | tee -a "$OUT/train.log"
    trainrun accelerate launch --num_cpu_threads_per_process 1 --mixed_precision bf16 src/musubi_tuner/wan_train_network.py --task t2v-A14B \
      --dit "$M/split_files/diffusion_models/wan2.2_t2v_low_noise_14B_fp16.safetensors" --dit_high_noise "$M/split_files/diffusion_models/wan2.2_t2v_high_noise_14B_fp16.safetensors" \
      --dataset_config "$W/ds.toml" --sdpa --mixed_precision bf16 --fp8_base --gradient_checkpointing --offload_inactive_dit \
      --optimizer_type adamw8bit --learning_rate 2e-4 --timestep_sampling shift --discrete_flow_shift 12.0 --timestep_boundary 0.875 \
      --network_module networks.lora_wan --network_dim 32 --max_train_epochs "$EP" --save_every_n_epochs 1 --seed 42 \
      --output_dir "$OUT/ckpt" --output_name xugc_real_life
  else
    M=$W/models/hy15; mkdir -p "$M"
    HF_HUB_ENABLE_HF_TRANSFER=1 hf download tencent/HunyuanVideo-1.5 --local-dir "$M" 2>&1 | tail -2
    cat > "$W/ds.toml" <<T
[general]
resolution = [480, 848]
caption_extension = ".txt"
batch_size = 1
enable_bucket = true
[[datasets]]
video_directory = "$D"
cache_directory = "$W/cache"
target_frames = [65]
frame_extraction = "head"
T
    cd musubi-tuner
    python src/musubi_tuner/hv_1_5_cache_latents.py --help > "$OUT/help.txt" 2>&1 || true
    python src/musubi_tuner/hv_1_5_cache_latents.py --dataset_config "$W/ds.toml" --vae "$M/vae" 2>&1 | tee -a "$OUT/train.log"
    python src/musubi_tuner/hv_1_5_cache_text_encoder_outputs.py --dataset_config "$W/ds.toml" 2>&1 | tee -a "$OUT/train.log"
    trainrun accelerate launch --num_cpu_threads_per_process 1 --mixed_precision bf16 src/musubi_tuner/hv_1_5_train_network.py \
      --dataset_config "$W/ds.toml" --sdpa --mixed_precision bf16 --gradient_checkpointing \
      --optimizer_type adamw --learning_rate 1e-4 --network_module networks.lora_hv_1_5 --network_dim 32 --discrete_flow_shift 2.0 \
      --max_train_epochs "$EP" --save_every_n_epochs 1 --seed 42 --output_dir "$OUT/ckpt" --output_name xugc_real_life
  fi
  ;;
*) echo "unknown MODEL $MODEL"; exit 2 ;;
esac
LAST=$(find "$OUT/ckpt" -name "*.safetensors" -printf "%T@ %p\n" 2>/dev/null | sort -n | tail -1 | cut -d" " -f2- || true)
[ -n "$LAST" ] || { echo "the trainer produced no LoRA file"; exit 3; }
cp "$LAST" "$OUT/lora.safetensors"
ls -la "$OUT"; echo "== $(date -u +%T) done"
