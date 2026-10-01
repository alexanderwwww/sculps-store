# XUGC training: master plan (2026-10-01)

Goal: an own engine whose UGC looks, moves and sounds like real phone footage. Credits: RunPod $14.21. Nothing spends without Alex's Approve.

## Team files (the specs this plan is built from)
01-look-camera.md, 02-behavior.md, 03-environments.md, 04-sound.md

## The one real constraint: training clips
A LoRA learns what the clips show. Clips made by an AI teach AI. So the set must be REAL phone footage of 40-80 clips, 3-6 s, 15+ different people, 8+ rooms, every clip with a real audio track (LTX learns sound only from real audio).
Sources, in order: (1) clips Alex or his girlfriend film on an iPhone from the shot list the team wrote; (2) hired UGC creators (Fiverr/Upwork) filming the same shot list, rights to train included in the brief; (3) free-licence stock phone footage where the licence allows it. Never other people's ads.

## Stages (each ends at a STOP where Alex approves)
0. Build 8: data prep, three trainers, Train button, LoRA picker, sound step. Free.
1. Bake-off ~$3: Hunyuan 1.5, Wan 2.2, LTX full on one shot, one clean photo. Judged frame by frame.
2. Dry runs ~$2 each (3 clips, few steps) on all three models: proves each trains and produces a LoRA file.
3. Full LoRA on the winner with the real clips, ~$6-8. The others wait for more credit.
4. Wire LoRAs in as picker switches; sound step for the silent models (Hunyuan, Wan).
5. Compare with Higgsfield on the same brief. If ours loses, buy their API for hero shots and keep ours for volume.
