/**
 * The one sparkline, shared by Home and Live View.
 *
 * A smooth curve, not a spike graph: the points are joined with monotone cubic
 * interpolation (the Fritsch–Carlson filter), which flows through the samples
 * without the overshoot a plain Catmull-Rom spline invents between them. The
 * curve never leaves the range of the data it was given, so nothing on screen
 * is higher or lower than something that actually happened.
 *
 * The honesty rule the spike version already had is kept, and tightened into
 * one place: fewer than `minSamples` non-empty buckets, or a series that is all
 * zeros, draws nothing at all. A flat line would claim a steady measurement was
 * taken; an empty box says only that nothing has happened yet.
 */
import { useId } from "react";

export interface SparklineProps {
  series: number[];
  width?: number;
  height?: number;
  stroke?: string;
  /** Non-zero samples needed before a curve is drawn at all. */
  minSamples?: number;
}

/**
 * Monotone cubic Hermite tangents, then each span as one cubic bézier.
 * Returns "" when there is nothing to draw.
 */
export function smoothPath(xs: number[], ys: number[]): string {
  const n = xs.length;
  if (n < 2) return "";

  const dx: number[] = [];
  const slope: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    const h = xs[i + 1] - xs[i];
    dx.push(h);
    slope.push(h === 0 ? 0 : (ys[i + 1] - ys[i]) / h);
  }

  const m: number[] = new Array(n);
  m[0] = slope[0];
  m[n - 1] = slope[n - 2];
  for (let i = 1; i < n - 1; i++) {
    // A turning point gets a flat tangent — that is what stops the curve
    // sailing past the sample either side of it.
    m[i] = slope[i - 1] * slope[i] <= 0 ? 0 : (slope[i - 1] + slope[i]) / 2;
  }
  for (let i = 0; i < n - 1; i++) {
    if (slope[i] === 0) {
      m[i] = 0;
      m[i + 1] = 0;
      continue;
    }
    const a = m[i] / slope[i];
    const b = m[i + 1] / slope[i];
    const s = a * a + b * b;
    if (s > 9) {
      const t = 3 / Math.sqrt(s);
      m[i] = t * a * slope[i];
      m[i + 1] = t * b * slope[i];
    }
  }

  let d = `M${xs[0].toFixed(2)} ${ys[0].toFixed(2)}`;
  for (let i = 0; i < n - 1; i++) {
    const h = dx[i] / 3;
    const c1x = xs[i] + h;
    const c1y = ys[i] + m[i] * h;
    const c2x = xs[i + 1] - h;
    const c2y = ys[i + 1] - m[i + 1] * h;
    d +=
      ` C${c1x.toFixed(2)} ${c1y.toFixed(2)},` +
      `${c2x.toFixed(2)} ${c2y.toFixed(2)},` +
      `${xs[i + 1].toFixed(2)} ${ys[i + 1].toFixed(2)}`;
  }
  return d;
}

export function Sparkline({
  series,
  width = 54,
  height = 18,
  stroke = "#1D3FCC",
  minSamples = 2,
}: SparklineProps) {
  const gradientId = useId();

  const max = series.length ? Math.max(...series) : 0;
  const filled = series.filter((value) => value > 0).length;
  if (series.length < 2 || max <= 0 || filled < minSamples) return null;

  const pad = 1.5;
  const step = width / (series.length - 1);
  const xs = series.map((_, index) => index * step);
  const ys = series.map((value) => height - pad - (value / max) * (height - pad * 2));

  const line = smoothPath(xs, ys);
  if (!line) return null;
  const area = `${line} L${width.toFixed(2)} ${height} L0 ${height} Z`;

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      style={{ flex: "none", display: "block", overflow: "visible" }}
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={stroke} stopOpacity=".26" />
          <stop offset="100%" stopColor={stroke} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${gradientId})`} />
      <path
        d={line}
        fill="none"
        stroke={stroke}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity=".85"
      />
    </svg>
  );
}
