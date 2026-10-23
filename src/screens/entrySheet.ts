// Add / edit sheet for both entry kinds. Pre-filled from the last purchase so a normal day is: open → Save.
import { formatRelativeDay, isISODate, today } from '../domain/dates.ts';
import { balanceOf, lastPurchase, recentAmounts, recentDayStats, usualQuantities } from '../domain/ledger.ts';
import { currencySymbol, parseAmount, toInputValue } from '../domain/money.ts';
import { entryMessage } from '../domain/share.ts';
import type { Entry, EntryItem, EntryKind } from '../domain/types.ts';
import { addEntry, deleteEntry, getData, restoreEntry, updateEntry, updateSettings } from '../data/store.ts';
import { h } from '../ui/dom.ts';
import { icon } from '../ui/icons.ts';
import { openSheet } from '../ui/sheet.ts';
import { toast } from '../ui/toast.ts';
import { approxMoney, money, notice, openWhatsApp, segmented } from './shared.ts';

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
  const usual = usualQuantities(data.items, data.entries);
  for (const item of data.items) {
    const inEntry = used?.find((i) => i.itemId === item.id);
    if (item.archived && !inEntry) continue;
    rows.push({ itemId: item.id, name: item.name, emoji: item.emoji, qty: 0 });
    qty.set(item.id, used ? (inEntry?.qty ?? 0) : (usual.get(item.id) ?? item.defaultQty));
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
  const noteInput = h('input', { type: 'text', id: 'entry-note', name: 'note', maxlength: 200, placeholder: 'Optional', value: editing?.note ?? '' });

  // One-tap amounts: the last few different amounts of this kind.
  const chips = h('div', { class: 'amount-chips', role: 'group', 'aria-label': 'Recent amounts' });
  const renderChips = () =>
    chips.replaceChildren(
      ...recentAmounts(data.entries, kind).map((a) =>
        h('button', {
          class: 'chip',
          type: 'button',
          onClick: () => {
            amountInput.value = toInputValue(a);
            amountError.textContent = '';
            amountInput.removeAttribute('aria-invalid');
          },
        }, money(a))),
    );

  const sendBox = h('input', { type: 'checkbox', id: 'entry-send', checked: data.settings.sendToShop });
  const sendRow = h('label', { class: 'check-row', for: 'entry-send' },
    sendBox,
    h('div', null,
      h('strong', null, editing ? 'Send the correction to the shop on WhatsApp' : 'Send to the shop on WhatsApp'),
      h('span', null, data.settings.shopPhone ? 'Opens WhatsApp with the message ready. You press Send.' : 'WhatsApp will ask which chat. Add the shop number in Settings to skip that.')));

  const itemsBlock = h(
    'fieldset',
    { class: 'field' },
    h('legend', { class: 'field-label' }, 'What I took'),
    h('div', { class: 'item-list' }, rows.map(stepper)),
  );
  const alreadyToday = !editing && data.entries.some((e) => e.kind === 'purchase' && e.date === now);
  const todayNotice = alreadyToday
    ? notice('info', 'info', `You already logged a purchase today. Save again only if you went to the shop twice.`)
    : null;

  const amountLabel = h('label', { class: 'field-label', for: 'entry-amount' });
  const submit = h('button', { class: 'btn btn-primary', type: 'submit', form: 'entry-form' });

  const syncKind = () => {
    const purchase = kind === 'purchase';
    itemsBlock.hidden = !purchase;
    if (todayNotice) todayNotice.hidden = !purchase;
    amountLabel.textContent = purchase ? 'Amount the shop charged' : 'Amount I gave the shop';
    amountHint.textContent = purchase
      ? stats ? `Usual day ${approxMoney(stats.average)} (${money(stats.min)}–${money(stats.max)})` : ''
      : `Balance now ${money(balanceOf(data.entries))}`;
    submit.textContent = editing ? 'Save changes' : purchase ? 'Save purchase' : 'Add money';
    if (!editing) amountInput.value = purchase && last ? toInputValue(last.amount) : '';
    amountError.textContent = '';
    renderChips();
  };

  const form = h(
    'form',
    { id: 'entry-form', class: 'form', novalidate: true },
    !editing &&
      segmented('Entry type', [{ id: 'purchase', label: 'Purchase' }, { id: 'topup', label: 'Add money' }], kind, (v) => {
        kind = v;
        syncKind();
      }),
    todayNotice,
    h('div', { class: 'field' }, h('label', { class: 'field-label', for: 'entry-date' }, 'Date'), h('div', { class: 'field-row' }, dateInput, dateHint)),
    itemsBlock,
    h(
      'div',
      { class: 'field' },
      amountLabel,
      h('div', { class: 'amount-input' }, h('span', { class: 'amount-prefix', 'aria-hidden': 'true' }, currencySymbol(data.settings.currency)), amountInput),
      chips,
      amountHint,
      amountError,
    ),
    h('div', { class: 'field' }, h('label', { class: 'field-label', for: 'entry-note' }, 'Note'), noteInput),
    sendRow,
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
          if (removed) toast('Entry deleted', { label: 'Undo', run: () => restoreEntry(removed) });
        },
      }, icon('trash', 18), 'Delete'),
    );
  }
  footer.appendChild(submit);

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const amount = parseAmount(amountInput.value);
    if (!isISODate(dateInput.value) || dateInput.value > now) {
      dateInput.focus();
      return;
    }
    if (amount === null) {
      amountError.textContent = 'Enter an amount greater than 0, like 42 or 42.50';
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
    // Save first, then open WhatsApp inside this same tap (browsers block pop-ups opened later).
    let saved: Entry;
    if (editing) {
      updateEntry(editing.id, draft);
      saved = getData().entries.find((x) => x.id === editing.id)!;
    } else {
      saved = addEntry(draft);
    }
    const left = balanceOf(getData().entries);
    const send = sendBox.checked;
    if (send) openWhatsApp(entryMessage(saved, left, getData().settings.currency, { corrected: !!editing }));
    if (send !== getData().settings.sendToShop) updateSettings({ sendToShop: send });

    void sheet.close();
    if (editing) toast('Changes saved');
    else
      toast(`${kind === 'purchase' ? 'Logged' : 'Added'} ${money(amount)} · ${money(left)} left`, {
        label: 'Undo',
        run: () => deleteEntry(saved.id),
      });
  });

  const sheet = openSheet({
    title: editing ? (editing.kind === 'purchase' ? 'Edit purchase' : 'Edit money added') : 'New entry',
    body: form,
    footer,
    initialFocus: amountInput,
  });
}
