import assert from 'node:assert/strict';
import { test } from 'node:test';
import { handleLedger, ROUTE, type LedgerStore, type Stored } from '../worker/src/ledger.ts';

function memoryStore(): LedgerStore & { value: () => Stored | null } {
  let stored: Stored | null = null;
  return {
    value: () => stored,
    load: async () => stored,
    save: async (s) => void (stored = s),
    remove: async () => void (stored = null),
  };
}

const ID = 'AbCdEfGhIjKlMnOpQrStUv';
const KEY = 'k'.repeat(43);
const url = `https://api.example/api/ledger/${ID}`;
const ledger = { v: 1, name: 'Anbu', shopName: '', currency: 'INR', updatedAt: 1, entries: [] };
const put = (body: unknown, key = KEY) =>
  new Request(url, { method: 'PUT', headers: { authorization: `Bearer ${key}` }, body: JSON.stringify(body) });
const del = (key = KEY) => new Request(url, { method: 'DELETE', headers: { authorization: `Bearer ${key}` } });

test('put then get returns the shared list, never the key; the change is pushed to open pages', async () => {
  const store = memoryStore();
  const saved = await handleLedger(put(ledger), store);
  assert.equal(saved.response.status, 204);
  assert.deepEqual(saved.changed, ledger, 'open shop pages get the new list');
  const got = await handleLedger(new Request(url), store);
  assert.equal(got.response.status, 200);
  assert.deepEqual(await got.response.json(), ledger);
  assert.equal(got.changed, undefined, 'reading changes nothing');
  assert.equal(got.response.headers.get('access-control-allow-origin'), '*');
  assert.ok(!JSON.stringify(store.value()).includes(KEY), 'only the hash of the key is stored');
});

test('only the first key can change or delete a list; deleting tells open pages', async () => {
  const store = memoryStore();
  await handleLedger(put(ledger), store);
  const other = 'x'.repeat(43);
  const wrong = await handleLedger(put({ ...ledger, name: 'Someone' }, other), store);
  assert.equal(wrong.response.status, 403);
  assert.equal(wrong.changed, undefined);
  assert.equal((await handleLedger(del(other), store)).response.status, 403);
  const gone = await handleLedger(del(), store);
  assert.equal(gone.response.status, 204);
  assert.equal(gone.changed, null, 'open pages are told the list is gone');
  assert.equal((await handleLedger(new Request(url), store)).response.status, 404);
  assert.equal((await handleLedger(del(), store)).changed, undefined, 'deleting twice is harmless');
});

test('rejects missing keys, bad bodies and other methods', async () => {
  const store = memoryStore();
  const status = async (req: Request) => (await handleLedger(req, store)).response.status;
  assert.equal(await status(new Request(url, { method: 'PUT', body: '{}' })), 401);
  assert.equal(await status(put({ hello: 1 })), 400);
  assert.equal(await status(new Request(url, { method: 'PUT', headers: { authorization: `Bearer ${KEY}` }, body: 'nope' })), 400);
  assert.equal(await status(put({ ...ledger, entries: ['x'.repeat(300_001)] })), 413);
  assert.equal(await status(new Request(url, { method: 'POST' })), 405);
  assert.equal(store.value(), null, 'nothing was stored');
});

test('routes: the list and its live line; bad ids are not routes', () => {
  assert.deepEqual(ROUTE.exec(`/api/ledger/${ID}`)?.slice(1), [ID, undefined]);
  assert.deepEqual(ROUTE.exec(`/api/ledger/${ID}/live`)?.slice(1), [ID, '/live']);
  assert.equal(ROUTE.exec('/api/ledger/short'), null);
  assert.equal(ROUTE.exec(`/api/ledger/${ID}/other`), null);
});
