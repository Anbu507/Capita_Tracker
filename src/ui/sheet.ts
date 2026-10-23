// Modal sheet built on <dialog>: slides up from the bottom on phones (drag down to close),
// a centered dialog on wider screens. Esc, the close button and a backdrop tap all close it.
import { h, prefersReducedMotion } from './dom.ts';
import { icon } from './icons.ts';

export interface SheetOptions {
  title: string;
  body: HTMLElement;
  footer?: HTMLElement;
  /** Element to focus on open; on touch devices the panel itself is focused so no keyboard pops up. */
  initialFocus?: HTMLElement;
  onClosed?: () => void;
  size?: 'normal' | 'small';
}

export interface Sheet {
  close: () => Promise<void>;
}

const isTouch = () => matchMedia('(pointer: coarse)').matches;
let openCount = 0;

export function openSheet(opts: SheetOptions): Sheet {
  const titleId = `sheet-title-${Math.random().toString(36).slice(2, 8)}`;
  const handle = h('div', { class: 'sheet-handle', 'aria-hidden': 'true' });
  const closeBtn = h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Close' }, icon('close'));
  const header = h('header', { class: 'sheet-header' }, h('h2', { id: titleId }, opts.title), closeBtn);
  const panel = h(
    'div',
    { class: `sheet-panel${opts.size === 'small' ? ' sheet-panel--small' : ''}`, tabindex: '-1' },
    handle,
    header,
    h('div', { class: 'sheet-body' }, opts.body),
    opts.footer && h('footer', { class: 'sheet-footer' }, opts.footer),
  );
  const dialog = h('dialog', { class: 'sheet', 'aria-labelledby': titleId }, panel);
  document.body.appendChild(dialog);

  let closing: Promise<void> | null = null;
  const close = (): Promise<void> => {
    if (closing) return closing;
    closing = new Promise<void>((resolve) => {
      dialog.classList.remove('is-open');
      panel.style.transform = '';
      const done = () => {
        dialog.close();
        dialog.remove();
        if (--openCount === 0) document.documentElement.classList.remove('has-sheet');
        opts.onClosed?.();
        resolve();
      };
      if (prefersReducedMotion()) done();
      else setTimeout(done, 220);
    });
    return closing;
  };

  closeBtn.addEventListener('click', () => void close());
  dialog.addEventListener('cancel', (e) => {
    e.preventDefault();
    void close();
  });
  dialog.addEventListener('click', (e) => {
    if (e.target === dialog) void close();
  });
  enableDragToClose(panel, [handle, header], close);

  openCount++;
  document.documentElement.classList.add('has-sheet');
  dialog.showModal();
  // The panel starts off-screen (translated); a scrolling focus would leave the whole sheet shifted.
  (opts.initialFocus && !isTouch() ? opts.initialFocus : panel).focus({ preventScroll: true });
  dialog.scrollTop = 0;
  void panel.offsetHeight; // commit the closed position so the open state transitions
  dialog.classList.add('is-open');
  return { close };
}

/** Phone bottom sheet: drag the handle/header down to dismiss. */
function enableDragToClose(panel: HTMLElement, grips: HTMLElement[], close: () => Promise<void>): void {
  let startY = 0;
  let startT = 0;
  let dy = 0;
  let dragging = false;

  const onMove = (e: PointerEvent) => {
    if (!dragging) return;
    dy = Math.max(0, e.clientY - startY);
    panel.style.transform = `translateY(${dy}px)`;
  };
  const onUp = () => {
    if (!dragging) return;
    dragging = false;
    panel.classList.remove('is-dragging');
    const velocity = dy / Math.max(1, performance.now() - startT);
    if (dy > 120 || velocity > 0.6) void close();
    else panel.style.transform = '';
  };

  for (const grip of grips) {
    grip.addEventListener('pointerdown', (e) => {
      if (!matchMedia('(max-width: 719.98px)').matches || (e.target as Element).closest('button')) return;
      dragging = true;
      startY = e.clientY;
      startT = performance.now();
      dy = 0;
      panel.classList.add('is-dragging');
      grip.setPointerCapture(e.pointerId);
    });
    grip.addEventListener('pointermove', onMove);
    grip.addEventListener('pointerup', onUp);
    grip.addEventListener('pointercancel', onUp);
  }
}
