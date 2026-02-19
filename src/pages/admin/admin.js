import template from './admin.html?raw';
import './admin.css';

function getCurrentUser() {
  try {
    const sessionUser = sessionStorage.getItem('currentUser');
    const localUser = localStorage.getItem('currentUser');
    return JSON.parse(sessionUser || localUser || 'null');
  } catch {
    return null;
  }
}

export const adminPage = {
  path: '/admin',
  name: 'admin',
  async render(container, ctx) {
    const host = document.createElement('section');
    host.innerHTML = template;

    const errorBox = host.querySelector('[data-admin-error]');
    const successBox = host.querySelector('[data-admin-success]');
    const usersBody = host.querySelector('[data-admin-users]');
    const refreshBtn = host.querySelector('[data-admin-refresh]');

    const showError = (message) => {
      successBox.classList.add('d-none');
      errorBox.textContent = message;
      errorBox.classList.remove('d-none');
    };

    const showSuccess = (message) => {
      errorBox.classList.add('d-none');
      successBox.textContent = message;
      successBox.classList.remove('d-none');
    };

    const hideMessages = () => {
      errorBox.classList.add('d-none');
      successBox.classList.add('d-none');
    };

    const currentUser = getCurrentUser();
    if (!currentUser || currentUser.role !== 'admin') {
      ctx.navigate('/lobby');
      return;
    }

    const loadUsers = async () => {
      hideMessages();

      const { data, error } = await ctx.supabaseClient
        .from('profiles')
        .select('id, username, display_name, email, role')
        .order('username', { ascending: true });

      if (error) {
        showError(error.message || 'Failed to load users');
        return;
      }

      usersBody.innerHTML = '';

      (data || []).forEach((user) => {
        const row = document.createElement('tr');
        const canAuthorize = user.role === 'unauthorized';

        row.innerHTML = `
          <td>${user.username || ''}</td>
          <td>${user.display_name || ''}</td>
          <td>${user.email || ''}</td>
          <td><span class="badge bg-secondary">${user.role}</span></td>
          <td>
            <div class="d-flex flex-column gap-2">
              <button class="btn btn-sm btn-success" data-action="authorize" ${canAuthorize ? '' : 'disabled'}>
                Authorize user
              </button>
              <div class="password-inline">
                <input type="password" class="form-control form-control-sm" minlength="6" placeholder="New password" data-action="password" />
                <button class="btn btn-sm btn-primary" data-action="set-password">Set password</button>
              </div>
            </div>
          </td>
        `;

        const authorizeBtn = row.querySelector('[data-action="authorize"]');
        authorizeBtn?.addEventListener('click', async () => {
          hideMessages();
          const { data: result, error: rpcError } = await ctx.supabaseClient.rpc('authorize_player', {
            p_target_profile_id: user.id
          });

          if (rpcError) {
            showError(rpcError.message || 'Failed to authorize user');
            return;
          }

          const updated = Array.isArray(result) ? result[0] : null;
          showSuccess(`User ${updated?.username || user.username} is now ${updated?.role || 'authorized'}.`);
          await loadUsers();
        });

        const passwordInput = row.querySelector('[data-action="password"]');
        const setPasswordBtn = row.querySelector('[data-action="set-password"]');

        setPasswordBtn?.addEventListener('click', async () => {
          hideMessages();
          const newPassword = passwordInput.value || '';

          if (newPassword.length < 6) {
            showError('Password must be at least 6 characters.');
            return;
          }

          const { data: fnData, error: fnError } = await ctx.supabaseClient.functions.invoke('admin-user-management', {
            body: {
              action: 'change_password',
              profile_id: user.id,
              new_password: newPassword
            }
          });

          if (fnError) {
            showError(fnError.message || 'Password change failed');
            return;
          }

          if (!fnData?.ok) {
            showError(fnData?.error || 'Password change failed');
            return;
          }

          passwordInput.value = '';
          showSuccess(`Password updated for ${user.username}.`);
        });

        usersBody.append(row);
      });
    };

    refreshBtn.addEventListener('click', () => {
      loadUsers();
    });

    await loadUsers();
    container.append(host);
  }
};
