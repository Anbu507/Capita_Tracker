import { h } from './dom.ts';
import { openSheet } from './sheet.ts';

/** Asks a yes/no question in a small sheet. Resolves true only when the confirm button is pressed. */
export function confirmDialog(opts: { title: string; message: string; confirmLabel: string; danger?: boolean }): Promise<boolean> {
  return new Promise((resolve) => {
    let answer = false;
    const cancel = h('button', { class: 'btn btn-secondary', type: 'button' }, 'Cancel');
    const ok = h('button', { class: `btn ${opts.danger ? 'btn-danger' : 'btn-primary'}`, type: 'button' }, opts.confirmLabel);
    const sheet = openSheet({
      title: opts.title,
      size: 'small',
      body: h('p', { class: 'confirm-message' }, opts.message),
      footer: h('div', { class: 'btn-row' }, cancel, ok),
      initialFocus: cancel,
      onClosed: () => resolve(answer),
    });
    cancel.addEventListener('click', () => void sheet.close());
    ok.addEventListener('click', () => {
      answer = true;
      void sheet.close();
    });
  });
}
