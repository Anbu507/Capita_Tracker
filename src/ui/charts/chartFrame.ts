// Shared chart plumbing: responsive mounting, the tooltip, the chart card and its table view.
import { h, prefersReducedMotion, type Child } from '../dom.ts';
import { icon } from '../icons.ts';
import { onDispose } from '../lifecycle.ts';

/**
 * Draws at the container's real pixel width and redraws on resize/rotate,
 * so SVG text is never stretched. Only the first draw animates.
 */
export function mountResponsive(container: HTMLElement, draw: (width: number, animate: boolean) => Element): void {
  let lastWidth = 0;
  let first = true;
  const render = (width: number) => {
    width = Math.floor(width);
    if (width <= 0 || width === lastWidth) return;
    lastWidth = width;
    container.replaceChildren(draw(width, first && !prefersReducedMotion()));
    first = false;
  };
  const ro = new ResizeObserver((entries) => render(entries[0].contentRect.width));
  ro.observe(container);
  onDispose(() => ro.disconnect());
}

export interface Tooltip {
  el: HTMLElement;
  show: (x: number, y: number, content: Child[]) => void;
  hide: () => void;
}

/** A single tooltip positioned inside `wrapper` (which must be position: relative). */
export function createTooltip(wrapper: HTMLElement): Tooltip {
  const el = h('div', { class: 'chart-tooltip', role: 'status', 'aria-live': 'polite' });
  wrapper.appendChild(el);
  return {
    el,
    show(x, y, content) {
      el.replaceChildren(...content.map((c) => (c instanceof Node ? c : document.createTextNode(String(c ?? '')))));
      el.classList.add('is-visible');
      const w = el.offsetWidth;
      const max = wrapper.clientWidth - w / 2 - 4;
      const left = Math.max(w / 2 + 4, Math.min(max, x));
      const below = y - el.offsetHeight - 14 < 0;
      el.style.left = `${left}px`;
      el.style.top = `${below ? y + 14 : y - 14}px`;
      el.classList.toggle('is-below', below);
    },
    hide() {
      el.classList.remove('is-visible');
    },
  };
}

/** Value first (strong), then the label, then optional detail — the tooltip hierarchy. */
export function tooltipContent(value: string, label: string, detail?: string): Child[] {
  return [
    h('strong', { class: 'tt-value' }, value),
    h('span', { class: 'tt-label' }, label),
    detail ? h('span', { class: 'tt-detail' }, detail) : null,
  ];
}

/**
 * Pointer + keyboard scrubbing over a plot. `indexAt` maps a plot x to a data index;
 * `activate(i)` draws the hover state, `activate(null)` clears it.
 */
export function bindScrub(
  target: SVGElement,
  count: number,
  indexAt: (x: number) => number,
  activate: (i: number | null) => void,
): void {
  let current: number | null = null;
  let hideTimer: number | undefined;
  const set = (i: number | null) => {
    current = i === null ? null : Math.max(0, Math.min(count - 1, i));
    activate(current);
  };
  const fromEvent = (e: PointerEvent) => {
    const box = target.getBoundingClientRect();
    set(indexAt(e.clientX - box.left));
  };
  target.addEventListener('pointerdown', (e) => {
    window.clearTimeout(hideTimer);
    fromEvent(e);
  });
  target.addEventListener('pointermove', (e) => {
    window.clearTimeout(hideTimer);
    fromEvent(e);
  });
  target.addEventListener('pointerleave', (e) => {
    // Mouse: hide right away. Touch: leave the readout up for a moment after the finger lifts.
    if (e.pointerType === 'mouse') set(null);
    else hideTimer = window.setTimeout(() => set(null), 2500);
  });
  target.addEventListener('pointercancel', () => set(null));
  target.addEventListener('focus', () => set(count - 1));
  target.addEventListener('blur', () => set(null));
  target.addEventListener('keydown', (e) => {
    const step: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowDown: -1, ArrowUp: 1 };
    if (e.key in step) set((current ?? count - 1) + step[e.key]);
    else if (e.key === 'Home') set(0);
    else if (e.key === 'End') set(count - 1);
    else if (e.key === 'Escape') set(null);
    else return;
    e.preventDefault();
  });
}

export interface ChartCardOptions {
  title: string;
  subtitle?: string;
  height: number;
  draw: (width: number, animate: boolean) => Element;
  table: () => HTMLTableElement;
  className?: string;
}

/** A chart in a card with a Chart/Table toggle — the table is the accessible twin of the chart. */
export function chartCard(opts: ChartCardOptions): HTMLElement {
  const body = h('div', { class: 'chart-body', style: `min-height:${opts.height}px` });
  const tableWrap = h('div', { class: 'chart-table', hidden: true });
  const toggle = h(
    'button',
    { class: 'chip chip-sm', type: 'button', 'aria-pressed': 'false', title: 'Show the numbers as a table' },
    icon('table', 16),
    'Table',
  );
  toggle.addEventListener('click', () => {
    const showTable = toggle.getAttribute('aria-pressed') !== 'true';
    toggle.setAttribute('aria-pressed', String(showTable));
    if (showTable) tableWrap.replaceChildren(opts.table());
    tableWrap.hidden = !showTable;
    body.hidden = showTable;
  });
  const card = h(
    'section',
    { class: `card chart-card ${opts.className ?? ''}` },
    h(
      'header',
      { class: 'card-header' },
      h('div', null, h('h3', { class: 'card-title' }, opts.title), opts.subtitle && h('p', { class: 'card-subtitle' }, opts.subtitle)),
      toggle,
    ),
    body,
    tableWrap,
  );
  mountResponsive(body, opts.draw);
  return card;
}

export function dataTable(columns: string[], rows: string[][], numericFrom = 1): HTMLTableElement {
  return h(
    'table',
    { class: 'data-table' },
    h('thead', null, h('tr', null, columns.map((c, i) => h('th', { scope: 'col', class: i >= numericFrom ? 'num' : '' }, c)))),
    h('tbody', null, rows.map((r) => h('tr', null, r.map((c, i) => h(i === 0 ? 'th' : 'td', { class: i >= numericFrom ? 'num' : '', scope: i === 0 ? 'row' : null }, c))))),
  );
}
