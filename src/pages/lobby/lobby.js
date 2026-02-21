import template from './lobby.html?raw';
import './lobby.css';
import { applyTranslations, languages } from '../../i18n/i18n.js';

// Simple in-memory chat for the lobby
const lobbyChatMessages = [];
let seedingInProgress = false;

export const lobbyPage = {
  path: '/lobby',
  name: 'lobby',
  async render(container, ctx) {
    resetLocalState();
    const host = document.createElement('section');
    host.innerHTML = template;

    const grid = host.querySelector('[data-table-grid]');
    const createBtn = host.querySelector('[data-action="create-table"]');

    applyTranslations(host, ctx.language);

    if (!ctx.supabaseClient) {
      createBtn.setAttribute('disabled', 'disabled');
    }

    createBtn.addEventListener('click', async () => {
      const rooms = await fetchRooms(ctx);
      if (rooms.length >= 5) {
        showLimitMessage(ctx);
      } else {
        alert('Table creation is stubbed for now.');
      }
    });

    function showLimitMessage(ctx) {
      const modal = document.createElement('div');
      modal.className = 'limit-modal-overlay';
      modal.innerHTML = `
        <div class="limit-modal">
          <div class="limit-modal-header">
            <i class="bi bi-exclamation-triangle-fill text-warning me-2"></i>
            <h5 class="mb-0">${ctx.t('lobbyLimitReached')}</h5>
          </div>
          <div class="limit-modal-body">
            <p>${ctx.t('lobbyLimitMessage')}</p>
          </div>
          <div class="limit-modal-footer">
            <button class="btn btn-primary" data-close-modal>
              <i class="bi bi-check-lg me-1"></i>${ctx.t('ctaRegister').includes('Register') ? 'OK' : 'Добре'}
            </button>
          </div>
        </div>
      `;
      
      host.appendChild(modal);
      
      const closeBtn = modal.querySelector('[data-close-modal]');
      closeBtn.addEventListener('click', () => modal.remove());
      modal.addEventListener('click', (e) => {
        if (e.target === modal) modal.remove();
      });
    }

    const rooms = await fetchRooms(ctx);
    renderRooms(grid, rooms, ctx);

    // Render lobby chat panel
    const chatPanel = document.createElement('div');
    chatPanel.className = 'chat-panel mt-4';
    chatPanel.innerHTML = `
      <div class="chat-header">
        <i class="bi bi-chat-dots me-2"></i><span data-i18n="chatLobby"></span>
      </div>
      <div class="chat-body" data-chat-body></div>
      <div class="chat-input d-flex gap-2">
        <input type="text" class="form-control form-control-sm" data-chat-input maxlength="50" placeholder="${ctx.t('chatPlaceholder')}">
        <button class="btn btn-primary btn-sm" data-chat-send>${ctx.t('chatSend')}</button>
      </div>
    `;

    const chatBody = chatPanel.querySelector('[data-chat-body]');
    const chatInput = chatPanel.querySelector('[data-chat-input]');
    const chatSend = chatPanel.querySelector('[data-chat-send]');

    function renderChat() {
      const lastMessages = lobbyChatMessages.slice(-15);
      chatBody.innerHTML = lastMessages
        .map((msg) => `<div class="chat-message"><strong>${msg.author}:</strong> ${msg.text}</div>`)
        .join('');
      chatBody.scrollTop = chatBody.scrollHeight;
    }

    function addMessage(text) {
      if (!text) return;
      lobbyChatMessages.push({ author: 'You', text });
      if (lobbyChatMessages.length > 15) lobbyChatMessages.shift();
      renderChat();
    }

    chatSend.addEventListener('click', () => {
      const value = chatInput.value.trim().slice(0, 50);
      if (!value) return;
      addMessage(value);
      chatInput.value = '';
    });

    chatInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        chatSend.click();
      }
    });

    renderChat();
    applyTranslations(chatPanel, ctx.language);

    const chatRow = document.createElement('div');
    chatRow.className = 'row g-3 chat-row';
    const chatCol = document.createElement('div');
    chatCol.className = 'col-12 col-md-12 col-lg-12';
    chatCol.append(chatPanel);
    chatRow.append(chatCol);

    const innerContainer = host.querySelector('.container');
    innerContainer.append(chatRow);

    container.append(host);

    if (ctx.supabaseClient) {
      const channel = ctx.supabaseClient
        .channel('lobby-sync')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'room_seats' }, async () => {
          const fresh = await fetchRooms(ctx);
          renderRooms(grid, fresh, ctx);
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'room_members' }, async () => {
          const fresh = await fetchRooms(ctx);
          renderRooms(grid, fresh, ctx);
        })
        .subscribe();

      // Fallback: refresh when tab becomes visible (catches missed realtime events)
      const onVisibilityChange = async () => {
        if (document.visibilityState === 'visible') {
          const fresh = await fetchRooms(ctx);
          renderRooms(grid, fresh, ctx);
        }
      };
      document.addEventListener('visibilitychange', onVisibilityChange);

      // Fallback: periodic refresh every 30s
      const pollInterval = setInterval(async () => {
        const fresh = await fetchRooms(ctx);
        renderRooms(grid, fresh, ctx);
      }, 30000);

      return () => {
        ctx.supabaseClient.removeChannel(channel);
        document.removeEventListener('visibilitychange', onVisibilityChange);
        clearInterval(pollInterval);
      };
    }
  }
};

function resetLocalState() {
  try {
    const keysToRemove = [];
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);
      if (!key) continue;
      if (
        key.startsWith('tableReadyState:') ||
        key.startsWith('tableVulnerability:') ||
        key.startsWith('tableDealState:') ||
        key.startsWith('tableBiddingState:')
      ) {
        keysToRemove.push(key);
      }
    }

    keysToRemove.forEach((key) => localStorage.removeItem(key));
  } catch (err) {
    console.warn('Failed to reset local lobby state', err);
  }
}

async function fetchRooms(ctx) {
  if (!ctx.supabaseClient) return [];

  let { data: rooms, error } = await ctx.supabaseClient
    .from('rooms')
    .select('id, name')
    .order('created_at', { ascending: true });

  if (error) {
    console.error('Failed to fetch rooms', error);
    return [];
  }

  if (!rooms || rooms.length === 0) {
    if (seedingInProgress) return [];
    seedingInProgress = true;

    try {
      const currentProfile = await getCurrentProfile(ctx);
      if (!currentProfile?.id) {
        seedingInProgress = false;
        return [];
      }

      const seed = [
        { name: 'Table 1', created_by: currentProfile.id },
        { name: 'Table 2', created_by: currentProfile.id },
        { name: 'Table 3', created_by: currentProfile.id }
      ];

      const { error: seedError } = await ctx.supabaseClient.from('rooms').insert(seed);
      if (seedError) {
        console.error('Failed to seed rooms', seedError);
        seedingInProgress = false;
        return [];
      }

      const refreshed = await ctx.supabaseClient
        .from('rooms')
        .select('id, name')
        .order('created_at', { ascending: true });
      rooms = refreshed.data || [];
    } finally {
      seedingInProgress = false;
    }
  }

  const roomIds = rooms.map((r) => r.id);

  const { data: seats } = await ctx.supabaseClient
    .from('room_seats')
    .select('room_id, seat_position, profile:profiles(id, username, display_name)')
    .in('room_id', roomIds);

  const { data: members } = await ctx.supabaseClient
    .from('room_members')
    .select('room_id, role, profile:profiles(id, username, display_name)')
    .eq('role', 'spectator')
    .in('room_id', roomIds);

  return rooms.map((room, idx) => {
    const seatsForRoom = (seats || []).filter((s) => s.room_id === room.id);
    const observersForRoom = (members || []).filter((m) => m.room_id === room.id);

    const seatsMap = { north: null, south: null, east: null, west: null };
    seatsForRoom.forEach((seat) => {
      seatsMap[seat.seat_position] = getProfileLabel(seat.profile);
    });

    return {
      id: room.id,
      label: room.name || `${ctx.t('table')} ${idx + 1}`,
      seats: seatsMap,
      observers: observersForRoom
        .map((m) => getProfileLabel(m.profile))
        .filter(Boolean)
    };
  });
}

function renderRooms(grid, rooms, ctx) {
  if (!grid) return;
  grid.innerHTML = '';
  rooms.forEach((table) => {
    const col = document.createElement('div');
    col.className = 'col-12 col-md-6 col-lg-4';

    const players = Object.values(table.seats).filter(Boolean).length;
    const hasObservers = table.observers.length > 0;
    const observerNames = table.observers.join(', ');
    const observerIconClass = hasObservers ? 'bi-eye-fill text-warning' : 'bi-eye text-muted';
    const observerTooltip = hasObservers ? `data-tooltip="${ctx.t('tableObservers')}: ${observerNames}"` : '';

    const getSeatDisplay = (position) => {
      const player = table.seats[position];
      const fullLabel = ctx.t(`seat${position.charAt(0).toUpperCase()}${position.slice(1)}`);
      const playerName = player ? player : ctx.t('seatOpen');
      return { fullLabel, playerName, isEmpty: !player };
    };

    const north = getSeatDisplay('north');
    const south = getSeatDisplay('south');
    const west = getSeatDisplay('west');
    const east = getSeatDisplay('east');

    col.innerHTML = `
      <div class="table-card h-100 d-flex flex-column">
        <div class="d-flex justify-content-between align-items-center mb-2">
          <h3 class="h5 mb-0">
            <span class="suits-group me-2">
              <i class="bi bi-suit-club-fill"></i><i class="bi bi-suit-diamond-fill text-danger"></i><i class="bi bi-suit-heart-fill text-danger"></i><i class="bi bi-suit-spade-fill"></i>
            </span>
            ${table.label}
          </h3>
          <span class="badge bg-secondary"><i class="bi bi-people-fill me-1"></i>${players}/4</span>
        </div>
        <div class="bridge-table-layout mb-3" data-seats-container="${table.id}">
          <div class="seat-position north ${north.isEmpty ? 'empty' : 'occupied'}" data-seat="north" data-table="${table.id}" style="${north.isEmpty ? 'cursor: pointer;' : ''}">
            <span class="seat-label">${north.fullLabel}</span>
            <span class="player-name">${north.playerName}</span>
          </div>
          <div class="seat-row-middle">
            <div class="seat-position west ${west.isEmpty ? 'empty' : 'occupied'}" data-seat="west" data-table="${table.id}" style="${west.isEmpty ? 'cursor: pointer;' : ''}">
              <span class="seat-label">${west.fullLabel}</span>
              <span class="player-name">${west.playerName}</span>
            </div>
            <div class="seat-position east ${east.isEmpty ? 'empty' : 'occupied'}" data-seat="east" data-table="${table.id}" style="${east.isEmpty ? 'cursor: pointer;' : ''}">
              <span class="seat-label">${east.fullLabel}</span>
              <span class="player-name">${east.playerName}</span>
            </div>
          </div>
          <div class="seat-position south ${south.isEmpty ? 'empty' : 'occupied'}" data-seat="south" data-table="${table.id}" style="${south.isEmpty ? 'cursor: pointer;' : ''}">
            <span class="seat-label">${south.fullLabel}</span>
            <span class="player-name">${south.playerName}</span>
          </div>
        </div>
        <div class="d-flex gap-2">
          <button class="btn btn-outline-secondary flex-grow-1" data-action="observe" data-id="${table.id}" title="${ctx.t('tableObservers')}">
            <i class="bi bi-eye me-2"></i> ${ctx.t('observe')}
          </button>
        </div>
        <div class="d-flex justify-content-between align-items-center text-muted small mt-2">
          <span><i class="bi bi-person-fill me-1"></i>${ctx.t('tablePlayers')}: ${players}/4</span>
          <span class="observer-indicator ${hasObservers ? 'has-observers' : ''}" ${observerTooltip}>
            <i class="${observerIconClass} me-1"></i>${ctx.t('tableObservers')}: ${table.observers.length}
          </span>
        </div>
      </div>
    `;

    applyTranslations(col, ctx.language);

    const seatElements = col.querySelectorAll('[data-seat]');
    seatElements.forEach(seatEl => {
      const seatPosition = seatEl.getAttribute('data-seat');
      const tableId = seatEl.getAttribute('data-table');

      if (seatEl.classList.contains('empty')) {
        seatEl.addEventListener('click', async () => {
          const profile = await getCurrentProfile(ctx);
          if (!profile) {
            alert('Please sign in first.');
            return;
          }

          const { error: clearSeatError } = await ctx.supabaseClient
            .from('room_seats')
            .delete()
            .eq('profile_id', profile.id);

          if (clearSeatError) {
            alert(clearSeatError.message || 'Failed to clear previous seat');
            return;
          }

          const { error: clearMemberError } = await ctx.supabaseClient
            .from('room_members')
            .delete()
            .eq('profile_id', profile.id)
            .eq('role', 'player');

          if (clearMemberError) {
            alert(clearMemberError.message || 'Failed to clear previous player membership');
            return;
          }

          const { error: memberError } = await ctx.supabaseClient
            .from('room_members')
            .insert({ room_id: tableId, profile_id: profile.id, role: 'player' });

          if (memberError) {
            alert(memberError.message || 'Failed to join room as player');
            return;
          }

          const { error: clearTargetSeatError } = await ctx.supabaseClient
            .from('room_seats')
            .delete()
            .eq('room_id', tableId)
            .eq('seat_position', seatPosition);

          if (clearTargetSeatError) {
            alert(clearTargetSeatError.message || 'Failed to clear seat');
            return;
          }

          const { error: seatError } = await ctx.supabaseClient
            .from('room_seats')
            .insert({
              room_id: tableId,
              seat_position: seatPosition,
              profile_id: profile.id,
              seated_at: new Date().toISOString()
            });

          if (seatError) {
            alert(seatError.message || 'Failed to take seat');
            return;
          }

          const { data: seatCheck, error: seatCheckError } = await ctx.supabaseClient
            .from('room_seats')
            .select('profile_id')
            .eq('room_id', tableId)
            .eq('seat_position', seatPosition)
            .eq('profile_id', profile.id)
            .maybeSingle();

          if (seatCheckError || !seatCheck) {
            alert(seatCheckError?.message || 'Seat was not persisted. Please try again.');
            return;
          }

          const playerName = profile.username || profile.display_name || 'Player';
          const playerPayload = {
            tableId: tableId,
            seat: seatPosition,
            name: playerName,
            joinedAt: new Date().toISOString()
          };
          // sessionStorage only – keeps each browser window independent.
          sessionStorage.setItem('currentPlayer', JSON.stringify(playerPayload));
          ctx.navigate(`/table?id=${tableId}&position=${seatPosition}`);
        });
      }
    });

    const observeBtn = col.querySelector('[data-action="observe"]');
    observeBtn.addEventListener('click', async () => {
      localStorage.removeItem('currentPlayer');

      const profile = await getCurrentProfile(ctx);
      if (!profile) {
        alert('Please sign in first.');
        return;
      }

      const { error: clearSpectatorError } = await ctx.supabaseClient
        .from('room_members')
        .delete()
        .eq('profile_id', profile.id)
        .eq('role', 'spectator');

      if (clearSpectatorError) {
        alert(clearSpectatorError.message || 'Failed to clear previous observer membership');
        return;
      }

      const { error: spectatorError } = await ctx.supabaseClient
        .from('room_members')
        .insert({ room_id: table.id, profile_id: profile.id, role: 'spectator' });

      if (spectatorError) {
        alert(spectatorError.message || 'Failed to join as observer');
        return;
      }

      const observerName = profile.username || profile.display_name || 'Observer';
      const observerPayload = {
        tableId: table.id,
        name: observerName,
        joinedAt: new Date().toISOString()
      };
      localStorage.setItem('currentObserver', JSON.stringify(observerPayload));
      sessionStorage.setItem('currentObserver', JSON.stringify(observerPayload));

      ctx.navigate(`/observer?id=${table.id}`);
    });

    grid.append(col);
  });
}

async function getCurrentProfile(ctx) {
  if (!ctx.supabaseClient) return null;

  const { data: authData, error: authError } = await ctx.supabaseClient.auth.getUser();
  if (authError || !authData?.user) {
    return null;
  }

  const fallbackName =
    authData.user.user_metadata?.username
    || authData.user.user_metadata?.display_name
    || (authData.user.email ? authData.user.email.split('@')[0] : null)
    || `player_${authData.user.id.slice(0, 8)}`;

  const { data: profileData, error: profileError } = await ctx.supabaseClient.rpc('upsert_current_profile', {
    p_username: fallbackName,
    p_display_name: fallbackName
  });

  if (profileError) {
    console.warn('Failed to resolve current profile', profileError);
    return null;
  }

  const profileRow = Array.isArray(profileData) ? profileData[0] : null;
  if (!profileRow?.profile_id) {
    return null;
  }

  const profile = {
    id: profileRow.profile_id,
    username: profileRow.username,
    display_name: profileRow.display_name,
    role: profileRow.role
  };

  try {
    const currentUser = JSON.parse(sessionStorage.getItem('currentUser') || '{}');
    // sessionStorage only – window-scoped, prevents cross-window identity leak.
    sessionStorage.setItem('currentUser', JSON.stringify({ ...currentUser, ...profile }));
  } catch (err) {
    console.warn('Failed to persist current user', err);
  }

  return profile;
}

function getProfileLabel(profile) {
  if (!profile) return null;
  return profile.username || profile.display_name || null;
}
