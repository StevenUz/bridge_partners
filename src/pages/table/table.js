import template from './table.html?raw';
import './table.css';
import { applyTranslations, languages } from '../../i18n/i18n.js';

const seats = [
  { id: 'south', player: 'You', icon: 'bi-arrow-down-circle' },
  { id: 'west', player: 'Open', icon: 'bi-arrow-left-circle' },
  { id: 'north', player: 'Open', icon: 'bi-arrow-up-circle' },
  { id: 'east', player: 'Open', icon: 'bi-arrow-right-circle' }
];

export const tablePage = {
  path: '/table',
  name: 'table',
  render(container, ctx) {
    const host = document.createElement('section');
    host.innerHTML = template;

    const grid = host.querySelector('[data-seat-grid]');
    const languagePicker = host.querySelector('[data-language-picker]');
    const backBtn = host.querySelector('[data-action="back-lobby"]');

    Object.entries(languages).forEach(([value, label]) => {
      const option = document.createElement('option');
      option.value = value;
      option.textContent = label;
      languagePicker.append(option);
    });
    languagePicker.value = ctx.language;

    applyTranslations(host, ctx.language);

    languagePicker.addEventListener('change', (event) => {
      ctx.onLanguageChange(event.target.value);
      applyTranslations(host, event.target.value);
    });

    backBtn.addEventListener('click', () => ctx.navigate('/lobby'));

    seats.forEach((seat) => {
      const col = document.createElement('div');
      col.className = 'col-12 col-md-6';

      const seatLabel = ctx.t(`seat${seat.id.charAt(0).toUpperCase()}${seat.id.slice(1)}`);
      const isOccupied = seat.player !== 'Open';
      const statusIcon = isOccupied ? 'bi-check-circle-fill' : 'bi-circle';

      col.innerHTML = `
        <div class="seat-card h-100 d-flex flex-column gap-2">
          <div class="d-flex align-items-center justify-content-between">
            <h3 class="h6 mb-0">
              <i class="${seat.icon} me-2"></i>${seatLabel}
            </h3>
            <span class="badge ${seat.player === 'Open' ? 'bg-warning text-dark' : 'bg-success'}">
              <i class="${statusIcon} me-1"></i>${seat.player}
            </span>
          </div>
          <p class="small text-muted mb-2"><i class="bi bi-info-circle me-1"></i>${ctx.t('tableJoinAs')}</p>
          <button class="btn btn-outline-primary" ${seat.player !== 'Open' ? 'disabled' : ''}>
            <i class="bi bi-box-arrow-in-right me-2"></i>${ctx.t('tableJoin')}
          </button>
        </div>
      `;

      const joinBtn = col.querySelector('button');
      if (!joinBtn.disabled) {
        joinBtn.addEventListener('click', () => ctx.navigate('/table'));
      }

      grid.append(col);
    });

    container.append(host);
  }
};
