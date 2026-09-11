/**
 * Store media, served from our own bucket.
 *
 * Product photography and video used to be served by whichever platform the
 * store was on, which means the shop stops having pictures the day that
 * account closes. These files are in R2, under this Worker, on the store's own
 * domain — nothing outside can take them away.
 *
 * Immutable: every key contains the file's own content hash, so a changed
 * image is a new key and this can be cached for a year.
 */
import type { Route } from "./+types/media.$key";

const TYPES: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
  svg: "image/svg+xml",
  mp4: "video/mp4",
  webm: "video/webm",
  mov: "video/quicktime",
};

export async function loader({ params, context, request }: Route.LoaderArgs) {
  const key = params.key;
  if (!key) throw new Response("Not found", { status: 404 });

  const bucket = context.cloudflare.env.MEDIA;
  if (!bucket) throw new Response("No media bucket is bound to this Worker.", { status: 503 });

  // A range request is how a browser scrubs a video. Without honouring it the
  // whole file is sent for every seek.
  const range = request.headers.get("Range");

  /**
   * The same picture, a tenth of the weight.
   *
   * The store's photography arrived as PNGs straight off the old platform —
   * 2.5MB each, 49MB across the shop — and that, not the code, was the 3.6
   * second largest-paint the store's own vitals were reporting. A WebP copy
   * of every one of them sits beside it under the same key with `.webp` on
   * the end, and any browser that says it can read WebP (every browser made
   * this decade) is given that instead. The original stays exactly where it
   * was for anything that cannot, so nothing can break: worst case, a browser
   * gets the same file it got yesterday.
   */
  const wantsWebp = (request.headers.get("Accept") ?? "").includes("image/webp");
  const isImage = /\.(png|jpe?g)$/i.test(key);
  let object = null;
  if (wantsWebp && isImage && !range) {
    object = await bucket.get(`${key}.webp`);
  }
  const servedWebp = Boolean(object);
  if (!object) object = await bucket.get(key, range ? { range: request.headers } : undefined);
  if (!object) throw new Response("Not found", { status: 404 });

  const extension = servedWebp ? "webp" : (key.split(".").pop()?.toLowerCase() ?? "");
  const headers = new Headers({
    "Content-Type": TYPES[extension] ?? object.httpMetadata?.contentType ?? "application/octet-stream",
    // Two different files answer the same URL depending on this header, so
    // every cache between here and the browser has to key on it.
    Vary: "Accept",
    "Cache-Control": "public, max-age=31536000, immutable",
    ETag: object.httpEtag,
    "Accept-Ranges": "bytes",
  });

  // Only answer 206 when the browser actually asked for a range. R2 fills in
  // the range on every object; replying 206 to a plain GET confuses clients
  // that never asked for one.
  if (range && object.range && "offset" in object.range) {
    const offset = object.range.offset ?? 0;
    const length = object.range.length ?? object.size - offset;
    headers.set("Content-Range", `bytes ${offset}-${offset + length - 1}/${object.size}`);
    return new Response(object.body, { status: 206, headers });
  }

  return new Response(object.body, { headers });
}
