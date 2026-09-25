/**
 * Turning a social post URL into something that can be put in an iframe.
 *
 * The rail under the buy box shows real posts, not screenshots of them, so the
 * like counts and the handle are the platform's own and cannot be faked by us.
 * Each platform publishes an embed address; this maps a normal link onto it.
 *
 * Anything that is not recognised returns null and is skipped — an unknown URL
 * must never reach an iframe's src.
 */

export interface Embed {
  src: string;
  title: string;
  /** TikTok and Reels are 9:16; YouTube is 16:9 unless it is a Short. */
  vertical: boolean;
}

const rx = {
  tiktok: /tiktok\.com\/(?:@[\w.\-]+\/video\/|v\/|t\/)?(\d{6,})/i,
  instagram: /instagram\.com\/(?:p|reel|reels|tv)\/([A-Za-z0-9_-]+)/i,
  youtube: /(?:youtube\.com\/(?:watch\?v=|shorts\/|embed\/)|youtu\.be\/)([A-Za-z0-9_-]{6,})/i,
  youtubeShort: /youtube\.com\/shorts\//i,
};

export function embedFor(raw: string): Embed | null {
  const url = raw.trim();
  if (!url) return null;

  const tt = url.match(rx.tiktok);
  if (tt) {
    return { src: `https://www.tiktok.com/embed/v2/${tt[1]}`, title: "TikTok post", vertical: true };
  }

  const ig = url.match(rx.instagram);
  if (ig) {
    return { src: `https://www.instagram.com/p/${ig[1]}/embed/`, title: "Instagram post", vertical: true };
  }

  const yt = url.match(rx.youtube);
  if (yt) {
    return {
      src: `https://www.youtube-nocookie.com/embed/${yt[1]}?rel=0&modestbranding=1`,
      title: "YouTube video",
      vertical: rx.youtubeShort.test(url),
    };
  }

  return null;
}

/** A direct video file we host ourselves, rather than someone else's platform. */
export function isOwnVideo(url: string): boolean {
  return /^\/media\/|\.(mp4|webm|mov)(\?|$)/i.test(url.trim());
}
