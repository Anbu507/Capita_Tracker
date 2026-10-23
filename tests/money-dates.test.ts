import assert from 'node:assert/strict';
import { test } from 'node:test';
import { addDays, daysBetween, eachDay, isISODate, startOfWeek, toISODate } from '../src/domain/dates.ts';
import { formatMoney, formatSigned, parseAmount, toInputValue } from '../src/domain/money.ts';
import { parseData } from '../src/data/storage.ts';

test('parseAmount accepts what people type', () => {
  assert.equal(parseAmount('42'), 4_200);
  assert.equal(parseAmount('42.5'), 4_250);
  assert.equal(parseAmount('42.50'), 4_250);
  assert.equal(parseAmount('₹ 42'), 4_200);
  assert.equal(parseAmount('42,5'), 4_250);
  assert.equal(parseAmount('1,200'), 120_000);
  assert.equal(parseAmount(' 0.1 '), 10);
  assert.equal(parseAmount('Rs. 40'), 4_000);
});

test('parseAmount rejects nonsense', () => {
  for (const bad of ['', '0', '-5', '−5', '4a2', 'abc', '.', '42.555', '1.2.3', '999999999']) assert.equal(parseAmount(bad), null, bad);
});

test('money formatting', () => {
  assert.equal(formatMoney(4_200, 'INR'), '₹42');
  assert.equal(formatMoney(4_250, 'INR'), '₹42.50');
  assert.equal(formatMoney(12_345_600, 'INR'), '₹1,23,456');
  assert.equal(formatSigned(-4_200, 'INR'), '−₹42');
  assert.equal(formatSigned(50_000, 'INR'), '+₹500');
  assert.equal(toInputValue(4_250), '42.50');
  assert.equal(toInputValue(4_200), '42');
});

test('dates', () => {
  assert.equal(addDays('2026-10-31', 1), '2026-11-01');
  assert.equal(addDays('2026-03-01', -1), '2026-02-28');
  assert.equal(daysBetween('2026-10-01', '2026-10-22'), 21);
  assert.equal(startOfWeek('2026-10-22'), '2026-10-19'); // Thursday → Monday
  assert.equal(startOfWeek('2026-10-19'), '2026-10-19');
  assert.equal(startOfWeek('2026-10-25'), '2026-10-19'); // Sunday belongs to the week before
  assert.deepEqual(eachDay('2026-10-30', '2026-11-02'), ['2026-10-30', '2026-10-31', '2026-11-01', '2026-11-02']);
  assert.equal(isISODate('2026-02-30'), false);
  assert.equal(isISODate('2026-02-28'), true);
  assert.equal(toISODate(new Date(2026, 0, 5)), '2026-01-05');
});

test('parseData cleans backups and rejects foreign files', () => {
  assert.equal(parseData({ hello: 1 }), null);
  assert.equal(parseData({ version: 99, entries: [] }), null);
  const data = parseData({
    version: 1,
    entries: [
      { kind: 'purchase', id: 'a', date: '2026-10-01', amount: 4200, items: [{ itemId: 'eggs', name: 'Eggs', emoji: '🥚', qty: 3 }], createdAt: 1 },
      { kind: 'purchase', id: 'a', date: '2026-10-01', amount: 4200, items: [], createdAt: 1 }, // duplicate id
      { kind: 'topup', id: 'b', date: 'not-a-date', amount: 100 },
      { kind: 'topup', id: 'c', date: '2026-10-01', amount: -5 },
      { kind: 'mystery', id: 'd', date: '2026-10-01', amount: 5 },
    ],
    settings: { currency: 'XYZ', theme: 'dark', lowBalance: 5000 },
  })!;
  assert.equal(data.entries.length, 1);
  assert.equal(data.items.length, 2); // defaults restored
  assert.equal(data.settings.currency, 'INR');
  assert.equal(data.settings.theme, 'dark');
  assert.equal(data.settings.lowBalance, 5000);
});
