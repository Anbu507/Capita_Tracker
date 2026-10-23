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
          'Add the fixed amount you paid in advance. Then log what you take each day, and the app keeps the balance for you.',
          h('button', { class: 'btn btn-primary', type: 'button', onClick: () => openEntrySheet({ kind: 'topup' }) }, icon('wallet'), 'Add money'),
          h('button', { class: 'btn btn-secondary', type: 'button', onClick: () => openEntrySheet({ kind: 'purchase' }) }, icon('plus'), 'Log a purchase'),
        ),
        h('p', { class: 'empty-foot' },
          'Just looking around? ',
          h('button', { class: 'link-btn', type: 'button', onClick: () => loadSample() }, 'Load sample data'),
          ' — you can erase it later in Settings.'),
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
      ? notice('critical', 'alert', h('strong', null, `You owe the shop ${money(-balance)}`), ' — add money to settle it.')
      : status === 'low'
        ? notice('warning', 'alert', h('strong', null, 'Low balance'), left !== null ? ` — about ${left} ${left === 1 ? 'day' : 'days'} left. Top up soon.` : ' — top up soon.')
        : left !== null
          ? h('p', { class: 'hero-status' }, `About ${left} ${left === 1 ? 'day' : 'days'} left at ${approxMoney(stats!.average)} a day`)
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
          'aria-label': 'Left from the last top-up',
          'aria-valuemin': 0,
          'aria-valuemax': cycle.start / 100,
          'aria-valuenow': Math.max(0, cycle.remaining) / 100,
          'aria-valuetext': `${money(cycle.remaining)} of ${money(cycle.start)}`,
        }, h('div', { class: 'meter-fill', style: `--fill:${meterFill}` })),
        h('p', { class: 'meter-caption' },
          h('span', null, `${money(cycle.remaining)} of ${money(cycle.start)} left`),
          h('span', null, `since ${formatDayMonth(cycle.since)}`)))
    : null;

  const todayLine = todaysPurchases.length
    ? h('p', { class: 'today-line is-done' }, icon('check', 18), `Logged today · ${money(todaysPurchases.reduce((s, e) => s + e.amount, 0))}`)
    : h('p', { class: 'today-line' }, 'Nothing logged today yet');

  const hero = h(
    'section',
    { class: 'card hero', 'aria-label': 'Balance' },
    h('div', null,
      h('p', { class: 'hero-label' }, `Balance at ${settings.shopName || 'the shop'}`),
      h('div', { class: 'hero-top' },
        h('p', { class: `hero-value${balance < 0 ? ' is-negative' : ''}` }, balance < 0 ? `−${money(-balance)}` : money(balance)),
        spark)),
    meter,
    statusLine,
    h('div', { class: 'hero-actions' },
      h('button', { class: 'btn btn-primary', type: 'button', onClick: () => openEntrySheet({ kind: 'purchase' }) }, icon('plus'), todaysPurchases.length ? 'Log purchase' : "Log today's purchase"),
      h('button', { class: 'btn btn-secondary', type: 'button', onClick: () => openEntrySheet({ kind: 'topup' }) }, icon('wallet'), 'Add money'),
      h('button', { class: 'btn btn-ghost hero-shop', type: 'button', onClick: () => go('shop') }, icon('store'), 'Shop view — show the shopkeeper')),
    todayLine,
  );

  // ----- KPI tiles -----
  const kpis = h(
    'section',
    { class: 'stats-grid', 'aria-label': 'Quick numbers' },
    statTile('Last 7 days', money(week.spent), `${week.purchaseDays} shop ${week.purchaseDays === 1 ? 'day' : 'days'}`),
    statTile('Usual day', stats ? approxMoney(stats.average) : '—', stats ? (stats.min === stats.max ? `last ${stats.days === 1 ? 'day' : `${stats.days} days`}` :`${money(stats.min)}–${money(stats.max)}`) : 'no purchases yet'),
    statTile('Days left', left !== null ? `≈ ${left}` : '—', left !== null ? 'at your usual day' : balance <= 0 ? 'top up to continue' : 'log a purchase first'),
  );

  // ----- Spend, last 14 days -----
  const buckets = spendBuckets(entries, addDays(now, -13), now, 'day');
  const spendCard = chartCard({
    title: 'Spend, last 14 days',
    subtitle: stats ? `Line shows your usual day (${approxMoney(stats.average)})` : undefined,
    height: 180,
    className: 'home-spend',
    draw: (width, animate) =>
      barChart({
        bars: buckets.map((b) => ({
          label: formatRowDate(b.start),
          tick: formatDayMonth(b.start),
          value: b.spent,
          detail: b.purchases ? itemsSummary(b.items) : 'No purchase',
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
      h('h3', { class: 'card-title' }, 'Recent'),
      h('button', { class: 'link-btn', type: 'button', onClick: () => go('history') }, 'All history', icon('arrowRight', 16))),
    h('ul', { class: 'entry-list' }, recentRows.map((r) => entryRow(r, () => openEntrySheet({ entry: r.entry })))),
  );

  const needsBackup = entries.length >= 20 && (!settings.lastBackupAt || Date.now() - settings.lastBackupAt > BACKUP_EVERY_MS);
  const nudge = needsBackup
    ? notice('info', 'download',
        'Your data is saved only on this device. ',
        h('button', { class: 'link-btn', type: 'button', onClick: exportBackup }, 'Download a backup'),
        ' so you never lose it.')
    : null;

  return h(
    'div',
    { class: 'screen' },
    header,
    h('div', { class: 'home-grid' }, hero, kpis, spendCard, recent, nudge && h('div', { class: 'home-nudge' }, nudge)),
  );
}
