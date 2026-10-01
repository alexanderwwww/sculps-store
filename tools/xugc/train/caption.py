#!/usr/bin/env python3
"""
Write a caption for every clip that has none, using an open vision model on the GPU.

  python3 caption.py --clips dataset/clips [--model Qwen/Qwen2.5-VL-7B-Instruct] [--prefix "UGC phone video."]

Runs INSIDE the rented GPU (needs torch + transformers + a GPU). It looks at four
frames of each clip and writes one plain sentence or two: who is in it, what they do,
what the product does, how the camera moves. The same words the trainer will see at
generation time, so they must describe, not sell.

NOT proven yet: this file has not been run on a GPU. The first paid run starts by
captioning two clips and printing them for a human to read before anything trains.
"""
import argparse, pathlib, sys

PROMPT = ("Describe this phone-camera video in one or two plain sentences for a video model: "
          "who is in it, what they do, what the product or object does, how the camera moves, the lighting. "
          "No opinions, no marketing words.")


def frames(path, count=4):
    import cv2  # opencv-python-headless
    cap = cv2.VideoCapture(str(path))
    total = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    out = []
    for k in range(count):
        cap.set(cv2.CAP_PROP_POS_FRAMES, int(total * (k + 0.5) / count))
        ok, img = cap.read()
        if ok:
            out.append(cv2.cvtColor(img, cv2.COLOR_BGR2RGB))
    cap.release()
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--clips", required=True)
    ap.add_argument("--model", default="Qwen/Qwen2.5-VL-7B-Instruct")
    ap.add_argument("--prefix", default="")
    ap.add_argument("--limit", type=int, default=0, help="caption only this many clips (a first read-through)")
    a = ap.parse_args()

    from transformers import AutoProcessor, Qwen2_5_VLForConditionalGeneration
    from PIL import Image
    import torch

    model = Qwen2_5_VLForConditionalGeneration.from_pretrained(a.model, torch_dtype=torch.bfloat16, device_map="auto")
    proc = AutoProcessor.from_pretrained(a.model)

    todo = [p for p in sorted(pathlib.Path(a.clips).glob("*.mp4")) if not p.with_suffix(".txt").exists() or not p.with_suffix(".txt").read_text().strip()]
    if a.limit:
        todo = todo[: a.limit]
    for p in todo:
        imgs = [Image.fromarray(f) for f in frames(p)]
        msgs = [{"role": "user", "content": [{"type": "image", "image": im} for im in imgs] + [{"type": "text", "text": PROMPT}]}]
        text = proc.apply_chat_template(msgs, tokenize=False, add_generation_prompt=True)
        inputs = proc(text=[text], images=imgs, return_tensors="pt").to(model.device)
        ids = model.generate(**inputs, max_new_tokens=90, do_sample=False)
        cap = proc.batch_decode(ids[:, inputs.input_ids.shape[1]:], skip_special_tokens=True)[0].strip().replace("\n", " ")
        p.with_suffix(".txt").write_text((a.prefix + " " + cap).strip())
        print(p.name, "->", cap)


if __name__ == "__main__":
    main()
