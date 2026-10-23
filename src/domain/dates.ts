import type { ISODate } from './types.ts';

const pad = (n: number) => String(n).padStart(2, '0');

export function toISODate(d: Date): ISODate {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Local noon avoids daylight-saving edge cases when adding days. */
export function fromISODate(s: ISODate): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d, 12);
}

export function today(now = new Date()): ISODate {
  return toISODate(now);
}

export function isISODate(s: unknown): s is ISODate {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  return toISODate(fromISODate(s)) === s;
}

export function addDays(s: ISODate, days: number): ISODate {
  const d = fromISODate(s);
  d.setDate(d.getDate() + days);
  return toISODate(d);
}

/** Whole days from a to b (b − a). */
export function daysBetween(a: ISODate, b: ISODate): number {
  return Math.round((fromISODate(b).getTime() - fromISODate(a).getTime()) / 86_400_000);
}

/** Monday of the week containing the date. */
export function startOfWeek(s: ISODate): ISODate {
  const d = fromISODate(s);
  const offset = (d.getDay() + 6) % 7;
  return addDays(s, -offset);
}

export function monthKey(s: ISODate): string {
  return s.slice(0, 7);
}

/** Every date from start to end, inclusive. */
export function eachDay(start: ISODate, end: ISODate): ISODate[] {
  const out: ISODate[] = [];
  for (let d = start; d <= end; d = addDays(d, 1)) out.push(d);
  return out;
}

const fmt = (opts: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat(undefined, opts);
const dayMonth = fmt({ day: 'numeric', month: 'short' });
const weekdayDayMonth = fmt({ weekday: 'short', day: 'numeric', month: 'short' });
const longDate = fmt({ weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
const monthYear = fmt({ month: 'long', year: 'numeric' });
const shortMonth = fmt({ month: 'short', year: '2-digit' });

/** "22 Oct" */
export const formatDayMonth = (s: ISODate) => dayMonth.format(fromISODate(s));
/** "Wed, 22 Oct" */
export const formatRowDate = (s: ISODate) => weekdayDayMonth.format(fromISODate(s));
/** "Wednesday, 22 October 2026" */
export const formatLongDate = (s: ISODate) => longDate.format(fromISODate(s));
/** "October 2026" from "2026-10" */
export const formatMonth = (key: string) => monthYear.format(fromISODate(`${key}-01`));
/** "Oct 26" from "2026-10" */
export const formatShortMonth = (key: string) => shortMonth.format(fromISODate(`${key}-01`));

/** "Today", "Yesterday", or "Wed, 22 Oct". */
export function formatRelativeDay(s: ISODate, now = today()): string {
  const diff = daysBetween(s, now);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  return formatRowDate(s);
}
