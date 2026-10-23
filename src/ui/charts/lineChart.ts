// Single-series line + soft area. Crosshair snaps to the nearest point; arrow keys scrub too.
import { h, s } from '../dom.ts';
import { bindScrub, createTooltip, tooltipContent } from './chartFrame.ts';
import { linear, niceTicks, textWidth, tickIndexes } from './scale.ts';

export interface LinePoint {
  /** Tooltip label, e.g. "Wed, 22 Oct". */
  label: string;
  /** Axis label, e.g. "22 Oct". */
  tick: string;
  value: number;
}

export interface LineChartOptions {
  points: LinePoint[];
  width: number;
  height: number;
  animate: boolean;
  ariaLabel: string;
  formatValue: (v: number) => string;
  formatTick: (v: number) => string;
}

export function lineChart(o: LineChartOptions): HTMLElement {
  const { points, width, height } = o;
  const values = points.map((p) => p.value);
  const ticks = niceTicks(Math.min(0, ...values), Math.max(0, ...values), height < 160 ? 3 : 4);
  const left = Math.min(72, Math.max(28, Math.max(...ticks.map((t) => textWidth(o.formatTick(t)))) + 10));
  const m = { top: 22, right: 10, bottom: 26, left };
  const plotW = width - m.left - m.right;
  const n = points.length;
  const x = (i: number) => (n === 1 ? m.left + plotW / 2 : m.left + (i * plotW) / (n - 1));
  const y = linear([ticks[0], ticks[ticks.length - 1]], [height - m.bottom, m.top]);

  const coords = points.map((p, i) => [x(i), y(p.value)] as const);
  const line = coords.map(([cx, cy], i) => `${i ? 'L' : 'M'}${cx.toFixed(1)},${cy.toFixed(1)}`).join('');
  const base = y(0);
  const area = `${line}L${coords[n - 1][0].toFixed(1)},${base}L${coords[0][0].toFixed(1)},${base}Z`;
  const [ex, ey] = coords[n - 1];

  const crosshair = s('line', { class: 'crosshair', x1: 0, x2: 0, y1: m.top, y2: height - m.bottom, visibility: 'hidden' });
  const focusDot = s('circle', { class: 'focus-dot', r: 5, cx: 0, cy: 0, visibility: 'hidden' });
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
    { class: `chart${o.animate ? ' is-animated' : ''}`, width, height, viewBox: `0 0 ${width} ${height}`, 'aria-hidden': 'false' },
    s('g', { class: 'grid' }, ticks.map((t) =>
      s('line', { class: t === 0 ? 'baseline' : 'gridline', x1: m.left, x2: width - m.right, y1: y(t), y2: y(t) }))),
    s('g', { class: 'axis axis-y' }, ticks.map((t) =>
      s('text', { x: m.left - 8, y: y(t), 'text-anchor': 'end', 'dominant-baseline': 'middle' }, o.formatTick(t)))),
    s('g', { class: 'axis axis-x' }, tickIndexes(n, plotW).map((i, k, all) =>
      s('text', {
        x: x(i),
        y: height - 8,
        'text-anchor': n === 1 ? 'middle' : k === 0 && i === 0 ? 'start' : k === all.length - 1 && i === n - 1 ? 'end' : 'middle',
      }, points[i].tick))),
    s('path', { class: 'series-area', d: area }),
    s('path', { class: 'series-line', d: line, pathLength: 1 }),
    s('circle', { class: 'end-dot', cx: ex, cy: ey, r: 4 }),
    s('text', { class: 'end-label', x: ex, y: ey - 10, 'text-anchor': n === 1 ? 'middle' : 'end' }, o.formatValue(values[n - 1])),
    crosshair,
    focusDot,
    overlay,
  );

  const wrap = h('div', { class: 'chart-wrap' }, svg);
  const tip = createTooltip(wrap);
  const step = n > 1 ? plotW / (n - 1) : plotW;

  bindScrub(overlay, n, (px) => Math.round(px / step), (i) => {
    if (i === null) {
      crosshair.setAttribute('visibility', 'hidden');
      focusDot.setAttribute('visibility', 'hidden');
      tip.hide();
      return;
    }
    const [cx, cy] = coords[i];
    crosshair.setAttribute('x1', String(cx));
    crosshair.setAttribute('x2', String(cx));
    focusDot.setAttribute('cx', String(cx));
    focusDot.setAttribute('cy', String(cy));
    crosshair.setAttribute('visibility', 'visible');
    focusDot.setAttribute('visibility', 'visible');
    tip.show(cx, cy, tooltipContent(o.formatValue(points[i].value), points[i].label));
  });
  return wrap;
}
