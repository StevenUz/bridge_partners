import template from './statistics.html?raw';
import './statistics.css';
import { applyTranslations, t } from '../../i18n/i18n.js';
import { supabaseClient } from '../../supabase.js';

// Store reference to current data and root for language changes
let currentStats = null;
let currentPartnerships = null;
let currentRoot = null;
let currentLanguage = 'en';

export const statisticsPage = {
  path: '/statistics',
  name: 'statistics',
  async render(container, ctx) {
    const host = document.createElement('section');
    host.innerHTML = template;

    applyTranslations(host, ctx.language);

    container.append(host);

    // Store root and language for language changes
    currentRoot = host;
    currentLanguage = ctx.language;

    // Load statistics data
    await loadStatistics(host, ctx.language);

    // Listen for language changes
    const languageChangeHandler = (e) => {
      const newLanguage = e.detail?.language || currentLanguage;
      currentLanguage = newLanguage;
      
      console.log('Language changed to:', newLanguage);
      
      // Apply translations to all elements with data-i18n attribute
      applyTranslations(host, newLanguage);
      
      // Explicitly update table headers
      host.querySelectorAll('[data-i18n]').forEach(element => {
        const key = element.getAttribute('data-i18n');
        element.textContent = t(newLanguage, key);
      });
      
      // Re-render tables with new language
      if (currentPartnerships && currentPartnerships.length > 0) {
        renderPartnershipsTable(host, currentPartnerships);
      }
      
      if (currentStats && currentStats.length > 0) {
        renderParticipationTable(host, currentStats, newLanguage);
        renderContractsTable(host, currentStats);
        renderScoringTable(host, currentStats);
      }
    };
    
    window.addEventListener('languageChange', languageChangeHandler);
    
    // Cleanup on unmount
    return () => {
      window.removeEventListener('languageChange', languageChangeHandler);
    };
  }
};

/**
 * Load and render all statistics tables
 */
async function loadStatistics(root, language) {
  if (!supabaseClient) {
    console.error('supabaseClient is null');
    showErrorMessage(root, 'Supabase не е конфигуриран. Добави VITE_SUPABASE_URL и VITE_SUPABASE_ANON_KEY в .env.local');
    return;
  }

  console.log('supabaseClient:', supabaseClient);
  console.log('Starting to load statistics...');

  try {
    // Fetch all statistics data in parallel
    console.log('Fetching partnerships and stats...');
    const [partnerships, allStats] = await Promise.all([
      fetchPartnerships(),
      fetchAllPlayerStats()
    ]);

    console.log('Partnerships data:', partnerships);
    console.log('All stats data:', allStats);

    // Store data for language changes
    currentPartnerships = partnerships;
    currentStats = allStats;

    if (partnerships && partnerships.length > 0) {
      console.log('Rendering partnerships table with', partnerships.length, 'rows');
      renderPartnershipsTable(root, partnerships);
    } else {
      console.warn('No partnerships data received');
    }

    if (allStats && allStats.length > 0) {
      console.log('Rendering participation table with', allStats.length, 'rows');
      renderParticipationTable(root, allStats, language);
      renderContractsTable(root, allStats);
      renderScoringTable(root, allStats);
    } else {
      console.warn('No stats data received');
    }
  } catch (error) {
    console.error('Error loading statistics:', error);
    console.error('Error message:', error.message);
    console.error('Error details:', error);
    showErrorMessage(root, `Грешка: ${error.message}`);
  }
}

/**
 * Fetch partnerships sorted by boards together (descending)
 */
async function fetchPartnerships() {
  try {
    // Get partnerships with related profile names
    const { data: partnerships, error } = await supabaseClient
      .from('partnerships')
      .select('*')
      .order('boards_together', { ascending: false })
      .limit(10);

    if (error) throw error;

    // For each partnership, fetch the profile names
    const enriched = await Promise.all((partnerships || []).map(async (p) => {
      const { data: p1 } = await supabaseClient
        .from('profiles')
        .select('display_name')
        .eq('id', p.player_id)
        .single();
      
      const { data: p2 } = await supabaseClient
        .from('profiles')
        .select('display_name')
        .eq('id', p.partner_id)
        .single();

      return {
        player1: p1?.display_name || 'Unknown',
        player2: p2?.display_name || 'Unknown',
        boards_together: p.boards_together,
        wins_together: p.wins_together,
        win_rate: p.boards_together > 0 
          ? ((p.wins_together / p.boards_together) * 100).toFixed(1) 
          : 0
      };
    }));

    return enriched;
  } catch (error) {
    console.error('Error fetching partnerships:', error);
    return [];
  }
}

/**
 * Fetch all player statistics
 */
async function fetchAllPlayerStats() {
  try {
    const { data, error } = await supabaseClient
      .from('player_statistics')
      .select('*, profiles!player_statistics_player_id_fkey(display_name)')
      .order('boards_completed', { ascending: false });

    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error('Error fetching player stats:', error);
    return [];
  }
}

/**
 * Render Partnerships Table
 */
function renderPartnershipsTable(root, partnerships) {
  const table = root.querySelector('#partnerships-tbody').closest('table');
  const thead = table.querySelector('thead');
  const tbody = table.querySelector('tbody');
  
  if (!tbody) return;

  // Get current language from global state
  const language = currentLanguage;

  // Update table header with current language
  thead.innerHTML = `
    <tr>
      <th>${t(language, 'playerCol')}</th>
      <th>${t(language, 'partnerCol')}</th>
      <th>${t(language, 'gamesCol')}</th>
      <th>${t(language, 'winsCol')}</th>
      <th>${t(language, 'winRateCol')}</th>
    </tr>
  `;

  tbody.innerHTML = partnerships.map(p => `
    <tr>
      <td>${escapeHtml(p.player1)}</td>
      <td>${escapeHtml(p.player2)}</td>
      <td>${p.boards_together}</td>
      <td>${p.wins_together}</td>
      <td>${p.win_rate}%</td>
    </tr>
  `).join('');
}

/**
 * Render Participation Table (Games, Declarer, Dummy, Defender)
 */
function renderParticipationTable(root, stats, language) {
  const table = root.querySelector('#participation-tbody').closest('table');
  const thead = table.querySelector('thead');
  const tbody = table.querySelector('tbody');
  
  if (!tbody) return;

  // Update table header with current language
  thead.innerHTML = `
    <tr>
      <th>${t(language, 'playerCol')}</th>
      <th>${t(language, 'totalGamesCol')}</th>
      <th>${t(language, 'declarerCol')}</th>
      <th>${t(language, 'dummyCol')}</th>
      <th>${t(language, 'defenderCol')}</th>
    </tr>
  `;

  const sorted = stats.sort((a, b) => 
    (b.boards_completed || 0) - (a.boards_completed || 0)
  );

  tbody.innerHTML = sorted.map(s => {
    const playerName = escapeHtml(s.profiles?.display_name || 'Unknown');
    const playerId = s.player_id;
    
    return `
      <tr>
        <td class="player-name-cell" data-player-id="${playerId}">${playerName}</td>
        <td>${s.boards_completed || 0}</td>
        <td>${s.boards_as_declarer || 0}</td>
        <td>${s.boards_as_dummy || 0}</td>
        <td>${s.boards_as_defender || 0}</td>
      </tr>
    `;
  }).join('');

  // Add hover tooltips
  addPlayerTooltips(root, stats, language);
}

/**
 * Add hover tooltips to player names
 */
function addPlayerTooltips(root, stats, language) {
  // Remove old tooltips first
  const oldTooltips = document.querySelectorAll('.player-tooltip');
  oldTooltips.forEach(tooltip => {
    if (document.body.contains(tooltip)) {
      document.body.removeChild(tooltip);
    }
  });
  
  const playerCells = root.querySelectorAll('.player-name-cell');
  
  playerCells.forEach(cell => {
    // Remove old listeners
    const newCell = cell.cloneNode(true);
    cell.parentNode.replaceChild(newCell, cell);
    
    const playerId = newCell.getAttribute('data-player-id');
    const playerStat = stats.find(s => s.player_id === playerId);
    
    if (!playerStat) return;

    // Add event listeners
    newCell.addEventListener('mouseenter', (e) => {
      // Create fresh tooltip with current language
      const tooltip = createPlayerTooltip(playerStat, language);
      document.body.appendChild(tooltip);
      positionTooltip(tooltip, e.target);
      tooltip.classList.add('visible');
    });
    
    newCell.addEventListener('mouseleave', () => {
      const tooltips = document.querySelectorAll('.player-tooltip');
      tooltips.forEach(tooltip => {
        tooltip.classList.remove('visible');
        setTimeout(() => {
          if (document.body.contains(tooltip)) {
            document.body.removeChild(tooltip);
          }
        }, 200);
      });
    });
    
    // Make cell hoverable
    newCell.style.cursor = 'pointer';
    newCell.style.textDecoration = 'underline';
    newCell.style.textDecorationStyle = 'dotted';
  });
}

/**
 * Create tooltip with player details
 */
function createPlayerTooltip(stat, language) {
  const tooltip = document.createElement('div');
  tooltip.className = 'player-tooltip';
  
  // Calculate metrics
  const made = (stat.contracts_made || 0) + (stat.contracts_made_with_overtricks || 0);
  const declDummy = (stat.boards_as_declarer || 0) + (stat.boards_as_dummy || 0);
  const successRate = declDummy > 0 ? ((made / declDummy) * 100).toFixed(1) : '0.0';
  
  const defeated = stat.contracts_defeated || 0;
  const timesDefender = stat.boards_as_defender || 0;
  const defenseRate = timesDefender > 0 ? ((defeated / timesDefender) * 100).toFixed(1) : '0.0';
  
  const scoreClass = stat.total_score > 0 ? 'score-positive'
                   : stat.total_score < 0 ? 'score-negative'
                   : 'score-neutral';
  
  tooltip.innerHTML = `
    <table class="tooltip-table">
      <tr>
        <th>${t(language, 'playerCol')}</th>
        <td colspan="2">${escapeHtml(stat.profiles?.display_name || 'Unknown')}</td>
      </tr>
      <tr>
        <th>${t(language, 'totalGamesCol')}</th>
        <td colspan="2">${stat.boards_completed || 0}</td>
      </tr>
      <tr>
        <th>${t(language, 'declarerCol')}</th>
        <td colspan="2">${stat.boards_as_declarer || 0}</td>
      </tr>
      <tr>
        <th>${t(language, 'dummyCol')}</th>
        <td colspan="2">${stat.boards_as_dummy || 0}</td>
      </tr>
      <tr>
        <th>${t(language, 'defenderCol')}</th>
        <td colspan="2">${stat.boards_as_defender || 0}</td>
      </tr>
      <tr>
        <th>${t(language, 'madeCol')}</th>
        <td colspan="2">${made}</td>
      </tr>
      <tr>
        <th>% ${t(language, 'madeCol')}</th>
        <td colspan="2">${successRate}%</td>
      </tr>
      <tr>
        <th>${t(language, 'defeatCol')}</th>
        <td colspan="2">${defeated}</td>
      </tr>
      <tr>
        <th>${t(language, 'defeatPctCol')}</th>
        <td colspan="2">${defenseRate}%</td>
      </tr>
      <tr>
        <th>${t(language, 'scoreCol')}</th>
        <td colspan="2" class="${scoreClass}">${stat.total_score || 0}</td>
      </tr>
    </table>
  `;
  
  return tooltip;
}

/**
 * Position tooltip to the right of the target element
 */
function positionTooltip(tooltip, target) {
  const rect = target.getBoundingClientRect();
  
  // Position to the right of the element
  let top = rect.top + window.scrollY + (rect.height / 2) - (tooltip.offsetHeight / 2);
  let left = rect.right + window.scrollX + 15; // 15px gap from element
  
  // Adjust if tooltip goes off right edge
  if (left + tooltip.offsetWidth > window.innerWidth) {
    left = window.innerWidth - tooltip.offsetWidth - 20;
  }
  
  // Adjust if tooltip goes off top
  if (top < window.scrollY) {
    top = window.scrollY + 10;
  }
  
  // Adjust if tooltip goes off bottom
  if (top + tooltip.offsetHeight > window.innerHeight + window.scrollY) {
    top = window.innerHeight + window.scrollY - tooltip.offsetHeight - 10;
  }
  
  tooltip.style.top = `${top}px`;
  tooltip.style.left = `${left}px`;
}

/**
 * Render Contracts Success Table
 * Made, Failed, Defeated (defense), Defeat %
 */
function renderContractsTable(root, stats) {
  const table = root.querySelector('#contracts-tbody').closest('table');
  const thead = table.querySelector('thead');
  const tbody = table.querySelector('tbody');
  
  if (!tbody) return;

  // Get current language from global state
  const language = currentLanguage;

  // Update table header with current language
  thead.innerHTML = `
    <tr>
      <th>${t(language, 'playerCol')}</th>
      <th>${t(language, 'madeCol')}</th>
      <th>${t(language, 'failedCol')}</th>
      <th>${t(language, 'defeatCol')}</th>
      <th>${t(language, 'defeatPctCol')}</th>
    </tr>
  `;

  // Calculate defense success rate (only when defender) and sort
  const withRates = stats.map(s => {
    const made = (s.contracts_made || 0) + (s.contracts_made_with_overtricks || 0);
    const failed = s.contracts_failed || 0;
    const defeated = s.contracts_defeated || 0;
    const timesDefender = s.boards_as_defender || 0;
    
    // Defense success rate = (defeated / timesDefender) * 100
    const defenseRate = timesDefender > 0 ? ((defeated / timesDefender) * 100) : 0;
    
    return {
      ...s,
      made,
      failed,
      defeated,
      defenseRate: defenseRate.toFixed(1)
    };
  }).sort((a, b) => b.defenseRate - a.defenseRate);

  tbody.innerHTML = withRates.map(s => {
    const rateClass = s.defenseRate >= 65 ? 'success-high' 
                    : s.defenseRate >= 50 ? 'success-medium' 
                    : 'success-low';
    
    return `
      <tr>
        <td>${escapeHtml(s.profiles?.display_name || 'Unknown')}</td>
        <td>${s.made}</td>
        <td>${s.failed}</td>
        <td>${s.defeated}</td>
        <td class="${rateClass}">${s.defenseRate}%</td>
      </tr>
    `;
  }).join('');
}

/**
 * Render Scoring Table (Total Score, Small Slams, Grand Slams)
 */
function renderScoringTable(root, stats) {
  const table = root.querySelector('#scoring-tbody').closest('table');
  const thead = table.querySelector('thead');
  const tbody = table.querySelector('tbody');
  
  if (!tbody) return;

  // Get current language from global state
  const language = currentLanguage;

  // Update table header with current language
  thead.innerHTML = `
    <tr>
      <th>${t(language, 'playerCol')}</th>
      <th>${t(language, 'scoreCol')}</th>
      <th>${t(language, 'smallSlamsCol')}</th>
      <th>${t(language, 'grandSlamsCol')}</th>
    </tr>
  `;

  const sorted = stats.sort((a, b) => 
    (b.total_score || 0) - (a.total_score || 0)
  );

  tbody.innerHTML = sorted.map(s => {
    const scoreClass = s.total_score > 0 ? 'score-positive'
                     : s.total_score < 0 ? 'score-negative'
                     : 'score-neutral';
    
    return `
      <tr>
        <td>${escapeHtml(s.profiles?.display_name || 'Unknown')}</td>
        <td class="${scoreClass}">${s.total_score || 0}</td>
        <td>${s.small_slams_bid || 0}</td>
        <td>${s.grand_slams_bid || 0}</td>
      </tr>
    `;
  }).join('');
}

/**
 * Show error message
 */
function showErrorMessage(root, message = 'Грешка при зареждане на данни') {
  const tables = ['partnerships-tbody', 'participation-tbody', 'contracts-tbody', 'scoring-tbody'];
  
  tables.forEach(tableId => {
    const tbody = root.querySelector('#' + tableId);
    if (tbody) {
      const cols = tbody.closest('table').querySelectorAll('th').length;
      tbody.innerHTML = `<tr><td colspan="${cols}" class="text-center text-danger py-3">${escapeHtml(message)}</td></tr>`;
    }
  });
}

/**
 * Escape HTML to prevent XSS
 */
function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
