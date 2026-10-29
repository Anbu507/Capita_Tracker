import assert from 'node:assert/strict';
import { test } from 'node:test';
import { startOnShopPage } from '../src/ui/router.ts';

const shopkeeper = { installed: true, route: 'home' as const, hasEntries: false, lastShopPage: 'AbCdEfGhIjKlMnOpQrStUv', choseApp: false };

test("the shopkeeper's home-screen app opens straight to the shop's page", () => {
  assert.equal(startOnShopPage(shopkeeper), true);
});

test('opening the address in a browser always shows the app (my phone is never trapped)', () => {
  assert.equal(startOnShopPage({ ...shopkeeper, installed: false }), false);
});

test('never when this phone has its own list, chose "Open the app", or never opened a shop page', () => {
  assert.equal(startOnShopPage({ ...shopkeeper, hasEntries: true }), false);
  assert.equal(startOnShopPage({ ...shopkeeper, choseApp: true }), false);
  assert.equal(startOnShopPage({ ...shopkeeper, lastShopPage: null }), false);
});

test('only from the start page, not when another screen was asked for', () => {
  assert.equal(startOnShopPage({ ...shopkeeper, route: 'settings' }), false);
});
