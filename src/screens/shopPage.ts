// The shop's page: what the shopkeeper sees on their own phone at #/s/<id>.
// Read-only and as plain as possible — money left, money given, spent, and the history.
import { fetchWithin, SHARE_API } from '../config.ts';
import { formatMonth, formatRelativeDay, formatUpdated } from '../domain/dates.ts';
import { balanceOf, groupByMonth, rangeTotals, runningBalance, type LedgerRow } from '../domain/ledger.ts';
import { formatMoney, formatSigned } from '../domain/money.ts';
import { readShared, sharedToEntries, type SharedLedger } from '../domain/sharedLedger.ts';
import { getData } from '../data/store.ts';
import { h } from '../ui/dom.ts';
import { icon } from '../ui/icons.ts';
import { onDispose } from '../ui/lifecycle.ts';
import { shopPageId } from '../ui/router.ts';
import { emptyState, itemsSummary } from './shared.ts';

const CACHE = 'capital-tracker/view/';
/** The shop's page last opened on this phone — "Add to Home screen" reopens it. */
export const LAST_VIEWED = 'capital-tracker/viewing';
/** Reconnect waits for the live line (ms), growing up to the last value. */
const RECONNECT_MS = [1_000, 2_000, 5_000, 10_000, 15_000];
/** Keeps mobile networks from silently dropping an idle live line. */
const PING_MS = 25_000;
/** Without a live line, check this often; with one, just refresh the "updated … ago" text. */
const TICK_MS = 30_000;

type Load = 'loading' | 'fresh' | 'offline' | 'gone';

function readCache(id: string): SharedLedger | null {
  try {
    return readShared(JSON.parse(localStorage.getItem(CACHE + id) ?? 'null'));
  } catch {
    return null;
  }
}

function writeCache(id: string, ledger: SharedLedger | null): void {
  try {
    if (ledger) localStorage.setItem(CACHE + id, JSON.stringify(ledger));
    else localStorage.removeItem(CACHE + id);
    // Only the shopkeeper's phone should reopen this page; my own phone just previews it.
    if (id !== getData().settings.shareId) localStorage.setItem(LAST_VIEWED, id);
  } catch {
    /* the page still works without the cache */
  }
}

export function lastViewedShopPage(): string | null {
  try {
    return localStorage.getItem(LAST_VIEWED);
  } catch {
    return null;
  }
}

export function shopPageScreen(): HTMLElement {
  const id = shopPageId()!;
  const root = h('div', { class: 'screen view' });
  let ledger = readCache(id);
  let load: Load = 'loading';
  let busy = false;
  let live = false;
  let socket: WebSocket | null = null;
  let attempts = 0;
  let reconnectTimer: number | undefined;
  let pingTimer: number | undefined;
  let disposed = false;

  const paint = (next: Load = load) => {
    load = next;
    root.replaceChildren(...content(ledger, load, live, refresh));
  };

  const show = (fresh: SharedLedger | null) => {
    ledger = fresh;
    writeCache(id, fresh);
    paint(fresh ? 'fresh' : 'gone');
  };

  // Plain request: the first look, the Refresh button, and the backup when the live line is down.
  const refresh = async () => {
    if (busy) return;
    busy = true;
    if (!ledger) paint('loading');
    try {
      const res = await fetchWithin(`${SHARE_API}/api/ledger/${id}`, { cache: 'no-store' });
      if (res.status === 404) show(null);
      else {
        const fresh = res.ok ? readShared(await res.json()) : null;
        if (!fresh) throw new Error('bad reply');
        show(fresh);
      }
    } catch {
      paint('offline');
    }
    busy = false;
  };

  // Live line: the server pushes every change the moment the customer saves it.
  const visible = () => document.visibilityState === 'visible';
  const connect = () => {
    if (disposed || socket || !visible()) return;
    let ws: WebSocket;
    try {
      ws = new WebSocket(`${SHARE_API.replace(/^http/, 'ws')}/api/ledger/${id}/live`);
    } catch {
      return reconnectLater();
    }
    socket = ws;
    ws.onopen = () => {
      attempts = 0;
      live = true;
      paint();
      pingTimer = window.setInterval(() => ws.readyState === WebSocket.OPEN && ws.send('ping'), PING_MS);
    };
    ws.onmessage = (e) => {
      if (e.data === 'pong') return;
      try {
        const msg = JSON.parse(String(e.data)) as { ledger?: unknown; gone?: boolean };
        if (msg.gone) show(null);
        else {
          const fresh = readShared(msg.ledger);
          if (fresh) show(fresh);
        }
      } catch {
        /* ignore anything unexpected */
      }
    };
    ws.onclose = () => {
      window.clearInterval(pingTimer);
      socket = null;
      if (disposed) return;
      if (live) {
        live = false;
        paint();
      }
      reconnectLater();
    };
    ws.onerror = () => ws.close();
  };
  const reconnectLater = () => {
    window.clearTimeout(reconnectTimer);
    if (disposed || !visible() || load === 'gone') return;
    reconnectTimer = window.setTimeout(connect, RECONNECT_MS[Math.min(attempts++, RECONNECT_MS.length - 1)]);
  };

  paint('loading');
  void refresh();
  connect();

  const tick = window.setInterval(() => {
    if (!visible()) return;
    if (live) paint(); // keeps "updated 5 min ago" true
    else void refresh();
  }, TICK_MS);
  // Phones pause hidden pages: catch up and reconnect as soon as the page is looked at again.
  const onVisible = () => {
    if (visible()) {
      void refresh();
      connect();
    } else socket?.close();
  };
  document.addEventListener('visibilitychange', onVisible);
  onDispose(() => {
    disposed = true;
    window.clearInterval(tick);
    window.clearTimeout(reconnectTimer);
    window.clearInterval(pingTimer);
    document.removeEventListener('visibilitychange', onVisible);
    socket?.close();
  });

  return root;
}

function content(ledger: SharedLedger | null, load: Load, live: boolean, refresh: () => void): HTMLElement[] {
  const retry = h('button', { class: 'btn btn-secondary btn-sm', type: 'button', onClick: refresh }, 'Refresh');

  if (load === 'gone') {
    return [h('section', { class: 'card' }, emptyState('This page is turned off', 'The customer stopped sharing this list.'))];
  }
  if (!ledger) {
    return [
      h('section', { class: 'card' },
        load === 'loading'
          ? h('p', { class: 'view-loading' }, 'Loading…')
          : emptyState('Could not load', 'Check the internet and try again.', retry)),
    ];
  }

  const fm = (p: number) => formatMoney(p, ledger.currency);
  const entries = sharedToEntries(ledger);
  const balance = balanceOf(entries);
  const totals = rangeTotals(entries, '0000-01-01', '9999-12-31');
  const groups = groupByMonth(runningBalance(entries));

  const status =
    load === 'offline'
      ? `No internet — showing the list from ${formatUpdated(ledger.updatedAt)}`
      : `Updated ${formatUpdated(ledger.updatedAt)}`;

  const row = (r: LedgerRow) => {
    const e = r.entry;
    const isTopUp = e.kind === 'topup';
    return h('li', { class: 'entry-row is-static' },
      h('span', { class: `entry-badge ${isTopUp ? 'is-topup' : ''}`, 'aria-hidden': 'true' }, icon(isTopUp ? 'wallet' : 'bag', 18)),
      h('span', { class: 'entry-main' },
        h('span', { class: 'entry-title' }, isTopUp ? 'Money given' : itemsSummary(e.kind === 'purchase' ? e.items : []) || 'Bought'),
        h('span', { class: 'entry-meta' }, formatRelativeDay(e.date))),
      h('span', { class: 'entry-amounts' },
        h('span', { class: `entry-amount ${isTopUp ? 'is-positive' : ''}` }, formatSigned(isTopUp ? e.amount : -e.amount, ledger.currency)),
        h('span', { class: 'entry-balance' }, `${fm(r.balanceAfter)} left`)));
  };

  return [
    h('header', { class: 'screen-header' },
      h('div', null,
        h('p', { class: 'eyebrow' }, ledger.name ? `${ledger.name}'s account` : 'Customer account'),
        h('h1', null, ledger.shopName || 'Shop account'))),
    h('section', { class: 'card hero view-hero', 'aria-label': 'Money left' },
      h('p', { class: 'hero-label' }, balance < 0 ? 'Customer owes' : 'Money left'),
      h('p', { class: `hero-value${balance < 0 ? ' is-negative' : ''}` }, fm(Math.abs(balance))),
      h('div', { class: 'view-totals' },
        h('p', null, h('span', null, 'Money given'), h('strong', null, fm(totals.added))),
        h('p', null, h('span', null, 'Spent'), h('strong', null, fm(totals.spent)))),
      h('div', { class: 'view-status' },
        h('p', null, live && h('span', { class: 'live-badge' }, 'Live'), status),
        retry)),
    entries.length
      ? h('div', { class: 'history-list' },
          groups.map((g) =>
            h('section', { class: 'card month', 'aria-label': formatMonth(g.key) },
              h('header', { class: 'month-header' },
                h('h2', null, formatMonth(g.key)),
                h('p', null, h('span', null, `Spent ${fm(g.spent)}`), g.added > 0 && h('span', { class: 'is-positive' }, `Given ${fm(g.added)}`))),
              h('ul', { class: 'entry-list' }, g.rows.map(row)))))
      : h('section', { class: 'card' }, emptyState('Nothing yet', 'Purchases will show here.')),
  ];
}
