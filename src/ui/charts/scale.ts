// Scales and "nice" ticks for the hand-drawn SVG charts.

export type Scale = (v: number) => number;

export function linear([d0, d1]: [number, number], [r0, r1]: [number, number]): Scale {
  const k = d1 === d0 ? 0 : (r1 - r0) / (d1 - d0);
  return (v) => r0 + (v - d0) * k;
}

function niceStep(raw: number): number {
  const exp = 10 ** Math.floor(Math.log10(raw));
  const f = raw / exp;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * exp;
}

/** Round tick values covering [min, max]. Values are paise; steps never go below ₹1. */
export function niceTicks(min: number, max: number, count = 4): number[] {
  if (max <= min) max = min + 10_000;
  const step = Math.max(100, niceStep((max - min) / count));
  const start = Math.floor(min / step) * step;
  const end = Math.ceil(max / step) * step;
  const ticks: number[] = [];
  for (let v = start; v <= end + step / 2; v += step) ticks.push(Math.round(v));
  return ticks;
}

/** Indexes to label on a category/time axis so labels never crowd (~1 per `minGap` px). */
export function tickIndexes(n: number, plotWidth: number, minGap = 64): number[] {
  if (n <= 0) return [];
  const max = Math.max(2, Math.floor(plotWidth / minGap));
  const step = Math.max(1, Math.ceil(n / max));
  const out: number[] = [];
  for (let i = 0; i < n; i += step) out.push(i);
  // Make sure the latest point is labelled; drop the previous one if they would collide.
  const last = n - 1;
  if (out[out.length - 1] !== last) {
    if (out.length > 1 && last - out[out.length - 1] < step * 0.6) out.pop();
    out.push(last);
  }
  return out;
}

/** Rough label width for 11px system-ui text, used to size the y-axis gutter. */
export const textWidth = (text: string) => text.length * 6.6;
