#!/usr/bin/env python3
"""Runs on the GPU. For every cNNN.mp4 in IN/ with a cNNN.json (creator, place, sound hint, loudness) writes cNNN.txt in the
team's caption format: [VISUAL] ... [SPEECH] ... [SOUNDS] ... [TEXT] ..., starting with the trigger word.
Picture: Qwen2.5-VL-7B-Instruct watches the clip. Speech: faster-whisper. Sounds: from the collector's hint."""
import json, os, sys, glob, subprocess, tempfile

IN = sys.argv[1]; TRIGGER = os.environ.get("TRIGGER", "xugciphone")
SOUND = {"voice": "close phone-microphone voice, faint room tone", "asmr": "close crisp handling sounds, packaging crinkle, soft taps, quiet room tone",
         "room": "faint room tone, small product and hand sounds", "street": "street ambience, distant traffic, wind on the microphone", "music": "background music bed under room tone"}
ASK = ("Describe this vertical phone video for a video-model training caption in 2 to 4 plain sentences, present tense. Say who is in it "
       "(approximate age, hair, clothes), the room and light, what the hands and body do, what the product is and how it is held, and how the "
       "phone camera moves (handheld sway, drift, refocus). Do not say 'video' or 'the creator'. Describe only what is visible.")


def whisper_all(files):
    try:
        from faster_whisper import WhisperModel
        m = WhisperModel("base", device="cpu", compute_type="int8")  # CPU on purpose: a missing CUDA library would abort the whole run
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


def frames_of(path, n=8):
    """Eight evenly spaced frames as jpg files (ffmpeg). No video-reader library involved: those break between versions."""
    d = tempfile.mkdtemp(prefix="fr_")
    subprocess.run(["ffmpeg", "-loglevel", "error", "-y", "-i", path, "-vf", "fps=2,scale=-2:360", "-frames:v", str(n), os.path.join(d, "f%02d.jpg")], check=False)
    return sorted(glob.glob(os.path.join(d, "f*.jpg")))


def plain_caption(meta, speech):
    """What a caption is worth without the vision model: the collector's own notes. Better than losing the run."""
    where = (meta.get("place") or "a room"); what = (meta.get("category") or "product")
    return f"A person films a {what} video on a phone in a {where}, handheld, real room light."


def main():
    files = sorted(glob.glob(os.path.join(IN, "c*.mp4")))
    if not files:
        sys.exit("no clips to caption")
    import torch
    model = proc = process_vision_info = None
    try:
        from transformers import Qwen2_5_VLForConditionalGeneration, AutoProcessor
        from qwen_vl_utils import process_vision_info
        mid = os.environ.get("CAPTION_MODEL", "Qwen/Qwen2.5-VL-7B-Instruct")
        model = Qwen2_5_VLForConditionalGeneration.from_pretrained(mid, torch_dtype=torch.bfloat16, device_map="auto")  # torch_dtype works in every transformers version
        proc = AutoProcessor.from_pretrained(mid)
    except Exception as e:
        print("CAPTION MODEL UNAVAILABLE, using the collector's notes instead:", repr(e)[:300], flush=True)
    speech = whisper_all(files)
    for f in files:
        meta = {}
        try:
            meta = json.load(open(f[:-4] + ".json"))
        except Exception:
            pass
        vis = ""
        if model is not None:
            try:
                fr = frames_of(f)
                if fr:
                    msgs = [{"role": "user", "content": [{"type": "video", "video": ["file://" + os.path.abspath(x) for x in fr], "fps": 2.0}, {"type": "text", "text": ASK}]}]
                    text = proc.apply_chat_template(msgs, tokenize=False, add_generation_prompt=True)
                    img, vid = process_vision_info(msgs)[:2]
                    inp = proc(text=[text], images=img, videos=vid, padding=True, return_tensors="pt").to(model.device)
                    gen = model.generate(**inp, max_new_tokens=200, do_sample=False)
                    vis = proc.batch_decode(gen[:, inp.input_ids.shape[1]:], skip_special_tokens=True)[0].strip().replace("\n", " ")
            except Exception as e:
                print("caption failed for", os.path.basename(f), repr(e)[:200], flush=True)
        if not vis:
            vis = plain_caption(meta, speech.get(f, ""))
        sp = speech.get(f, "")
        snd = SOUND.get(meta.get("sound", "voice"), SOUND["voice"])
        cap = f"{TRIGGER}. [VISUAL] {vis} [SPEECH] " + (f'The person says: "{sp}"' if sp else "No speech.") + f" [SOUNDS] {snd}. [TEXT] None."
        open(f[:-4] + ".txt", "w").write(cap)
        print(os.path.basename(f), "->", cap[:110], flush=True)


main()
