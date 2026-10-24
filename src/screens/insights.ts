import { daysBetween, formatDayMonth, formatRowDate, formatShortMonth, today } from '../domain/dates.ts';
import {
  balanceSeries,
  bucketFor,
  RANGES,
  rangeStart,
  rangeTotals,
  recentDayStats,
  spendBuckets,
  type Range,
  type SpendBucket,
} from '../domain/ledger.ts';
import type { AppData } from '../domain/types.ts';
import { barChart } from '../ui/charts/barChart.ts';
import { chartCard, dataTable } from '../ui/charts/chartFrame.ts';
import { lineChart } from '../ui/charts/lineChart.ts';
import { h } from '../ui/dom.ts';
import { disposeAll } from '../ui/lifecycle.ts';
import { approxMoney, compactMoney, emptyState, itemsSummary, money, screenHeader, segmented, statTile } from './shared.ts';

let range: Range = '30d';

function bucketLabel(b: SpendBucket, kind: 'day' | 'week' | 'month'): { label: string; tick: string } {
  if (kind === 'day') return { label: formatRowDate(b.start), tick: formatDayMonth(b.start) };
  if (kind === 'week') return { label: `${formatDayMonth(b.start)} – ${formatDayMonth(b.end)}`, tick: formatDayMonth(b.start) };
  return { label: formatShortMonth(b.key), tick: formatShortMonth(b.key) };
}

export function insightsScreen(data: AppData): HTMLElement {
  const content = h('div', { class: 'insights-content' });
  const note = h('p', { class: 'filter-note' });
  const screen = h(
    'div',
    { class: 'screen' },
    screenHeader('Charts', 'Where your money went'),
  );

  if (!data.entries.length) {
    screen.append(h('section', { class: 'card' }, emptyState('Nothing to show yet', 'Charts show up after you add the money you gave and a few days of buying.')));
    return screen;
  }

  const render = () => {
    disposeAll();
    const end = today();
    const start = rangeStart(range, data.entries, end);
    const days = daysBetween(start, end) + 1;
    const totals = rangeTotals(data.entries, start, end);
    const stats = recentDayStats(data.entries.filter((e) => e.date >= start), end, Number.MAX_SAFE_INTEGER);
    const series = balanceSeries(data.entries, start, end);
    const bucket = bucketFor(days);
    const buckets = spendBuckets(data.entries, start, end, bucket);
    const per = bucket === 'day' ? 'day' : bucket === 'week' ? 'week' : 'month';
    // Average over buckets that had a purchase, so "each day" matches the "Daily cost" tile.
    const shopBuckets = buckets.filter((b) => b.spent > 0);
    const avgPerBucket = shopBuckets.length ? Math.round(totals.spent / shopBuckets.length) : 0;
    note.textContent = start === end ? formatRowDate(end) : `${formatDayMonth(start)} – ${formatDayMonth(end)}`;

    const kpis = h(
      'section',
      { class: 'stats-grid stats-grid-wide', 'aria-label': 'Totals for the selected period' },
      statTile('Spent', money(totals.spent), `on ${totals.purchaseDays} of ${days} days`),
      statTile('Money given', money(totals.added), totals.added ? undefined : 'none in these days'),
      statTile('Daily cost', stats ? approxMoney(stats.average) : '—', stats && stats.min !== stats.max ? `${money(stats.min)} to ${money(stats.max)}` : undefined),
      ...totals.items.map((i) => statTile(`${i.emoji} ${i.name}`, String(i.qty), 'bought')),
    );

    const balanceCard = chartCard({
      title: 'Money left, day by day',
      subtitle: 'Money left at the shop at the end of each day',
      height: 220,
      draw: (width, animate) =>
        lineChart({
          points: series.map((p) => ({ label: formatRowDate(p.date), tick: formatDayMonth(p.date), value: p.balance })),
          width,
          height: 220,
          animate,
          ariaLabel: `Line chart of money left from ${formatDayMonth(start)} to ${formatDayMonth(end)}`,
          formatValue: money,
          formatTick: compactMoney,
        }),
      table: () => dataTable(['Day', 'Money left'], [...series].reverse().map((p) => [formatRowDate(p.date), money(p.balance)])),
    });

    const spendCard = chartCard({
      title: `Money spent each ${per}`,
      subtitle: avgPerBucket ? `The line is a normal ${per} (${approxMoney(avgPerBucket)})` : undefined,
      height: 220,
      draw: (width, animate) =>
        barChart({
          bars: buckets.map((b) => ({
            ...bucketLabel(b, bucket),
            value: b.spent,
            detail: b.purchases ? itemsSummary(b.items) : 'Nothing bought',
          })),
          width,
          height: 220,
          animate,
          ariaLabel: `Column chart of money spent each ${per}`,
          formatValue: money,
          formatTick: compactMoney,
          average: avgPerBucket,
        }),
      table: () =>
        dataTable(
          [per[0].toUpperCase() + per.slice(1), 'Spent', 'Items'],
          [...buckets].reverse().map((b) => [bucketLabel(b, bucket).label, money(b.spent), itemsSummary(b.items) || '—']),
        ),
    });

    content.replaceChildren(kpis, h('div', { class: 'chart-grid' }, balanceCard, spendCard));
  };

  screen.append(
    h('div', { class: 'filter-row' },
      segmented<Range>('Period', RANGES.map((r) => ({ id: r.id, label: r.label })), range, (v) => {
        range = v;
        render();
      }),
      note,
    ),
    content,
  );
  render();
  return screen;
}
