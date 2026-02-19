import template from './home.html?raw';
import './home.css';
import { applyTranslations, languages } from '../../i18n/i18n.js';
import { attemptExclusiveLogin, setLoggedInUserSession } from '../../session/session-manager.js';

export const homePage = {
  path: '/',
  name: 'home',
  render(container, ctx) {
    const host = document.createElement('section');
    host.innerHTML = template;

    const registerForm = host.querySelector('[data-form="register"]');
    const loginForm = host.querySelector('[data-form="login"]');
    
    const signupFormDiv = host.querySelector('#signup-form');
    const signinFormDiv = host.querySelector('#signin-form');
    const showSignupBtn = host.querySelector('#showSignup');
    const showSigninBtn = host.querySelector('#showSignin');

    applyTranslations(host, ctx.language);

    const goLobby = () => ctx.navigate('/lobby');

    // Toggle between forms
    showSignupBtn.addEventListener('click', () => {
      signupFormDiv.classList.remove('d-none');
      signinFormDiv.classList.add('d-none');
      showSignupBtn.classList.add('active');
      showSignupBtn.classList.remove('btn-outline-success');
      showSignupBtn.classList.add('btn-success');
      showSigninBtn.classList.remove('active', 'btn-success');
      showSigninBtn.classList.add('btn-outline-success');
    });

    showSigninBtn.addEventListener('click', () => {
      signinFormDiv.classList.remove('d-none');
      signupFormDiv.classList.add('d-none');
      showSigninBtn.classList.add('active');
      showSigninBtn.classList.remove('btn-outline-success');
      showSigninBtn.classList.add('btn-success');
      showSignupBtn.classList.remove('active', 'btn-success');
      showSignupBtn.classList.add('btn-outline-success');
    });

    // Initialize Sign In button as active by default
    showSigninBtn.classList.add('active', 'btn-success');
    showSigninBtn.classList.remove('btn-outline-success');
    showSignupBtn.classList.add('btn-outline-success');

    // Register Form Handler
    const registerError = registerForm.querySelector('#registerError');
    const showRegisterError = (message) => {
      registerError.textContent = message;
      registerError.classList.remove('d-none');
    };
    const hideRegisterError = () => {
      registerError.classList.add('d-none');
    };

    registerForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      hideRegisterError();

      const displayName = registerForm.querySelector('#displayName').value.trim();
      const email = registerForm.querySelector('#email').value.trim();
      const password = registerForm.querySelector('#password').value;

      if (!displayName || !email || !password) {
        showRegisterError(ctx.t ? ctx.t('registrationRequired') : 'Please fill in all fields');
        return;
      }

      if (!ctx.supabaseClient) {
        showRegisterError('Registration service unavailable');
        return;
      }

      try {
        const { data: existsData, error: existsError } = await ctx.supabaseClient.rpc('check_player_exists', {
          p_username: displayName,
          p_email: email
        });

        if (existsError) throw existsError;

        const exists = existsData && existsData.length > 0 ? existsData[0] : null;
        if (exists?.username_exists && exists?.email_exists) {
          showRegisterError(ctx.t ? ctx.t('usernameAndEmailExist') : 'Username and email already exist');
          return;
        }

        if (exists?.username_exists) {
          showRegisterError(ctx.t ? ctx.t('usernameExistsOnly') : 'Username already exists');
          return;
        }

        if (exists?.email_exists) {
          showRegisterError(ctx.t ? ctx.t('emailExistsOnly') : 'Email already exists');
          return;
        }

        const { data, error } = await ctx.supabaseClient.rpc('register_player', {
          p_username: displayName,
          p_email: email,
          p_display_name: displayName,
          p_password: password
        });

        if (error) throw error;
        if (!data || data.length === 0) {
          showRegisterError(ctx.t ? ctx.t('registrationFailed') : 'Registration failed');
          return;
        }

        const result = data[0];
        if (result.already_exists) {
          showRegisterError(ctx.t ? ctx.t('usernameOrEmailExists') : 'Username or email already exists');
          return;
        }

        const profile = {
          id: result.user_id,
          username: result.username || displayName,
          display_name: result.display_name || displayName
        };

        const sessionResult = await attemptExclusiveLogin({
          supabaseClient: ctx.supabaseClient,
          profileId: profile.id
        });

        if (!sessionResult.ok) {
          showRegisterError(sessionResult.message || (ctx.t ? ctx.t('registrationFailed') : 'Registration failed'));
          return;
        }

        setLoggedInUserSession({ ...profile, session_id: sessionResult.sessionId });

        goLobby();
      } catch (error) {
        showRegisterError(error.message || 'Registration error');
      }
    });

    // Login Form Handler
    const loginError = loginForm.querySelector('#loginError');
    const loginInfo = loginForm.querySelector('#loginInfo');
    const showLoginError = (message) => {
      loginError.textContent = message;
      loginError.classList.remove('d-none');
    };
    const hideLoginError = () => {
      loginError.classList.add('d-none');
    };
    const showLoginInfo = (message) => {
      if (!loginInfo) return;
      loginInfo.textContent = message;
      loginInfo.classList.remove('d-none');
    };
    const hideLoginInfo = () => {
      if (!loginInfo) return;
      loginInfo.classList.add('d-none');
    };

    loginForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      hideLoginError();
      hideLoginInfo();

      const username = loginForm.querySelector('#loginUsername').value.trim();
      const password = loginForm.querySelector('#loginPassword').value;

      if (!username || !password) {
        showLoginError(ctx.t ? ctx.t('loginRequired') : 'Please enter username and password');
        return;
      }

      if (!ctx.supabaseClient) {
        showLoginError('Login service unavailable');
        return;
      }

      try {
        const { data, error } = await ctx.supabaseClient.rpc('authenticate_player', {
          p_username: username,
          p_password: password
        });

        if (error) throw error;
        if (!data || data.length === 0) {
          showLoginError(ctx.t ? ctx.t('invalidCredentials') : 'Invalid username or password');
          return;
        }

        // Successful login
        const profile = data[0];
        const payload = {
          id: profile.user_id,
          username: profile.username,
          display_name: profile.display_name
        };

        const sessionResult = await attemptExclusiveLogin({
          supabaseClient: ctx.supabaseClient,
          profileId: payload.id,
          onWaitStatus: () => {
            showLoginInfo(ctx.t ? ctx.t('loginPleaseWait') : 'Please wait...');
          }
        });

        if (!sessionResult.ok) {
          hideLoginInfo();
          showLoginError(sessionResult.message || (ctx.t ? ctx.t('playerAlreadyIn') : 'Sorry, a player is already in'));
          return;
        }

        setLoggedInUserSession({ ...payload, session_id: sessionResult.sessionId });

        hideLoginInfo();
        goLobby();
      } catch (error) {
        showLoginError(error.message || 'Login error');
      }
    });

    container.append(host);
  }
};
