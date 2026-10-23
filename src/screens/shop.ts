// Shop view: a full-screen page I hand to the shopkeeper at the counter.
// Built only from things they already know — big numbers, item pictures, a calculator-style
// number pad, one Save button, and WhatsApp. No menus, no settings, no small text to read.
import { today } from '../domain/dates.ts';
import { balanceOf, lastPurchase, usualQuantities } from '../domain/ledger.ts';
import { entryMessage } from '../domain/share.ts';
import type { AppData, Entry, EntryItem, PurchaseEntry } from '../domain/types.ts';
import { addEntry, deleteEntry, getData } from '../data/store.ts';
import { h } from '../ui/dom.ts';
import { icon } from '../ui/icons.ts';
import { onDispose } from '../ui/lifecycle.ts';
import { go } from '../ui/router.ts';
import { itemsSummary, money, openWhatsApp } from './shared.ts';

const MAX_DIGITS = 5; // up to ₹99,999

// Kept outside the render so a refresh of the data (e.g. from another tab) never wipes what the
// shopkeeper has typed. Reset each time the Shop view is opened.
// 'saved' is set before the entry is stored: storing re-renders this screen straight away.
let mode: 'auto' | 'entry' | 'saved' = 'auto';
let digits = '';
let qty: Map<string, number> | null = null;

export function resetShopView(): void {
  mode = 'auto';
  digits = '';
  qty = null;
}

const tap = () => navigator.vibrate?.(8);

function leave(): void {
  resetShopView();
  go('home');
}

export function shopScreen(data: AppData): HTMLElement {
  const now = today();
  const balance = balanceOf(data.entries);
  const todays = data.entries.filter((e): e is PurchaseEntry => e.kind === 'purchase' && e.date === now);
  // The Shop view always saves with today's date, so the newest purchase is the one just saved.
  const justSaved = mode === 'saved' ? lastPurchase(data.entries) : undefined;

  const body = h('div', { class: 'shop-body' });
  const paint = () =>
    body.replaceChildren(justSaved ? savedPanel(justSaved, balance) : mode === 'auto' && todays.length ? todayPanel(todays, paint) : entryPanel(data));
  paint();

  return h(
    'div',
    { class: 'shop' },
    h('header', { class: 'shop-top' },
      h('button', { class: 'btn btn-ghost', type: 'button', onClick: leave }, icon('arrowLeft'), 'Back'),
      data.settings.shopName && h('span', { class: 'shop-name' }, data.settings.shopName)),
    h('section', { class: `shop-balance${balance < 0 ? ' is-negative' : ''}`, 'aria-live': 'polite' },
      h('p', { class: 'shop-balance-label' }, balance < 0 ? 'I owe you' : 'Money left with you'),
      h('p', { class: 'shop-balance-value' }, money(Math.abs(balance)))),
    body,
  );
}

// ---------- Typing today's purchase ----------

function entryPanel(data: AppData): HTMLElement {
  const items = data.items.filter((i) => !i.archived);
  if (!qty) qty = usualQuantities(items, data.entries);
  const q = qty;
  const last = lastPurchase(data.entries);

  const itemRow = (it: (typeof items)[number]) => {
    const count = h('output', { class: 'shop-count', 'aria-live': 'polite' }, String(q.get(it.id) ?? 0));
    const change = (d: number) => {
      tap();
      const v = Math.max(0, Math.min(99, (q.get(it.id) ?? 0) + d));
      q.set(it.id, v);
      count.textContent = String(v);
    };
    return h('div', { class: 'shop-item' },
      h('span', { class: 'shop-item-pic', 'aria-hidden': 'true' }, it.emoji),
      h('span', { class: 'shop-item-name' }, it.name),
      h('button', { class: 'shop-step', type: 'button', 'aria-label': `Fewer ${it.name}`, onClick: () => change(-1) }, icon('minus', 26)),
      count,
      h('button', { class: 'shop-step', type: 'button', 'aria-label': `More ${it.name}`, onClick: () => change(1) }, icon('plus', 26)));
  };

  const amountValue = h('output', { class: 'shop-amount-value', id: 'shop-amount', 'aria-live': 'polite' });
  const save = h('button', { class: 'btn btn-primary shop-save', type: 'button' });
  const show = () => {
    const paise = Number(digits || '0') * 100;
    amountValue.textContent = money(paise);
    amountValue.classList.toggle('is-empty', !digits);
    save.disabled = !digits;
    save.replaceChildren(icon('check', 26), digits ? `Save ${money(paise)}` : 'Save');
  };
  const press = (key: string) => {
    tap();
    if (key === 'C') digits = '';
    else if (key === '⌫') digits = digits.slice(0, -1);
    else if (digits.length < MAX_DIGITS && !(digits === '' && key === '0')) digits += key;
    show();
  };

  const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'C', '0', '⌫'];
  const keypad = h('div', { class: 'keypad', role: 'group', 'aria-label': 'Number pad' },
    keys.map((k) =>
      h('button', {
        class: `key${k === 'C' || k === '⌫' ? ' key-fn' : ''}`,
        type: 'button',
        'aria-label': k === 'C' ? 'Clear' : k === '⌫' ? 'Delete last digit' : k,
        onClick: () => press(k),
      }, k === '⌫' ? icon('backspace', 28) : k)));

  save.addEventListener('click', () => {
    if (!digits) return;
    const entryItems: EntryItem[] = items.map((it) => ({ itemId: it.id, name: it.name, emoji: it.emoji, qty: q.get(it.id) ?? 0 }));
    const amount = Number(digits) * 100;
    mode = 'saved';
    digits = '';
    qty = null;
    addEntry({ kind: 'purchase', date: today(), amount, note: '', items: entryItems });
  });

  // A laptop keyboard works too: digits, Backspace, Escape to clear, Enter to save.
  const onKey = (e: KeyboardEvent) => {
    if (e.ctrlKey || e.metaKey || e.altKey || document.querySelector('dialog')) return;
    if (/^\d$/.test(e.key)) press(e.key);
    else if (e.key === 'Backspace') press('⌫');
    else if (e.key === 'Escape') press('C');
    else if (e.key === 'Enter' && digits) save.click();
    else return;
    e.preventDefault();
  };
  window.addEventListener('keydown', onKey);
  onDispose(() => window.removeEventListener('keydown', onKey));

  show();
  return h('div', { class: 'shop-entry' },
    items.length > 0 && h('section', { class: 'shop-card shop-items', 'aria-label': 'Items taken today' }, items.map(itemRow)),
    h('section', { class: 'shop-card' },
      h('div', { class: 'shop-amount' },
        h('label', { class: 'shop-amount-label', for: 'shop-amount' }, "Today's amount"),
        amountValue),
      last && h('p', { class: 'shop-hint' }, `Last time ${money(last.amount)}`),
      keypad),
    save);
}

// ---------- After saving ----------

function savedPanel(entry: Entry, balance: number): HTMLElement {
  const items = entry.kind === 'purchase' ? itemsSummary(entry.items) : '';
  return h('div', { class: 'shop-result' },
    h('div', { class: 'big-check', 'aria-hidden': 'true' }, icon('check', 52)),
    h('h2', { class: 'shop-result-title' }, 'Saved'),
    h('p', { class: 'shop-result-line' }, items ? `${items}  ·  ${money(entry.amount)}` : money(entry.amount)),
    h('div', { class: 'shop-actions' },
      h('button', {
        class: 'btn btn-secondary shop-big-btn',
        type: 'button',
        onClick: () => openWhatsApp(entryMessage(entry, balance, getData().settings.currency)),
      }, icon('send', 22), 'Send on WhatsApp'),
      h('button', { class: 'btn btn-primary shop-big-btn', type: 'button', onClick: leave }, 'Done')),
    h('button', {
      class: 'link-btn shop-undo',
      type: 'button',
      onClick: () => {
        // Back to the number pad with the same values, so a wrong amount is easy to fix.
        if (entry.kind === 'purchase') {
          qty = new Map(entry.items.map((i) => [i.itemId, i.qty]));
          digits = entry.amount % 100 === 0 ? String(entry.amount / 100) : '';
        }
        mode = 'entry';
        deleteEntry(entry.id);
      },
    }, 'Made a mistake? Undo'));
}

function todayPanel(todays: PurchaseEntry[], repaint: () => void): HTMLElement {
  return h('div', { class: 'shop-result' },
    h('div', { class: 'big-check', 'aria-hidden': 'true' }, icon('check', 52)),
    h('h2', { class: 'shop-result-title' }, 'Today is saved'),
    h('ul', { class: 'shop-today-list' },
      todays.map((e) => h('li', null, h('span', null, itemsSummary(e.items) || 'Purchase'), h('strong', null, money(e.amount))))),
    h('div', { class: 'shop-actions' },
      h('button', {
        class: 'btn btn-secondary shop-big-btn',
        type: 'button',
        onClick: () => {
          mode = 'entry';
          repaint();
        },
      }, icon('plus', 22), 'Add another'),
      h('button', { class: 'btn btn-primary shop-big-btn', type: 'button', onClick: leave }, 'Done')));
}
