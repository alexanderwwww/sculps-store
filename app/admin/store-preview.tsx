/**
 * The store, on the page.
 *
 * Not a screenshot and not a mock-up: a same-origin iframe of the real
 * storefront route, scaled down and laid back under a perspective tilt so the
 * top edge is narrower than the bottom. It is `pointer-events: none` and
 * `loading="lazy"`, so it can never take focus, never be clicked into, and
 * never blocks the admin from painting.
 *
 * If the store has a password on, this shows the password page — which is what
 * a customer would see, and therefore the truthful preview.
 */
export function StorePreview({
  slug,
  title,
  width = 460,
  height = 300,
  frameWidth = 1280,
}: {
  slug: string;
  title: string;
  width?: number;
  height?: number;
  frameWidth?: number;
}) {
  const scale = width / frameWidth;
  const frameHeight = Math.round(height / scale);

  return (
    <div style={{ perspective: 1400, perspectiveOrigin: "50% 0%", width: "100%", maxWidth: width }}>
      <div style={{ position: "relative", transformStyle: "preserve-3d" }}>
        <div
          style={{
            transform: "rotateX(14deg)",
            transformOrigin: "50% 100%",
            width: "100%",
            height,
            borderRadius: 18,
            overflow: "hidden",
            border: "1px solid rgba(255,255,255,.7)",
            boxShadow:
              "0 30px 60px rgba(20,16,40,.22), 0 6px 16px rgba(20,16,40,.10), inset 0 1px 0 rgba(255,255,255,.9)",
            background: "#fff",
          }}
        >
          <iframe
            src={`/?store=${encodeURIComponent(slug)}`}
            title={title}
            loading="lazy"
            tabIndex={-1}
            aria-hidden="true"
            scrolling="no"
            style={{
              width: frameWidth,
              height: frameHeight,
              border: 0,
              transform: `scale(${scale})`,
              transformOrigin: "top left",
              pointerEvents: "none",
              display: "block",
            }}
          />
        </div>
        {/* The contact shadow that puts the card on the page rather than over it. */}
        <div
          aria-hidden="true"
          style={{
            position: "absolute",
            left: "8%",
            right: "8%",
            bottom: -18,
            height: 26,
            borderRadius: "50%",
            background: "radial-gradient(50% 50% at 50% 50%, rgba(20,16,40,.22), rgba(20,16,40,0) 70%)",
            filter: "blur(6px)",
            pointerEvents: "none",
          }}
        />
      </div>
    </div>
  );
}
