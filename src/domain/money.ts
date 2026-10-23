import type { Currency, Paise } from './types.ts';

export const CURRENCIES: { code: Currency; label: string }[] = [
  { code: 'INR', label: 'Indian rupee (₹)' },
  { code: 'USD', label: 'US dollar ($)' },
  { code: 'EUR', label: 'Euro (€)' },
  { code: 'GBP', label: 'British pound (£)' },
];

const MAX_AMOUNT: Paise = 10_000_000; // ₹1,00,000 — anything above is almost certainly a typo

function localeFor(currency: Currency): string {
  return currency === 'INR' ? 'en-IN' : currency === 'GBP' ? 'en-GB' : currency === 'EUR' ? 'en-IE' : 'en-US';
}

const cache = new Map<string, Intl.NumberFormat>();
function formatter(currency: Currency, kind: 'whole' | 'fraction' | 'compact'): Intl.NumberFormat {
  const key = `${currency}:${kind}`;
  let f = cache.get(key);
  if (!f) {
    const base: Intl.NumberFormatOptions = { style: 'currency', currency };
    const opts: Intl.NumberFormatOptions =
      kind === 'whole' ? { ...base, minimumFractionDigits: 0, maximumFractionDigits: 0 }
      : kind === 'fraction' ? { ...base, minimumFractionDigits: 2, maximumFractionDigits: 2 }
      : { ...base, notation: 'compact', maximumFractionDigits: 1 };
    f = new Intl.NumberFormat(localeFor(currency), opts);
    cache.set(key, f);
  }
  return f;
}

/** ₹42 for whole amounts, ₹42.50 when there are paise. */
export function formatMoney(paise: Paise, currency: Currency): string {
  const kind = paise % 100 === 0 ? 'whole' : 'fraction';
  return formatter(currency, kind).format(paise / 100);
}

/** "+₹500" / "−₹42" for ledger rows. */
export function formatSigned(paise: Paise, currency: Currency): string {
  const sign = paise > 0 ? '+' : paise < 0 ? '−' : '';
  return sign + formatMoney(Math.abs(paise), currency);
}

/** Short axis labels: ₹0, ₹500, ₹1.2K. */
export function formatCompact(paise: Paise, currency: Currency): string {
  if (Math.abs(paise) < 100_000) return formatMoney(Math.round(paise / 100) * 100, currency);
  return formatter(currency, 'compact').format(paise / 100);
}

export function currencySymbol(currency: Currency): string {
  return formatter(currency, 'whole').formatToParts(0).find((p) => p.type === 'currency')?.value ?? currency;
}

/** Paise → the plain text shown in an amount input ("42", "42.5"). */
export function toInputValue(paise: Paise): string {
  if (paise % 100 === 0) return String(paise / 100);
  return (paise / 100).toFixed(2);
}

/**
 * Parses what a person types into an amount field: "42", "42.50", "₹ 42", "1,200", "42,5".
 * Returns paise, or null when it isn't a positive amount within range.
 */
export function parseAmount(input: string): Paise | null {
  // Allow a leading currency sign or "Rs", nothing else: "-5" or "4a2" must not quietly become 5 or 42.
  let s = input.trim().replace(/^(rs\.?|inr|[₹$€£])\s*/i, '').replace(/\s/g, '');
  if (!/^[\d.,]+$/.test(s)) return null;
  const lastComma = s.lastIndexOf(',');
  // A single comma followed by 1–2 digits is a decimal comma ("42,5"); otherwise commas group thousands.
  if (lastComma !== -1 && !s.includes('.') && /^\d+,\d{1,2}$/.test(s)) s = s.replace(',', '.');
  else s = s.replace(/,/g, '');
  if (!/^\d*\.?\d{0,2}$/.test(s) || s === '.') return null;
  const paise = Math.round(Number(s) * 100);
  if (!Number.isFinite(paise) || paise <= 0 || paise > MAX_AMOUNT) return null;
  return paise;
}
