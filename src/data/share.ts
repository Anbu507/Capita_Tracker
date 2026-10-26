// Keeps the shop's page up to date: turn sharing on/off, and send my list after every change.
// Sends are serialised (never two at once) and skipped when nothing the shop sees has changed.
import { SHARE_API } from '../config.ts';
import { randomToken, sharedSignature, toShared } from '../domain/sharedLedger.ts';
import { getData, updateSettings } from './store.ts';

export type ShareState = 'off' | 'sending' | 'sent' | 'waiting';

const SENT_AT = 'capital-tracker/share-sent-at';
const DELAY_MS = 1200;

let state: ShareState = 'off';
let lastSent = '';
let timer: number | undefined;
let current: Promise<boolean> | null = null;
let again = false;
const listeners = new Set<() => void>();

const endpoint = (id: string) => `${SHARE_API}/api/ledger/${id}`;
const auth = (key: string) => ({ authorization: `Bearer ${key}` });

function setState(next: ShareState): void {
  state = next;
  listeners.forEach((fn) => fn());
}

export const shareState = (): ShareState => state;

export function lastSentAt(): number | null {
  try {
    const v = Number(localStorage.getItem(SENT_AT));
    return v > 0 ? v : null;
  } catch {
    return null;
  }
}

/** Calls `fn` when the sending state changes; returns the unsubscribe function. */
export function onShareState(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** The link the shopkeeper opens: this same site, at #/s/<id>. */
export function shopLink(id: string): string {
  return `${location.origin}${location.pathname}#/s/${id}`;
}

async function put(id: string, key: string, body: string): Promise<boolean> {
  try {
    const res = await fetch(endpoint(id), { method: 'PUT', headers: { ...auth(key), 'content-type': 'application/json' }, body });
    return res.ok;
  } catch {
    return false;
  }
}

async function send(): Promise<boolean> {
  const data = getData();
  const { shareId, shareKey } = data.settings;
  if (!shareId) return false;
  if (current) {
    // One at a time: send the newest list once this one finishes, so an older list never lands last.
    again = true;
    return current;
  }
  const signature = sharedSignature(data);
  if (signature === lastSent) {
    setState('sent');
    return true;
  }
  setState('sending');
  current = put(shareId, shareKey, JSON.stringify(toShared(data)));
  const ok = await current;
  current = null;
  if (ok) {
    lastSent = signature;
    try {
      localStorage.setItem(SENT_AT, String(Date.now()));
    } catch {
      /* the time is only for display */
    }
  }
  setState(ok ? 'sent' : 'waiting');
  if (again) {
    again = false;
    return send();
  }
  return ok;
}

/** Called after every change to my data: sends a little later, so quick edits go up as one. */
export function scheduleShare(): void {
  if (!getData().settings.shareId) {
    if (state !== 'off') setState('off');
    return;
  }
  window.clearTimeout(timer);
  timer = window.setTimeout(() => void send(), DELAY_MS);
}

/** Sends right away (app start, back online, "Try again"). */
export function shareNow(): Promise<boolean> {
  window.clearTimeout(timer);
  return send();
}

/** Makes the shop's page: a new random id plus a secret key that only this phone keeps. */
export async function startSharing(name: string): Promise<boolean> {
  lastSent = '';
  updateSettings({ shareName: name.trim(), shareId: randomToken(16), shareKey: randomToken(32) });
  return shareNow();
}

/** Deletes the online copy, then forgets the link. Needs internet, so nothing is left behind. */
export async function stopSharing(): Promise<boolean> {
  window.clearTimeout(timer);
  again = false;
  if (current) await current; // a send still on its way would otherwise put the page back
  const { shareId, shareKey } = getData().settings;
  if (shareId) {
    try {
      const res = await fetch(endpoint(shareId), { method: 'DELETE', headers: auth(shareKey) });
      if (!res.ok && res.status !== 404) return false;
    } catch {
      return false;
    }
  }
  lastSent = '';
  updateSettings({ shareId: '', shareKey: '' });
  try {
    localStorage.removeItem(SENT_AT);
  } catch {
    /* ignore */
  }
  setState('off');
  return true;
}

/** App start: catch up on changes made while offline, and retry whenever the internet comes back. */
export function initSharing(): void {
  window.addEventListener('online', () => {
    if (getData().settings.shareId) void shareNow();
  });
  if (getData().settings.shareId) void shareNow();
}
