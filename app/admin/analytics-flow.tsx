/**
 * Smooth flowing charts for the Analytics screen.
 *
 * Only `app/routes/admin.analytics.tsx` imports this. It is named
 * `analytics-flow` (and its component `FlowLine`, not `Sparkline`) on purpose:
 * another agent is writing a shared `Sparkline` under `app/admin/` and the two
 * must not collide.
 *
 * Every line here is a curve. Points are joined with a monotone cubic
 * interpolation (Fritsch–Carlson tangents, emitted as cubic béziers), which is
 * the one interpolation that cannot overshoot: it flows, but it never invents a
 * peak or a dip that is not in the data. A polyline's hard corners — the
 * "spike graph" — never appear.
 *
 * The line draws itself in once, on first paint, and never again on a poll or
 * a re-render, because the animation is a CSS keyframe on an element whose
 * identity does not change. `prefers-reduced-motion` removes it entirely.
 */
import { useId } from "react";

export type FlowPoint = { x: number; y: number };

/**
 * Monotone cubic interpolation through the points, as an SVG path.
 * Points must already be in ascending x. One point renders a flat segment so
 * the shape of the chart is still readable.
 */
export function smoothLinePath(points: FlowPoint[]): string {
  const n = points.length;
  if (n === 0) return "";
  if (n === 1) return `M${r(points[0].x)} ${r(points[0].y)}`;
  if (n === 2) return `M${r(points[0].x)} ${r(points[0].y)} L${r(points[1].x)} ${r(points[1].y)}`;

  // Secant slopes between neighbouring points.
  const dx: number[] = [];
  const dy: number[] = [];
  const secant: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    const h = points[i + 1].x - points[i].x;
    const d = points[i + 1].y - points[i].y;
    dx.push(h);
    dy.push(d);
    secant.push(h === 0 ? 0 : d / h);
  }

  // Tangents: the average of the neighbouring secants, flattened to zero at a
  // turning point so the curve cannot overshoot into a value nobody measured.
  const tangent: number[] = new Array(n);
  tangent[0] = secant[0];
  tangent[n - 1] = secant[n - 2];
  for (let i = 1; i < n - 1; i++) {
    if (secant[i - 1] * secant[i] <= 0) tangent[i] = 0;
    else tangent[i] = (secant[i - 1] + secant[i]) / 2;
  }
  // Fritsch–Carlson clamp.
  for (let i = 0; i < n - 1; i++) {
    if (secant[i] === 0) {
      tangent[i] = 0;
      tangent[i + 1] = 0;
      continue;
    }
    const a = tangent[i] / secant[i];
    const b = tangent[i + 1] / secant[i];
    const s = a * a + b * b;
    if (s > 9) {
      const t = 3 / Math.sqrt(s);
      tangent[i] = t * a * secant[i];
      tangent[i + 1] = t * b * secant[i];
    }
  }

  let d = `M${r(points[0].x)} ${r(points[0].y)}`;
  for (let i = 0; i < n - 1; i++) {
    const h = dx[i] / 3;
    const c1x = points[i].x + h;
    const c1y = points[i].y + tangent[i] * h;
    const c2x = points[i + 1].x - h;
    const c2y = points[i + 1].y - tangent[i + 1] * h;
    d += ` C${r(c1x)} ${r(c1y)} ${r(c2x)} ${r(c2y)} ${r(points[i + 1].x)} ${r(points[i + 1].y)}`;
  }
  return d;
}

/** The same curve, closed down to a baseline so it can be filled. */
export function smoothAreaPath(points: FlowPoint[], baseline: number): string {
  if (points.length === 0) return "";
  const line = smoothLinePath(points);
  const first = points[0];
  const last = points[points.length - 1];
  return `${line} L${r(last.x)} ${r(baseline)} L${r(first.x)} ${r(baseline)} Z`;
}

function r(value: number): string {
  return (Math.round(value * 100) / 100).toString();
}

/**
 * Turn a list of values into points inside a box. `top` is the padding kept
 * above the peak so the stroke is never clipped.
 */
export function toPoints(
  values: number[],
  width: number,
  height: number,
  opts: { top?: number; bottom?: number; max?: number } = {},
): FlowPoint[] {
  const top = opts.top ?? 2;
  const bottom = opts.bottom ?? 2;
  const peak = Math.max(1, opts.max ?? 0, ...values);
  const span = Math.max(0, height - top - bottom);
  return values.map((value, index) => ({
    x: values.length > 1 ? (index / (values.length - 1)) * width : width / 2,
    y: height - bottom - (value / peak) * span,
  }));
}

/** The draw-in, scoped to this module. Mounted once per page. */
export function FlowStyles() {
  return (
    <style>{`
.k-flow-draw{stroke-dasharray:var(--flow-len,1200);stroke-dashoffset:var(--flow-len,1200);animation:kFlowDraw 1.05s cubic-bezier(.22,.8,.28,1) forwards}
.k-flow-fill{opacity:0;animation:kFlowFill .9s ease-out .25s forwards}
@keyframes kFlowDraw{to{stroke-dashoffset:0}}
@keyframes kFlowFill{to{opacity:1}}
@media (prefers-reduced-motion:reduce){
  .k-flow-draw{animation:none;stroke-dasharray:none;stroke-dashoffset:0}
  .k-flow-fill{animation:none;opacity:1}
}
`}</style>
  );
}

/**
 * A smooth line with a soft gradient area beneath it.
 *
 * `animate` is read on the first render only — the class it adds runs its
 * keyframe once and CSS does not restart it when the data behind the path
 * changes, so a poll updates the shape without replaying the animation.
 */
export function FlowLine({
  values,
  width,
  height,
  stroke = "var(--chart)",
  strokeWidth = 2,
  fill = true,
  animate = true,
  max,
  pad,
}: {
  values: number[];
  width: number;
  height: number;
  stroke?: string;
  strokeWidth?: number;
  fill?: boolean;
  animate?: boolean;
  max?: number;
  pad?: { top?: number; bottom?: number };
}) {
  const id = useId().replace(/:/g, "");
  const points = toPoints(values, width, height, { ...pad, max });
  const line = smoothLinePath(points);
  const area = smoothAreaPath(points, height);
  // A generous over-estimate of the path length: the dash animation only needs
  // to start fully hidden, and any excess is eaten by the eased finish.
  const length = Math.round(width * 1.6 + height * 2);

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      style={{ width: "100%", height, display: "block", overflow: "visible" }}
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={`flow-${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={stroke} stopOpacity="0.22" />
          <stop offset="55%" stopColor={stroke} stopOpacity="0.07" />
          <stop offset="100%" stopColor={stroke} stopOpacity="0" />
        </linearGradient>
      </defs>
      {fill ? (
        <path d={area} fill={`url(#flow-${id})`} className={animate ? "k-flow-fill" : undefined} />
      ) : null}
      <path
        d={line}
        fill="none"
        stroke={stroke}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
        className={animate ? "k-flow-draw" : undefined}
        style={animate ? ({ "--flow-len": length } as React.CSSProperties) : undefined}
      />
    </svg>
  );
}
