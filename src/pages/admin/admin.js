import template from './admin.html?raw';
import './admin.css';

function getCurrentUser() {
  try {
    return JSON.parse(sessionStorage.getItem('currentUser') || 'null');
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

    const getAuthHeaders = async () => {
      const { data: { session } } = await ctx.supabaseClient.auth.getSession();
      const token = session?.access_token;
      return token ? { Authorization: `Bearer ${token}` } : {};
    };

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
        const isSelf = currentUser?.id === user.id;

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
              <button class="btn btn-sm btn-warning" data-action="reset-stats">
                <i class="bi bi-arrow-counterclockwise me-1"></i>Reset stats
              </button>
              <button class="btn btn-sm btn-danger" data-action="delete-user" ${isSelf ? 'disabled title="Cannot delete your own account"' : ''}>
                <i class="bi bi-trash me-1"></i>Delete user
              </button>
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
            },
            headers: await getAuthHeaders()
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

        const resetStatsBtn = row.querySelector('[data-action="reset-stats"]');
        resetStatsBtn?.addEventListener('click', async () => {
          hideMessages();
          const confirmed = window.confirm(
            `Reset all statistics for "${user.username}"?\n\nAll scores, game counts and contract results will be zeroed out.`
          );
          if (!confirmed) return;

          const { error: rpcError } = await ctx.supabaseClient.rpc('admin_reset_player_statistics', {
            p_profile_id: user.id
          });

          if (rpcError) {
            showError(rpcError.message || 'Reset failed');
            return;
          }

          showSuccess(`Statistics for "${user.username}" have been reset.`);
        });

        const deleteBtn = row.querySelector('[data-action="delete-user"]');
        deleteBtn?.addEventListener('click', async () => {
          hideMessages();
          const confirmed = window.confirm(
            `Are you sure you want to permanently delete "${user.username}"?\n\nThis will remove all their data including statistics and cannot be undone.`
          );
          if (!confirmed) return;

          const { error: rpcError } = await ctx.supabaseClient.rpc('admin_delete_player', {
            p_profile_id: user.id
          });

          if (rpcError) {
            showError(rpcError.message || 'Delete failed');
            return;
          }

          showSuccess(`User "${user.username}" has been permanently deleted.`);
          await loadUsers();
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
