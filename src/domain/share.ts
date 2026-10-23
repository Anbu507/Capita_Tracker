// Plain-text WhatsApp messages for the shopkeeper. Written from their side ("Money left with you"),
// short lines, emoji for the items — readable by someone who only uses WhatsApp.
import { formatDayMonth } from './dates.ts';
import { balanceOf, runningBalance } from './ledger.ts';
import { formatMoney } from './money.ts';
import type { Currency, Entry, EntryItem, Paise } from './types.ts';

/**
 * Cleans what someone types as a phone number into wa.me form (digits with country code).
 * Returns '' for an empty field and null when it can't be a phone number.
 * A 10-digit number gets India's +91 when the currency is INR.
 */
export function normalizePhone(input: string, currency: Currency): string | null {
  let d = input.replace(/\D/g, '');
  if (!d) return '';
  if (d.length === 11 && d.startsWith('0')) d = d.slice(1);
  if (d.length === 10 && currency === 'INR') d = `91${d}`;
  return d.length >= 11 && d.length <= 15 ? d : null;
}

/** WhatsApp "click to chat" link. Without a number, WhatsApp asks which chat to send to. */
export function whatsAppLink(text: string, phone: string): string {
  return `https://wa.me/${phone}?text=${encodeURIComponent(text)}`;
}

/** "🥚 Eggs × 3, 🍌 Bananas × 3" */
export function itemsLine(items: EntryItem[]): string {
  return items.filter((i) => i.qty > 0).map((i) => `${i.emoji} ${i.name} × ${i.qty}`).join(', ');
}

function balanceLine(balance: Paise, currency: Currency): string {
  return balance >= 0 ? `Money left with you: ${formatMoney(balance, currency)}` : `I owe you: ${formatMoney(-balance, currency)}`;
}

/** Message for one entry; `balance` is the overall balance after saving it. */
export function entryMessage(entry: Entry, balance: Paise, currency: Currency, opts: { corrected?: boolean } = {}): string {
  const fm = (p: Paise) => formatMoney(p, currency);
  const date = formatDayMonth(entry.date);
  const lines: (string | false)[] =
    entry.kind === 'topup'
      ? [`💰 Money given – ${date}`, `Amount: ${fm(entry.amount)}`]
      : [`🛒 ${date}`, entry.items.some((i) => i.qty > 0) && `Took: ${itemsLine(entry.items)}`, `Amount: ${fm(entry.amount)}`];
  if (entry.note) lines.push(`Note: ${entry.note}`);
  lines.push(balanceLine(balance, currency));
  if (opts.corrected) lines.unshift('✏️ Correction');
  return lines.filter(Boolean).join('\n');
}

/**
 * Everything since the last time money was given, like a page of an account book.
 * Totals always add up: earlier balance + money given − taken = left.
 */
export function statementMessage(entries: readonly Entry[], currency: Currency, asOf: string, shopName = '', maxLines = 40): string {
  const fm = (p: Paise) => formatMoney(p, currency);
  const rows = runningBalance(entries);
  const title = `🧾 Account${shopName ? ` – ${shopName}` : ''} (till ${formatDayMonth(asOf)})`;
  if (!rows.length) return `${title}\nNo entries yet.`;

  let start = rows.length - 1;
  while (start > 0 && rows[start].entry.kind !== 'topup') start--;
  const earlier = start > 0 ? rows[start - 1].balanceAfter : 0;
  const slice = rows.slice(start);

  let given = 0;
  let taken = 0;
  const lines = slice.map(({ entry: e }) => {
    const date = formatDayMonth(e.date);
    if (e.kind === 'topup') {
      given += e.amount;
      return `${date} – Money given +${fm(e.amount)}`;
    }
    taken += e.amount;
    const items = e.items.filter((i) => i.qty > 0).map((i) => `${i.emoji}${i.qty}`).join(' ');
    return `${date} – ${items ? `${items} ` : ''}${fm(e.amount)}`;
  });
  const shown = lines.length > maxLines ? ['…', ...lines.slice(-maxLines)] : lines;

  return [
    title,
    '',
    ...shown,
    '',
    earlier !== 0 && `Earlier balance: ${earlier < 0 ? '−' : ''}${fm(Math.abs(earlier))}`,
    given > 0 && `Money given: ${fm(given)}`,
    `Taken: ${fm(taken)}`,
    balanceLine(balanceOf(entries), currency),
  ]
    .filter((l) => l !== false)
    .join('\n');
}
