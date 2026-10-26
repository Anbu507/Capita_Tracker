import type { AppData, Item, Settings } from './types.ts';

export function newId(): string {
  // crypto.randomUUID needs a secure context; a phone on the LAN over plain http doesn't have one.
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}

export function defaultItems(): Item[] {
  return [
    { id: 'eggs', name: 'Eggs', emoji: '🥚', defaultQty: 3, archived: false },
    { id: 'bananas', name: 'Bananas', emoji: '🍌', defaultQty: 3, archived: false },
  ];
}

export function defaultSettings(): Settings {
  return { shopName: '', currency: 'INR', lowBalance: 10_000, theme: 'system', lastBackupAt: null, shareName: '', shareId: '', shareKey: '' };
}

export function emptyData(): AppData {
  return { version: 1, items: defaultItems(), entries: [], settings: defaultSettings() };
}
