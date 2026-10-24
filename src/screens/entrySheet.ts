// Add / edit sheet for both entry kinds. Pre-filled from the last purchase so a normal day is: open → Save.
import { formatRelativeDay, isISODate, today } from '../domain/dates.ts';
import { balanceOf, lastPurchase, recentDayStats } from '../domain/ledger.ts';
import { currencySymbol, parseAmount, toInputValue } from '../domain/money.ts';
import type { Entry, EntryItem, EntryKind } from '../domain/types.ts';
import { addEntry, deleteEntry, getData, restoreEntry, updateEntry } from '../data/store.ts';
import { h } from '../ui/dom.ts';
import { icon } from '../ui/icons.ts';
import { openSheet } from '../ui/sheet.ts';
import { toast } from '../ui/toast.ts';
import { money, notice, segmented } from './shared.ts';

export function openEntrySheet(opts: { kind?: EntryKind; entry?: Entry } = {}): void {
  const data = getData();
  const editing = opts.entry;
  let kind: EntryKind = editing?.kind ?? opts.kind ?? 'purchase';
  const now = today();
  const last = lastPurchase(data.entries);
  const stats = recentDayStats(data.entries, now);

  // ----- Items: active catalog items, plus any archived ones this entry already uses -----
  const qty = new Map<string, number>();
  const rows: EntryItem[] = [];
  const used = editing?.kind === 'purchase' ? editing.items : null;
  for (const item of data.items) {
    const inEntry = used?.find((i) => i.itemId === item.id);
    if (item.archived && !inEntry) continue;
    rows.push({ itemId: item.id, name: item.name, emoji: item.emoji, qty: 0 });
    const fromLast = last?.items.find((i) => i.itemId === item.id)?.qty;
    qty.set(item.id, used ? (inEntry?.qty ?? 0) : (fromLast ?? item.defaultQty));
  }
  for (const i of used ?? []) {
    if (!rows.some((r) => r.itemId === i.itemId)) {
      rows.push({ ...i, qty: 0 });
      qty.set(i.itemId, i.qty);
    }
  }

  const stepper = (r: EntryItem) => {
    const out = h('output', { class: 'stepper-value', 'aria-live': 'polite' }, String(qty.get(r.itemId) ?? 0));
    const change = (d: number) => {
      const v = Math.max(0, Math.min(99, (qty.get(r.itemId) ?? 0) + d));
      qty.set(r.itemId, v);
      out.textContent = String(v);
    };
    return h(
      'div',
      { class: 'item-row' },
      h('span', { class: 'item-emoji', 'aria-hidden': 'true' }, r.emoji),
      h('span', { class: 'item-name' }, r.name),
      h(
        'div',
        { class: 'stepper' },
        h('button', { type: 'button', class: 'icon-btn', 'aria-label': `Fewer ${r.name}`, onClick: () => change(-1) }, icon('minus', 18)),
        out,
        h('button', { type: 'button', class: 'icon-btn', 'aria-label': `More ${r.name}`, onClick: () => change(1) }, icon('plus', 18)),
      ),
    );
  };

  // ----- Fields -----
  const dateInput = h('input', { type: 'date', id: 'entry-date', name: 'date', required: true, max: now, value: editing?.date ?? now });
  const dateHint = h('span', { class: 'field-hint' }, formatRelativeDay(dateInput.value, now));
  dateInput.addEventListener('input', () => (dateHint.textContent = isISODate(dateInput.value) ? formatRelativeDay(dateInput.value, now) : ''));

  const amountInput = h('input', {
    type: 'text',
    id: 'entry-amount',
    name: 'amount',
    inputmode: 'decimal',
    enterkeyhint: 'done',
    autocomplete: 'off',
    required: true,
    'aria-describedby': 'entry-amount-hint entry-amount-error',
    value: editing ? toInputValue(editing.amount) : '',
  });
  amountInput.addEventListener('focus', () => amountInput.select());
  const amountError = h('p', { class: 'field-error', id: 'entry-amount-error', role: 'alert' });
  const amountHint = h('p', { class: 'field-hint', id: 'entry-amount-hint' });
  const noteInput = h('input', { type: 'text', id: 'entry-note', name: 'note', maxlength: 200, placeholder: 'You can leave this empty', value: editing?.note ?? '' });

  const itemsBlock = h(
    'fieldset',
    { class: 'field' },
    h('legend', { class: 'field-label' }, 'What I bought'),
    h('div', { class: 'item-list' }, rows.map(stepper)),
  );
  const alreadyToday = !editing && data.entries.some((e) => e.kind === 'purchase' && e.date === now);
  const todayNotice = alreadyToday
    ? notice('info', 'info', `You already added today. Add again only if you went to the shop twice today.`)
    : null;

  const amountLabel = h('label', { class: 'field-label', for: 'entry-amount' });
  const submit = h('button', { class: 'btn btn-primary', type: 'submit', form: 'entry-form' });

  const syncKind = () => {
    const purchase = kind === 'purchase';
    itemsBlock.hidden = !purchase;
    if (todayNotice) todayNotice.hidden = !purchase;
    amountLabel.textContent = purchase ? 'How much it cost' : 'How much I gave the shop';
    amountHint.textContent = purchase
      ? stats ? (stats.min === stats.max ? `Normally ${money(stats.min)}` : `Normally ${money(stats.min)} to ${money(stats.max)}`) : ''
      : `Money left now: ${money(balanceOf(data.entries))}`;
    submit.textContent = 'Save';
    if (!editing) amountInput.value = purchase && last ? toInputValue(last.amount) : '';
    amountError.textContent = '';
  };

  const form = h(
    'form',
    { id: 'entry-form', class: 'form', novalidate: true },
    !editing &&
      segmented('What is this?', [{ id: 'purchase', label: 'I bought' }, { id: 'topup', label: 'I gave money' }], kind, (v) => {
        kind = v;
        syncKind();
      }),
    todayNotice,
    h('div', { class: 'field' }, h('label', { class: 'field-label', for: 'entry-date' }, 'Day'), h('div', { class: 'field-row' }, dateInput, dateHint)),
    itemsBlock,
    h(
      'div',
      { class: 'field' },
      amountLabel,
      h('div', { class: 'amount-input' }, h('span', { class: 'amount-prefix', 'aria-hidden': 'true' }, currencySymbol(data.settings.currency)), amountInput),
      amountHint,
      amountError,
    ),
    h('div', { class: 'field' }, h('label', { class: 'field-label', for: 'entry-note' }, 'Note'), noteInput),
  );
  syncKind();

  const footer = h('div', { class: 'btn-row' });
  if (editing) {
    footer.appendChild(
      h('button', {
        class: 'btn btn-danger-ghost',
        type: 'button',
        onClick: async () => {
          await sheet.close();
          const removed = deleteEntry(editing.id);
          if (removed) toast('Deleted', { label: 'Undo', run: () => restoreEntry(removed) });
        },
      }, icon('trash', 18), 'Delete'),
    );
  }
  footer.appendChild(submit);

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const amount = parseAmount(amountInput.value);
    if (!isISODate(dateInput.value) || dateInput.value > now) {
      dateInput.focus();
      return;
    }
    if (amount === null) {
      amountError.textContent = 'Type the money, like 42';
      amountInput.setAttribute('aria-invalid', 'true');
      amountInput.focus();
      return;
    }
    const draft = {
      kind,
      date: dateInput.value,
      amount,
      note: noteInput.value,
      items: rows.map((r) => ({ ...r, qty: qty.get(r.itemId) ?? 0 })),
    };
    await sheet.close();
    if (editing) {
      updateEntry(editing.id, draft);
      toast('Saved');
    } else {
      const created = addEntry(draft);
      const left = balanceOf(getData().entries);
      toast(`Saved ${money(amount)}. Money left: ${money(left)}`, {
        label: 'Undo',
        run: () => deleteEntry(created.id),
      });
    }
  });

  const sheet = openSheet({
    title: editing ? (editing.kind === 'purchase' ? 'Change what I bought' : 'Change money given') : 'Add',
    body: form,
    footer,
    initialFocus: amountInput,
  });
}
