// Small building blocks shared by several screens.
import { formatRelativeDay } from '../domain/dates.ts';
import type { LedgerRow } from '../domain/ledger.ts';
import { formatCompact, formatMoney, formatSigned } from '../domain/money.ts';
import type { EntryItem, Paise } from '../domain/types.ts';
import { getData } from '../data/store.ts';
import { h, type Child } from '../ui/dom.ts';
import { icon, type IconName } from '../ui/icons.ts';

/** Money in the user's currency. */
export const money = (p: Paise) => formatMoney(p, getData().settings.currency);
export const signedMoney = (p: Paise) => formatSigned(p, getData().settings.currency);
export const compactMoney = (p: Paise) => formatCompact(p, getData().settings.currency);
/** Averages rounded to whole rupees — "₹37", not "₹37.29". */
export const approxMoney = (p: Paise) => money(Math.round(p / 100) * 100);

/** "🥚 3 · 🍌 3" */
export function itemsSummary(items: EntryItem[]): string {
  return items.filter((i) => i.qty > 0).map((i) => `${i.emoji} ${i.qty}`).join(' · ');
}

export function screenHeader(title: string, eyebrow?: string, aside?: Child): HTMLElement {
  return h(
    'header',
    { class: 'screen-header' },
    h('div', null, eyebrow && h('p', { class: 'eyebrow' }, eyebrow), h('h1', null, title)),
    aside,
  );
}

export function statTile(label: string, value: string, sub?: string, extra?: Child): HTMLElement {
  return h(
    'div',
    { class: 'stat' },
    h('p', { class: 'stat-label' }, label),
    h('p', { class: 'stat-value' }, value),
    sub && h('p', { class: 'stat-sub' }, sub),
    extra,
  );
}

export function segmented<T extends string>(
  label: string,
  options: { id: T; label: string }[],
  value: T,
  onChange: (v: T) => void,
): HTMLElement {
  const group = h('div', { class: 'segmented', role: 'radiogroup', 'aria-label': label });
  const buttons = options.map((o) =>
    h('button', {
      type: 'button',
      role: 'radio',
      'aria-checked': String(o.id === value),
      tabindex: o.id === value ? '0' : '-1',
      onClick: () => select(o.id, false),
    }, o.label),
  );
  const select = (id: T, focus: boolean) => {
    buttons.forEach((b, i) => {
      const on = options[i].id === id;
      b.setAttribute('aria-checked', String(on));
      b.tabIndex = on ? 0 : -1;
      if (on && focus) b.focus();
    });
    onChange(id);
  };
  group.addEventListener('keydown', (e) => {
    const dir = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
    if (!dir) return;
    e.preventDefault();
    const i = buttons.findIndex((b) => b.getAttribute('aria-checked') === 'true');
    select(options[(i + dir + options.length) % options.length].id, true);
  });
  group.append(...buttons);
  return group;
}

export function notice(kind: 'info' | 'warning' | 'critical' | 'good', iconName: IconName, ...children: Child[]): HTMLElement {
  return h('div', { class: `notice notice-${kind}`, role: kind === 'critical' ? 'alert' : null }, icon(iconName, 18), h('div', null, children));
}

/** One ledger line: date, what, amount, balance after. Tapping it opens the edit sheet. */
export function entryRow(row: LedgerRow, onOpen: () => void): HTMLElement {
  const e = row.entry;
  const isTopUp = e.kind === 'topup';
  const what = isTopUp ? 'Added money' : itemsSummary(e.items) || 'Purchase';
  return h(
    'li',
    null,
    h(
      'button',
      { class: 'entry-row', type: 'button', onClick: onOpen, 'aria-label': `${formatRelativeDay(e.date)}, ${isTopUp ? 'added' : 'spent'} ${money(e.amount)}. Edit` },
      h('span', { class: `entry-badge ${isTopUp ? 'is-topup' : ''}`, 'aria-hidden': 'true' }, icon(isTopUp ? 'wallet' : 'bag', 18)),
      h(
        'span',
        { class: 'entry-main' },
        h('span', { class: 'entry-title' }, what),
        h('span', { class: 'entry-meta' }, formatRelativeDay(e.date), e.note && ` · ${e.note}`),
      ),
      h(
        'span',
        { class: 'entry-amounts' },
        h('span', { class: `entry-amount ${isTopUp ? 'is-positive' : ''}` }, signedMoney(isTopUp ? e.amount : -e.amount)),
        h('span', { class: 'entry-balance' }, `${money(row.balanceAfter)} left`),
      ),
    ),
  );
}

export function emptyState(title: string, text: string, ...actions: Child[]): HTMLElement {
  return h(
    'div',
    { class: 'empty' },
    h('div', { class: 'empty-art', 'aria-hidden': 'true' }, '🥚🍌'),
    h('h2', null, title),
    h('p', null, text),
    actions.length > 0 && h('div', { class: 'btn-row' }, actions),
  );
}
