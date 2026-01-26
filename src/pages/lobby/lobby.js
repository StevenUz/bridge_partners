import template from './lobby.html?raw';
import './lobby.css';
import { applyTranslations, languages } from '../../i18n/i18n.js';

const sampleTables = [
  {
    id: 1,
    seats: { south: 'Elena', west: 'Marco', north: null, east: null },
    observers: ['Anna']
  },
  {
    id: 2,
    seats: { south: null, west: null, north: null, east: null },
    observers: []
  },
  {
    id: 3,
    seats: { south: 'Ivo', west: 'Lina', north: 'Sara', east: null },
    observers: ['Peter', 'Maya', 'Todor']
  }
];

// Simple in-memory chat for the lobby
const lobbyChatMessages = [
  { author: 'Elena', text: 'Welcome to the lobby!' },
  { author: 'Marco', text: 'Table 1 needs a North.' },
  { author: 'Sara', text: 'Looking for a quick game.' }
];

export const lobbyPage = {
  path: '/lobby',
  name: 'lobby',
  render(container, ctx) {
    const host = document.createElement('section');
    host.innerHTML = template;

    const grid = host.querySelector('[data-table-grid]');
    const createBtn = host.querySelector('[data-action="create-table"]');

    applyTranslations(host, ctx.language);

    if (sampleTables.length >= 5) {
      createBtn.setAttribute('disabled', 'disabled');
    }

    createBtn.addEventListener('click', () => {
      if (sampleTables.length >= 5) {
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

    sampleTables.forEach((table) => {
      const col = document.createElement('div');
      col.className = 'col-12 col-md-6 col-lg-4';

      const players = Object.values(table.seats).filter(Boolean).length;
      const hasObservers = table.observers.length > 0;
      const observerNames = table.observers.join(', ');
      const observerIconClass = hasObservers ? 'bi-eye-fill text-warning' : 'bi-eye text-muted';
      const observerTooltip = hasObservers ? `data-tooltip="${ctx.t('tableObservers')}: ${observerNames}"` : '';
      
      // Create bridge-style table layout
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
              ${ctx.t('table')} ${table.id}
            </h3>
            <span class="badge bg-secondary"><i class="bi bi-people-fill me-1"></i>${players}/4</span>
          </div>
          <div class="bridge-table-layout mb-3">
            <div class="seat-position north ${north.isEmpty ? 'empty' : 'occupied'}">
              <span class="seat-label">${north.fullLabel}</span>
              <span class="player-name">${north.playerName}</span>
            </div>
            <div class="seat-row-middle">
              <div class="seat-position west ${west.isEmpty ? 'empty' : 'occupied'}">
                <span class="seat-label">${west.fullLabel}</span>
                <span class="player-name">${west.playerName}</span>
              </div>
              <div class="seat-position east ${east.isEmpty ? 'empty' : 'occupied'}">
                <span class="seat-label">${east.fullLabel}</span>
                <span class="player-name">${east.playerName}</span>
              </div>
            </div>
            <div class="seat-position south ${south.isEmpty ? 'empty' : 'occupied'}">
              <span class="seat-label">${south.fullLabel}</span>
              <span class="player-name">${south.playerName}</span>
            </div>
          </div>
          <div class="d-flex gap-2">
            <button class="btn btn-primary flex-grow-1" data-action="join" data-id="${table.id}">
              <i class="bi bi-box-arrow-in-right me-2"></i>${ctx.t('tableJoin')}
            </button>
            <button class="btn btn-outline-secondary" data-action="observe" data-id="${table.id}" title="${ctx.t('tableObservers')}">
              <i class="bi bi-eye"></i> ${ctx.t('observe')}
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

      const joinBtn = col.querySelector('[data-action="join"]');
      const observeBtn = col.querySelector('[data-action="observe"]');
      joinBtn.addEventListener('click', () => {
        // Store current player info when joining
        const position = 'south';
        localStorage.setItem('currentPlayer', JSON.stringify({
          tableId: table.id,
          seat: position,
          joinedAt: new Date().toISOString()
        }));
        // Navigate to table view with tableId and position parameters
        ctx.navigate(`/table?id=${table.id}&position=${position}`);
      });
      observeBtn.addEventListener('click', () => {
        // Clear player info when observing
        localStorage.removeItem('currentPlayer');
        ctx.navigate(`/observer?id=${table.id}`);
      });

      grid.append(col);
    });

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
  }
};
