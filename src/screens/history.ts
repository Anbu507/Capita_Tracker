import { formatMonth, today } from '../domain/dates.ts';
import { groupByMonth, runningBalance } from '../domain/ledger.ts';
import { statementMessage } from '../domain/share.ts';
import type { AppData, EntryKind } from '../domain/types.ts';
import { h } from '../ui/dom.ts';
import { icon } from '../ui/icons.ts';
import { openEntrySheet } from './entrySheet.ts';
import { emptyState, entryRow, money, openWhatsApp, screenHeader, segmented } from './shared.ts';

type Filter = 'all' | EntryKind;
let filter: Filter = 'all';

export function historyScreen(data: AppData): HTMLElement {
  const groups = groupByMonth(runningBalance(data.entries));
  const list = h('div', { class: 'history-list' });

  const renderList = () => {
    const visible = groups
      .map((g) => ({ ...g, rows: g.rows.filter((r) => filter === 'all' || r.entry.kind === filter) }))
      .filter((g) => g.rows.length);
    list.replaceChildren(
      ...(visible.length
        ? visible.map((g) =>
            h('section', { class: 'card month', 'aria-label': formatMonth(g.key) },
              h('header', { class: 'month-header' },
                h('h2', null, formatMonth(g.key)),
                h('p', null,
                  h('span', null, `Spent ${money(g.spent)}`),
                  g.added > 0 && h('span', { class: 'is-positive' }, `Added ${money(g.added)}`))),
              h('ul', { class: 'entry-list' }, g.rows.map((r) => entryRow(r, () => openEntrySheet({ entry: r.entry }))))))
        : [h('section', { class: 'card' },
            data.entries.length
              ? emptyState('Nothing here', filter === 'topup' ? 'No money added yet.' : 'No purchases logged yet.')
              : emptyState('No history yet', 'Your purchases and the money you add will show up here, newest first.',
                  h('button', { class: 'btn btn-primary', type: 'button', onClick: () => openEntrySheet({ kind: 'purchase' }) }, icon('plus'), 'Log a purchase')))]),
    );
  };
  renderList();

  return h(
    'div',
    { class: 'screen' },
    screenHeader(
      'History',
      `${data.entries.length} ${data.entries.length === 1 ? 'entry' : 'entries'}`,
      data.entries.length > 0 &&
        h('button', {
          class: 'btn btn-secondary btn-sm',
          type: 'button',
          title: 'Everything since you last gave money, as one WhatsApp message',
          onClick: () => openWhatsApp(statementMessage(data.entries, data.settings.currency, today(), data.settings.shopName)),
        }, icon('send', 18), 'Send statement'),
    ),
    h('div', { class: 'filter-row' },
      segmented<Filter>('Show', [
        { id: 'all', label: 'All' },
        { id: 'purchase', label: 'Purchases' },
        { id: 'topup', label: 'Money added' },
      ], filter, (v) => {
        filter = v;
        renderList();
      })),
    list,
  );
}
