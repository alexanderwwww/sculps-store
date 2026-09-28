# The glass, in Electron — read this before you build it

Send this to whoever is building the other version. It is one finding, and it
decides whether the app is liquid glass or another grey slab.

## The trap

`backdrop-filter` **only sees what is inside the window.**

On a frameless, transparent Electron window there is nothing behind the glass.
So you can copy the approved recipe perfectly — the displacement map, the three
channel-split `feDisplacementMap`s, the rim, the light — and it will bend
**empty air**. What arrives on the Mac is a faintly glowing outline with
nothing in it, or, once someone "fixes" it with a fill, a grey panel.

The handoff says this itself, on its last page. It is easy to read past, and it
is the single reason eleven earlier builds of this app looked like frosted
plastic.

## The fix

**Bring the desktop inside the window.**

1. Main process captures the screen (`desktopCapturer.getSources`, thumbnail at
   the display's real pixel size).
2. Renderer draws that capture as an `<img>` **behind** the refraction layer,
   offset by the window's own position:

   ```js
   img.style.left = `${-(win.x - display.bounds.x)}px`;
   img.style.top  = `${-(win.y - display.bounds.y)}px`;
   img.style.width  = `${display.size.width}px`;   // points, not pixels
   img.style.height = `${display.size.height}px`;
   ```

3. The filter now has the real desktop to bend, correctly aligned.
4. Re-grab on `move` and `resize`, and on a slow timer while it sits still —
   the desktop changes underneath it and a frozen capture reads as a
   photograph, not as glass.

Layer order, and nothing goes between them:

```
.behind   ← the captured desktop
.refract  ← backdrop-filter: url(#lg-phone) saturate(1.35) brightness(1.06)
.light    ← specular + rim, box-shadows only, no fill
.rim      ← 1.5px conic-gradient ring
.content  ← everything else, always on top, never inside .refract
```

**The cost, and say it out loud rather than hiding it:** macOS asks for Screen
Recording permission once, the first time. Nothing is recorded or sent — the
capture never leaves the process that draws it. Put
`NSScreenCaptureUsageDescription` in the app's Info.plist saying exactly that.

## Do not

- Do not replace the refraction with `blur()`, frosted glass or a white fill.
  The centre of the glass must stay **perfectly clear** — only the rim bends.
- Do not use Electron's `vibrancy`. That is macOS's own frosted material and it
  sits behind the glass as a grey wash, which is the look this design exists to
  replace.
- Do not keep one displacement map across sizes. A map drawn for 320×64 puts
  the rim through the middle of a 393×852 window. Regenerate on every resize.
- Do not put content inside `.refract`. It will be displaced along with the
  desktop and the type will smear at the edges.

## How to know you actually have it

Do not judge it by eye, and do not judge it against a flat background — glass
is invisible over a plain colour, which is exactly how a slab gets approved.

Put a **black-and-white stripe pattern** behind the shape and read pixels:

1. **Centre:** the stripes must be in the same places as the bare background.
   The same number of bands across the same distance. Clear glass does not move
   what is behind its middle.
2. **Rim:** the stripes must have moved — more bands squeezed into the same
   distance. That compression *is* the refraction.
3. **Colour:** the rim must show colour that black-and-white stripes do not
   have. The three displacements are split by channel, and that fringe is the
   crystal.

If all three hold, it is the design. If any one fails, it is not — whatever it
looks like.

Working implementation and the test are in `tools/plugapp/` on the branch:
`renderer/glass.js`, `renderer/index.html`, `main.js`, `test/glass.test.mjs`.
