# 03 - Environments: what makes everyday places look real in phone video

Role: ENVIRONMENT spec for the XUGC iPhone-UGC LoRA. Companion files cover subject/identity and motion. This file covers where the video happens.

## 1. Sources used

- https://higgsfield.ai/blog/ai-video-look-real-2026 - AI defaults to even, flattering studio light. Real footage has hot spots, deep shadows, coloured bounce and uneven exposure.
- https://dxbuilder.io/blog/how-to-create-realistic-phone-footage-ai-ugc-230926 - realistic phone UGC mixes 5600K window daylight with 2700K home lamps, mild grain.
- https://videoai.me/blog/how-to-make-ai-videos-that-look-filmed-on-iphone - the phone look comes from adding imperfections and removing polish; micro-tremor handheld, organic refocus.
- https://www.runcomfy.com/trainer/ai-toolkit/z-image-character-lora-dataset-guide - captions must describe everything that is not the thing being learned: setting, framing, lighting, other variables.
- https://offlinecreator.com/guide/flux-lora-training-dataset-guide - varied backgrounds prevent background bleed; more than ~30 near-duplicate images overfit without proportional diversity.
- https://github.com/Haoming02/All-in-One-Stable-Diffusion-Guide/blob/main/LoRATraining.md - caption what you want to stay changeable; leave out what you want baked in.

Everything below beyond those sources is studio practice and judgement, not citation.

## 2. Rules that make a place read as real

1. **Every scene has 2 or more named light sources that disagree.** Window daylight (cool, ~5600K) plus a warm lamp (~2700K) plus a screen glow (blue). Never one soft source.
2. **Clutter is specific and lived-in, not random.** Charger cable, half-full mug, shoes by the door, a laundry pile, a mail stack. Clutter sits on surfaces where gravity and habit put it.
3. **Background is mildly out of focus but still legible.** Phone main camera at arm's length keeps backgrounds fairly sharp. Do not blur backgrounds like a portrait-mode cinema shot unless the clip is flagged portrait mode.
4. **Exposure is imperfect.** Windows blow out when the face is exposed; auto-exposure breathes when the camera pans toward a light.
5. **Reflections exist.** Car windows, bathroom mirror, dark TV, microwave door, night windows showing the room back.
6. **Life happens behind the subject.** Passing cars, a neighbour, a dog, a person at the next machine. Always out of focus or partial, never looking at camera, never matching the subject.
7. **Time and weather are consistent across the whole frame.** Sky colour, shadow direction, wet ground, window light and clothing all agree.
8. **Surfaces are slightly dirty.** Fingerprints on mirrors, toothpaste splashes, scuffed paint, dust on screens, worn car dashboards.
9. **Text in scene is mundane and mostly illegible.** Cereal boxes, a gym sign, a street sign. Never perfectly spelled hero text.
10. **Phone-camera artefacts belong to the scene:** mild noise in dim rooms, lens flare from a streetlight, slight highlight bloom, rolling-shutter on fast pans.

## 3. Environment catalog (30 scenes)

Format: ID, scene, realistic details, light, caption phrase. Caption phrases go in the caption after the shot/subject sentence.

### Bedroom (4)
**B1. Messy bedroom, morning window.** Unmade duvet, phone charger cable across the bed, clothes on a chair, curtains half open, a bedside glass of water. Light: cool window side-light, warm bedside lamp still on. Caption: `in a messy bedroom, morning daylight from a side window, unmade bed, clothes on a chair`

**B2. Bedroom at night, lamp only.** Dark room, one warm bedside lamp, laptop glow, noisy shadows, dark window showing a reflection. Light: 2700K lamp plus blue screen. Caption: `in a dim bedroom at night, single warm bedside lamp, noisy low light, dark window behind`

**B3. Dorm or small-apartment bedroom.** Posters, fairy lights, desk with monitor, cramped, cinder-block or off-white walls. Light: warm string lights, overhead tube. Caption: `in a small cluttered dorm room, string lights, desk with monitor, posters on the wall`

**B4. Bed edge, selfie-held, ring light off.** Subject sits on the bed edge, phone propped on a stack of books, ring light visible but unlit in the background. Caption: `sitting on bed edge, phone propped on books, unlit ring light on a stand in the background`

### Kitchen and living (5)
**K1. Kitchen counter, daytime.** Dish rack, fruit bowl, coffee machine, mail pile, fridge magnets, window over the sink. Light: window daylight plus under-cabinet warm LED. Caption: `in a lived-in kitchen, dish rack and fruit bowl on the counter, window daylight, under-cabinet warm light`

**K2. Kitchen at night, overhead light.** Harsh overhead, dark window reflecting the room, stove clock glowing. Caption: `in a kitchen at night, harsh overhead light, black window reflecting the room`

**K3. Kitchen island / breakfast bar.** Stools, laptop, takeout bag, kid's drawing on fridge. Caption: `at a kitchen island with stools, takeout bag and laptop on the counter, bright daylight`

**L1. Living-room sofa, evening.** Throw blanket, TV on in background (soft, off-focus), lamp, coffee table with remote and mug. Light: warm lamp, flickering TV colour spill on the wall. Caption: `on a living-room sofa in the evening, TV glowing softly behind, warm lamp, remote and mug on coffee table`

**L2. Living room, bright afternoon.** Window sun patch on the floor, plants, shelves with uneven objects, shoes by door. Caption: `in a bright living room, sunlight patch on the floor, houseplants, shelves with mixed objects`

### Bathroom (3)
**BA1. Bathroom mirror selfie-style.** Toothbrush cup, product bottles, a towel on a hook, fingerprint smears on the mirror, vanity strip lights. Light: cool-white LED vanity, slightly green tiles. Caption: `in a bathroom at the mirror, vanity light, toothbrush cup and skincare bottles on the counter, smudged mirror`

**BA2. Bathroom, morning routine, shower steam.** Foggy mirror edges, damp towel, slightly overexposed whites. Caption: `in a steamy bathroom, partly fogged mirror, damp towel on hook, bright overexposed whites`

**BA3. Bathroom at night, one light.** Dim warm bulb, dark corners, strong face shadows. Caption: `in a dim bathroom at night, one warm bulb, deep shadows`

### Cars (4)
**C1. Driver's seat, parked, daytime.** Seatbelt, steering wheel in frame edge, phone on the dash mount or hand-held, receipts and a water bottle in the door, windshield glare, dashboard dust. Light: harsh hard sun from windshield. Caption: `sitting in a parked car in the driver's seat, daytime, sunlight on the dashboard, water bottle in door pocket`

**C2. Car, passenger seat, golden hour.** Warm low sun through side window, cars passing outside, seatbelt strap crossing the frame. Caption: `in a car passenger seat at golden hour, warm low sun through the side window, traffic outside`

**C3. Car at night under streetlights.** Orange sodium light sweeping over the face, dark cabin, dash glow, rain dots on the window. Caption: `in a parked car at night, orange streetlight on face, dashboard glow, raindrops on the window`

**C4. Car, back seat, with bags.** Shopping bags, jacket, child seat edge. Caption: `in the back seat of a car with shopping bags, overcast daylight through the windows`

### Suburban outdoors (5)
**S1. Front lawn, daytime.** Grass with uneven patches, a neighbour's house, parked cars, a mailbox, a sprinkler or hose, long shadows if morning. Caption: `standing on a suburban front lawn, daytime, neighbour's house and parked cars behind, mailbox`

**S2. Front lawn at night.** Porch light, motion-light glare, dark sky, a streetlamp down the road, parked cars with reflective glints, insects near the bulb. Caption: `on a suburban lawn at night, porch light, streetlamp in the distance, parked cars, dark sky`

**S3. Driveway, overcast.** Garage door, basketball hoop, trash bins, flat white sky, wet patches. Caption: `in a driveway on an overcast day, garage door, trash bins, flat grey sky`

**S4. Suburban street, dusk.** Blue-hour sky, lit windows in houses, a passing car with headlights, a person walking a dog far off. Caption: `on a suburban street at dusk, lit house windows, a car with headlights passing, blue sky`

**S5. Backyard / patio, afternoon.** Fence, grill, patio chairs, plant pots, dappled tree shade creating hot and cold patches on the face. Caption: `on a backyard patio, afternoon sun through trees, dappled shade, grill and chairs, wooden fence`

### Urban and shops (5)
**U1. City sidewalk, daytime.** Passersby out of focus, a bus passing, storefront reflections, shadow patches between buildings. Caption: `on a city sidewalk, daytime, pedestrians blurred behind, storefront windows, bus passing`

**U2. City street at night.** Neon and shop signs, wet pavement reflections, headlights, mixed colour spill. Caption: `on a city street at night, neon signs, wet pavement reflections, headlights in the background`

**U3. Grocery store aisle.** Fluorescent top light (slightly green), shelves with colourful packaging, a cart, other shoppers partial at frame edge. Caption: `in a grocery store aisle, flat fluorescent light, shelves of packaged goods, shopper blurred in the background`

**U4. Clothing or beauty shop.** Racks, mirrors, spot lights, price tags, a changing-room curtain. Caption: `in a retail clothing store, clothing racks, spot lights, changing room curtain`

**U5. Cafe table.** Window seat, cups, laptop, background customers and a barista out of focus, glass reflections. Caption: `at a cafe table by the window, cup and laptop, customers blurred in the background, daylight`

### Gym and fitness (2)
**G1. Commercial gym floor.** Machines, mirrors, a person lifting in the background, fluorescent plus warm accent lights, rubber floor, water bottle on bench. Caption: `in a commercial gym, machines and mirrors, person exercising in the background, mixed fluorescent light`

**G2. Home workout corner.** Yoga mat, dumbbells, a fan, couch pushed aside, window light. Caption: `in a home workout corner, yoga mat and dumbbells, couch pushed aside, window light`

### Work and other (2)
**W1. Home desk / office.** Monitor, sticky notes, cables, a cold mug, desk lamp and window both on. Caption: `at a home desk, monitor and sticky notes, cables, desk lamp plus window light`

**W2. Hallway / entryway.** Shoes pile, coat hooks, mirror, keys bowl, door-light spill. Caption: `in an entryway, shoes by the door, coat hooks, keys bowl, light from the open door`

## 4. Coverage matrix

Target clip counts for a 300-clip training set (adjust proportionally). Rows are locations; columns are time and light. Cell = clips. Aim to have every cell with at least 1 and no row over 15% of the set.

| Location group | Day (window/sun) | Golden/dusk | Night (artificial) | Overcast/rain | Total | Share |
|---|---|---|---|---|---|---|
| Bedroom (B1-B4) | 22 | 6 | 22 | 0 | 50 | 17% |
| Kitchen/living (K1-K3, L1-L2) | 22 | 8 | 20 | 0 | 50 | 17% |
| Bathroom (BA1-BA3) | 12 | 0 | 12 | 0 | 24 | 8% |
| Car (C1-C4) | 14 | 8 | 14 | 4 | 40 | 13% |
| Suburban outdoor (S1-S5) | 16 | 10 | 14 | 10 | 50 | 17% |
| Urban/shop (U1-U5) | 16 | 4 | 12 | 4 | 36 | 12% |
| Gym/fitness (G1-G2) | 10 | 0 | 8 | 0 | 18 | 6% |
| Work/entry (W1-W2) | 14 | 0 | 8 | 0 | 22 | 7% |
| Total | 126 | 36 | 110 | 18 | 290 | |

Balancing rules:
- **Indoor 65-70%, outdoor/car 30-35%.** Real UGC ads are mostly shot at home or in a car.
- **At least 35% night/low light.** Without it the model collapses to daylight and loses grain and mixed colour temperature.
- **No single scene ID above 5% of the set.** Repeat the same room too often and the LoRA bakes that room in.
- **Same subject in at least 4 different groups** so identity separates from place.
- **Cap near-duplicates:** two clips from the same room and same lighting count as one for diversity; keep the second only if the framing or time differs.
- **Background people/vehicles in at least 40% of outdoor and shop clips**, always out of focus or partial.
- **Hold out 10% of clips per group** as a validation set; test prompts should combine a trained subject with a place absent from its clips.

## 5. How to caption environments

- Caption structure: `[trigger/subject] [action], [framing], [environment sentence], [light sentence], [camera note]`.
- The environment sentence names the room, 2-3 specific objects, and the light sources. Use the catalog phrases.
- Always caption what you want to remain controllable: room type, time of day, weather, light colour, background people, vehicles.
- Never caption what you want baked in: the phone look itself (grain, handheld, slight softness) goes in a single constant tag such as `iphone ugc footage` on every clip; do not describe it per clip.
- Use plain words, concrete nouns, present tense. No adjectives like "beautiful", "cinematic", "stunning" - they pull the model toward the stock look.
- Include the weakness when present: `noisy low light`, `blown-out window`, `smudged mirror`. These are the traits the model must learn.
- Keep caption length to 40-80 words per clip for video; each caption varies in word order so the model does not key on one template.
- Auto-caption a first draft with a VLM, then correct by hand for light sources and clutter; VLMs miss mixed colour temperature and mundane clutter.

## 6. AI giveaways to avoid (reject clips and prompts that show these)

1. Single even soft light, no shadows, glowing skin, no colour contrast between window and lamp.
2. Spotless rooms; magazine-tidy shelves; symmetrical decor; perfect throw pillows.
3. Backgrounds blurred like cinema bokeh on a phone clip.
4. Warped or gibberish text on signs, cereal boxes, book spines, car plates.
5. Background people who all face camera, look identical, drift, or morph; cars with wrong wheel counts or melting plates.
6. Windows and mirrors with no reflections, or reflections that do not match the room or the subject.
7. Impossible light: sun shadows pointing two ways, night sky with daytime-bright faces, wet street with dry sun glare.
8. Lawns, hedges and brick that look like a repeating texture; identical trees in a row.
9. Floating objects, items fused into hands or counters, cables that go nowhere, door handles that vanish.
10. Steady glide camera inside a "handheld" scene; no micro-tremor, no refocus hunt.
11. Colour palette uniformly teal-orange or pastel; skin and walls the same hue.
12. Overly tidy night scenes: dark rooms with a perfectly lit face and zero noise.
13. Car interiors with wrong controls, missing seatbelt, perfect clean dashboard, windshield with no glare or dust.
14. Every scene having a plant, a neon sign and string lights - the "AI apartment" cliche. Vary decor and allow plain, ugly rooms.

## 7. Acceptance checks for the dataset

- Every clip has 2 or more distinguishable light sources or one clearly directional source with visible fall-off.
- Every clip has at least 3 mundane objects that are not product-related.
- No clip with legible brand text other than the product being advertised.
- Contact-sheet review: one frame per clip in a grid per group; reject any group that looks like one location.
