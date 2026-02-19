import 'bootstrap/dist/css/bootstrap.min.css';
import './styles/main.css';

import { applyTranslations, getLanguage, setLanguage, t } from './i18n/i18n.js';
import { supabaseClient } from './supabase.js';
import { createFooter } from './components/footer/footer.js';
import { createHeader } from './components/header/header.js';
import { matchRoute } from './routes.js';
import { routes } from './routes.js';
import { initSessionManager } from './session/session-manager.js';

const app = document.querySelector('#app');

const headerHost = document.createElement('div');
const mainHost = document.createElement('main');
const footerHost = document.createElement('div');

mainHost.classList.add('flex-grow-1');

app.append(headerHost, mainHost, footerHost);

const state = {
  language: getLanguage(),
  currentRoute: matchRoute(window.location.pathname + window.location.search)
};

let cleanupPage = null;

function buildContext() {
  return {
    language: state.language,
    t: (key) => t(state.language, key),
    applyTranslations: (root) => applyTranslations(root, state.language),
    onLanguageChange: handleLanguageChange,
    navigate: (path) => navigate(path),
    supabaseClient: supabaseClient
  };
}

function handleLanguageChange(language) {
  state.language = setLanguage(language);
  renderHeader();
  
  // For table view, only apply translations without re-rendering
  if (state.currentRoute.path === '/table' || state.currentRoute.path === '/observer') {
    const ctx = buildContext();
    applyTranslations(mainHost, state.language);
    
    // Update any dynamic text that uses t()
    mainHost.querySelectorAll('[data-dynamic-text]').forEach(el => {
      const key = el.getAttribute('data-dynamic-text');
      if (key) el.textContent = ctx.t(key);
    });
  } else {
    renderPage({ skipHistory: true });
  }
}

function renderHeader() {
  headerHost.innerHTML = '';
  const header = createHeader({
    currentPath: state.currentRoute.path,
    language: state.language,
    onNavigate: (path) => navigate(path),
    onLanguageChange: handleLanguageChange,
    supabaseClient: supabaseClient
  });
  headerHost.append(header);
  
  // Setup fullscreen button after header is rendered
  setTimeout(() => setupFullscreenButton(), 0);
}

function setupFullscreenButton() {
  const fullscreenBtn = document.querySelector('[data-fullscreen-toggle]');
  if (!fullscreenBtn) return;
  
  const updateIcon = () => {
    const icon = fullscreenBtn.querySelector('i');
    if (!icon) return;
    
    if (document.fullscreenElement) {
      icon.className = 'bi bi-fullscreen-exit';
      fullscreenBtn.title = 'Exit fullscreen';
    } else {
      icon.className = 'bi bi-fullscreen';
      fullscreenBtn.title = 'Enter fullscreen';
    }
  };
  
  // Remove old listener if exists
  if (fullscreenBtn._clickHandler) {
    fullscreenBtn.removeEventListener('click', fullscreenBtn._clickHandler);
  }
  
  // Add new listener
  fullscreenBtn._clickHandler = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen();
      } else {
        await document.exitFullscreen();
      }
      updateIcon();
    } catch (err) {
      console.error('Error toggling fullscreen:', err);
    }
  };
  
  fullscreenBtn.addEventListener('click', fullscreenBtn._clickHandler);
  updateIcon();
}

function renderFooter() {
  footerHost.innerHTML = '';
  footerHost.append(createFooter({ t: (key) => t(state.language, key) }));
}

async function renderPage({ skipHistory = false } = {}) {
  if (cleanupPage) {
    cleanupPage();
    cleanupPage = null;
  }

  mainHost.innerHTML = '';
  const page = state.currentRoute;
  cleanupPage = await page.render(mainHost, buildContext()) || null;

  if (!skipHistory) {
    history.replaceState({}, '', page.path);
  }
}

function navigate(path) {
  console.log('Navigate called with path:', path);
  const targetRoute = matchRoute(path);
  console.log('Target route:', targetRoute);
  
  if (state.currentRoute.path === targetRoute.path) {
    history.pushState({}, '', path);
    renderPage({ skipHistory: true });
    return;
  }

  state.currentRoute = targetRoute;
  history.pushState({}, '', path);
  renderHeader();
  renderPage({ skipHistory: true });
}

window.addEventListener('popstate', () => {
  const fullPath = window.location.pathname + window.location.search;
  state.currentRoute = matchRoute(fullPath);
  renderHeader();
  renderPage({ skipHistory: true });
});

// Initial render
try {
  initSessionManager({
    supabaseClient,
    navigate: (path) => navigate(path),
    t: (key) => t(state.language, key)
  });

  renderHeader();
  renderPage({ skipHistory: true });
  renderFooter();
  console.info('App initialized successfully');
  
  // Global fullscreen change handler (for F11 key)
  document.addEventListener('fullscreenchange', () => {
    setupFullscreenButton();
  });
} catch (error) {
  console.error('Failed to initialize app:', error);
  app.innerHTML = '<div style="padding: 20px; background: red; color: white;">Error loading app: ' + error.message + '</div>';
}

// Pre-register routes for dev tools reference
console.info('Routes available:', routes.map((route) => route.path).join(', '));
