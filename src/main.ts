import './styles/tokens.css';
import './styles/base.css';
import './styles/layout.css';
import './styles/components.css';
import './styles/charts.css';

import type { AppData, Theme } from './domain/types.ts';
import { load, onExternalChange, requestPersistence } from './data/storage.ts';
import { getData, hydrate, lastSaveFailed, subscribe } from './data/store.ts';
import { openEntrySheet } from './screens/entrySheet.ts';
import { historyScreen } from './screens/history.ts';
import { homeScreen } from './screens/home.ts';
import { insightsScreen } from './screens/insights.ts';
import { settingsScreen } from './screens/settings.ts';
import { $, h, prefersReducedMotion } from './ui/dom.ts';
import { icon, type IconName } from './ui/icons.ts';
import { disposeAll } from './ui/lifecycle.ts';
import { currentRoute, onRouteChange, ROUTES, type Route } from './ui/router.ts';
import { toast } from './ui/toast.ts';

const SCREENS: Record<Route, (data: AppData) => HTMLElement> = {
  home: homeScreen,
  history: historyScreen,
  insights: insightsScreen,
  settings: settingsScreen,
};
const NAV_ICONS: Record<Route, IconName> = { home: 'home', history: 'history', insights: 'chart', settings: 'settings' };

const outlet = $('#outlet');

// ---------- Theme ----------

function applyTheme(theme: Theme): void {
  const root = document.documentElement;
  if (theme === 'system') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', theme);
  const dark = theme === 'dark' || (theme === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
  $('meta[name="theme-color"]').setAttribute('content', dark ? '#0d0d0d' : '#f4f4f1');
}
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => applyTheme(getData().settings.theme));

// ---------- Navigation ----------

function buildNav(): void {
  const link = (r: (typeof ROUTES)[number]) =>
    h('li', null, h('a', { class: 'nav-link', href: r.hash, 'data-route': r.id }, icon(NAV_ICONS[r.id], 22), h('span', null, r.label)));
  const [home, history, insights, settings] = ROUTES;
  $('#nav').replaceChildren(
    h('div', { class: 'brand' },
      h('img', { src: './icon.svg', alt: '', width: 32, height: 32 }),
      h('span', null, 'Capital Tracker')),
    h('div', { class: 'nav-actions' },
      h('button', { class: 'btn btn-primary btn-block', type: 'button', onClick: () => openEntrySheet({ kind: 'purchase' }) }, icon('plus'), 'Log purchase'),
      h('button', { class: 'btn btn-secondary btn-block', type: 'button', onClick: () => openEntrySheet({ kind: 'topup' }) }, icon('wallet'), 'Add money')),
    h('ul', { class: 'nav-links' },
      link(home),
      link(history),
      h('li', { class: 'nav-fab-slot' },
        h('button', { class: 'nav-fab', type: 'button', 'aria-label': 'Log a purchase', onClick: () => openEntrySheet({ kind: 'purchase' }) }, icon('plus', 26))),
      link(insights),
      link(settings)),
  );
}

function markActive(route: Route): void {
  document.querySelectorAll<HTMLAnchorElement>('.nav-link').forEach((a) => {
    if (a.dataset.route === route) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  });
}

// ---------- Rendering ----------

/** Re-renders the current screen, keeping focus (by element id) and the caret where they were. */
function render(): void {
  const active = document.activeElement as HTMLInputElement | null;
  const focusId = active && outlet.contains(active) ? active.id : '';
  const selection = focusId && 'selectionStart' in active! ? [active!.selectionStart, active!.selectionEnd] : null;

  disposeAll();
  const route = currentRoute();
  outlet.replaceChildren(SCREENS[route](getData()));
  markActive(route);

  if (focusId) {
    const el = document.getElementById(focusId) as HTMLInputElement | null;
    el?.focus({ preventScroll: true });
    if (el && selection && selection[0] !== null) {
      try {
        el.setSelectionRange(selection[0], selection[1]);
      } catch {
        /* not a text input */
      }
    }
  }
}

function navigate(): void {
  render();
  window.scrollTo({ top: 0 });
  outlet.focus({ preventScroll: true });
  if (prefersReducedMotion()) return;
  outlet.classList.remove('screen-enter');
  void outlet.offsetWidth; // restart the enter animation
  outlet.classList.add('screen-enter');
}

// ---------- Boot ----------

const result = load();
hydrate(result.data);
applyTheme(result.data.settings.theme);
buildNav();
render();

let warnedSave = false;
subscribe((data) => {
  applyTheme(data.settings.theme);
  render();
  if (lastSaveFailed() && !warnedSave) {
    warnedSave = true;
    toast('Could not save on this device. Storage may be full or blocked.', undefined, 8000);
  }
});
onRouteChange(navigate);
onExternalChange(hydrate);
requestPersistence();

if (!result.ok) {
  toast(
    result.reason === 'unavailable'
      ? 'This browser is blocking storage, so entries will not be saved.'
      : 'Saved data could not be read. A copy was kept; starting fresh.',
    undefined,
    10000,
  );
}

// Keyboard shortcut on desktop: "n" opens a new purchase.
window.addEventListener('keydown', (e) => {
  const t = e.target as HTMLElement;
  if (e.key !== 'n' || e.ctrlKey || e.metaKey || e.altKey || t.closest('input, textarea, select, dialog')) return;
  e.preventDefault();
  openEntrySheet({ kind: 'purchase' });
});

if (import.meta.env.PROD && 'serviceWorker' in navigator && window.isSecureContext) {
  window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));
}
