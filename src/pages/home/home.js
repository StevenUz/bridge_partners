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

    const goLobby = () => ctx.navigate('/resources');

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
        const { data: existingUsername } = await ctx.supabaseClient
          .from('profiles')
          .select('id')
          .ilike('username', displayName)
          .limit(1);

        if (existingUsername && existingUsername.length > 0) {
          showRegisterError(ctx.t ? ctx.t('usernameExistsOnly') : 'Username already exists');
          return;
        }

        const { data: signUpData, error: signUpError } = await ctx.supabaseClient.auth.signUp({
          email,
          password,
          options: {
            data: {
              username: displayName,
              display_name: displayName
            }
          }
        });

        if (signUpError) throw signUpError;

        if (!signUpData?.session) {
          showRegisterError(ctx.t ? ctx.t('registrationFailed') : 'Registration requires email confirmation before login');
          return;
        }

        const { data: profileData, error: profileError } = await ctx.supabaseClient
          .rpc('upsert_current_profile', {
            p_username: displayName,
            p_display_name: displayName
          });

        if (profileError) throw profileError;

        const profile = Array.isArray(profileData) ? profileData[0] : null;
        if (!profile?.profile_id) {
          showRegisterError(ctx.t ? ctx.t('registrationFailed') : 'Registration failed');
          return;
        }

        const sessionResult = await attemptExclusiveLogin({
          supabaseClient: ctx.supabaseClient,
          profileId: profile.profile_id
        });

        if (!sessionResult.ok) {
          showRegisterError(sessionResult.message || (ctx.t ? ctx.t('registrationFailed') : 'Registration failed'));
          return;
        }

        await ctx.supabaseClient.rpc('cleanup_player_logout', {
          p_profile_id: profile.profile_id
        });

        setLoggedInUserSession({
          id: profile.profile_id,
          username: profile.username || displayName,
          display_name: profile.display_name || displayName,
          role: profile.role,
          session_id: sessionResult.sessionId
        });

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
        let email = username;
        let legacyUser = null;

        if (!username.includes('@')) {
          const { data: legacyData, error: legacyError } = await ctx.supabaseClient.rpc('legacy_authenticate_player', {
            p_username: username,
            p_password: password
          });

          if (legacyError) throw legacyError;

          legacyUser = Array.isArray(legacyData) ? legacyData[0] : null;
          if (legacyUser?.email) {
            email = legacyUser.email;
          } else {
            const { data: profileByName, error: profileByNameError } = await ctx.supabaseClient
              .from('profiles')
              .select('email')
              .ilike('username', username)
              .limit(1)
              .maybeSingle();

            if (profileByNameError) throw profileByNameError;
            email = profileByName?.email || '';
          }
        }

        if (!email) {
          showLoginError(ctx.t ? ctx.t('invalidCredentials') : 'Invalid username or password');
          return;
        }

        let { error: signInError } = await ctx.supabaseClient.auth.signInWithPassword({
          email,
          password
        });

        if (signInError && legacyUser && !legacyUser.has_auth_user) {
          const { error: signUpError } = await ctx.supabaseClient.auth.signUp({
            email,
            password,
            options: {
              data: {
                username: legacyUser.username || username,
                display_name: legacyUser.display_name || legacyUser.username || username
              }
            }
          });

          if (signUpError && !String(signUpError.message || '').toLowerCase().includes('already registered')) {
            throw signUpError;
          }

          const retry = await ctx.supabaseClient.auth.signInWithPassword({ email, password });
          signInError = retry.error;
        }

        if (signInError) {
          showLoginError(ctx.t ? ctx.t('invalidCredentials') : 'Invalid username or password');
          return;
        }

        const { data: profileData, error: profileError } = await ctx.supabaseClient
          .rpc('upsert_current_profile', {
            p_username: username,
            p_display_name: username
          });

        if (profileError) throw profileError;

        const profile = Array.isArray(profileData) ? profileData[0] : null;
        if (!profile?.profile_id) {
          showLoginError(ctx.t ? ctx.t('invalidCredentials') : 'Invalid username or password');
          return;
        }

        const payload = {
          id: profile.profile_id,
          username: profile.username,
          display_name: profile.display_name,
          role: profile.role
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

        await ctx.supabaseClient.rpc('cleanup_player_logout', {
          p_profile_id: payload.id
        });

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
