import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  balanceOf,
  balanceSeries,
  balanceStatus,
  bucketFor,
  currentCycle,
  daysLeft,
  groupByMonth,
  lastPurchase,
  rangeStart,
  rangeTotals,
  recentDayStats,
  runningBalance,
  spendBuckets,
} from '../src/domain/ledger.ts';
import type { Entry } from '../src/domain/types.ts';

let t = 0;
const topup = (date: string, amount: number): Entry => ({ kind: 'topup', id: `t${++t}`, date, amount, note: '', createdAt: t, updatedAt: t });
const buy = (date: string, amount: number, eggs = 3, bananas = 3): Entry => ({
  kind: 'purchase',
  id: `p${++t}`,
  date,
  amount,
  note: '',
  createdAt: t,
  updatedAt: t,
  items: [
    { itemId: 'eggs', name: 'Eggs', emoji: '🥚', qty: eggs },
    { itemId: 'bananas', name: 'Bananas', emoji: '🍌', qty: bananas },
  ],
});

const entries = [
  topup('2026-10-01', 50_000),
  buy('2026-10-01', 4_200),
  buy('2026-10-02', 3_900),
  buy('2026-10-04', 4_500),
  buy('2026-10-04', 1_000, 1, 0), // second trip the same day
];

test('balance is top-ups minus purchases', () => {
  assert.equal(balanceOf(entries), 50_000 - 4_200 - 3_900 - 4_500 - 1_000);
  assert.equal(balanceOf([]), 0);
});

test('running balance follows date then creation order, regardless of input order', () => {
  const rows = runningBalance([...entries].reverse());
  assert.deepEqual(rows.map((r) => r.balanceAfter), [50_000, 45_800, 41_900, 37_400, 36_400]);
});

test('day stats merge several purchases on one day and skip days without purchases', () => {
  const stats = recentDayStats(entries, '2026-10-04');
  assert.deepEqual(stats, { average: Math.round((4_200 + 3_900 + 5_500) / 3), min: 3_900, max: 5_500, days: 3 });
  assert.equal(recentDayStats([], '2026-10-04'), null);
  assert.equal(recentDayStats(entries, '2026-10-04', 1)?.average, 5_500);
});

test('days left only when there is money and history', () => {
  assert.equal(daysLeft(36_400, 4_533), 8);
  assert.equal(daysLeft(0, 4_533), null);
  assert.equal(daysLeft(-500, 4_533), null);
  assert.equal(daysLeft(36_400, undefined), null);
});

test('current cycle starts at the balance right after the latest top-up', () => {
  const withSecond = [...entries, buy('2026-10-05', 30_000), topup('2026-10-06', 20_000), buy('2026-10-07', 5_000)];
  const cycle = currentCycle(withSecond)!;
  assert.equal(cycle.start, 6_400 + 20_000);
  assert.equal(cycle.remaining, 26_400 - 5_000);
  assert.equal(cycle.since, '2026-10-06');
  assert.ok(Math.abs(cycle.fraction - 21_400 / 26_400) < 1e-9);
  assert.equal(currentCycle([buy('2026-10-01', 100)]), null);
});

test('balance status', () => {
  assert.equal(balanceStatus(0, 10_000, false), 'empty');
  assert.equal(balanceStatus(-1, 10_000, true), 'owed');
  assert.equal(balanceStatus(10_000, 10_000, true), 'low');
  assert.equal(balanceStatus(10_001, 10_000, true), 'ok');
});

test('balance series carries the balance through days without entries', () => {
  const series = balanceSeries(entries, '2026-09-30', '2026-10-05');
  assert.deepEqual(series.map((p) => p.balance), [0, 45_800, 41_900, 41_900, 36_400, 36_400]);
  // Entries before the range are the opening balance.
  assert.equal(balanceSeries(entries, '2026-10-03', '2026-10-03')[0].balance, 41_900);
});

test('spend buckets include empty days and items', () => {
  const days = spendBuckets(entries, '2026-10-01', '2026-10-04', 'day');
  assert.deepEqual(days.map((b) => b.spent), [4_200, 3_900, 0, 5_500]);
  assert.deepEqual(days[3].items.map((i) => i.qty), [4, 3]);
  assert.equal(days[3].purchases, 2);

  const weeks = spendBuckets(entries, '2026-09-28', '2026-10-11', 'week');
  assert.deepEqual(weeks.map((b) => [b.key, b.spent]), [['2026-09-28', 13_600], ['2026-10-05', 0]]);

  const months = spendBuckets(entries, '2026-09-15', '2026-10-04', 'month');
  assert.deepEqual(months.map((b) => b.key), ['2026-09', '2026-10']);
});

test('bucket size by range length', () => {
  assert.equal(bucketFor(30), 'day');
  assert.equal(bucketFor(90), 'week');
  assert.equal(bucketFor(500), 'month');
});

test('range start', () => {
  assert.equal(rangeStart('7d', entries, '2026-10-22'), '2026-10-16');
  assert.equal(rangeStart('all', entries, '2026-10-22'), '2026-10-01');
  assert.equal(rangeStart('all', [], '2026-10-22'), '2026-10-22');
});

test('range totals', () => {
  const totals = rangeTotals(entries, '2026-10-02', '2026-10-04');
  assert.equal(totals.spent, 9_400);
  assert.equal(totals.added, 0);
  assert.equal(totals.purchaseDays, 2);
  assert.deepEqual(totals.items.map((i) => [i.itemId, i.qty]), [['eggs', 7], ['bananas', 6]]);
});

test('history groups newest month first with month totals', () => {
  const groups = groupByMonth(runningBalance([...entries, buy('2026-11-01', 4_000)]));
  assert.deepEqual(groups.map((g) => g.key), ['2026-11', '2026-10']);
  assert.equal(groups[1].added, 50_000);
  assert.equal(groups[1].spent, 13_600);
  assert.equal(groups[1].rows[0].entry.date, '2026-10-04');
});

test('last purchase', () => {
  assert.equal(lastPurchase(entries)?.amount, 1_000);
  assert.equal(lastPurchase([topup('2026-10-01', 1)]), undefined);
});
