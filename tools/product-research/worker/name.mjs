/**
 * The app's name lives here and nowhere else.
 *
 * Alex's girl is naming this one, so everything that shows a name — the
 * window, the menu bar, the ticker, the report's cover, the connector — reads
 * it from here. When she picks, this is the only line that changes.
 */
export const NAME = process.env.RESEARCH_NAME || "Product Research";

/** The bundle id and the folder names, derived so they never drift apart. */
export const SLUG = NAME.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
export const BUNDLE_ID = `us.blackreaper.${SLUG.replace(/-/g, "")}`;
