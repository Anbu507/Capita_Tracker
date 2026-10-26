import assert from 'node:assert/strict';
import { test } from 'node:test';
import { handle, type Env } from '../worker/src/index.ts';

function memoryEnv(): Env & { store: Map<string, string> } {
  const store = new Map<string, string>();
  return {
    store,
    LEDGERS: {
      get: async (k) => (store.has(k) ? JSON.parse(store.get(k)!) : null),
      put: async (k, v) => void store.set(k, v),
      delete: async (k) => void store.delete(k),
    },
  };
}

const ID = 'AbCdEfGhIjKlMnOpQrStUv';
const KEY = 'k'.repeat(43);
const url = `https://api.example/api/ledger/${ID}`;
const ledger = { v: 1, name: 'Anbu', shopName: '', currency: 'INR', updatedAt: 1, entries: [] };
const put = (body: unknown, key = KEY) =>
  new Request(url, { method: 'PUT', headers: { authorization: `Bearer ${key}` }, body: JSON.stringify(body) });

test('put then get returns the shared list, never the key', async () => {
  const env = memoryEnv();
  assert.equal((await handle(put(ledger), env)).status, 204);
  const res = await handle(new Request(url), env);
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), ledger);
  assert.equal(res.headers.get('access-control-allow-origin'), '*');
  assert.ok(!env.store.get(ID)!.includes(KEY), 'only the hash of the key is stored');
});

test('only the first key can change or delete a list', async () => {
  const env = memoryEnv();
  await handle(put(ledger), env);
  const other = 'x'.repeat(43);
  assert.equal((await handle(put({ ...ledger, name: 'Someone' }, other), env)).status, 403);
  assert.equal((await handle(new Request(url, { method: 'DELETE', headers: { authorization: `Bearer ${other}` } }), env)).status, 403);
  assert.equal((await handle(new Request(url, { method: 'DELETE', headers: { authorization: `Bearer ${KEY}` } }), env)).status, 204);
  assert.equal((await handle(new Request(url), env)).status, 404);
});

test('rejects missing keys, bad bodies, bad ids and other methods', async () => {
  const env = memoryEnv();
  assert.equal((await handle(new Request(url, { method: 'PUT', body: '{}' }), env)).status, 401);
  assert.equal((await handle(put({ hello: 1 }), env)).status, 400);
  assert.equal((await handle(new Request(url, { method: 'PUT', headers: { authorization: `Bearer ${KEY}` }, body: 'nope' }), env)).status, 400);
  assert.equal((await handle(put({ ...ledger, entries: ['x'.repeat(300_001)] }), env)).status, 413);
  assert.equal((await handle(new Request('https://api.example/api/ledger/short'), env)).status, 404);
  assert.equal((await handle(new Request(url, { method: 'POST' }), env)).status, 405);
  assert.equal((await handle(new Request(url, { method: 'OPTIONS' }), env)).status, 204);
});
