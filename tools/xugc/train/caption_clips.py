#!/usr/bin/env python3
"""Runs on the GPU. For every cNNN.mp4 in IN/ with a cNNN.json (creator, place, sound hint, loudness) writes cNNN.txt in the
team's caption format: [VISUAL] ... [SPEECH] ... [SOUNDS] ... [TEXT] ..., starting with the trigger word.
Picture: Qwen2.5-VL-7B-Instruct watches the clip. Speech: faster-whisper. Sounds: from the collector's hint."""
import json, os, sys, glob

IN = sys.argv[1]; TRIGGER = os.environ.get("TRIGGER", "xugciphone")
SOUND = {"voice": "close phone-microphone voice, faint room tone", "asmr": "close crisp handling sounds, packaging crinkle, soft taps, quiet room tone",
         "room": "faint room tone, small product and hand sounds", "street": "street ambience, distant traffic, wind on the microphone", "music": "background music bed under room tone"}
ASK = ("Describe this vertical phone video for a video-model training caption in 2 to 4 plain sentences, present tense. Say who is in it "
       "(approximate age, hair, clothes), the room and light, what the hands and body do, what the product is and how it is held, and how the "
       "phone camera moves (handheld sway, drift, refocus). Do not say 'video' or 'the creator'. Describe only what is visible.")


def whisper_all(files):
    try:
        from faster_whisper import WhisperModel
        m = WhisperModel("small", device="cuda", compute_type="float16")
    except Exception as e:
        print("whisper unavailable:", e)
        return {f: "" for f in files}
    out = {}
    for f in files:
        try:
            segs, _ = m.transcribe(f, vad_filter=True)
            out[f] = " ".join(s.text.strip() for s in segs).strip()
        except Exception:
            out[f] = ""
    return out


def main():
    files = sorted(glob.glob(os.path.join(IN, "c*.mp4")))
    if not files:
        sys.exit("no clips to caption")
    import torch
    from transformers import Qwen2_5_VLForConditionalGeneration, AutoProcessor
    from qwen_vl_utils import process_vision_info
    mid = "Qwen/Qwen2.5-VL-7B-Instruct"
    model = Qwen2_5_VLForConditionalGeneration.from_pretrained(mid, torch_dtype=torch.bfloat16, device_map="auto")
    proc = AutoProcessor.from_pretrained(mid)
    speech = whisper_all(files)
    for f in files:
        meta = {}
        try:
            meta = json.load(open(f[:-4] + ".json"))
        except Exception:
            pass
        msgs = [{"role": "user", "content": [{"type": "video", "video": "file://" + os.path.abspath(f), "fps": 2.0, "max_pixels": 360 * 640}, {"type": "text", "text": ASK}]}]
        text = proc.apply_chat_template(msgs, tokenize=False, add_generation_prompt=True)
        img, vid = process_vision_info(msgs)
        inp = proc(text=[text], images=img, videos=vid, padding=True, return_tensors="pt").to(model.device)
        gen = model.generate(**inp, max_new_tokens=200, do_sample=False)
        vis = proc.batch_decode(gen[:, inp.input_ids.shape[1]:], skip_special_tokens=True)[0].strip().replace("\n", " ")
        sp = speech.get(f, "")
        snd = SOUND.get(meta.get("sound", "voice"), SOUND["voice"])
        cap = f"{TRIGGER}. [VISUAL] {vis} [SPEECH] " + (f'The person says: "{sp}"' if sp else "No speech.") + f" [SOUNDS] {snd}. [TEXT] None."
        open(f[:-4] + ".txt", "w").write(cap)
        print(os.path.basename(f), "->", cap[:110], flush=True)


main()
