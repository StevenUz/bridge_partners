import { homePage } from './pages/home/home.js';
import { lobbyPage } from './pages/lobby/lobby.js';
import { tablePage } from './pages/table/table.js';
import { statisticsPage } from './pages/statistics/statistics.js';

export const routes = [
  homePage,
  lobbyPage,
  tablePage,
  statisticsPage
];

export function matchRoute(pathname) {
  const cleanPath = pathname.endsWith('/') && pathname !== '/' ? pathname.slice(0, -1) : pathname;
  return routes.find((route) => route.path === cleanPath) ?? homePage;
}
