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

const PROTECTED_ROUTES = new Set(['/lobby', '/table', '/observer']);
const ADMIN_ROUTES = new Set(['/admin']);

let cleanupPage = null;

function isProtectedRoute(path) {
  return PROTECTED_ROUTES.has(path);
}

async function hasValidAuthSession() {
  if (!supabaseClient?.auth) return false;

  const { data, error } = await supabaseClient.auth.getSession();
  if (error) {
    console.warn('Auth session check failed:', error);
    return false;
  }

  return !!data?.session;
}

function getStoredCurrentUser() {
  try {
    // sessionStorage only – window-scoped to prevent cross-window identity leakage.
    return JSON.parse(sessionStorage.getItem('currentUser') || 'null');
  } catch {
    return null;
  }
}

async function getCurrentUserRole() {
  const stored = getStoredCurrentUser();
  if (stored?.role) {
    return stored.role;
  }

  if (!supabaseClient?.auth) {
    return null;
  }

  const { data: authData, error: authError } = await supabaseClient.auth.getUser();
  if (authError || !authData?.user) {
    return null;
  }

  const fallbackName =
    authData.user.user_metadata?.username
    || authData.user.user_metadata?.display_name
    || (authData.user.email ? authData.user.email.split('@')[0] : null)
    || `player_${authData.user.id.slice(0, 8)}`;

  const { data: profileData, error: profileError } = await supabaseClient.rpc('upsert_current_profile', {
    p_username: fallbackName,
    p_display_name: fallbackName
  });

  if (profileError) {
    return null;
  }

  const profile = Array.isArray(profileData) ? profileData[0] : null;
  if (!profile?.profile_id) {
    return null;
  }

  const merged = {
    ...(stored || {}),
    id: profile.profile_id,
    username: profile.username,
    display_name: profile.display_name,
    role: profile.role
  };

  // sessionStorage only – window-scoped so each browser window keeps its own user.
  sessionStorage.setItem('currentUser', JSON.stringify(merged));

  return profile.role || null;
}

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
  if (isProtectedRoute(state.currentRoute.path)) {
    const authenticated = await hasValidAuthSession();
    if (!authenticated) {
      state.currentRoute = matchRoute('/');
      renderHeader();
      history.replaceState({}, '', '/');
    } else {
      const role = await getCurrentUserRole();
      if (role !== 'authorized' && role !== 'admin') {
        state.currentRoute = matchRoute('/resources');
        renderHeader();
        history.replaceState({}, '', '/resources');
      }
    }
  }

  if (ADMIN_ROUTES.has(state.currentRoute.path)) {
    const role = await getCurrentUserRole();
    if (role !== 'admin') {
      const fallback = role === 'authorized' ? '/lobby' : '/resources';
      state.currentRoute = matchRoute(fallback);
      renderHeader();
      history.replaceState({}, '', fallback);
    }
  }

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

async function navigate(path) {
  console.log('Navigate called with path:', path);
  let targetPath = path;
  let targetRoute = matchRoute(path);

  if (isProtectedRoute(targetRoute.path)) {
    const authenticated = await hasValidAuthSession();
    if (!authenticated) {
      targetPath = '/';
      targetRoute = matchRoute('/');
    } else {
      const role = await getCurrentUserRole();
      if (role !== 'authorized' && role !== 'admin') {
        targetPath = '/resources';
        targetRoute = matchRoute('/resources');
      }
    }
  }

  if (ADMIN_ROUTES.has(targetRoute.path)) {
    const role = await getCurrentUserRole();
    if (role !== 'admin') {
      const fallback = role === 'authorized' ? '/lobby' : '/resources';
      targetPath = fallback;
      targetRoute = matchRoute(fallback);
    }
  }

  console.log('Target route:', targetRoute);
  
  if (state.currentRoute.path === targetRoute.path) {
    history.pushState({}, '', targetPath);
    renderPage({ skipHistory: true });
    return;
  }

  state.currentRoute = targetRoute;
  history.pushState({}, '', targetPath);
  renderHeader();
  renderPage({ skipHistory: true });
}

window.addEventListener('popstate', async () => {
  const fullPath = window.location.pathname + window.location.search;
  const targetRoute = matchRoute(fullPath);
  if (isProtectedRoute(targetRoute.path)) {
    const authenticated = await hasValidAuthSession();
    if (!authenticated) {
      state.currentRoute = matchRoute('/');
      history.replaceState({}, '', '/');
    } else {
      const role = await getCurrentUserRole();
      if (role !== 'authorized' && role !== 'admin') {
        state.currentRoute = matchRoute('/resources');
        history.replaceState({}, '', '/resources');
      } else {
        state.currentRoute = targetRoute;
      }
    }
  } else {
    if (ADMIN_ROUTES.has(targetRoute.path)) {
      const role = await getCurrentUserRole();
      if (role !== 'admin') {
        const fallback = role === 'authorized' ? '/lobby' : '/resources';
        state.currentRoute = matchRoute(fallback);
        history.replaceState({}, '', fallback);
      } else {
        state.currentRoute = targetRoute;
      }
    } else {
      state.currentRoute = targetRoute;
    }
  }

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
