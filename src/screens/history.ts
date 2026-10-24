import { formatMonth } from '../domain/dates.ts';
import { groupByMonth, runningBalance } from '../domain/ledger.ts';
import type { AppData, EntryKind } from '../domain/types.ts';
import { h } from '../ui/dom.ts';
import { icon } from '../ui/icons.ts';
import { openEntrySheet } from './entrySheet.ts';
import { emptyState, entryRow, money, screenHeader, segmented } from './shared.ts';

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
                  g.added > 0 && h('span', { class: 'is-positive' }, `Given ${money(g.added)}`))),
              h('ul', { class: 'entry-list' }, g.rows.map((r) => entryRow(r, () => openEntrySheet({ entry: r.entry }))))))
        : [h('section', { class: 'card' },
            data.entries.length
              ? emptyState('Nothing here', filter === 'topup' ? 'No money given yet.' : 'Nothing bought yet.')
              : emptyState('No history yet', 'What you buy and the money you give will show here, newest first.',
                  h('button', { class: 'btn btn-primary', type: 'button', onClick: () => openEntrySheet({ kind: 'purchase' }) }, icon('plus'), 'Add what I bought')))]),
    );
  };
  renderList();

  return h(
    'div',
    { class: 'screen' },
    screenHeader('History', `${data.entries.length} saved`),
    h('div', { class: 'filter-row' },
      segmented<Filter>('Show', [
        { id: 'all', label: 'All' },
        { id: 'purchase', label: 'Bought' },
        { id: 'topup', label: 'Money given' },
      ], filter, (v) => {
        filter = v;
        renderList();
      })),
    list,
  );
}
