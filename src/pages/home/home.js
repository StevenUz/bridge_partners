import template from './home.html?raw';
import './home.css';
import { applyTranslations, languages } from '../../i18n/i18n.js';

export const homePage = {
  path: '/',
  name: 'home',
  render(container, ctx) {
    const host = document.createElement('section');
    host.innerHTML = template;

    const form = host.querySelector('[data-form="register"]');
    const languagePicker = host.querySelector('[data-language-picker]');
    const cta = host.querySelector('[data-action="enter-lobby"]');

    Object.entries(languages).forEach(([value, label]) => {
      const option = document.createElement('option');
      option.value = value;
      option.textContent = label;
      languagePicker.append(option);
    });
    languagePicker.value = ctx.language;

    applyTranslations(host, ctx.language);

    const goLobby = () => ctx.navigate('/lobby');
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      goLobby();
    });

    cta.addEventListener('click', goLobby);

    languagePicker.addEventListener('change', (event) => {
      ctx.onLanguageChange(event.target.value);
      applyTranslations(host, event.target.value);
    });

    container.append(host);
  }
};
