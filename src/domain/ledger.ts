// Pure ledger maths. No DOM, no storage — everything here is unit tested.
import { addDays, eachDay, monthKey, startOfWeek } from './dates.ts';
import type { Entry, EntryKind, ISODate, Item, Paise, PurchaseEntry } from './types.ts';

export function compareEntries(a: Entry, b: Entry): number {
  return a.date < b.date ? -1 : a.date > b.date ? 1 : a.createdAt - b.createdAt;
}

/** Oldest first. */
export function sortEntries(entries: readonly Entry[]): Entry[] {
  return [...entries].sort(compareEntries);
}

const signed = (e: Entry): Paise => (e.kind === 'topup' ? e.amount : -e.amount);

export function balanceOf(entries: readonly Entry[]): Paise {
  return entries.reduce((sum, e) => sum + signed(e), 0);
}

export interface LedgerRow {
  entry: Entry;
  balanceAfter: Paise;
}

/** Chronological rows with the balance right after each entry. */
export function runningBalance(entries: readonly Entry[]): LedgerRow[] {
  let balance = 0;
  return sortEntries(entries).map((entry) => {
    balance += signed(entry);
    return { entry, balanceAfter: balance };
  });
}

export function lastPurchase(entries: readonly Entry[]): PurchaseEntry | undefined {
  let last: PurchaseEntry | undefined;
  for (const e of entries) if (e.kind === 'purchase' && (!last || compareEntries(e, last) > 0)) last = e;
  return last;
}

/** Quantities to pre-fill for a new purchase: what I took last time, else each item's usual quantity. */
export function usualQuantities(items: readonly Item[], entries: readonly Entry[]): Map<string, number> {
  const last = lastPurchase(entries);
  return new Map(
    items.filter((i) => !i.archived).map((i) => [i.id, last?.items.find((x) => x.itemId === i.id)?.qty ?? i.defaultQty]),
  );
}

/** The last few different amounts of one kind, newest first — one-tap choices in the entry sheet. */
export function recentAmounts(entries: readonly Entry[], kind: EntryKind, count = 3): Paise[] {
  const out: Paise[] = [];
  for (const e of sortEntries(entries).reverse()) {
    if (e.kind === kind && !out.includes(e.amount)) out.push(e.amount);
    if (out.length === count) break;
  }
  return out;
}

/** Purchase total per date (several purchases on one day are summed). */
export function dailyPurchaseTotals(entries: readonly Entry[]): Map<ISODate, Paise> {
  const totals = new Map<ISODate, Paise>();
  for (const e of entries) if (e.kind === 'purchase') totals.set(e.date, (totals.get(e.date) ?? 0) + e.amount);
  return totals;
}

export interface DayStats {
  average: Paise;
  min: Paise;
  max: Paise;
  days: number;
}

/** Average / min / max over the most recent `days` days that had a purchase (up to `asOf`). */
export function recentDayStats(entries: readonly Entry[], asOf: ISODate, days = 7): DayStats | null {
  const totals = [...dailyPurchaseTotals(entries)]
    .filter(([date]) => date <= asOf)
    .sort(([a], [b]) => (a < b ? 1 : -1))
    .slice(0, days)
    .map(([, total]) => total);
  if (!totals.length) return null;
  const sum = totals.reduce((a, b) => a + b, 0);
  return { average: Math.round(sum / totals.length), min: Math.min(...totals), max: Math.max(...totals), days: totals.length };
}

/** Rough number of shop days the balance still covers. */
export function daysLeft(balance: Paise, average: Paise | undefined): number | null {
  if (!average || average <= 0 || balance <= 0) return null;
  return Math.floor(balance / average);
}

export interface Cycle {
  /** Balance right after the latest top-up (the 100 % mark of the meter). */
  start: Paise;
  remaining: Paise;
  since: ISODate;
  /** 0–1 share of `start` still left. */
  fraction: number;
}

export function currentCycle(entries: readonly Entry[]): Cycle | null {
  const rows = runningBalance(entries);
  let i = rows.length - 1;
  while (i >= 0 && rows[i].entry.kind !== 'topup') i--;
  if (i < 0) return null;
  const start = rows[i].balanceAfter;
  const remaining = rows[rows.length - 1].balanceAfter;
  const fraction = start > 0 ? Math.min(1, Math.max(0, remaining / start)) : 0;
  return { start, remaining, since: rows[i].entry.date, fraction };
}

export type BalanceStatus = 'empty' | 'ok' | 'low' | 'owed';

export function balanceStatus(balance: Paise, lowBalance: Paise, hasEntries: boolean): BalanceStatus {
  if (!hasEntries) return 'empty';
  if (balance < 0) return 'owed';
  if (balance <= lowBalance) return 'low';
  return 'ok';
}

// ---------- Ranges & series (Insights) ----------

export type Range = '7d' | '30d' | '90d' | 'all';

export const RANGES: { id: Range; label: string; days: number | null }[] = [
  { id: '7d', label: '7 days', days: 7 },
  { id: '30d', label: '30 days', days: 30 },
  { id: '90d', label: '90 days', days: 90 },
  { id: 'all', label: 'All', days: null },
];

export function rangeStart(range: Range, entries: readonly Entry[], end: ISODate): ISODate {
  const r = RANGES.find((x) => x.id === range)!;
  if (r.days) return addDays(end, -(r.days - 1));
  let first = end;
  for (const e of entries) if (e.date < first) first = e.date;
  return first;
}

export interface BalancePoint {
  date: ISODate;
  balance: Paise;
}

/** End-of-day balance for every calendar day in [start, end]. */
export function balanceSeries(entries: readonly Entry[], start: ISODate, end: ISODate): BalancePoint[] {
  let balance = 0;
  const net = new Map<ISODate, Paise>();
  for (const e of entries) {
    if (e.date < start) balance += signed(e);
    else if (e.date <= end) net.set(e.date, (net.get(e.date) ?? 0) + signed(e));
  }
  return eachDay(start, end).map((date) => {
    balance += net.get(date) ?? 0;
    return { date, balance };
  });
}

export type Bucket = 'day' | 'week' | 'month';

export function bucketFor(days: number): Bucket {
  return days <= 45 ? 'day' : days <= 400 ? 'week' : 'month';
}

export interface ItemCount {
  itemId: string;
  name: string;
  emoji: string;
  qty: number;
}

export interface SpendBucket {
  key: string;
  start: ISODate;
  end: ISODate;
  spent: Paise;
  purchases: number;
  items: ItemCount[];
}

function addItems(into: Map<string, ItemCount>, e: PurchaseEntry): void {
  for (const it of e.items) {
    const cur = into.get(it.itemId);
    if (cur) cur.qty += it.qty;
    else into.set(it.itemId, { itemId: it.itemId, name: it.name, emoji: it.emoji, qty: it.qty });
  }
}

/** Spend grouped per day, week (Mon–Sun) or month; empty buckets included so the axis is continuous. */
export function spendBuckets(entries: readonly Entry[], start: ISODate, end: ISODate, bucket: Bucket): SpendBucket[] {
  const keyOf = (d: ISODate) => (bucket === 'day' ? d : bucket === 'week' ? startOfWeek(d) : monthKey(d));
  const buckets = new Map<string, SpendBucket & { itemMap: Map<string, ItemCount> }>();
  for (const date of eachDay(start, end)) {
    const key = keyOf(date);
    const b = buckets.get(key);
    if (b) b.end = date;
    else buckets.set(key, { key, start: date, end: date, spent: 0, purchases: 0, items: [], itemMap: new Map() });
  }
  for (const e of sortEntries(entries)) {
    if (e.kind !== 'purchase' || e.date < start || e.date > end) continue;
    const b = buckets.get(keyOf(e.date))!;
    b.spent += e.amount;
    b.purchases++;
    addItems(b.itemMap, e);
  }
  return [...buckets.values()].map(({ itemMap, ...b }) => ({ ...b, items: [...itemMap.values()] }));
}

export interface RangeTotals {
  spent: Paise;
  added: Paise;
  purchaseDays: number;
  items: ItemCount[];
}

export function rangeTotals(entries: readonly Entry[], start: ISODate, end: ISODate): RangeTotals {
  let spent = 0;
  let added = 0;
  const days = new Set<ISODate>();
  const items = new Map<string, ItemCount>();
  for (const e of sortEntries(entries)) {
    if (e.date < start || e.date > end) continue;
    if (e.kind === 'topup') added += e.amount;
    else {
      spent += e.amount;
      days.add(e.date);
      addItems(items, e);
    }
  }
  return { spent, added, purchaseDays: days.size, items: [...items.values()].filter((i) => i.qty > 0) };
}

export interface MonthGroup {
  key: string;
  spent: Paise;
  added: Paise;
  /** Newest first. */
  rows: LedgerRow[];
}

/** History view: newest month first, newest entry first inside each month. */
export function groupByMonth(rows: readonly LedgerRow[]): MonthGroup[] {
  const groups = new Map<string, MonthGroup>();
  for (let i = rows.length - 1; i >= 0; i--) {
    const row = rows[i];
    const key = monthKey(row.entry.date);
    let g = groups.get(key);
    if (!g) groups.set(key, (g = { key, spent: 0, added: 0, rows: [] }));
    if (row.entry.kind === 'topup') g.added += row.entry.amount;
    else g.spent += row.entry.amount;
    g.rows.push(row);
  }
  return [...groups.values()];
}
