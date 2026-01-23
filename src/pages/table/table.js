import template from './table.html?raw';
import './table.css';
import { applyTranslations, languages } from '../../i18n/i18n.js';

const seats = [
  { id: 'south', player: 'You' },
  { id: 'west', player: 'Open' },
  { id: 'north', player: 'Open' },
  { id: 'east', player: 'Open' }
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

      col.innerHTML = `
        <div class="seat-card h-100 d-flex flex-column gap-2">
          <div class="d-flex align-items-center justify-content-between">
            <h3 class="h6 mb-0">${ctx.t(`seat${seat.id.charAt(0).toUpperCase()}${seat.id.slice(1)}`)}</h3>
            <span class="badge ${seat.player === 'Open' ? 'bg-warning text-dark' : 'bg-success'}">${seat.player}</span>
          </div>
          <p class="small text-muted mb-2">${ctx.t('tableJoinAs')}</p>
          <button class="btn btn-outline-primary" ${seat.player !== 'Open' ? 'disabled' : ''}>${ctx.t('tableJoin')}</button>
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
