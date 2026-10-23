// Small trend line for the hero card: de-emphasised gray line, accent dot on the latest value. No axes.
import { s } from '../dom.ts';
import { linear } from './scale.ts';

export function sparkline(values: number[], width: number, height: number, animate: boolean): SVGSVGElement {
  const pad = 5;
  const min = Math.min(0, ...values);
  const max = Math.max(...values, min + 1);
  const x = linear([0, Math.max(1, values.length - 1)], [pad, width - pad]);
  const y = linear([min, max], [height - pad, pad]);
  const d = values.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join('');
  const last = values.length - 1;
  return s(
    'svg',
    { class: `sparkline${animate ? ' is-animated' : ''}`, width, height, viewBox: `0 0 ${width} ${height}`, 'aria-hidden': 'true' },
    min < 0 && s('line', { class: 'baseline', x1: pad, x2: width - pad, y1: y(0), y2: y(0) }),
    s('path', { class: 'spark-line', d, pathLength: 1 }),
    s('circle', { class: 'end-dot', cx: x(last), cy: y(values[last]), r: 4 }),
  );
}
