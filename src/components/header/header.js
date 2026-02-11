import template from './header.html?raw';
import './header.css';
import './imp-table-styles.css';
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
  const fullscreenBtn = nav.querySelector('[data-fullscreen-toggle]');

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
  const impTableBtn = nav.querySelector('[data-imp-table-btn]');
  const impTableBtnWrapper = nav.querySelector('#impTableBtnWrapper');
  const navCollapse = nav.querySelector('#mainNav');
  const navToggler = nav.querySelector('[data-nav-toggle]');
  
  if (currentPath === '/table' || currentPath === '/observer') {
    navList.style.display = 'none';
    if (navCollapse) {
      navCollapse.style.display = 'none';
    }
    if (navToggler) {
      navToggler.style.display = 'none';
    }
    leaveButton.style.display = 'block';
    
    leaveButton.addEventListener('click', (event) => {
      event.preventDefault();
      // Clear player or observer data
      localStorage.removeItem('currentPlayer');
      localStorage.removeItem('currentObserver');
      // Navigate to lobby
      onNavigate('/lobby');
    });
  } else {
    if (navCollapse) {
      navCollapse.style.display = '';
    }
    if (navToggler) {
      navToggler.style.display = '';
    }
  }
  
  // Show IMP table button only on /table page
  if (impTableBtnWrapper) {
    if (currentPath === '/table') {
      impTableBtnWrapper.style.display = 'block';
    } else {
      impTableBtnWrapper.style.display = 'none';
    }
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
      console.log('Navigation clicked:', href);
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

  // IMP Table Button and Popup
  const impTablePopup = nav.querySelector('#impTablePopup');
  
  if (impTableBtn && impTablePopup && currentPath === '/table') {
    let isPopupVisible = false;
    
    // Function to load and render IMP table data
    const renderImpTable = () => {
      const tableId = getTableId();
      let impData = null;
      
      try {
        const raw = localStorage.getItem(`tableImpCycle:${tableId}`);
        if (raw) {
          impData = JSON.parse(raw);
        }
      } catch (e) {
        console.warn('Failed to load IMP cycle data', e);
      }
      
      // Default data if none exists
      if (!impData) {
        impData = {
          cycleNumber: 1,
          currentGame: 1,
          table: {}
        };
      }
      
      // Get current player perspective (NS or EW) from sessionStorage or localStorage
      let currentPlayerSeat = null;
      try {
        const sessionPlayer = sessionStorage.getItem('currentPlayer');
        const localPlayer = localStorage.getItem('currentPlayer');
        const playerData = JSON.parse(sessionPlayer || localPlayer || '{}');
        currentPlayerSeat = playerData.seat;
      } catch (e) {
        console.warn('Failed to parse player data', e);
      }
      
      // Fallback: get position from URL
      if (!currentPlayerSeat) {
        const params = new URLSearchParams(window.location.search);
        currentPlayerSeat = params.get('position');
      }
      
      const isNS = currentPlayerSeat === 'north' || currentPlayerSeat === 'south';
      console.log('Current player seat:', currentPlayerSeat, 'isNS:', isNS);
      
      // Sequence: A1-B1-C1-D1-B2-C2-D2-A2-C3-D3-A3-B3-D4-A4-B4-C4
      const sequence = [
        'A1', 'B1', 'C1', 'D1',
        'B2', 'C2', 'D2', 'A2',
        'C3', 'D3', 'A3', 'B3',
        'D4', 'A4', 'B4', 'C4'
      ];
      
      // Get current cell in sequence
      const gameIndex = (impData.currentGame - 1) % 16;
      const currentCellId = sequence[gameIndex];
      
      // Helper function to get cell value for player's perspective
      const getCellValue = (cellId) => {
        const value = impData.table[cellId];
        if (value === null || value === undefined) return '';
        // NS sees positive values as-is, EW sees them inverted
        const displayValue = isNS ? value : -value;
        return displayValue >= 0 ? `+${displayValue}` : `${displayValue}`;
      };
      
      // Helper function to get cell class
      const getCellClass = (cellId) => {
        const value = impData.table[cellId];
        if (value === null || value === undefined) return 'empty';
        const displayValue = isNS ? value : -value;
        if (displayValue > 0) return 'positive';
        if (displayValue < 0) return 'negative';
        return '';
      };
      
      // Vulnerability symbols for rows: A=0, B=-, C=|, D=+
      const vulnSymbols = { 'A': '0', 'B': '-', 'C': '|', 'D': '+' };
      const rows = ['A', 'B', 'C', 'D'];
      const cols = ['1', '2', '3', '4'];
      
      let gridHTML = `
        <h4>${isNS ? 'N-S' : 'E-W'} Perspective</h4>
        <div class="imp-cycle-info">Cycle ${impData.cycleNumber} - Game ${impData.currentGame}/16</div>
        <div class="imp-grid">
      `;
      
      // Rows with data (without row labels)
      rows.forEach(row => {
        gridHTML += `<div class="imp-grid-row">`;
        cols.forEach(col => {
          const cellId = `${row}${col}`;
          const isCurrent = cellId === currentCellId;
          const cellValue = getCellValue(cellId);
          const cellClass = getCellClass(cellId);
          const currentClass = isCurrent ? 'current-game' : '';
          
          gridHTML += `<div class="imp-grid-cell ${cellClass} ${currentClass}">${cellValue || '-'}</div>`;
        });
        gridHTML += `</div>`;
      });
      
      gridHTML += `
        </div>
      `;
      
      impTablePopup.innerHTML = gridHTML;
    };
    
    // Improved popup show/hide logic
    let hideTimeout = null;
    
    const showPopup = () => {
      if (hideTimeout) {
        clearTimeout(hideTimeout);
        hideTimeout = null;
      }
      if (!isPopupVisible) {
        renderImpTable();
        impTablePopup.style.display = 'block';
        // Force reflow
        impTablePopup.offsetHeight;
        impTablePopup.classList.add('show');
        isPopupVisible = true;
      }
    };
    
    const hidePopup = () => {
      if (hideTimeout) {
        clearTimeout(hideTimeout);
      }
      hideTimeout = setTimeout(() => {
        impTablePopup.classList.remove('show');
        setTimeout(() => {
          if (!isPopupVisible) {
            impTablePopup.style.display = 'none';
          }
        }, 300);
        isPopupVisible = false;
        hideTimeout = null;
      }, 150);
    };
    
    const cancelHide = () => {
      if (hideTimeout) {
        clearTimeout(hideTimeout);
        hideTimeout = null;
      }
    };
    
    impTableBtn.addEventListener('mouseenter', showPopup);
    impTableBtn.addEventListener('mouseleave', hidePopup);
    impTablePopup.addEventListener('mouseenter', cancelHide);
    impTablePopup.addEventListener('mouseleave', hidePopup);
  }

  return nav;
}
