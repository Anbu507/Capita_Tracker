// Single-series columns: thin (≤ 24 px), 4 px rounded tops, square at the baseline, optional average line.
// The whole column slot is the touch target; the other columns dim while one is active.
import { h, s } from '../dom.ts';
import { bindScrub, createTooltip, tooltipContent } from './chartFrame.ts';
import { linear, niceTicks, textWidth, tickIndexes } from './scale.ts';

export interface Bar {
  label: string;
  tick: string;
  value: number;
  detail?: string;
}

export interface BarChartOptions {
  bars: Bar[];
  width: number;
  height: number;
  animate: boolean;
  ariaLabel: string;
  formatValue: (v: number) => string;
  formatTick: (v: number) => string;
  /** Drawn as a reference line; the card subtitle names its value (an on-plot label would sit on the bars). */
  average?: number;
}

function columnPath(x: number, w: number, top: number, base: number): string {
  const r = Math.min(4, w / 2, base - top);
  return `M${x},${base}V${top + r}Q${x},${top} ${x + r},${top}H${x + w - r}Q${x + w},${top} ${x + w},${top + r}V${base}Z`;
}

export function barChart(o: BarChartOptions): HTMLElement {
  const { bars, width, height } = o;
  const n = bars.length;
  const max = Math.max(0, ...bars.map((b) => b.value), o.average ?? 0);
  const ticks = niceTicks(0, max, height < 160 ? 3 : 4);
  const left = Math.min(72, Math.max(28, Math.max(...ticks.map((t) => textWidth(o.formatTick(t)))) + 10));
  const m = { top: 12, right: 6, bottom: 26, left };
  const plotW = width - m.left - m.right;
  const band = plotW / Math.max(1, n);
  const barW = Math.min(24, Math.max(2, band * 0.64));
  const y = linear([0, ticks[ticks.length - 1]], [height - m.bottom, m.top]);
  const base = y(0);
  const cx = (i: number) => m.left + band * i + band / 2;

  const columns = bars.map((b, i) => {
    const top = y(b.value);
    const delay = Math.min(i * 14, 400);
    return b.value > 0
      ? s('path', { class: 'bar', d: columnPath(cx(i) - barW / 2, barW, top, base), style: `animation-delay:${delay}ms` })
      : s('rect', { class: 'bar bar-zero', x: cx(i) - barW / 2, y: base - 1, width: barW, height: 1 });
  });

  const avg = o.average && o.average > 0 ? o.average : null;
  const columnsGroup = s('g', { class: 'bars' }, columns);
  const overlay = s('rect', {
    class: 'chart-hit',
    x: m.left,
    y: 0,
    width: Math.max(0, plotW),
    height: height - m.bottom + 6,
    tabindex: 0,
    role: 'img',
    'aria-label': `${o.ariaLabel}. Use the left and right arrow keys to read values.`,
  });

  const svg = s(
    'svg',
    { class: `chart${o.animate ? ' is-animated' : ''}`, width, height, viewBox: `0 0 ${width} ${height}` },
    s('g', { class: 'grid' }, ticks.map((t) =>
      s('line', { class: t === 0 ? 'baseline' : 'gridline', x1: m.left, x2: width - m.right, y1: y(t), y2: y(t) }))),
    s('g', { class: 'axis axis-y' }, ticks.map((t) =>
      s('text', { x: m.left - 8, y: y(t), 'text-anchor': 'end', 'dominant-baseline': 'middle' }, o.formatTick(t)))),
    s('g', { class: 'axis axis-x' }, tickIndexes(n, plotW, 56).map((i) =>
      s('text', { x: cx(i), y: height - 8, 'text-anchor': 'middle' }, bars[i].tick))),
    columnsGroup,
    avg && s('g', { class: 'ref' }, s('line', { class: 'ref-line', x1: m.left, x2: width - m.right, y1: y(avg), y2: y(avg) })),
    overlay,
  );

  const wrap = h('div', { class: 'chart-wrap' }, svg);
  const tip = createTooltip(wrap);

  bindScrub(overlay, n, (px) => Math.floor(px / band), (i) => {
    columns.forEach((c, k) => c.classList.toggle('is-active', k === i));
    columnsGroup.classList.toggle('has-active', i !== null);
    if (i === null) return tip.hide();
    const b = bars[i];
    tip.show(cx(i), Math.min(y(b.value), base - 2), tooltipContent(o.formatValue(b.value), b.label, b.detail));
  });
  return wrap;
}
