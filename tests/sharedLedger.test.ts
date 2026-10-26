import assert from 'node:assert/strict';
import { test } from 'node:test';
import { defaultSettings } from '../src/domain/defaults.ts';
import { balanceOf, runningBalance } from '../src/domain/ledger.ts';
import { randomToken, readShared, SHARE_ID, SHARE_KEY, sharedSignature, sharedToEntries, toShared } from '../src/domain/sharedLedger.ts';
import type { AppData, Entry } from '../src/domain/types.ts';

const entries: Entry[] = [
  { kind: 'purchase', id: 'b', date: '2026-10-14', amount: 4_200, note: 'secret note', createdAt: 3, updatedAt: 3,
    items: [{ itemId: 'eggs', name: 'Eggs', emoji: '🥚', qty: 3 }, { itemId: 'milk', name: 'Milk', emoji: '🥛', qty: 0 }] },
  { kind: 'topup', id: 'a', date: '2026-10-13', amount: 50_000, note: 'cash', createdAt: 1, updatedAt: 1 },
  { kind: 'purchase', id: 'c', date: '2026-10-14', amount: 3_800, note: '', createdAt: 2, updatedAt: 2, items: [] },
];
const data: AppData = {
  version: 1,
  items: [],
  entries,
  settings: { ...defaultSettings(), shopName: 'Murugan Stores', shareName: 'Anbu', shareId: 'x'.repeat(22), shareKey: 'y'.repeat(43) },
};

test('shared copy is oldest first, has no notes, ids or secret key, and skips zero items', () => {
  const shared = toShared(data, 99);
  assert.deepEqual(shared, {
    v: 1, name: 'Anbu', shopName: 'Murugan Stores', currency: 'INR', updatedAt: 99,
    entries: [
      { kind: 'topup', date: '2026-10-13', amount: 50_000, t: 1 },
      { kind: 'purchase', date: '2026-10-14', amount: 3_800, t: 2, items: [] },
      { kind: 'purchase', date: '2026-10-14', amount: 4_200, t: 3, items: [{ emoji: '🥚', name: 'Eggs', qty: 3 }] },
    ],
  });
  const text = JSON.stringify(shared);
  for (const secret of ['secret note', 'cash', 'y'.repeat(43), 'x'.repeat(22)]) assert.ok(!text.includes(secret), secret);
});

test('the shop sees the same balance and running totals as me', () => {
  const back = sharedToEntries(readShared(JSON.parse(JSON.stringify(toShared(data))))!);
  assert.equal(balanceOf(back), balanceOf(entries));
  assert.deepEqual(runningBalance(back).map((r) => r.balanceAfter), runningBalance(entries).map((r) => r.balanceAfter));
});

test('signature ignores the time stamp but notices real changes', () => {
  assert.equal(sharedSignature(data), sharedSignature({ ...data }));
  assert.notEqual(sharedSignature(data), sharedSignature({ ...data, entries: entries.slice(1) }));
  // A note change is not shared, so it does not need a new upload.
  assert.equal(sharedSignature(data), sharedSignature({ ...data, entries: entries.map((e) => ({ ...e, note: 'changed' })) }));
});

test('readShared cleans bad input and rejects foreign data', () => {
  assert.equal(readShared(null), null);
  assert.equal(readShared({ v: 2, entries: [] }), null);
  const cleaned = readShared({
    v: 1, name: 'A'.repeat(100), currency: 'XYZ', entries: [
      { kind: 'purchase', date: '2026-10-14', amount: 100, t: 1, items: [{ emoji: '🥚', name: 'Eggs', qty: -1 }, { name: 'Bread', qty: 2 }] },
      { kind: 'topup', date: 'nope', amount: 100 },
      { kind: 'other', date: '2026-10-14', amount: 100 },
      { kind: 'topup', date: '2026-10-14', amount: -5 },
    ],
  })!;
  assert.equal(cleaned.name.length, 40);
  assert.equal(cleaned.currency, 'INR');
  assert.equal(cleaned.entries.length, 1);
  assert.deepEqual(cleaned.entries[0].items, [{ emoji: '🛒', name: 'Bread', qty: 2 }]);
});

test('random ids and keys are URL-safe and long enough', () => {
  const id = randomToken(16);
  const key = randomToken(32);
  assert.match(id, SHARE_ID);
  assert.match(key, SHARE_KEY);
  assert.equal(id.length, 22);
  assert.notEqual(randomToken(16), id);
});
