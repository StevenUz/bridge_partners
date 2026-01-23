import template from './statistics.html?raw';
import './statistics.css';
import { applyTranslations } from '../../i18n/i18n.js';

export const statisticsPage = {
  path: '/statistics',
  name: 'statistics',
  render(container, ctx) {
    const host = document.createElement('section');
    host.innerHTML = template;

    applyTranslations(host, ctx.language);

    container.append(host);
  }
};
