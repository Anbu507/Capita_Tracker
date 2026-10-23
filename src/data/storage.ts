// localStorage persistence: load → validate → migrate, and save. The only module that touches storage,
// so a sync backend can replace it later without changing the screens.
import { isISODate } from '../domain/dates.ts';
import { defaultItems, defaultSettings, emptyData } from '../domain/defaults.ts';
import { CURRENCIES } from '../domain/money.ts';
import type { AppData, Entry, EntryItem, Item, Settings } from '../domain/types.ts';

export const STORAGE_KEY = 'capital-tracker/v1';

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown, max = 200) => (typeof v === 'string' ? v.slice(0, max) : '');
const int = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? Math.round(v) : NaN);

function cleanItem(v: unknown): Item | null {
  if (!isObj(v) || !str(v.id) || !str(v.name)) return null;
  const qty = int(v.defaultQty);
  return {
    id: str(v.id, 64),
    name: str(v.name, 40),
    emoji: str(v.emoji, 8) || '🛒',
    defaultQty: qty >= 0 && qty <= 99 ? qty : 1,
    archived: v.archived === true,
  };
}

function cleanEntryItem(v: unknown): EntryItem | null {
  if (!isObj(v) || !str(v.itemId)) return null;
  const qty = int(v.qty);
  if (!(qty >= 0 && qty <= 999)) return null;
  return { itemId: str(v.itemId, 64), name: str(v.name, 40) || 'Item', emoji: str(v.emoji, 8) || '🛒', qty };
}

function cleanEntry(v: unknown): Entry | null {
  if (!isObj(v) || !str(v.id) || !isISODate(v.date)) return null;
  const amount = int(v.amount);
  if (!(amount > 0)) return null;
  const createdAt = int(v.createdAt);
  const base = {
    id: str(v.id, 64),
    date: v.date,
    amount,
    note: str(v.note, 200),
    createdAt: createdAt > 0 ? createdAt : 0,
    updatedAt: int(v.updatedAt) > 0 ? int(v.updatedAt) : createdAt > 0 ? createdAt : 0,
  };
  if (v.kind === 'topup') return { ...base, kind: 'topup' };
  if (v.kind === 'purchase') {
    const items = Array.isArray(v.items) ? v.items.map(cleanEntryItem).filter((x): x is EntryItem => !!x) : [];
    return { ...base, kind: 'purchase', items };
  }
  return null;
}

function cleanSettings(v: unknown): Settings {
  const d = defaultSettings();
  if (!isObj(v)) return d;
  const low = int(v.lowBalance);
  return {
    shopName: str(v.shopName, 40),
    currency: CURRENCIES.some((c) => c.code === v.currency) ? (v.currency as Settings['currency']) : d.currency,
    lowBalance: low >= 0 ? low : d.lowBalance,
    theme: v.theme === 'light' || v.theme === 'dark' ? v.theme : 'system',
    lastBackupAt: int(v.lastBackupAt) > 0 ? int(v.lastBackupAt) : null,
    shopPhone: str(v.shopPhone, 20).replace(/\D/g, ''),
    sendToShop: v.sendToShop === true,
  };
}

/** Turns anything (old versions, hand-edited backups) into valid AppData, or null if it isn't ours. */
export function parseData(raw: unknown): AppData | null {
  if (!isObj(raw) || !Array.isArray(raw.entries)) return null;
  // Future schema versions migrate here: if (raw.version === 1) raw = migrateV1toV2(raw) …
  if (raw.version !== 1) return null;
  const items = Array.isArray(raw.items) ? raw.items.map(cleanItem).filter((x): x is Item => !!x) : [];
  const seen = new Set<string>();
  const entries = raw.entries
    .map(cleanEntry)
    .filter((e): e is Entry => !!e && !seen.has(e.id) && !!seen.add(e.id));
  return { version: 1, items: items.length ? items : defaultItems(), entries, settings: cleanSettings(raw.settings) };
}

export type LoadResult = { data: AppData; ok: true } | { data: AppData; ok: false; reason: 'unavailable' | 'corrupt' };

export function load(): LoadResult {
  let text: string | null;
  try {
    text = localStorage.getItem(STORAGE_KEY);
  } catch {
    return { data: emptyData(), ok: false, reason: 'unavailable' };
  }
  if (text === null) return { data: emptyData(), ok: true };
  try {
    const data = parseData(JSON.parse(text));
    if (data) return { data, ok: true };
  } catch {
    /* fall through */
  }
  // Keep the unreadable copy instead of overwriting it, so nothing is lost silently.
  try {
    localStorage.setItem(`${STORAGE_KEY}/corrupt-${Date.now()}`, text);
  } catch {
    /* ignore */
  }
  return { data: emptyData(), ok: false, reason: 'corrupt' };
}

export function save(data: AppData): boolean {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    return true;
  } catch {
    return false;
  }
}

/** Asks the browser not to evict our data under storage pressure (best effort). */
export function requestPersistence(): void {
  navigator.storage?.persist?.().catch(() => {});
}

/** Fires when another tab changes the data. */
export function onExternalChange(cb: (data: AppData) => void): void {
  window.addEventListener('storage', (e) => {
    if (e.key !== STORAGE_KEY || e.newValue === null) return;
    try {
      const data = parseData(JSON.parse(e.newValue));
      if (data) cb(data);
    } catch {
      /* ignore */
    }
  });
}
