/**
 * The Marketing Studio's sections: plain data shared by the page (client) and
 * the agent (server). Nothing here may import a server module.
 */
import type { StudioSection } from "~/db/schema";

export const SECTION_INFO: Record<StudioSection, { label: string; short: string; purpose: string; aspect: string }> = {
  meta_photos: {
    label: "Meta ad photos",
    short: "Meta ads",
    purpose: "Still images for Meta (Facebook/Instagram) paid ads: scroll-stopping, one subject, product large, 4:5 or 1:1.",
    aspect: "4:5",
  },
  ugc_videos: {
    label: "UGC videos",
    short: "UGC",
    purpose: "Real-phone UGC clips for Meta ads and organic: a creator in a real room, talking to camera, holding the product, 9:16.",
    aspect: "9:16",
  },
  product_photos: {
    label: "Product photos",
    short: "Product",
    purpose: "Clean product photography: white or one-hue backgrounds, exact product, several angles, 1:1 or 4:3.",
    aspect: "1:1",
  },
  website_photos: {
    label: "Website photos",
    short: "Website",
    purpose: "Lifestyle and hero photography for the storefront: wide, calm, room for headlines, 16:9 or 3:4.",
    aspect: "16:9",
  },
  organic: {
    label: "Organic clips",
    short: "Organic",
    purpose:
      "Volume for Instagram Reels and TikTok: batches of short 9:16 clips, each a still + video pair with its own hook line, plus captions. Cheap models by default (LTX-2 Pro), quantity over polish.",
    aspect: "9:16",
  },
};
