import assert from 'node:assert/strict';
import { test } from 'node:test';
import { formatDayMonth } from '../src/domain/dates.ts';
import { entryMessage, normalizePhone, statementMessage, whatsAppLink } from '../src/domain/share.ts';
import type { Entry } from '../src/domain/types.ts';

let t = 0;
const topup = (date: string, amount: number): Entry => ({ kind: 'topup', id: `t${++t}`, date, amount, note: '', createdAt: t, updatedAt: t });
const buy = (date: string, amount: number, note = ''): Entry => ({
  kind: 'purchase',
  id: `p${++t}`,
  date,
  amount,
  note,
  createdAt: t,
  updatedAt: t,
  items: [
    { itemId: 'eggs', name: 'Eggs', emoji: '🥚', qty: 3 },
    { itemId: 'bananas', name: 'Bananas', emoji: '🍌', qty: 3 },
    { itemId: 'milk', name: 'Milk', emoji: '🥛', qty: 0 },
  ],
});

test('phone numbers become wa.me digits', () => {
  assert.equal(normalizePhone('98765 43210', 'INR'), '919876543210');
  assert.equal(normalizePhone('+91 98765-43210', 'INR'), '919876543210');
  assert.equal(normalizePhone('09876543210', 'INR'), '919876543210');
  assert.equal(normalizePhone('', 'INR'), '');
  assert.equal(normalizePhone('12345', 'INR'), null);
  assert.equal(normalizePhone('9876543210', 'USD'), null); // no country code guessed outside INR
  assert.equal(normalizePhone('+1 415 555 0100', 'USD'), '14155550100');
});

test('whatsApp link encodes the message', () => {
  assert.equal(whatsAppLink('Hi ₹42\nok', '919876543210'), 'https://wa.me/919876543210?text=Hi%20%E2%82%B942%0Aok');
  assert.equal(whatsAppLink('x', ''), 'https://wa.me/?text=x');
});

test('purchase message lists items (skipping zero), amount and money left', () => {
  const msg = entryMessage(buy('2026-10-22', 4_200, 'paid extra'), 45_800, 'INR');
  assert.equal(
    msg,
    [`🛒 ${formatDayMonth('2026-10-22')}`, 'Took: 🥚 Eggs × 3, 🍌 Bananas × 3', 'Amount: ₹42', 'Note: paid extra', 'Money left with you: ₹458'].join('\n'),
  );
});

test('top-up, owed balance and correction messages', () => {
  assert.match(entryMessage(topup('2026-10-20', 50_000), 50_000, 'INR'), /^💰 Money given – .+\nAmount: ₹500\nMoney left with you: ₹500$/);
  assert.match(entryMessage(buy('2026-10-22', 4_000), -4_000, 'INR'), /I owe you: ₹40$/);
  assert.match(entryMessage(buy('2026-10-22', 4_000), 0, 'INR', { corrected: true }), /^✏️ Correction\n🛒/);
});

test('statement starts at the last top-up and its totals add up', () => {
  const entries = [topup('2026-10-01', 10_000), buy('2026-10-02', 4_000), topup('2026-10-03', 50_000), buy('2026-10-03', 4_200), buy('2026-10-04', 3_800)];
  const msg = statementMessage(entries, 'INR', '2026-10-04', 'Murugan Stores');
  const lines = msg.split('\n');
  assert.equal(lines[0], `🧾 Account – Murugan Stores (till ${formatDayMonth('2026-10-04')})`);
  assert.ok(!msg.includes(formatDayMonth('2026-10-02')), 'entries before the last top-up are summed into "Earlier balance"');
  assert.ok(lines.includes(`${formatDayMonth('2026-10-03')} – Money given +₹500`));
  assert.ok(lines.includes(`${formatDayMonth('2026-10-04')} – 🥚3 🍌3 ₹38`));
  // 60 + 500 − 80 = 480
  assert.deepEqual(lines.slice(-4), ['Earlier balance: ₹60', 'Money given: ₹500', 'Taken: ₹80', 'Money left with you: ₹480']);
});

test('statement with no top-up yet, and with no entries', () => {
  const msg = statementMessage([buy('2026-10-02', 4_000)], 'INR', '2026-10-02');
  assert.deepEqual(msg.split('\n').slice(-2), ['Taken: ₹40', 'I owe you: ₹40']);
  assert.match(statementMessage([], 'INR', '2026-10-02'), /No entries yet\.$/);
});

test('long statements keep only the latest lines', () => {
  const entries = [topup('2026-08-01', 1_000_000)];
  for (let d = 1; d <= 60; d++) entries.push(buy(`2026-09-${String(((d - 1) % 30) + 1).padStart(2, '0')}`, 100));
  const lines = statementMessage(entries, 'INR', '2026-09-30', '', 10).split('\n');
  assert.equal(lines[2], '…');
  assert.equal(lines.filter((l) => l.includes('🥚3')).length, 10);
});
