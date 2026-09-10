/**
 * The fifteen sections. Fixed set, fixed order, every store.
 *
 * This file is the single source of truth. The storefront renders from it and
 * the admin generates its editing forms from it, so the two can never drift.
 *
 * The admin can edit `fields`, add/remove/reorder `blocks`, and hide a whole
 * section. It can never reorder, add, or delete a section — that is why the
 * order below is a plain array and position is written at seed time.
 */

export type FieldKind = "text" | "textarea" | "image" | "video" | "url";

export interface FieldDef {
  name: string;
  label: string;
  kind: FieldKind;
  /** shown under the input in the admin */
  help?: string;
}

export interface BlockDef {
  /** what one block is called, e.g. "Question" */
  label: string;
  addLabel: string;
  fields: FieldDef[];
}

export interface SectionDef {
  type: string;
  label: string;
  /** one-line description shown in the editor's section list */
  hint: string;
  fields: FieldDef[];
  /** null means this section has no repeating items */
  blocks: BlockDef | null;
  /**
   * true for Reviews: its content comes from the reviews table, not blocks.
   * One source of truth — the editor links to the Reviews screen instead.
   */
  externalSource?: "reviews";
}

const heading: FieldDef = { name: "heading", label: "Heading", kind: "text" };
const subheading: FieldDef = { name: "subheading", label: "Subheading", kind: "text" };
const body: FieldDef = { name: "body", label: "Body", kind: "textarea" };

export const SECTIONS: SectionDef[] = [
  {
    type: "buy_box",
    label: "Buy box",
    hint: "Product images, bundle options, add to cart",
    fields: [
      heading,
      subheading,
      { name: "badge", label: "Badge above heading", kind: "text" },
      { name: "ctaLabel", label: "Button label", kind: "text" },
      { name: "reassurance", label: "Line under the button", kind: "text" },
    ],
    blocks: {
      label: "Product image",
      addLabel: "Add image",
      fields: [
        { name: "image", label: "Image", kind: "image" },
        { name: "alt", label: "Alt text", kind: "text", help: "Describes the image for screen readers" },
      ],
    },
  },
  {
    type: "video_faq",
    label: "Video with FAQ",
    hint: "A video beside the questions people ask before buying",
    fields: [heading, subheading, { name: "video", label: "Video", kind: "video" }],
    blocks: {
      label: "Question",
      addLabel: "Add question",
      fields: [
        { name: "question", label: "Question", kind: "text" },
        { name: "answer", label: "Answer", kind: "textarea" },
      ],
    },
  },
  {
    type: "social_proof_images",
    label: "Social proof images",
    hint: "Photos from real customers",
    fields: [heading, subheading],
    blocks: {
      label: "Photo",
      addLabel: "Add photo",
      fields: [
        { name: "image", label: "Photo", kind: "image" },
        { name: "caption", label: "Caption", kind: "text" },
      ],
    },
  },
  {
    type: "video_clips",
    label: "Video clips",
    hint: "Short clips of the product in use",
    fields: [heading, subheading],
    blocks: {
      label: "Clip",
      addLabel: "Add clip",
      fields: [
        { name: "video", label: "Video", kind: "video" },
        { name: "caption", label: "Caption", kind: "text" },
      ],
    },
  },
  {
    type: "product_grid",
    label: "Product grid",
    hint: "What comes in the set. With no items it falls back to the bundles.",
    fields: [heading, subheading, { name: "footnote", label: "Footnote", kind: "text" }],
    blocks: {
      label: "Item",
      addLabel: "Add item",
      fields: [
        { name: "image", label: "Photo", kind: "image" },
        { name: "title", label: "Name", kind: "text" },
        { name: "note", label: "Size or detail", kind: "text" },
      ],
    },
  },
  {
    type: "trust_icons",
    label: "Trust icons",
    hint: "Shipping, returns, guarantee",
    fields: [heading],
    blocks: {
      label: "Icon",
      addLabel: "Add icon",
      fields: [
        { name: "icon", label: "Icon", kind: "image" },
        { name: "title", label: "Title", kind: "text" },
        { name: "text", label: "Text", kind: "text" },
      ],
    },
  },
  {
    type: "three_steps",
    label: "Three steps",
    hint: "How it works, in three moves",
    fields: [heading, subheading],
    blocks: {
      label: "Step",
      addLabel: "Add step",
      fields: [
        { name: "title", label: "Title", kind: "text" },
        { name: "text", label: "Text", kind: "textarea" },
        { name: "image", label: "Image", kind: "image" },
      ],
    },
  },
  {
    type: "benefits",
    label: "Benefits",
    hint: "What it does for them",
    fields: [heading, subheading],
    blocks: {
      label: "Benefit",
      addLabel: "Add benefit",
      fields: [
        { name: "title", label: "Title", kind: "text" },
        { name: "text", label: "Text", kind: "textarea" },
        { name: "image", label: "Image", kind: "image" },
      ],
    },
  },
  {
    type: "features",
    label: "Features",
    hint: "What it is",
    fields: [heading, subheading],
    blocks: {
      label: "Feature",
      addLabel: "Add feature",
      fields: [
        { name: "title", label: "Title", kind: "text" },
        { name: "text", label: "Text", kind: "textarea" },
        { name: "image", label: "Image", kind: "image" },
      ],
    },
  },
  {
    type: "comparison_table",
    label: "Comparison table",
    hint: "This product against the alternative",
    fields: [
      heading,
      subheading,
      { name: "usLabel", label: "Our column heading", kind: "text" },
      { name: "themLabel", label: "Their column heading", kind: "text" },
    ],
    blocks: {
      label: "Row",
      addLabel: "Add row",
      fields: [
        { name: "label", label: "Row label", kind: "text" },
        { name: "us", label: "Ours", kind: "text" },
        { name: "them", label: "Theirs", kind: "text" },
      ],
    },
  },
  {
    type: "reviews",
    label: "Reviews",
    hint: "Pulled from the Reviews screen — one source of truth",
    fields: [heading, subheading],
    blocks: null,
    externalSource: "reviews",
  },
  {
    type: "who_its_for",
    label: "Who it's for",
    hint: "Who should buy it, and who shouldn't",
    fields: [heading, subheading],
    blocks: {
      label: "Person",
      addLabel: "Add person",
      fields: [
        { name: "title", label: "Title", kind: "text" },
        { name: "text", label: "Text", kind: "textarea" },
      ],
    },
  },
  {
    type: "whats_in_the_box",
    label: "What's in the box",
    hint: "Everything they receive",
    fields: [heading, subheading, { name: "image", label: "Image", kind: "image" }],
    blocks: {
      label: "Item",
      addLabel: "Add item",
      fields: [
        { name: "title", label: "Item", kind: "text" },
        { name: "text", label: "Detail", kind: "text" },
      ],
    },
  },
  {
    type: "specifications",
    label: "Specifications",
    hint: "Measured numbers only — blanks show as 'Spec pending'",
    fields: [heading],
    blocks: {
      label: "Spec row",
      addLabel: "Add spec",
      fields: [
        { name: "label", label: "Label", kind: "text" },
        {
          name: "value",
          label: "Value",
          kind: "text",
          help: "Leave blank if you haven't measured it. It shows as 'Spec pending' on the live page — never guess a number.",
        },
      ],
    },
  },
  {
    type: "closing_cta",
    label: "Closing CTA",
    hint: "Last call to buy",
    fields: [heading, subheading, { name: "ctaLabel", label: "Button label", kind: "text" }],
    blocks: null,
  },
];

/** What an unfilled specification value renders as. Never a guess. */
export const SPEC_PENDING = "Spec pending";

export const SECTION_TYPES = SECTIONS.map((s) => s.type);

export function sectionDef(type: string): SectionDef | undefined {
  return SECTIONS.find((s) => s.type === type);
}
