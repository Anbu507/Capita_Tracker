// The single source of truth. Screens read with getData(), change things only through these actions,
// and re-render when subscribe() fires.
import { today } from '../domain/dates.ts';
import { emptyData, newId } from '../domain/defaults.ts';
import { sampleEntries } from '../domain/sample.ts';
import type { AppData, Entry, EntryItem, EntryKind, Item, Paise, Settings } from '../domain/types.ts';
import { save } from './storage.ts';

type Listener = (data: AppData) => void;

let data: AppData = emptyData();
let saveFailed = false;
const listeners = new Set<Listener>();

export const getData = (): AppData => data;
export const lastSaveFailed = (): boolean => saveFailed;

export function subscribe(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Set the state without saving (initial load, or a change that came from another tab). */
export function hydrate(next: AppData): void {
  data = next;
  listeners.forEach((fn) => fn(data));
}

function commit(next: AppData): void {
  data = next;
  saveFailed = !save(data);
  listeners.forEach((fn) => fn(data));
}

// ---------- Entries ----------

export interface EntryDraft {
  kind: EntryKind;
  date: string;
  amount: Paise;
  note: string;
  items: EntryItem[];
}

function build(draft: EntryDraft, id: string, createdAt: number): Entry {
  const base = { id, date: draft.date, amount: draft.amount, note: draft.note.trim(), createdAt, updatedAt: Date.now() };
  return draft.kind === 'topup'
    ? { ...base, kind: 'topup' }
    : { ...base, kind: 'purchase', items: draft.items.filter((i) => i.qty > 0) };
}

export function addEntry(draft: EntryDraft): Entry {
  const entry = build(draft, newId(), Date.now());
  commit({ ...data, entries: [...data.entries, entry] });
  return entry;
}

export function updateEntry(id: string, draft: EntryDraft): void {
  commit({
    ...data,
    entries: data.entries.map((e) => (e.id === id ? build(draft, id, e.createdAt) : e)),
  });
}

/** Returns the removed entry so the caller can offer Undo. */
export function deleteEntry(id: string): Entry | undefined {
  const removed = data.entries.find((e) => e.id === id);
  if (removed) commit({ ...data, entries: data.entries.filter((e) => e.id !== id) });
  return removed;
}

export function restoreEntry(entry: Entry): void {
  if (data.entries.some((e) => e.id === entry.id)) return;
  commit({ ...data, entries: [...data.entries, entry] });
}

// ---------- Items ----------

export function addItem(): Item {
  const item: Item = { id: newId(), name: 'New item', emoji: '🛒', defaultQty: 1, archived: false };
  commit({ ...data, items: [...data.items, item] });
  return item;
}

export function updateItem(id: string, patch: Partial<Omit<Item, 'id'>>): void {
  commit({ ...data, items: data.items.map((i) => (i.id === id ? { ...i, ...patch } : i)) });
}

/** Items used in history are archived (kept for old entries); unused ones are removed. */
export function removeItem(id: string): void {
  const used = data.entries.some((e) => e.kind === 'purchase' && e.items.some((i) => i.itemId === id));
  const items = used
    ? data.items.map((i) => (i.id === id ? { ...i, archived: true } : i))
    : data.items.filter((i) => i.id !== id);
  commit({ ...data, items });
}

// ---------- Settings & data ----------

export function updateSettings(patch: Partial<Settings>): void {
  commit({ ...data, settings: { ...data.settings, ...patch } });
}

export function replaceAll(next: AppData): void {
  commit(next);
}

export function eraseAll(): void {
  commit({ ...emptyData(), settings: { ...emptyData().settings, theme: data.settings.theme } });
}

export function loadSample(): void {
  commit({ ...data, entries: sampleEntries(data.items, today()) });
}
