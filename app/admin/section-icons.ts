/**
 * The named glyph set for section icons.
 *
 * One list, two readers: this editor's icon picker draws from it, and the
 * storefront components are meant to draw from it too, so that a name chosen
 * here ("shield") renders as the same glyph on the live page.
 *
 * The second reader does not exist yet. Today every storefront glyph is inline
 * SVG in `app/storefronts/**`, keyed by position, and the one icon field we
 * have (`trust_icons` → `icon`) is declared `kind: "image"` and rendered by
 * garden-kneeler as `<img src={value}>`. Writing a name into that field now
 * would put a broken image on the live page, so the picker in the editor is
 * rendered disabled with that reason next to it until the storefront side
 * reads this file.
 *
 * Paths are drawn on a 24×24 viewBox, stroked (no fill), so they match the
 * storefront's existing stroke-1.6 glyph style.
 */

export interface IconDef {
  name: string;
  label: string;
  /** one or more <path>/<circle> children, as raw path data */
  paths: string[];
  circles?: { cx: number; cy: number; r: number }[];
  rects?: { x: number; y: number; width: number; height: number; rx: number }[];
}

export const SECTION_ICON_SET: IconDef[] = [
  {
    name: "truck",
    label: "Delivery",
    paths: ["M1.5 6.5h11v9h-11z", "M12.5 10h4l3 3v2.5h-7z"],
    circles: [
      { cx: 6, cy: 17.5, r: 2 },
      { cx: 16.5, cy: 17.5, r: 2 },
    ],
  },
  {
    name: "shield",
    label: "Guarantee",
    paths: [
      "M12 2.5l7.5 3v5.7c0 4.6-3.1 8.4-7.5 10.3C7.6 19.6 4.5 15.8 4.5 11.2V5.5z",
      "M8.6 11.8l2.4 2.4 4.4-4.6",
    ],
  },
  {
    name: "lock",
    label: "Secure checkout",
    paths: ["M8 10V7.2a4 4 0 0 1 8 0V10", "M12 14v2.6"],
    rects: [{ x: 4, y: 10, width: 16, height: 10.5, rx: 2.2 }],
  },
  {
    name: "headset",
    label: "Support",
    paths: ["M4 14v-2a8 8 0 0 1 16 0v2", "M19.5 20v.4a2.6 2.6 0 0 1-2.6 2.6H13"],
    rects: [
      { x: 2.5, y: 13.5, width: 4, height: 6.5, rx: 1.8 },
      { x: 17.5, y: 13.5, width: 4, height: 6.5, rx: 1.8 },
    ],
  },
  {
    name: "knees",
    label: "Comfort",
    paths: [
      "M8.6 12c-1.5 2.3-2.6 3.2-4.1 3.2A3.2 3.2 0 0 1 4.5 8.8C7 8.8 8.4 12 12 12s5-3.2 7.5-3.2a3.2 3.2 0 0 1 0 6.4c-1.5 0-2.6-.9-4.1-3.2",
    ],
  },
  {
    name: "box",
    label: "In the box",
    paths: ["M12 3.2l8.5 4.3-8.5 4.3L3.5 7.5z", "M3.5 12.2l8.5 4.3 8.5-4.3", "M3.5 16.6l8.5 4.2 8.5-4.2"],
  },
  {
    name: "clock",
    label: "Time saved",
    paths: ["M12 7.2V12l3.2 2"],
    circles: [{ cx: 12, cy: 12, r: 8.6 }],
  },
  {
    name: "leaf",
    label: "Garden",
    paths: [
      "M12 21c0-5 2-9 7-11-1 6-3.4 9.3-7 11z",
      "M12 21C7.5 20 4 16 4 10.5 4 6.5 6.5 4 9.5 4c2.6 0 4.3 1.8 4.9 4",
    ],
  },
  {
    name: "heart",
    label: "Loved",
    paths: ["M12 20.4l-7-6.6a4.4 4.4 0 0 1 7-5.2 4.4 4.4 0 0 1 7 5.2z"],
  },
  {
    name: "check",
    label: "Tick",
    paths: ["M4.5 12.5l4.5 4.5 10.5-11"],
  },
];

export const SECTION_ICON_NAMES = SECTION_ICON_SET.map((icon) => icon.name);
