import { addDays, formatDayMonth, formatLongDate, formatRowDate, today } from '../domain/dates.ts';
import {
  balanceOf,
  balanceSeries,
  balanceStatus,
  currentCycle,
  daysLeft,
  rangeTotals,
  recentDayStats,
  runningBalance,
  spendBuckets,
} from '../domain/ledger.ts';
import type { AppData } from '../domain/types.ts';
import { exportBackup } from '../data/backup.ts';
import { loadSample } from '../data/store.ts';
import { barChart } from '../ui/charts/barChart.ts';
import { chartCard, dataTable, mountResponsive } from '../ui/charts/chartFrame.ts';
import { sparkline } from '../ui/charts/sparkline.ts';
import { h } from '../ui/dom.ts';
import { icon } from '../ui/icons.ts';
import { go } from '../ui/router.ts';
import { openEntrySheet } from './entrySheet.ts';
import { approxMoney, compactMoney, emptyState, entryRow, itemsSummary, money, notice, screenHeader, statTile } from './shared.ts';

const BACKUP_EVERY_MS = 30 * 86_400_000;

export function homeScreen(data: AppData): HTMLElement {
  const now = today();
  const { entries, settings } = data;
  const header = screenHeader('Home', formatLongDate(now));

  if (!entries.length) {
    return h(
      'div',
      { class: 'screen' },
      header,
      h('section', { class: 'card' },
        emptyState(
          'Start with the money you gave the shop',
          'First add the money you gave the shop. Then each day, add what you bought. The app shows how much money is left.',
          h('button', { class: 'btn btn-primary', type: 'button', onClick: () => openEntrySheet({ kind: 'topup' }) }, icon('wallet'), 'Add money I gave'),
          h('button', { class: 'btn btn-secondary', type: 'button', onClick: () => openEntrySheet({ kind: 'purchase' }) }, icon('plus'), 'Add what I bought'),
        ),
        !settings.shareId && h('p', { class: 'empty-foot' },
          'Just trying the app? ',
          h('button', { class: 'link-btn', type: 'button', onClick: () => loadSample() }, 'Show an example'),
          ' (you can delete it later in Settings).'),
      ),
    );
  }

  const balance = balanceOf(entries);
  const status = balanceStatus(balance, settings.lowBalance, true);
  const stats = recentDayStats(entries, now);
  const left = daysLeft(balance, stats?.average);
  const cycle = currentCycle(entries);
  const rows = runningBalance(entries);
  const todaysPurchases = entries.filter((e) => e.kind === 'purchase' && e.date === now);
  const week = rangeTotals(entries, addDays(now, -6), now);

  // ----- Hero: the one number that matters -----
  const statusLine =
    status === 'owed'
      ? notice('critical', 'alert', h('strong', null, `You owe the shop ${money(-balance)}`), ' Give the shop money to clear it.')
      : status === 'low'
        ? notice('warning', 'alert', h('strong', null, 'Money is running low'), left !== null ? ` — about ${left} ${left === 1 ? 'day' : 'days'} left. Give the shop money soon.` : ' — give the shop money soon.')
        : left !== null
          ? h('p', { class: 'hero-status' }, `Enough for about ${left} more ${left === 1 ? 'day' : 'days'} (about ${approxMoney(stats!.average)} a day)`)
          : null;

  const spark = h('div', { class: 'hero-spark', 'aria-hidden': 'true' });
  const sparkValues = balanceSeries(entries, addDays(now, -29), now).map((p) => p.balance);
  // Too narrow to read a trend on the smallest phones: leave the space empty.
  mountResponsive(spark, (w, animate) => (w < 56 ? h('span') : sparkline(sparkValues, w, 56, animate)));

  const meterFill = cycle && balance >= 0 ? cycle.fraction : 0;
  const meter = cycle && balance >= 0
    ? h('div', { class: 'meter-block' },
        h('div', {
          class: `meter meter-${status}`,
          role: 'meter',
          'aria-label': 'Money left from the last money given',
          'aria-valuemin': 0,
          'aria-valuemax': cycle.start / 100,
          'aria-valuenow': Math.max(0, cycle.remaining) / 100,
          'aria-valuetext': `${money(cycle.remaining)} of ${money(cycle.start)}`,
        }, h('div', { class: 'meter-fill', style: `--fill:${meterFill}` })),
        h('p', { class: 'meter-caption' },
          h('span', null, `${money(cycle.remaining)} left of ${money(cycle.start)}`),
          h('span', null, `given on ${formatDayMonth(cycle.since)}`)))
    : null;

  const todayLine = todaysPurchases.length
    ? h('p', { class: 'today-line is-done' }, icon('check', 18), `Bought today · ${money(todaysPurchases.reduce((s, e) => s + e.amount, 0))}`)
    : h('p', { class: 'today-line' }, 'Nothing added today');

  const hero = h(
    'section',
    { class: 'card hero', 'aria-label': 'Money left' },
    h('div', null,
      h('p', { class: 'hero-label' }, `Money left at ${settings.shopName || 'the shop'}`),
      h('div', { class: 'hero-top' },
        h('p', { class: `hero-value${balance < 0 ? ' is-negative' : ''}` }, balance < 0 ? `−${money(-balance)}` : money(balance)),
        spark)),
    meter,
    statusLine,
    h('div', { class: 'hero-actions' },
      h('button', { class: 'btn btn-primary', type: 'button', onClick: () => openEntrySheet({ kind: 'purchase' }) }, icon('plus'), 'Add what I bought'),
      h('button', { class: 'btn btn-secondary', type: 'button', onClick: () => openEntrySheet({ kind: 'topup' }) }, icon('wallet'), 'Add money I gave')),
    todayLine,
  );

  // ----- KPI tiles -----
  const kpis = h(
    'section',
    { class: 'stats-grid', 'aria-label': 'Quick numbers' },
    statTile('Last 7 days', money(week.spent), `spent on ${week.purchaseDays} ${week.purchaseDays === 1 ? 'day' : 'days'}`),
    statTile('Daily cost', stats ? approxMoney(stats.average) : '—', stats ? (stats.min === stats.max ? `last ${stats.days === 1 ? 'day' : `${stats.days} days`}` : `${money(stats.min)} to ${money(stats.max)}`) : 'nothing bought yet'),
    statTile('Days left', left !== null ? String(left) : '—', left !== null ? `at ${approxMoney(stats!.average)} a day` : balance <= 0 ? 'give money to go on' : 'add what you bought first'),
  );

  // ----- Spend, last 14 days -----
  const buckets = spendBuckets(entries, addDays(now, -13), now, 'day');
  const spendCard = chartCard({
    title: 'Money spent, last 14 days',
    subtitle: stats ? `The line is the daily cost (${approxMoney(stats.average)})` : undefined,
    height: 180,
    className: 'home-spend',
    draw: (width, animate) =>
      barChart({
        bars: buckets.map((b) => ({
          label: formatRowDate(b.start),
          tick: formatDayMonth(b.start),
          value: b.spent,
          detail: b.purchases ? itemsSummary(b.items) : 'Nothing bought',
        })),
        width,
        height: 180,
        animate,
        ariaLabel: 'Column chart of daily spend for the last 14 days',
        formatValue: money,
        formatTick: compactMoney,
        average: stats?.average,
      }),
    table: () => dataTable(['Day', 'Spent', 'Items'], buckets.map((b) => [formatRowDate(b.start), money(b.spent), itemsSummary(b.items) || '—'])),
  });

  // ----- Recent entries -----
  const recentRows = rows.slice(-5).reverse();
  const recent = h(
    'section',
    { class: 'card recent' },
    h('header', { class: 'card-header' },
      h('h3', { class: 'card-title' }, 'Latest'),
      h('button', { class: 'link-btn', type: 'button', onClick: () => go('history') }, 'See all', icon('arrowRight', 16))),
    h('ul', { class: 'entry-list' }, recentRows.map((r) => entryRow(r, () => openEntrySheet({ entry: r.entry })))),
  );

  const needsBackup = entries.length >= 20 && (!settings.lastBackupAt || Date.now() - settings.lastBackupAt > BACKUP_EVERY_MS);
  const nudge = needsBackup
    ? notice('info', 'download',
        'Your list is kept only on this phone. ',
        h('button', { class: 'link-btn', type: 'button', onClick: exportBackup }, 'Save a copy'),
        ' so you never lose it.')
    : null;

  return h(
    'div',
    { class: 'screen' },
    header,
    h('div', { class: 'home-grid' }, hero, kpis, spendCard, recent, nudge && h('div', { class: 'home-nudge' }, nudge)),
  );
}
