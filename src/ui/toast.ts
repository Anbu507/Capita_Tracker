// One toast at a time, announced to screen readers, with an optional action (Undo).
import { $, h } from './dom.ts';

let timer: number | undefined;

export function toast(message: string, action?: { label: string; run: () => void }, ms = 5000): void {
  const region = $('#toast-region');
  window.clearTimeout(timer);
  const hide = () => {
    el.classList.remove('is-visible');
    window.setTimeout(() => el.remove(), 200);
  };
  const el = h(
    'div',
    { class: 'toast', role: 'status' },
    h('span', null, message),
    action &&
      h('button', {
        class: 'toast-action',
        type: 'button',
        onClick: () => {
          action.run();
          hide();
        },
      }, action.label),
  );
  region.replaceChildren(el);
  void el.offsetHeight; // commit the hidden state so the entrance transitions
  el.classList.add('is-visible');
  timer = window.setTimeout(hide, ms);
}
