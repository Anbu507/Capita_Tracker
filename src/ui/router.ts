// Hash router: #/ , #/history , #/insights , #/settings. Back button works and nothing reloads.

export type Route = 'home' | 'history' | 'insights' | 'settings' | 'shop';

export const ROUTES: { id: Route; label: string; hash: string }[] = [
  { id: 'home', label: 'Home', hash: '#/' },
  { id: 'history', label: 'History', hash: '#/history' },
  { id: 'insights', label: 'Insights', hash: '#/insights' },
  { id: 'settings', label: 'Settings', hash: '#/settings' },
  // Full-screen view for the shopkeeper; not in the navigation bar.
  { id: 'shop', label: 'Shop view', hash: '#/shop' },
];

export function currentRoute(): Route {
  const hash = location.hash || '#/';
  return ROUTES.find((r) => r.hash === hash)?.id ?? 'home';
}

export function onRouteChange(cb: (route: Route) => void): void {
  window.addEventListener('hashchange', () => cb(currentRoute()));
}

export function go(route: Route): void {
  const hash = ROUTES.find((r) => r.id === route)!.hash;
  if (location.hash !== hash) location.hash = hash;
}
