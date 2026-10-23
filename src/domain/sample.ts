import { addDays } from './dates.ts';
import { newId } from './defaults.ts';
import type { Entry, ISODate, Item } from './types.ts';

/** About two months of realistic history, so a new user can see how the app looks when used. */
export function sampleEntries(items: Item[], end: ISODate, days = 60): Entry[] {
  const eggs = items.find((i) => i.id === 'eggs') ?? items[0];
  const bananas = items.find((i) => i.id === 'bananas') ?? items[1];
  let seed = 7;
  const rand = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;

  const entries: Entry[] = [];
  let balance = 0;
  let t = Date.now() - days * 86_400_000;
  const stamp = () => (t += 60_000);

  for (let i = days - 1; i >= 0; i--) {
    const date = addDays(end, -i);
    if (balance < 15_000) {
      const amount = balance < 0 ? 100_000 : 50_000;
      entries.push({ kind: 'topup', id: newId(), date, amount, note: '', createdAt: stamp(), updatedAt: t });
      balance += amount;
    }
    if (rand() < 0.1) continue; // a few days without shopping
    const eggPrice = 600 + Math.round(rand() * 3) * 50; // ₹6.00–₹7.50
    const bananaPrice = 500 + Math.round(rand() * 2) * 50; // ₹5.00–₹6.00
    const amount = Math.round((3 * eggPrice + 3 * bananaPrice) / 100) * 100;
    const purchaseItems = [eggs, bananas]
      .filter(Boolean)
      .map((it) => ({ itemId: it.id, name: it.name, emoji: it.emoji, qty: 3 }));
    entries.push({ kind: 'purchase', id: newId(), date, amount, items: purchaseItems, note: '', createdAt: stamp(), updatedAt: t });
    balance -= amount;
  }
  return entries;
}
