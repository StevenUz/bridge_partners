import { homePage } from './pages/home/home.js';
import { lobbyPage } from './pages/lobby/lobby.js';
import { tablePage } from './pages/table/table.js';
import { statisticsPage } from './pages/statistics/statistics.js';
import { observerPage } from './pages/observer/observer.js';
import { resourcesPage } from './pages/resources/resources.js';
import { adminPage } from './pages/admin/admin.js';

export const routes = [
  homePage,
  lobbyPage,
  tablePage,
  statisticsPage,
  resourcesPage,
  observerPage,
  adminPage
];

export function matchRoute(path) {
  // Ensure we match only against the pathname, ignoring any query string.
  const url = new URL(path, window.location.origin);
  const pathname = url.pathname;
  const cleanPath = pathname.endsWith('/') && pathname !== '/' ? pathname.slice(0, -1) : pathname;
  return routes.find((route) => route.path === cleanPath) ?? homePage;
}
