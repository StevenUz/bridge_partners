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
  const navList = nav.querySelector('[data-nav-list]');

  // Extract table id from current URL if on table or observer page
  const getTableId = () => {
    const params = new URLSearchParams(window.location.search);
    const idStr = params.get('id');
    const id = Number(idStr);
    return Number.isFinite(id) && id > 0 ? id : 1; // Default to 1
  };

  // Hide navigation links when on /table or /observer route
  // Show leave button when on /table or /observer route
  const leaveButton = nav.querySelector('[data-action="leave-table"]');
  if (currentPath === '/table' || currentPath === '/observer') {
    navList.style.display = 'none';
    leaveButton.style.display = 'block';
    
    leaveButton.addEventListener('click', (event) => {
      event.preventDefault();
      // Clear player or observer data
      localStorage.removeItem('currentPlayer');
      localStorage.removeItem('currentObserver');
      // Navigate to lobby
      onNavigate('/lobby');
    });
  }

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
    let href = link.getAttribute('data-route');
    
    // If Observer link, append current table id
    if (href === '/observer') {
      const tableId = getTableId();
      href = `/observer?id=${tableId}`;
    }
    
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
