import template from './header.html?raw';
import './header.css';
import { applyTranslations, languages } from '../../i18n/i18n.js';

export function createHeader({ currentPath, language, onNavigate, onLanguageChange }) {
  const wrapper = document.createElement('div');
  wrapper.innerHTML = template;

  const nav = wrapper.querySelector('nav');
  const collapse = nav.querySelector('#mainNav');
  const toggle = nav.querySelector('[data-nav-toggle]');
  const languagePicker = nav.querySelector('[data-language-picker]');
  const brand = nav.querySelector('[data-brand]');

  Object.entries(languages).forEach(([value, label]) => {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = label;
    languagePicker.append(option);
  });
  languagePicker.value = language;

  applyTranslations(nav, language);

  brand.addEventListener('click', (event) => {
    event.preventDefault();
    onNavigate('/');
    collapse.classList.remove('show');
  });

  nav.querySelectorAll('[data-route]').forEach((link) => {
    const href = link.getAttribute('data-route');
    if (href === currentPath) {
      link.classList.add('active');
    }
    link.addEventListener('click', (event) => {
      event.preventDefault();
      onNavigate(href);
      collapse.classList.remove('show');
    });
  });

  languagePicker.addEventListener('change', (event) => {
    onLanguageChange(event.target.value);
  });

  toggle.addEventListener('click', () => {
    collapse.classList.toggle('show');
  });

  return nav;
}
