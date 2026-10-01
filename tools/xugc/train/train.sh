#!/usr/bin/env bash
# Runs on the rented GPU, started by pod_agent.py. Trains ONE Wan 2.2 LoRA.
#
# Inputs (already uploaded to /workspace/job/in): v-0001.mp4 v-0002.mp4 ... (the videos), scripts, captions.json (optional, keyed by those file names)
# Env: LORA_NAME, EPOCHS (default 16), DRY=1 (3 clips, 1 epoch: proves the whole chain cheaply),
#      CAPTION_PREFIX
# Output: /workspace/job/out/<LORA_NAME>.safetensors plus the manifest and the log tail.
#
# NOT proven yet: written from musubi-tuner's Wan 2.2 documentation and never run.
# The first paid run is the DRY run, and its only job is to produce a file.
set -euo pipefail
R="${JOB_ROOT:-/workspace/job}"; IN="$R/in"; OUT="$R/out"; M=/workspace/models
: "${LORA_NAME:?}"; EPOCHS="${EPOCHS:-16}"; TASK=i2v-A14B
[ "${DRY:-0}" = "1" ] && EPOCHS=1
mkdir -p "$OUT" "$R/data"
echo "== $(date -u +%T) installing"
command -v ffmpeg >/dev/null || (apt-get update -qq && apt-get install -y -qq ffmpeg >/dev/null)
cd /workspace
[ -d musubi-tuner ] || git clone --depth 1 https://github.com/kohya-ss/musubi-tuner.git
cd musubi-tuner && pip install -q -e . && pip install -q "huggingface_hub[cli]" accelerate bitsandbytes opencv-python-headless
echo "== $(date -u +%T) models"
mkdir -p $M
huggingface-cli download Wan-AI/Wan2.1-I2V-14B-720P models_t5_umt5-xxl-enc-bf16.pth Wan2.1_VAE.pth --local-dir $M
huggingface-cli download Comfy-Org/Wan_2.2_ComfyUI_Repackaged split_files/diffusion_models/wan2.2_i2v_low_noise_14B_fp16.safetensors split_files/diffusion_models/wan2.2_i2v_high_noise_14B_fp16.safetensors --local-dir $M
echo "== $(date -u +%T) preparing clips"
mkdir -p "$R/videos" && cp "$IN"/v-*.* "$R/videos"/
CAPS=""; [ -f "$IN/captions.json" ] && CAPS="--captions $IN/captions.json"
python3 "$IN/prep_dataset.py" --src "$R/videos" --out "$R/data" $CAPS --prefix "${CAPTION_PREFIX:-}"
if [ "${DRY:-0}" = "1" ]; then ls "$R/data/clips"/*.mp4 | tail -n +4 | while read f; do rm -f "$f" "${f%.mp4}.txt"; done; fi
python3 "$IN/caption.py" --clips "$R/data/clips" --prefix "${CAPTION_PREFIX:-}"
cp "$R/data/manifest.json" "$OUT/manifest.json"; cat "$R/data/clips"/*.txt | head -c 2000 > "$OUT/captions-sample.txt" || true
sed -i "s#{{WORK}}#$R/data#g" "$R/data/dataset.toml"
cd /workspace/musubi-tuner
echo "== $(date -u +%T) caching"
python src/musubi_tuner/wan_cache_latents.py --dataset_config "$R/data/dataset.toml" --vae $M/Wan2.1_VAE.pth
python src/musubi_tuner/wan_cache_text_encoder_outputs.py --dataset_config "$R/data/dataset.toml" --t5 $M/models_t5_umt5-xxl-enc-bf16.pth --batch_size 16
echo "== $(date -u +%T) training ($EPOCHS epochs)"
accelerate launch --num_cpu_threads_per_process 1 --mixed_precision bf16 src/musubi_tuner/wan_train_network.py \
  --task $TASK \
  --dit $M/split_files/diffusion_models/wan2.2_i2v_low_noise_14B_fp16.safetensors \
  --dit_high_noise $M/split_files/diffusion_models/wan2.2_i2v_high_noise_14B_fp16.safetensors \
  --dataset_config "$R/data/dataset.toml" --vae $M/Wan2.1_VAE.pth --t5 $M/models_t5_umt5-xxl-enc-bf16.pth \
  --sdpa --mixed_precision bf16 --fp8_base --optimizer_type adamw8bit --learning_rate 2e-4 --gradient_checkpointing \
  --network_module networks.lora_wan --network_dim 32 \
  --timestep_sampling shift --discrete_flow_shift 5.0 --timestep_boundary 0.9 --preserve_distribution_shape \
  --max_train_epochs "$EPOCHS" --save_every_n_epochs 1 --seed 42 \
  --output_dir "$OUT" --output_name "$LORA_NAME"
ls -la "$OUT"
echo "== $(date -u +%T) done"
