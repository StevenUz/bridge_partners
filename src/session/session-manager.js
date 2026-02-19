const INACTIVITY_MS = 15 * 60 * 1000;
const WARNING_MS = 60 * 1000;
const TOUCH_THROTTLE_MS = 10 * 1000;

let supabaseClientRef = null;
let navigateRef = null;
let tRef = (key) => key;

let activeUser = null;
let channel = null;
let initialized = false;

let inactivityTimeout = null;
let warningTimeout = null;
let warningTickInterval = null;
let warningType = null;
let warningExpiresAt = 0;
let modalRoot = null;

let lastTouchAt = 0;

function safeJsonParse(value) {
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function getStoredCurrentUser() {
  const sessionUser = safeJsonParse(sessionStorage.getItem('currentUser'));
  const localUser = safeJsonParse(localStorage.getItem('currentUser'));
  return sessionUser || localUser || null;
}

function persistCurrentUser(user) {
  const payload = JSON.stringify(user);
  localStorage.setItem('currentUser', payload);
  sessionStorage.setItem('currentUser', payload);
}

function clearCurrentUserStorage() {
  localStorage.removeItem('currentUser');
  sessionStorage.removeItem('currentUser');
  localStorage.removeItem('currentPlayer');
  sessionStorage.removeItem('currentPlayer');
  localStorage.removeItem('currentObserver');
  sessionStorage.removeItem('currentObserver');
}

function clearTimers() {
  if (inactivityTimeout) {
    clearTimeout(inactivityTimeout);
    inactivityTimeout = null;
  }
  if (warningTimeout) {
    clearTimeout(warningTimeout);
    warningTimeout = null;
  }
  if (warningTickInterval) {
    clearInterval(warningTickInterval);
    warningTickInterval = null;
  }
}

function removeModal() {
  if (modalRoot) {
    modalRoot.remove();
    modalRoot = null;
  }
  warningType = null;
  warningExpiresAt = 0;
  if (warningTickInterval) {
    clearInterval(warningTickInterval);
    warningTickInterval = null;
  }
  if (warningTimeout) {
    clearTimeout(warningTimeout);
    warningTimeout = null;
  }
}

function getSecondsLeft() {
  return Math.max(0, Math.ceil((warningExpiresAt - Date.now()) / 1000));
}

function updateCountdown() {
  if (!modalRoot) return;
  const countdownNode = modalRoot.querySelector('[data-session-warning-countdown]');
  if (!countdownNode) return;
  countdownNode.textContent = String(getSecondsLeft());
}

function showWarningModal({ title, message, expiresAt, type }) {
  removeModal();

  warningType = type;
  warningExpiresAt = expiresAt;

  modalRoot = document.createElement('div');
  modalRoot.className = 'session-warning-overlay';
  modalRoot.innerHTML = `
    <div class="session-warning-modal" role="dialog" aria-modal="true">
      <div class="session-warning-header">${title}</div>
      <div class="session-warning-body">${message}</div>
      <div class="session-warning-countdown">
        ${tRef('sessionWarningCountdown')}: <strong data-session-warning-countdown>${getSecondsLeft()}</strong>
      </div>
      <div class="session-warning-actions">
        <button type="button" class="btn btn-primary btn-sm" data-session-warning-continue>${tRef('sessionStillHere')}</button>
      </div>
    </div>
  `;

  const continueBtn = modalRoot.querySelector('[data-session-warning-continue]');
  if (continueBtn) {
    continueBtn.addEventListener('click', () => {
      handleUserActivity();
    });
  }

  document.body.appendChild(modalRoot);

  warningTickInterval = setInterval(updateCountdown, 1000);
  warningTimeout = setTimeout(() => {
    logoutCurrentUser(type === 'takeover' ? tRef('sessionTakeoverLogoutReason') : tRef('sessionInactiveLogoutReason'));
  }, Math.max(0, warningExpiresAt - Date.now()));
}

function scheduleInactivityWarning() {
  if (!activeUser) return;
  if (warningType === 'takeover') return;

  if (inactivityTimeout) {
    clearTimeout(inactivityTimeout);
  }

  inactivityTimeout = setTimeout(() => {
    showWarningModal({
      title: tRef('sessionInactiveWarningTitle'),
      message: tRef('sessionInactiveWarningMessage'),
      expiresAt: Date.now() + WARNING_MS,
      type: 'inactive'
    });
  }, INACTIVITY_MS);
}

async function touchSession(force = false) {
  if (!activeUser?.id || !activeUser?.session_id || !supabaseClientRef) return;

  const now = Date.now();
  if (!force && now - lastTouchAt < TOUCH_THROTTLE_MS) return;
  lastTouchAt = now;

  try {
    const { data, error } = await supabaseClientRef.rpc('touch_player_session_activity', {
      p_profile_id: activeUser.id,
      p_session_id: activeUser.session_id
    });

    if (error) {
      console.warn('touch_player_session_activity failed', error);
      return;
    }

    if (data === 'replaced') {
      await logoutCurrentUser(tRef('sessionReplacedReason'));
    }
  } catch (err) {
    console.warn('touch session error', err);
  }
}

function handleRealtimeSessionUpdate(payload) {
  if (!activeUser) return;
  const row = payload?.new;
  if (!row) return;

  if (row.session_id && activeUser.session_id && row.session_id !== activeUser.session_id) {
    logoutCurrentUser(tRef('sessionReplacedReason'));
    return;
  }

  const hasTakeoverWarning =
    row.session_id === activeUser.session_id &&
    !!row.waiting_session_id &&
    !!row.warning_until &&
    new Date(row.warning_until).getTime() > Date.now();

  if (hasTakeoverWarning) {
    showWarningModal({
      title: tRef('sessionTakeoverWarningTitle'),
      message: tRef('sessionTakeoverWarningMessage'),
      expiresAt: new Date(row.warning_until).getTime(),
      type: 'takeover'
    });
    return;
  }

  if (warningType === 'takeover') {
    removeModal();
    scheduleInactivityWarning();
  }
}

async function subscribeToSessionRow() {
  if (!supabaseClientRef || !activeUser?.id) return;

  if (channel) {
    supabaseClientRef.removeChannel(channel);
    channel = null;
  }

  channel = supabaseClientRef
    .channel(`player-session-${activeUser.id}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'player_sessions',
        filter: `profile_id=eq.${activeUser.id}`
      },
      handleRealtimeSessionUpdate
    )
    .subscribe();
}

async function handleUserActivity() {
  if (!activeUser) return;

  if (warningType) {
    removeModal();
  }

  scheduleInactivityWarning();
  await touchSession(true);
}

function registerGlobalActivityListeners() {
  const events = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'click'];
  events.forEach((eventName) => {
    window.addEventListener(eventName, handleUserActivity, { passive: true });
  });
}

export async function attemptExclusiveLogin({ supabaseClient, profileId, onWaitStatus }) {
  const sessionId = crypto.randomUUID();

  const { data, error } = await supabaseClient.rpc('begin_player_session', {
    p_profile_id: profileId,
    p_session_id: sessionId,
    p_wait_seconds: 60
  });

  if (error) {
    return { ok: false, message: error.message || 'Login session error' };
  }

  const row = Array.isArray(data) ? data[0] : null;
  const status = row?.status;

  if (status === 'granted') {
    return { ok: true, sessionId };
  }

  if (status !== 'wait') {
    return { ok: false, message: 'Login session error' };
  }

  if (typeof onWaitStatus === 'function') {
    onWaitStatus('wait');
  }

  const deadline = Date.now() + WARNING_MS + 5000;
  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 3000));

    const result = await supabaseClient.rpc('resolve_player_login_attempt', {
      p_profile_id: profileId,
      p_waiting_session_id: sessionId
    });

    if (result.error) {
      return { ok: false, message: result.error.message || 'Login resolve error' };
    }

    const currentState = result.data;
    if (currentState === 'granted') {
      return { ok: true, sessionId };
    }

    if (currentState === 'denied') {
      return { ok: false, message: 'Sorry, a player is already in' };
    }
  }

  return { ok: false, message: 'Sorry, a player is already in' };
}

export function setLoggedInUserSession(user) {
  activeUser = user;
  persistCurrentUser(user);
  subscribeToSessionRow();
  scheduleInactivityWarning();
  touchSession(true);
}

export async function logoutCurrentUser() {
  const userToClose = activeUser || getStoredCurrentUser();

  if (userToClose?.id && supabaseClientRef) {
    try {
      await supabaseClientRef.rpc('cleanup_player_logout', {
        p_profile_id: userToClose.id
      });
    } catch (err) {
      console.warn('cleanup_player_logout failed', err);
    }
  }

  if (userToClose?.id && userToClose?.session_id && supabaseClientRef) {
    try {
      await supabaseClientRef.rpc('end_player_session', {
        p_profile_id: userToClose.id,
        p_session_id: userToClose.session_id
      });
    } catch (err) {
      console.warn('end_player_session failed', err);
    }
  }

  clearTimers();
  removeModal();

  if (channel && supabaseClientRef) {
    supabaseClientRef.removeChannel(channel);
    channel = null;
  }

  activeUser = null;
  clearCurrentUserStorage();

  if (supabaseClientRef?.auth) {
    try {
      await supabaseClientRef.auth.signOut();
    } catch (err) {
      console.warn('supabase auth signOut failed', err);
    }
  }

  if (navigateRef) {
    navigateRef('/');
  }
}

export function initSessionManager({ supabaseClient, navigate, t }) {
  supabaseClientRef = supabaseClient;
  navigateRef = navigate;
  tRef = t;

  if (!initialized) {
    registerGlobalActivityListeners();
    initialized = true;
  }

  const stored = getStoredCurrentUser();
  if (stored?.id && stored?.session_id) {
    activeUser = stored;
    subscribeToSessionRow();
    scheduleInactivityWarning();
  }

  if (!stored?.id && supabaseClientRef?.auth) {
    supabaseClientRef.auth.getUser().then(async ({ data, error }) => {
      if (error || !data?.user || !supabaseClientRef) return;

      const fallbackName =
        data.user.user_metadata?.username
        || data.user.user_metadata?.display_name
        || (data.user.email ? data.user.email.split('@')[0] : null)
        || `player_${data.user.id.slice(0, 8)}`;

      const { data: profileData, error: profileError } = await supabaseClientRef.rpc('upsert_current_profile', {
        p_username: fallbackName,
        p_display_name: fallbackName
      });

      if (profileError) return;

      const profile = Array.isArray(profileData) ? profileData[0] : null;
      if (!profile?.profile_id) return;

      persistCurrentUser({
        id: profile.profile_id,
        username: profile.username,
        display_name: profile.display_name
      });
    }).catch(() => {
      // no-op
    });
  }
}
