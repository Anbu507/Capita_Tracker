// The copy of my list that the shop's page sees. Only what the shop needs: date, items, amount,
// bought / money given, my name and the shop name. Notes are never shared.
import { isISODate } from './dates.ts';
import { sortEntries } from './ledger.ts';
import { CURRENCIES } from './money.ts';
import type { AppData, Currency, Entry, Paise } from './types.ts';

export interface SharedItem {
  emoji: string;
  name: string;
  qty: number;
}

export interface SharedEntry {
  kind: 'purchase' | 'topup';
  date: string;
  amount: Paise;
  /** createdAt — keeps the order of several entries on the same day. */
  t: number;
  items?: SharedItem[];
}

export interface SharedLedger {
  v: 1;
  name: string;
  shopName: string;
  currency: Currency;
  updatedAt: number;
  entries: SharedEntry[];
}

export const SHARE_ID = /^[A-Za-z0-9_-]{16,64}$/;
export const SHARE_KEY = /^[A-Za-z0-9_-]{32,128}$/;

export function toShared(data: AppData, now = Date.now()): SharedLedger {
  return {
    v: 1,
    name: data.settings.shareName,
    shopName: data.settings.shopName,
    currency: data.settings.currency,
    updatedAt: now,
    entries: sortEntries(data.entries).map((e): SharedEntry =>
      e.kind === 'purchase'
        ? {
            kind: 'purchase',
            date: e.date,
            amount: e.amount,
            t: e.createdAt,
            items: e.items.filter((i) => i.qty > 0).map(({ emoji, name, qty }) => ({ emoji, name, qty })),
          }
        : { kind: 'topup', date: e.date, amount: e.amount, t: e.createdAt },
    ),
  };
}

/** Same content without the time stamp — used to skip sending when nothing the shop sees changed. */
export function sharedSignature(data: AppData): string {
  return JSON.stringify(toShared(data, 0));
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown, max: number) => (typeof v === 'string' ? v.slice(0, max) : '');
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? Math.round(v) : NaN);

/** Checks and cleans a shared list from the server or the page's cache. Null when it isn't one. */
export function readShared(raw: unknown): SharedLedger | null {
  if (!isObj(raw) || raw.v !== 1 || !Array.isArray(raw.entries)) return null;
  const entries: SharedEntry[] = [];
  for (const e of raw.entries) {
    if (!isObj(e) || !isISODate(e.date) || (e.kind !== 'purchase' && e.kind !== 'topup')) continue;
    const amount = num(e.amount);
    if (!(amount > 0)) continue;
    const t = num(e.t);
    const entry: SharedEntry = { kind: e.kind, date: e.date, amount, t: t > 0 ? t : 0 };
    if (e.kind === 'purchase' && Array.isArray(e.items)) {
      entry.items = e.items
        .filter(isObj)
        .map((i) => ({ emoji: str(i.emoji, 8) || '🛒', name: str(i.name, 40) || 'Item', qty: num(i.qty) }))
        .filter((i) => i.qty > 0 && i.qty <= 999);
    }
    entries.push(entry);
  }
  const updatedAt = num(raw.updatedAt);
  return {
    v: 1,
    name: str(raw.name, 40),
    shopName: str(raw.shopName, 40),
    currency: CURRENCIES.some((c) => c.code === raw.currency) ? (raw.currency as Currency) : 'INR',
    updatedAt: updatedAt > 0 ? updatedAt : 0,
    entries,
  };
}

/** Back to normal entries, so the shop's page uses the same ledger maths as my app. */
export function sharedToEntries(ledger: SharedLedger): Entry[] {
  return ledger.entries.map((e, i): Entry => {
    const base = { id: `s${i}`, date: e.date, amount: e.amount, note: '', createdAt: e.t || i, updatedAt: e.t || i };
    return e.kind === 'purchase'
      ? { ...base, kind: 'purchase', items: (e.items ?? []).map((it) => ({ itemId: it.name, name: it.name, emoji: it.emoji, qty: it.qty })) }
      : { ...base, kind: 'topup' };
  });
}

/** Random URL-safe text: page ids (16 bytes) and secret keys (32 bytes). */
export function randomToken(bytes: number): string {
  const b = crypto.getRandomValues(new Uint8Array(bytes));
  return btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
