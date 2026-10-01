# realism-rules.md
The rules a video must pass to look like real footage. These came from watching real failures frame by frame.
The rules below the line "Rules for whoever writes the prompt" are read by Claude and by Alex, not by the model.

## Prompt
- One single continuous phone shot, never several scenes, never a montage
- One clear main subject that stays the same size, shape and colour for the whole clip
- The setting stays put: the house, trees, street and sky do not change or morph during the clip
- Only a few things move at once, and they move the way real things move
- Everything described is physically possible and sits on the ground under real gravity

## Never
- Scene changes, cuts, montages, flashbacks, split screens or time jumps inside one clip
- Objects that appear from nowhere, change shape, melt, duplicate or turn into something else
- Diagrams, charts, measurements, silhouettes, arrows, labels or any graphic overlay
- A second, different version of the main subject appearing later in the clip

## Rules for whoever writes the prompt (not read by the video model)
1. **One clip is one shot, 5 to 10 seconds.** A story with several shots is made as several clips and joined afterwards. A 15-second story with four cuts written into one prompt becomes mush.
2. **Show the finished state, not the transformation.** A distilled video model cannot do "a flat heap inflates into a giant". Start with the product standing, then add people reacting around it.
3. **Lock the product with ONE clean reference photo.** A real photo of the product with no text, no diagram, no scale graphic. A photo with writing on it gets pasted into the video, writing and all. Check every photo before using it.
4. **Place the reference deliberately.** Start of the clip when the product is on screen from the first frame; middle when the camera reveals it. Strength 1 is exact, 0.6 is a hint.
5. **Name every person differently and give each one a job.** Six strangers described the same way become six clones. Two or three clearly different people beat a crowd of twelve.
6. **No contradictions in the prompt.** Not indoors and a lawn. Not selfie-style and a neighbour filming. Not a studio and a phone. If the look setting does not match the story, set it to None.
7. **Scale needs a human next to it.** For something huge, put one adult at its base in the frame, and say the head is level with the upstairs windows.
8. **Sound is described second by second and must be audible from frame one.** Check the file has an audio track, then listen to it on the app's sound button before judging anything.
9. **Judge a take against the brief frame by frame before showing it.** If the product, the people or the sound are wrong, say so and fix the prompt. Never call a video fine because it looks like a phone video.
10. **Captions are never drawn by the model.** They are burned on afterwards.
