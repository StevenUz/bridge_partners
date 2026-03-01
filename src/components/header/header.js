import template from './header.html?raw';
import './header.css';
import './imp-table-styles.css';
import { applyTranslations, languages, t } from '../../i18n/i18n.js';
import { logoutCurrentUser } from '../../session/session-manager.js';

export function createHeader({ currentPath, language, onNavigate, onLanguageChange, supabaseClient }) {
  const wrapper = document.createElement('div');
  wrapper.innerHTML = template;

  const nav = wrapper.querySelector('nav');
  const collapse = nav.querySelector('#mainNav');
  const toggle = nav.querySelector('[data-nav-toggle]');
  const languagePicker = nav.querySelector('[data-language-picker]');
  const brand = nav.querySelector('[data-brand]');
  const navList = nav.querySelector('[data-nav-list]');
  const fullscreenBtn = nav.querySelector('[data-fullscreen-toggle]');
  const adminNavItem = nav.querySelector('[data-admin-only]');
  const roleBadge = nav.querySelector('[data-user-role-badge]');
  const logoutBtn = nav.querySelector('[data-action="logout"]');

  let currentUser = null;
  try {
    // sessionStorage only – window-scoped, each window has its own logged-in user.
    currentUser = JSON.parse(sessionStorage.getItem('currentUser') || 'null');
  } catch (err) {
    console.warn('Failed to parse current user for admin nav visibility', err);
  }

  if (adminNavItem) {
    if (currentUser?.role === 'admin') {
      adminNavItem.classList.remove('d-none');
    } else {
      adminNavItem.classList.add('d-none');
    }
  }

  const authorizedNavItems = nav.querySelectorAll('[data-authorized-only]');
  authorizedNavItems.forEach((item) => {
    if (currentUser?.role === 'authorized' || currentUser?.role === 'admin') {
      item.classList.remove('d-none');
    } else {
      item.classList.add('d-none');
    }
  });

  if (roleBadge) {
    const role = currentUser?.role;
    const username = currentUser?.username || currentUser?.display_name;
    if (!role || !username) {
      roleBadge.classList.add('d-none');
    } else {
      roleBadge.classList.remove('d-none');
      roleBadge.classList.remove('bg-danger', 'bg-success', 'bg-warning', 'text-dark');

      if (role === 'admin') {
        roleBadge.classList.add('bg-danger');
      } else if (role === 'authorized') {
        roleBadge.classList.add('bg-success');
      } else {
        roleBadge.classList.add('bg-warning', 'text-dark');
      }

      roleBadge.textContent = username;
      roleBadge.title = `${t(language, 'currentRole')}: ${t(language, role === 'admin' ? 'roleAdmin' : role === 'authorized' ? 'roleAuthorized' : 'roleUnauthorized')}`;
    }
  }

  if (logoutBtn) {
    if (currentUser?.id) {
      logoutBtn.classList.remove('d-none');
    } else {
      logoutBtn.classList.add('d-none');
    }

    logoutBtn.addEventListener('click', async (event) => {
      event.preventDefault();
      await logoutCurrentUser();
      collapse.classList.remove('show');
    });
  }

  // Extract table id from current URL or current player if on table or observer page
  const getTableId = () => {
    const params = new URLSearchParams(window.location.search);
    const idStr = params.get('id');
    
    // Return the raw ID string (could be UUID or number)
    if (idStr) return idStr;

    try {
      const sessionPlayer = sessionStorage.getItem('currentPlayer');
      const playerData = JSON.parse(sessionPlayer || '{}');
      if (playerData?.tableId) return playerData.tableId;
    } catch (err) {
      console.warn('Failed to read current player tableId', err);
    }

    return '1'; // Default to '1'
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
    
    leaveButton.addEventListener('click', async (event) => {
      event.preventDefault();
      
      let currentUser = null;
      try {
        const storedUser = sessionStorage.getItem('currentUser');
        if (storedUser) {
          currentUser = JSON.parse(storedUser);
        }
      } catch (parseErr) {
        console.warn('Failed to parse currentUser from storage', parseErr);
      }
      
      console.log('[Leave Table] Current user:', currentUser);
      
      if (currentUser?.id && supabaseClient) {
        try {
          console.log('[Leave Table] Calling cleanup_player_logout with profile_id:', currentUser.id);
          const result = await supabaseClient.rpc('cleanup_player_logout', {
            p_profile_id: currentUser.id
          });
          console.log('[Leave Table] Cleanup result:', result);
        } catch (err) {
          console.error('[Leave Table] Failed to cleanup player from table:', err);
        }
      } else {
        console.warn('[Leave Table] Missing currentUser.id or supabaseClient', { userId: currentUser?.id, hasClient: !!supabaseClient });
      }
      
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
      console.log(`[IMP Table] Rendering for tableId: ${tableId}`);

      const emptyTable = {
        A1: null, A2: null, A3: null, A4: null,
        B1: null, B2: null, B3: null, B4: null,
        C1: null, C2: null, C3: null, C4: null,
        D1: null, D2: null, D3: null, D4: null
      };

      const normalizeImpData = (rawData) => {
        const base = {
          cycleNumber: 1,
          currentGame: 1,
          table: { ...emptyTable }
        };

        if (!rawData || typeof rawData !== 'object') {
          return base;
        }

        let rawTable = rawData.table ?? rawData.table_data ?? {};
        if (typeof rawTable === 'string') {
          try {
            rawTable = JSON.parse(rawTable);
          } catch {
            rawTable = {};
          }
        }

        if (!rawTable || typeof rawTable !== 'object' || Array.isArray(rawTable)) {
          rawTable = {};
        }

        return {
          ...base,
          ...rawData,
          table: {
            ...emptyTable,
            ...rawTable
          }
        };
      };
      
      let impData = null;
      
      try {
        const raw = localStorage.getItem(`tableImpCycle:${tableId}`);
        console.log(`[IMP Table] localStorage data:`, raw);
        if (raw) {
          impData = normalizeImpData(JSON.parse(raw));
          console.log(`[IMP Table] Parsed data:`, impData);
        }
      } catch (e) {
        console.warn('Failed to load IMP cycle data', e);
      }
      
      // Default data if none exists
      if (!impData) {
        impData = normalizeImpData(null);
      }
      
      // Get current player perspective (NS or EW) from sessionStorage
      let currentPlayerSeat = null;
      try {
        const playerData = JSON.parse(sessionStorage.getItem('currentPlayer') || '{}');
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
        <div class="imp-actions">
          <button type="button" class="imp-reset-btn" data-imp-reset>Нулирай таблицата</button>
        </div>
      `;
      
      impTablePopup.innerHTML = gridHTML;

      const resetBtn = impTablePopup.querySelector('[data-imp-reset]');
      if (resetBtn) {
        resetBtn.addEventListener('click', () => {
          const currentTableId = getTableId();
          try {
            localStorage.removeItem(`tableImpCycle:${currentTableId}`);
            Object.keys(localStorage)
              .filter((key) => key.startsWith(`tableImpRecorded:${currentTableId}:`))
              .forEach((key) => localStorage.removeItem(key));

            // Keep deal/vulnerability sequencing aligned with the IMP cycle after a reset.
            localStorage.removeItem(`tableLastDealNumber:${currentTableId}`);
            localStorage.removeItem(`tableVulnerability:${currentTableId}`);

            // Notify the table page (same tab) to clear any in-memory cached IMP data.
            window.dispatchEvent(new CustomEvent('imp-cycle-reset', { detail: { tableId: currentTableId } }));
          } catch (err) {
            console.warn('Failed to reset IMP table', err);
          }
          renderImpTable();
        });
      }
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
    
    // Listen for IMP table updates from localStorage
    window.addEventListener('storage', (event) => {
      const tableId = getTableId();
      if (event.key === `tableImpCycle:${tableId}`) {
        console.log('IMP table updated via storage event');
        if (isPopupVisible) {
          renderImpTable();
        }
      }
    });
    
    // Listen for custom IMP update events (same-tab updates)
    window.addEventListener('imp-cycle-updated', () => {
      console.log('IMP table updated via custom event');
      if (isPopupVisible) {
        renderImpTable();
      }
    });
  }

  return nav;
}
