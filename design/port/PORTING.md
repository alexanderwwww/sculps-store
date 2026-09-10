# How to port a screen

The admin was rebuilt once by reading the approved prototype and re-authoring
it from a summary. The result looked like someone's impression of the design
instead of the design. This is the method that does not have that failure.

**The rule: transliterate, never re-author.** Every style string in the
prototype is a decision that was signed off. Copy them across character for
character. If you find yourself typing a colour, a pixel value, a font weight
or a piece of copy that is not already in the prototype, stop — you are
inventing again.

## What you are given

- `design/port/<screen>.html` — the exact markup for one screen, cut out of
  `design/prototype/Shop Admin.dc.html`.
- `design/port/view-model.js` — the prototype's own JavaScript. Every `{{ x }}`
  in the markup is defined here. Read it to learn what a binding *means*
  before deciding what real data replaces it.
- The live route file under `app/routes/`, which already has a working loader
  and action wired to the database.

## The transliteration

| Prototype | React |
|---|---|
| `style="a:b;c:d"` | `style={{ a: "b", c: "d" }}` — same values, camelCased keys |
| `<sc-if value="{{ x }}">…</sc-if>` | `{x ? <>…</> : null}` |
| `<sc-for list="{{ xs }}" as="x">…</sc-for>` | `{xs.map((x) => …)}` — add a `key` |
| `onClick="{{ f }}"` | `onClick={f}`, or a `<Form method="post">` when it writes |
| `{{ a.b }}` | `{a.b}` |
| `class=` / `for=` | `className=` / `htmlFor=` |
| `style-hover="background:var(--hover)"` | `className="k-hover"` (already in `admin.css`) |
| self-closing `<input>` `<img>` `<br>` | close them: `<input />` |

Keep the DOM nesting identical. Do not "tidy" a wrapper div away — the layout
depends on it.

## Data, not decoration

The only thing that changes is where values come from. The prototype invents
its numbers; you take them from the loader. Where the prototype has fake rows,
render the real rows in the same markup, and render the prototype's own empty
state when there are none.

Three rules override the design where they collide, and only these three:

1. **Nothing is simulated.** Any demo or "simulate" control is dropped. Say so
   in a comment where you drop it.
2. **Nothing pretends.** A control with nothing behind it is rendered visibly
   disabled with the reason next to it, never as a working switch that saves a
   value nobody reads.
3. **Nothing is invented.** No placeholder copy, no example data, no guessed
   number. An empty field renders the design's empty state.

If a design element cannot be honoured (there is no data source for it yet),
keep the markup and show its empty state. Do not delete the element and do not
fill it with something made up.

## When you are done

- `npm run typecheck` is clean.
- Compare your JSX against the prototype markup line by line and confirm every
  style string matches.
- Report: what you ported, anything you deliberately dropped and why, any
  server helper you need that does not exist yet (do not add it to shared
  files yourself — name it in your report).

## Files you may edit

Only the route file(s) named in your task, plus new files under `app/admin/`
that only your screen imports. `app/lib/admin.server.ts`, `app/db/schema.ts`,
`app/routes.ts` and `app/admin/ui.tsx` are shared — other people are working
in them at the same time. Name what you need instead of editing them.
