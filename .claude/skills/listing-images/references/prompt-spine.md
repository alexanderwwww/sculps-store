# The prompt spine

Every panel prompt is the same document with three things swapped: the product
paragraph, the scene, and the permitted words. Do not write a prompt from scratch —
start from the last one that worked and change those three.

This file is the list of rules that were each bought with a rejected render. Breaking
one does not produce a slightly worse picture; it produces a picture Alex sends back.

## Open and close

Open with `Render this image now. Do not reply with text, just generate the picture.`
then the frame: `SQUARE 1:1` (carousel panels) or `WIDE LANDSCAPE 16:9` (full-bleed
section images), and `THE PHOTOGRAPH FILLS THE ENTIRE SQUARE, edge to edge, corner to
corner` — plus `NOT a tilted card, NO white border, NO rounded corners`. Without that
last line the model draws a photograph lying on a white page.

Close with three paragraphs, always, in this order:

1. **The permitted word list.** `PERMITTED WORDS, each drawn exactly once:` then every
   string that may appear, one per line. This is the single most effective control in
   the whole document. Without it the model letters instructions onto the image —
   "ONE ENORMOUS", "SITTING AGAINST", "FLAT SOLID GREY SILHOUETTE" have all shipped.
2. **The banned-word list.** Name the colour words, position words and layout words
   explicitly: WHITE, BLACK, ORANGE, LEFT, RIGHT, BAND, BAR, CELL, ICON, SILHOUETTE,
   HEADLINE. Plus: no price, no percentage, no stars, no rating, no review count, no
   logo, no watermark, no social interface, no slash character.
3. **The anti-carryover paragraph.** `THIS IMAGE IS COMPLETELY SEPARATE FROM EVERY
   PICTURE DRAWN BEFORE IT IN THIS CONVERSATION.` Then say the permitted list is the
   entire text of the image, no matter what appeared on the last one.

Add `SPELL EVERY WORD CORRECTLY. Check each one letter by letter before drawing it.`
A single wrong letter — "INSIDF" — kills an otherwise finished panel.

## The rules that were paid for

**Tell the truth about the product.** Every claim on a panel is a claim a buyer
measures when the box arrives. A zombie drawn the size of a person, a "16 FT BACK"
on a lamp that sits two feet from the glass, "UP AND RUNNING IN A MINUTE" on a screen
that takes two — each of those is a return and a chargeback. When a prompt is reused
for another product, re-read every number in it.

**Describe the product as it physically is, not as its category.** The Crawling Zombie
is a head, a torso and two arms with no legs, lying flat on its belly. Until the prompt
said that, every render came back kneeling. One accurate paragraph fixed eight panels.

**Scale is set by the people, and people render tiny unless told otherwise.** Never
describe a person as a fraction of the product — a prompt that said the figures were
"a quarter of the product's height" produced specks for weeks. Say instead: the people
stand close to the lens, taller than half the frame, and the product sits beyond them
reaching their knee.

**Two colours plus black.** Deep navy-teal night and warm amber. No violet, magenta,
gradient wash or lens flare. Three saturated colours is what makes a picture look cheap.

**Blue hour, never black night.** A deep saturated navy sky with light still in it, so
the product reads as a hard silhouette. Plus a hot core — lit eyes, a glowing pane —
blown to near-white at its centre, spilling light onto the ground so the object is
sitting in the scene rather than pasted on it.

**American, said explicitly and at length.** Clapboard siding, a covered porch, a
two-car garage door, a mailbox on a post, a white rectangular number plate, no front
wall or hedge. Say what it is NEVER: never British brick with a tiled roof, never a
yellow number plate, never a wheelie bin. Left vague, it draws a British house.

**Restrained decoration.** No more than three things behind the product, and keep a
clean darker band directly behind its top so the outline stays sharp.

**Camera from the road, at knee height, product off centre.** Real phone picture: grain
in the shadows, slightly off level, natural phone colour. Never studio, catalogue,
poster or cinematic. **No clouds and no sky** — fill the area above the roofline with
dark tree canopy.

**Type is hard-edged rectangles.** Heavy condensed bold caps. Any shape behind type has
straight edges and square corners — never a brush stroke, painted swipe, highlighter
mark, underline stroke or rounded pill.

## When it must look like a real ad

For creative that will run as an ad, the polish comes down, not up. The reference is a
phone clip somebody actually posted:

- The projection or lit effect is **thin projected light** — pale, translucent, nearly
  monochrome, the curtain visible through it. Never saturated comic-book artwork, never
  crisp line work, never a glossy sticker on the glass.
- **Show the rectangle of light** spilling a little past the pane. That is what makes
  the eye read "a projector did this".
- **Ordinary people in ordinary clothes, caught mid-step** — a hoodie, jeans, a kid in
  costume, shoulders up, weight on the back foot. Never a styled couple in matching
  wool coats standing still. That is a stock photo, and it reads as one.
- Dark, grainy, low contrast, slightly crooked, real streetlight colour.

## Running the job

One wand job per product, eight prompts, references attached once. Then the loop:
**render → look at it → place it**. Never place a panel unseen; roughly one in three
comes back with a carried-over headline, a duplicated caption or a factual error, and
the only way to catch it is to open the picture.

To correct a panel mid-run: patch the prompt, POST the job again with **the same `id`
as the running job**, send `requeue`, then `redo N`. A different id is ignored.

When a run has drifted badly — the same wrong house in every frame — the conversation
is the problem, not the prompt. Start the job in a fresh chat (`newChat: "start"`),
once, at the beginning. Never per image.
