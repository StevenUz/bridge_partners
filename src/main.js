import 'bootstrap/dist/css/bootstrap.min.css';
import './styles/main.css';

import { applyTranslations, getLanguage, setLanguage, t } from './i18n/i18n.js';
import { createFooter } from './components/footer/footer.js';
import { createHeader } from './components/header/header.js';
import { matchRoute } from './routes.js';
import { routes } from './routes.js';

const app = document.querySelector('#app');

const headerHost = document.createElement('div');
const mainHost = document.createElement('main');
const footerHost = document.createElement('div');

mainHost.classList.add('flex-grow-1');

app.append(headerHost, mainHost, footerHost);

const state = {
  language: getLanguage(),
  currentRoute: matchRoute(window.location.pathname)
};

let cleanupPage = null;

function buildContext() {
  return {
    language: state.language,
    t: (key) => t(state.language, key),
    applyTranslations: (root) => applyTranslations(root, state.language),
    onLanguageChange: handleLanguageChange,
    navigate: (path) => navigate(path)
  };
}

function handleLanguageChange(language) {
  state.language = setLanguage(language);
  renderHeader();
  renderPage({ skipHistory: true });
}

function renderHeader() {
  headerHost.innerHTML = '';
  const header = createHeader({
    currentPath: state.currentRoute.path,
    language: state.language,
    onNavigate: (path) => navigate(path),
    onLanguageChange: handleLanguageChange
  });
  headerHost.append(header);
}

function renderFooter() {
  footerHost.innerHTML = '';
  footerHost.append(createFooter({ t: (key) => t(state.language, key) }));
}

function renderPage({ skipHistory = false } = {}) {
  if (cleanupPage) {
    cleanupPage();
    cleanupPage = null;
  }

  mainHost.innerHTML = '';
  const page = state.currentRoute;
  cleanupPage = page.render(mainHost, buildContext()) || null;

  if (!skipHistory) {
    history.replaceState({}, '', page.path);
  }
}

function navigate(path) {
  const targetRoute = matchRoute(path);
  if (state.currentRoute.path === targetRoute.path) {
    history.pushState({}, '', targetRoute.path);
    renderPage({ skipHistory: true });
    return;
  }

  state.currentRoute = targetRoute;
  history.pushState({}, '', targetRoute.path);
  renderHeader();
  renderPage({ skipHistory: true });
}

window.addEventListener('popstate', () => {
  state.currentRoute = matchRoute(window.location.pathname);
  renderHeader();
  renderPage({ skipHistory: true });
});

// Initial render
renderHeader();
renderPage({ skipHistory: true });
renderFooter();

// Pre-register routes for dev tools reference
console.info('Routes available:', routes.map((route) => route.path).join(', '));
