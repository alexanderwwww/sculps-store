#!/usr/bin/env bash
# Runs on the rented GPU. Makes one clip from a start image, with or without a trained LoRA.
# Inputs in /workspace/job/in: first.png, optional lora.safetensors.  Env: PROMPT.
# Output: /workspace/job/out/clip.mp4
# --video_size is HEIGHT then WIDTH: 832 480 is portrait 9:16.
# NOT proven yet (never run).
set -euo pipefail
R="${JOB_ROOT:-/workspace/job}"; IN="$R/in"; OUT="$R/out"; M=/workspace/models
: "${PROMPT:?}"; mkdir -p "$OUT"
cd /workspace
echo "== $(date -u +%T) installing"
if [ ! -d musubi-tuner ]; then
  git clone --depth 1 https://github.com/kohya-ss/musubi-tuner.git
  (cd musubi-tuner && pip install -q -e . && pip install -q "huggingface_hub[cli]" accelerate)
fi
if [ ! -f $M/Wan2.1_VAE.pth ]; then
  echo "== $(date -u +%T) downloading the model"
  mkdir -p $M
  huggingface-cli download Wan-AI/Wan2.1-I2V-14B-720P models_t5_umt5-xxl-enc-bf16.pth Wan2.1_VAE.pth --local-dir $M
  huggingface-cli download Comfy-Org/Wan_2.2_ComfyUI_Repackaged split_files/diffusion_models/wan2.2_i2v_low_noise_14B_fp16.safetensors split_files/diffusion_models/wan2.2_i2v_high_noise_14B_fp16.safetensors --local-dir $M
fi
LORA=""; [ -f "$IN/lora.safetensors" ] && LORA="--lora_weight $IN/lora.safetensors --lora_multiplier 1.0"
echo "== $(date -u +%T) making the clip"
cd musubi-tuner
python src/musubi_tuner/wan_generate_video.py --task i2v-A14B \
  --dit $M/split_files/diffusion_models/wan2.2_i2v_low_noise_14B_fp16.safetensors \
  --dit_high_noise $M/split_files/diffusion_models/wan2.2_i2v_high_noise_14B_fp16.safetensors \
  --vae $M/Wan2.1_VAE.pth --t5 $M/models_t5_umt5-xxl-enc-bf16.pth \
  --image_path "$IN/first.png" --video_size 832 480 --video_length 81 --infer_steps 30 --fp8 \
  --prompt "$PROMPT" --save_path "$OUT/clip.mp4" --attn_mode torch $LORA
ls -la "$OUT"
echo "== $(date -u +%T) done"
