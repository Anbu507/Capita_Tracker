// Hash router: #/ , #/history , #/insights , #/settings, and the shop's page at #/s/<id>.
// Back button works and nothing reloads.

export type NavRoute = 'home' | 'history' | 'insights' | 'settings';
export type Route = NavRoute | 'shopPage';

const SHOP_PAGE = /^#\/s\/([A-Za-z0-9_-]{16,64})$/;

export const ROUTES: { id: NavRoute; label: string; hash: string }[] = [
  { id: 'home', label: 'Home', hash: '#/' },
  { id: 'history', label: 'History', hash: '#/history' },
  { id: 'insights', label: 'Charts', hash: '#/insights' },
  { id: 'settings', label: 'Settings', hash: '#/settings' },
];

export function currentRoute(): Route {
  const hash = location.hash || '#/';
  if (SHOP_PAGE.test(hash)) return 'shopPage';
  return ROUTES.find((r) => r.hash === hash)?.id ?? 'home';
}

/** The id in #/s/<id>, when the shop's page is open. */
export function shopPageId(): string | null {
  return SHOP_PAGE.exec(location.hash)?.[1] ?? null;
}

export function onRouteChange(cb: (route: Route) => void): void {
  window.addEventListener('hashchange', () => cb(currentRoute()));
}

export function go(route: NavRoute): void {
  const hash = ROUTES.find((r) => r.id === route)!.hash;
  if (location.hash !== hash) location.hash = hash;
}
