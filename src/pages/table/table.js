import template from './table.html?raw';
import './table.css';
import { applyTranslations, languages } from '../../i18n/i18n.js';
import { createTableView, getRotatedPositions } from './table-view.js';

// Sample table data - will come from backend
const currentTable = {
  id: 1,
  players: {
    south: 'Elena',
    west: 'Marco',
    north: 'Ivan',
    east: 'Maria'
  },
  observers: ['Peter', 'Maya']
};

// Get player position from URL or default to south for observer
function getPlayerPosition() {
  const params = new URLSearchParams(window.location.search);
  return params.get('position') || 'observer';
}

export const tablePage = {
  path: '/table',
  name: 'table',
  render(container, ctx) {
    const host = document.createElement('section');
    host.className = 'py-4';
    host.innerHTML = `
      <div class="container">
        <div class="d-flex flex-wrap justify-content-between align-items-center gap-3 mb-3">
          <div>
            <h1 class="h3 mb-1"><i class="bi bi-table me-2"></i><span data-i18n="tableViewTitle"></span></h1>
            <p class="text-muted mb-0"><i class="bi bi-hourglass-split me-1"></i><span data-i18n="tableStatusWaiting"></span></p>
          </div>
          <div class="d-flex align-items-center gap-2">
            <button class="btn btn-outline-secondary btn-sm" data-action="back-lobby"><i class="bi bi-arrow-left me-1"></i><span data-i18n="navLobby"></span></button>
          </div>
        </div>

        <!-- Position Indicator -->
        <div class="position-indicator mb-4" data-position-indicator></div>

        <!-- Position Switcher -->
        <div class="position-switcher mb-4" data-position-switcher></div>

        <!-- Table Layout -->
        <div class="bridge-table-layout-view" data-seat-grid></div>

        <!-- Observers Section -->
        <div class="row mt-4">
          <div class="col-12">
            <div class="observers-section card" data-observers-section></div>
          </div>
        </div>
      </div>
    `;

    const grid = host.querySelector('[data-seat-grid]');
    const backBtn = host.querySelector('[data-action="back-lobby"]');
    const positionIndicator = host.querySelector('[data-position-indicator]');
    const positionSwitcher = host.querySelector('[data-position-switcher]');

    // Get current player position from URL
    const viewPosition = getPlayerPosition();
    const isObserver = viewPosition === 'observer';

    // Create table view data with rotation
    const viewData = createTableView(currentTable.id, viewPosition, ctx);

    applyTranslations(host, ctx.language);

    if (backBtn) {
      backBtn.addEventListener('click', () => ctx.navigate('/lobby'));
    }

    // Render position indicator
    if (positionIndicator) {
      if (!isObserver) {
        positionIndicator.innerHTML = `
          <div class="alert alert-info">
            <i class="bi bi-person-circle"></i> 
            <span data-i18n="yourPosition"></span>: 
            <strong data-i18n="seat${viewPosition.charAt(0).toUpperCase() + viewPosition.slice(1)}"></strong>
          </div>
        `;
      } else {
        positionIndicator.innerHTML = `
          <div class="alert alert-secondary">
            <i class="bi bi-eye"></i> 
            <span data-i18n="observerMode"></span>
          </div>
        `;
      }
    }

    // Render position switcher
    if (positionSwitcher) {
      positionSwitcher.innerHTML = `
        <div class="switcher-label" data-i18n="changePosition"></div>
        <div class="btn-group btn-group-lg" role="group">
          <button type="button" class="btn ${viewPosition === 'south' ? 'btn-primary' : 'btn-outline-primary'} position-btn" data-position="south">
            <i class="bi bi-arrow-down-circle me-2"></i><span data-i18n="seatSouth"></span>
          </button>
          <button type="button" class="btn ${viewPosition === 'west' ? 'btn-primary' : 'btn-outline-primary'} position-btn" data-position="west">
            <i class="bi bi-arrow-left-circle me-2"></i><span data-i18n="seatWest"></span>
          </button>
          <button type="button" class="btn ${viewPosition === 'north' ? 'btn-primary' : 'btn-outline-primary'} position-btn" data-position="north">
            <i class="bi bi-arrow-up-circle me-2"></i><span data-i18n="seatNorth"></span>
          </button>
          <button type="button" class="btn ${viewPosition === 'east' ? 'btn-primary' : 'btn-outline-primary'} position-btn" data-position="east">
            <i class="bi bi-arrow-right-circle me-2"></i><span data-i18n="seatEast"></span>
          </button>
          <button type="button" class="btn ${viewPosition === 'observer' ? 'btn-primary' : 'btn-outline-primary'} position-btn" data-position="observer">
            <i class="bi bi-eye me-2"></i><span data-i18n="observerMode"></span>
          </button>
        </div>
      `;

      // Attach position switcher handlers
      positionSwitcher.querySelectorAll('[data-position]').forEach(btn => {
        btn.addEventListener('click', () => {
          const newPosition = btn.dataset.position;
          const tableId = new URLSearchParams(window.location.search).get('id') || '1';
          ctx.navigate(`/table?id=${tableId}&position=${newPosition}`);
        });
      });
    }

    // Render seats with rotated positions
    const positions = viewData.positions;
    
    // Clear grid
    grid.innerHTML = '';
    
    // Create bridge layout with rotated positions
    const seatPositions = [
      { pos: 'top', direction: 'north', icon: 'bi-arrow-up-circle' },
      { pos: 'left', direction: 'west', icon: 'bi-arrow-left-circle' },
      { pos: 'right', direction: 'east', icon: 'bi-arrow-right-circle' },
      { pos: 'bottom', direction: 'south', icon: 'bi-arrow-down-circle' }
    ];

    seatPositions.forEach(({ pos, direction, icon }) => {
      const actualPos = positions[pos];
      const player = currentTable.players[actualPos];
      const cardCount = viewData.visibleCards[actualPos]?.length || (pos === 'bottom' ? 13 : 0);
      
      const seatDiv = document.createElement('div');
      seatDiv.className = `seat-position ${direction}`;
      
      const isCurrentPlayer = pos === 'bottom' && !isObserver;
      seatDiv.innerHTML = `
        <div class="seat-card ${player ? 'occupied' : ''} ${isCurrentPlayer ? 'current-player' : ''}">
          <i class="bi ${icon} seat-icon"></i>
          <div class="seat-label" data-i18n="seat${actualPos.charAt(0).toUpperCase() + actualPos.slice(1)}"></div>
          ${player ? `<div class="seat-player">${player}</div>` : '<div class="seat-empty" data-i18n="seatOpen"></div>'}
          <div class="card-count">${cardCount} <span data-i18n="cards"></span></div>
        </div>
      `;
      
      grid.append(seatDiv);
    });

    // Render observers section
    const observersSection = host.querySelector('[data-observers-section]');
    if (observersSection) {
      const hasObservers = currentTable.observers.length > 0;
      observersSection.innerHTML = `
        <div class="card-body d-flex align-items-center justify-content-between">
          <div class="d-flex align-items-center gap-2">
            <i class="bi ${hasObservers ? 'bi-eye-fill text-warning' : 'bi-eye text-muted'} fs-4"></i>
            <div>
              <h5 class="mb-0" data-i18n="tableObservers"></h5>
              <p class="small text-muted mb-0">${hasObservers ? currentTable.observers.join(', ') : ''}</p>
            </div>
          </div>
          <span class="badge ${hasObservers ? 'bg-warning text-dark' : 'bg-secondary'}">
            ${currentTable.observers.length}
          </span>
        </div>
      `;
    }

    applyTranslations(host, ctx.language);
    container.append(host);
  }
};
