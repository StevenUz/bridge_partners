import template from './lobby.html?raw';
import './lobby.css';
import { applyTranslations, languages } from '../../i18n/i18n.js';

const sampleTables = [
  {
    id: 1,
    name: 'Table 1',
    seats: { south: 'Elena', west: 'Marco', north: null, east: null },
    observers: 1
  },
  {
    id: 2,
    name: 'Table 2',
    seats: { south: null, west: null, north: null, east: null },
    observers: 0
  },
  {
    id: 3,
    name: 'Table 3',
    seats: { south: 'Ivo', west: 'Lina', north: 'Sara', east: null },
    observers: 3
  }
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
      alert('Table creation is stubbed for now.');
    });

    sampleTables.forEach((table) => {
      const col = document.createElement('div');
      col.className = 'col-12 col-md-6 col-lg-4';

      const players = Object.values(table.seats).filter(Boolean).length;
      const seatsMarkup = Object.entries(table.seats)
        .map(([seat, player]) => {
          const label = ctx.t(`seat${seat.charAt(0).toUpperCase()}${seat.slice(1)}`);
          const status = player ? player : ctx.t('seatObserver');
          return `<span class="seat-chip">${label}: ${status}</span>`;
        })
        .join('');

      col.innerHTML = `
        <div class="table-card h-100 d-flex flex-column">
          <div class="d-flex justify-content-between align-items-center mb-2">
            <h3 class="h5 mb-0">
              <span class="suits-group me-2">
                <i class="bi bi-suit-club-fill"></i><i class="bi bi-suit-diamond-fill text-danger"></i><i class="bi bi-suit-heart-fill text-danger"></i><i class="bi bi-suit-spade-fill"></i>
              </span>
              ${table.name}
            </h3>
            <span class="badge bg-secondary"><i class="bi bi-people-fill me-1"></i>${players}/4</span>
          </div>
          <p class="small text-muted mb-2" data-i18n="tableSeats"></p>
          <div class="d-flex flex-wrap gap-2 mb-3">${seatsMarkup}</div>
          <button class="btn btn-primary w-100" data-action="join" data-id="${table.id}">
            <i class="bi bi-box-arrow-in-right me-2"></i>${ctx.t('tableJoin')}
          </button>
          <div class="d-flex justify-content-between align-items-center text-muted small mt-2">
            <span><i class="bi bi-person-fill me-1"></i>${ctx.t('tablePlayers')}: ${players}/4</span>
            <span><i class="bi bi-eye-fill me-1"></i>${ctx.t('tableObservers')}: ${table.observers}</span>
          </div>
        </div>
      `;

      applyTranslations(col, ctx.language);

      const joinBtn = col.querySelector('[data-action="join"]');
      joinBtn.addEventListener('click', () => ctx.navigate('/table'));

      grid.append(col);
    });

    container.append(host);
  }
};
