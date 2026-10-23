// Domain types. Money is always integer paise (₹42.50 → 4250); dates are local "YYYY-MM-DD".

export type Paise = number;
export type ISODate = string;

export interface Item {
  id: string;
  name: string;
  emoji: string;
  defaultQty: number;
  archived: boolean;
}

export interface EntryItem {
  itemId: string;
  name: string;
  emoji: string;
  qty: number;
}

interface EntryBase {
  id: string;
  date: ISODate;
  amount: Paise;
  note: string;
  createdAt: number;
  updatedAt: number;
}

export interface PurchaseEntry extends EntryBase {
  kind: 'purchase';
  items: EntryItem[];
}

export interface TopUpEntry extends EntryBase {
  kind: 'topup';
}

export type Entry = PurchaseEntry | TopUpEntry;
export type EntryKind = Entry['kind'];

export type Currency = 'INR' | 'USD' | 'EUR' | 'GBP';
export type Theme = 'system' | 'light' | 'dark';

export interface Settings {
  shopName: string;
  currency: Currency;
  lowBalance: Paise;
  theme: Theme;
  lastBackupAt: number | null;
}

export interface AppData {
  version: 1;
  items: Item[];
  entries: Entry[];
  settings: Settings;
}
