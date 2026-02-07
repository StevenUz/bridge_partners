import template from './table.html?raw';
import './table.css';
import './table-cards.css';
import { applyTranslations, languages } from '../../i18n/i18n.js';
import { dealCards } from './card-dealer.js';
import { DetermineAuctionResult, CallType } from '../../bridge/auction.js';
import { createCardElement } from './card-renderer.js';

const seatOrder = ['south', 'west', 'north', 'east'];
const suitOrder = ['C', 'D', 'H', 'S', 'NT'];

function sameTeam(a, b) {
  const ns = ['north', 'south'];
  const ew = ['east', 'west'];
  return (ns.includes(a) && ns.includes(b)) || (ew.includes(a) && ew.includes(b));
}

function parseBid(call) {
  return {
    level: Number(call[0]),
    strain: call.slice(1)
  };
}

function bidRank(call) {
  const { level, strain } = parseBid(call);
  return level * 10 + suitOrder.indexOf(strain);
}

function isHigherBid(candidate, lastBid) {
  if (!lastBid) return true;
  return bidRank(candidate) > bidRank(lastBid);
}

// Sample table data
const currentTable = {
  id: 1,
  players: {
    north: null,
    south: null,
    west: null,
    east: null
  },
  observers: []
};

// Chat state
const lobbyChatMessages = [];

const tableChatMessages = [];

const MAX_CHAT_MESSAGES = 15;

// Card game state
let currentDeal = null;
let dealNumber = 1;
let hcpScores = { north: 0, east: 0, south: 0, west: 0 };
let biddingState = null;

// Play state for tracking tricks after contract
let playState = {
  contract: null,        // { level, strain, doubled, declaringSide }
  declarer: null,        // 'N'/'E'/'S'/'W'
  dummy: null,           // 'N'/'E'/'S'/'W'
  openingLeader: null,   // 'N'/'E'/'S'/'W'
  tricksNS: 0,
  tricksEW: 0,
  inProgress: false
};

// Vulnerability cycle - 16 deals pattern
// "0" = neither vulnerable, "-" = EW vulnerable, "|" = NS vulnerable, "+" = both vulnerable
const vulnerabilityPattern = "0_-_|_+_-_|_+_0_|_+_0_-_+_0_-_|";
const vulnerabilityStates = vulnerabilityPattern.split('_').filter(s => s !== '');

// Track ready state for each player
const playerReadyState = {
  north: false,
  south: false,
  west: false,
  east: false
};

function loadReadyState(tableId) {
  try {
    const raw = localStorage.getItem(`tableReadyState:${tableId}`);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return typeof parsed === 'object' && parsed !== null ? parsed : {};
  } catch (err) {
    console.warn('Failed to load ready state', err);
    return {};
  }
}

function persistReadyState(tableId, state) {
  try {
    localStorage.setItem(`tableReadyState:${tableId}`, JSON.stringify(state));
  } catch (err) {
    console.warn('Failed to persist ready state', err);
  }
}

function syncReadyState(tableId, playerReadyState) {
  const stored = loadReadyState(tableId);
  ['north', 'south', 'east', 'west'].forEach((seat) => {
    if (typeof stored[seat] === 'boolean') {
      playerReadyState[seat] = stored[seat];
    }
  });
}

function getVulnerability(dealNum) {
  const cyclePosition = (dealNum - 1) % 16;
  const symbol = vulnerabilityStates[cyclePosition];
  
  switch (symbol) {
    case '0': return { ns: false, ew: false };
    case '-': return { ns: false, ew: true };
    case '|': return { ns: true, ew: false };
    case '+': return { ns: true, ew: true };
    default: return { ns: false, ew: false };
  }
}

function persistVulnerabilityState(tableId, vulnState) {
  try {
    localStorage.setItem(`tableVulnerability:${tableId}`, JSON.stringify(vulnState));
  } catch (err) {
    console.warn('Failed to persist vulnerability state', err);
  }
}

function loadVulnerabilityState(tableId) {
  try {
    const raw = localStorage.getItem(`tableVulnerability:${tableId}`);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (err) {
    console.warn('Failed to load vulnerability state', err);
    return null;
  }
}

function persistDealState(tableId, dealState) {
  try {
    localStorage.setItem(`tableDealState:${tableId}`, JSON.stringify(dealState));
  } catch (err) {
    console.warn('Failed to persist deal state', err);
  }
}

function loadDealState(tableId) {
  try {
    const raw = localStorage.getItem(`tableDealState:${tableId}`);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (err) {
    console.warn('Failed to load deal state', err);
    return null;
  }
}

function persistBiddingState(tableId, biddingState) {
  try {
    localStorage.setItem(`tableBiddingState:${tableId}`, JSON.stringify(biddingState));
  } catch (err) {
    console.warn('Failed to persist bidding state', err);
  }
}

function loadBiddingState(tableId) {
  try {
    const raw = localStorage.getItem(`tableBiddingState:${tableId}`);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (err) {
    console.warn('Failed to load bidding state', err);
    return null;
  }
}

function computeHCP(hand) {
  const values = { A: 4, K: 3, Q: 2, J: 1 };
  return hand.reduce((sum, card) => sum + (values[card.rank] || 0), 0);
}

// Get player position from URL
function getPlayerPosition() {
  const params = new URLSearchParams(window.location.search);
  // Default to Marco's seat (north) when no position is provided so preview renders from his perspective
  return params.get('position') || 'north';
}

function getTableId() {
  const params = new URLSearchParams(window.location.search);
  const fromUrl = params.get('id');
  if (fromUrl) return fromUrl;
  const currentPlayer = getCurrentPlayer();
  return currentPlayer?.tableId || '1';
}

function getCurrentPlayer() {
  try {
    const sessionPlayer = sessionStorage.getItem('currentPlayer');
    if (sessionPlayer) {
      return JSON.parse(sessionPlayer);
    }
    const playerData = localStorage.getItem('currentPlayer');
    if (playerData) {
      return JSON.parse(playerData);
    }
  } catch (err) {
    console.warn('Failed to read current player', err);
  }
  return null;
}

async function loadRoomPlayers(ctx, roomId) {
  if (!ctx?.supabaseClient || !roomId) return;

  const { data, error } = await ctx.supabaseClient
    .from('room_seats')
    .select('seat_position, profile:profiles(id, username, display_name)')
    .eq('room_id', roomId);

  if (error) {
    console.error('Failed to load room seats', error);
    return;
  }

  currentTable.players = { north: null, south: null, east: null, west: null };
  (data || []).forEach((seat) => {
    const label = seat.profile?.username || seat.profile?.display_name || null;
    currentTable.players[seat.seat_position] = label;
  });
}

function updateVulnerabilityIndicators(host, ctx, dealNum) {
  const vulnerability = getVulnerability(dealNum);
  
  // North-South partnership (north and south players)
  const nsElement = host.querySelector('[data-vulnerability-ns]');
  const nsNamesElement = host.querySelector('[data-vulnerability-names-ns]');
  const nsStatusElement = host.querySelector('[data-vulnerability-status-ns]');
  
  if (nsElement && nsNamesElement && nsStatusElement) {
    const northName = currentTable.players.north || ctx.t('seatNorth');
    const southName = currentTable.players.south || ctx.t('seatSouth');
    
    nsNamesElement.textContent = `${southName}-${northName}`;
    nsStatusElement.textContent = vulnerability.ns ? ctx.t('vulnerable') : ctx.t('notVulnerable');
    
    nsElement.className = `vulnerability-pair vulnerability-ns ${vulnerability.ns ? 'vulnerable' : 'not-vulnerable'}`;
  }
  
  // East-West partnership (east and west players)
  const ewElement = host.querySelector('[data-vulnerability-ew]');
  const ewNamesElement = host.querySelector('[data-vulnerability-names-ew]');
  const ewStatusElement = host.querySelector('[data-vulnerability-status-ew]');
  
  if (ewElement && ewNamesElement && ewStatusElement) {
    const eastName = currentTable.players.east || ctx.t('seatEast');
    const westName = currentTable.players.west || ctx.t('seatWest');
    
    ewNamesElement.textContent = `${eastName}-${westName}`;
    ewStatusElement.textContent = vulnerability.ew ? ctx.t('vulnerable') : ctx.t('notVulnerable');
    
    ewElement.className = `vulnerability-pair vulnerability-ew ${vulnerability.ew ? 'vulnerable' : 'not-vulnerable'}`;
  }
  
  // Persist vulnerability state for other tabs
  persistVulnerabilityState(currentTable.id, { dealNumber: dealNum, vulnerability });
}

// Update vulnerability indicators with contract and tricks after bidding ends
function updateVulnerabilityWithContract(host, ctx, dealNum, playState) {
  const vulnerability = getVulnerability(dealNum);
  const { contract, tricksNS, tricksEW } = playState;
  
  // Format contract string: e.g. "3NT", "4HX", "6SXX"
  const contractStr = contract 
    ? `${contract.level}${contract.strain}${contract.doubled === 'Doubled' ? 'X' : (contract.doubled === 'Redoubled' ? 'XX' : '')}`
    : '';
  
  // North-South partnership
  const nsElement = host.querySelector('[data-vulnerability-ns]');
  const nsNamesElement = host.querySelector('[data-vulnerability-names-ns]');
  const nsStatusElement = host.querySelector('[data-vulnerability-status-ns]');
  
  if (nsElement && nsNamesElement && nsStatusElement) {
    const northName = currentTable.players.north || ctx.t('seatNorth');
    const southName = currentTable.players.south || ctx.t('seatSouth');
    
    nsNamesElement.textContent = `${southName}-${northName}`;
    
    // Abbreviated vulnerability: V/NV (З/БЗ in BG)
    const vulnShort = vulnerability.ns ? ctx.t('vulnerableShort') : ctx.t('notVulnerableShort');
    
    // If NS is declaring side, show contract
    if (contract && contract.declaringSide === 'NS') {
      nsStatusElement.textContent = `${vulnShort} - ${contractStr} - ${tricksNS}`;
    } else {
      nsStatusElement.textContent = `${vulnShort} - ${tricksNS}`;
    }
    
    nsElement.className = `vulnerability-pair vulnerability-ns ${vulnerability.ns ? 'vulnerable' : 'not-vulnerable'}`;
    console.log('[vuln] NS status ->', nsStatusElement.textContent);
  }
  
  // East-West partnership
  const ewElement = host.querySelector('[data-vulnerability-ew]');
  const ewNamesElement = host.querySelector('[data-vulnerability-names-ew]');
  const ewStatusElement = host.querySelector('[data-vulnerability-status-ew]');
  
  if (ewElement && ewNamesElement && ewStatusElement) {
    const eastName = currentTable.players.east || ctx.t('seatEast');
    const westName = currentTable.players.west || ctx.t('seatWest');
    
    ewNamesElement.textContent = `${eastName}-${westName}`;
    
    // Abbreviated vulnerability: V/NV (З/БЗ in BG)
    const vulnShort = vulnerability.ew ? ctx.t('vulnerableShort') : ctx.t('notVulnerableShort');
    
    // If EW is declaring side, show contract
    if (contract && contract.declaringSide === 'EW') {
      ewStatusElement.textContent = `${vulnShort} - ${contractStr} - ${tricksEW}`;
    } else {
      ewStatusElement.textContent = `${vulnShort} - ${tricksEW}`;
    }
    
    ewElement.className = `vulnerability-pair vulnerability-ew ${vulnerability.ew ? 'vulnerable' : 'not-vulnerable'}`;
    console.log('[vuln] EW status ->', ewStatusElement.textContent);
  }
}

function createCardDisplay(hand, position, faceVisible, isRedBack) {
  const container = document.createElement('div');
  container.className = `hand-display hand-${position}`;

  hand.forEach(card => {
    const cardEl = createCardElement(card, faceVisible, isRedBack);
    container.appendChild(cardEl);
  });

  return container;
}

export const tablePage = {
  path: '/table',
  name: 'table',
  async render(container, ctx) {
    const host = document.createElement('section');
    host.innerHTML = template;

    const tableId = getTableId();
    currentTable.id = tableId;

    await loadRoomPlayers(ctx, tableId);

    try {
      // Update current table with joined player info
      const currentPlayer = getCurrentPlayer();
      let currentUser = null;
      try {
        currentUser = JSON.parse(localStorage.getItem('currentUser'));
      } catch (err) {
        console.warn('Failed to read current user', err);
      }

      if (currentPlayer) {
        const playerName = currentPlayer.name
          || currentUser?.username
          || currentUser?.display_name
          || `Player ${currentPlayer.seat.charAt(0).toUpperCase()}`;
        currentTable.players[currentPlayer.seat] = playerName;
        console.log(`✓ Joined table ${currentPlayer.tableId} as ${currentPlayer.seat}: ${playerName}`);
      } else {
        console.log('No current player info - viewing table as observer');
      }
    } catch (err) {
      console.error('Error initializing player:', err);
    }

    const viewPosition = getPlayerPosition();
    const viewerSeat = viewPosition === 'observer' ? null : viewPosition;
    const isObserver = false; // Show only own cards

    const seatLabels = {
      south: ctx.t('seatSouth'),
      west: ctx.t('seatWest'),
      north: ctx.t('seatNorth'),
      east: ctx.t('seatEast')
    };

    const suitSymbols = { C: '♣', D: '♦', H: '♥', S: '♠', NT: 'NT' };

    const getSeatName = (seat) => currentTable.players[seat] || positionLabels[seat] || seat;
    const getSeatPlayerName = (seat) => currentTable.players[seat] || positionLabels[seat] || seat;
    const nextSeat = (seat) => seatOrder[(seatOrder.indexOf(seat) + 1) % seatOrder.length];

    function formatCall(call) {
      if (call === 'pass') return ctx.t('pass');
      if (call === 'double') return ctx.t('double');
      if (call === 'redouble') return ctx.t('redouble');
      const { level, strain } = parseBid(call);
      const symbol = suitSymbols[strain] || strain;
      if (strain === 'NT') {
        return `<span class="bid-level">${level}</span><span class="bid-suit nt">${symbol}</span>`;
      }
      return `<span class="bid-level">${level}</span><span class="bid-suit">${symbol}</span>`;
    }

    function callCssClass(call) {
      if (call === 'pass') return 'call-pass';
      if (call === 'double') return 'call-double';
      if (call === 'redouble') return 'call-redouble';
      const { strain } = parseBid(call);
      return `call-suit-${strain.toLowerCase()}`;
    }

    applyTranslations(host, ctx.language);

    const resetBtn = host.querySelector('[data-action="reset-game"]');
    const resetGameState = () => {
      try {
        localStorage.removeItem(`tableReadyState:${currentTable.id}`);
        localStorage.removeItem(`tableDealState:${currentTable.id}`);
        localStorage.removeItem(`tableBiddingState:${currentTable.id}`);
        localStorage.removeItem(`tableVulnerability:${currentTable.id}`);
      } catch (err) {
        console.warn('Failed to clear table state', err);
      }

      currentDeal = null;
      biddingState = null;
      playState = {
        contract: null,
        declarer: null,
        dummy: null,
        openingLeader: null,
        tricksNS: 0,
        tricksEW: 0,
        inProgress: false
      };
      hcpScores = { north: 0, east: 0, south: 0, west: 0 };
      dealNumber = 1;
      ['north', 'south', 'east', 'west'].forEach((seat) => {
        playerReadyState[seat] = false;
      });
      persistReadyState(currentTable.id, playerReadyState);

      window.location.reload();
    };

    const showResetModal = () => {
      const modal = document.createElement('div');
      modal.className = 'reset-modal-overlay';
      modal.innerHTML = `
        <div class="reset-modal">
          <div class="reset-modal-header">
            <i class="bi bi-exclamation-triangle-fill text-warning me-2"></i>
            <h5 class="mb-0">${ctx.t('resetGameConfirmTitle')}</h5>
          </div>
          <div class="reset-modal-body">
            <p>${ctx.t('resetGameConfirm')}</p>
          </div>
          <div class="reset-modal-footer">
            <button class="btn btn-outline-light" data-reset-cancel>${ctx.t('resetGameConfirmNo')}</button>
            <button class="btn btn-danger" data-reset-confirm>${ctx.t('resetGameConfirmYes')}</button>
          </div>
        </div>
      `;

      host.appendChild(modal);

      const closeModal = () => modal.remove();
      modal.querySelector('[data-reset-cancel]').addEventListener('click', closeModal);
      modal.addEventListener('click', (event) => {
        if (event.target === modal) closeModal();
      });
      modal.querySelector('[data-reset-confirm]').addEventListener('click', () => {
        closeModal();
        resetGameState();
      });
    };

    if (resetBtn) {
      const resetLabel = ctx.t('resetGame');
      resetBtn.title = resetLabel;
      resetBtn.setAttribute('aria-label', resetLabel);

      resetBtn.addEventListener('click', showResetModal);
    }

    // Initialize vulnerability indicators for current state
    const storedDeal = loadDealState(currentTable.id);
    const currentDealNumber = storedDeal?.dealNumber || dealNumber;
    updateVulnerabilityIndicators(host, ctx, currentDealNumber);

    // Hydrate ready state from storage
    syncReadyState(currentTable.id, playerReadyState);

    // Start hourglass spinning animation immediately (waiting for players to be ready)
    const hourglassIcon = host.querySelector('[data-hourglass-icon]');
    if (hourglassIcon) {
      hourglassIcon.classList.add('hourglass-spinning');
    }

    // Render seated players in waiting view
    const positionLabels = {
      north: ctx.t('seatNorth'),
      south: ctx.t('seatSouth'),
      west: ctx.t('seatWest'),
      east: ctx.t('seatEast')
    };

    const visualPanels = {
      north: host.querySelector('[data-player-position="north"]'),
      south: host.querySelector('[data-player-position="south"]'),
      west: host.querySelector('[data-player-position="west"]'),
      east: host.querySelector('[data-player-position="east"]')
    };

    // Highlight current player's seat
    try {
      if (currentPlayer && visualPanels[currentPlayer.seat]) {
        visualPanels[currentPlayer.seat].classList.add('current-player');
      }
    } catch (err) {
      console.warn('Could not highlight player seat:', err);
    }

    const seatingOrder = ['north', 'east', 'south', 'west'];
    const viewerIdx = viewerSeat ? seatingOrder.indexOf(viewerSeat) : -1;
    const bottomSeat = viewerIdx >= 0 ? seatingOrder[viewerIdx] : 'south';
    const opposite = (s) => ({ north:'south', south:'north', east:'west', west:'east' }[s]);
    const nextClockwise = (s) => seatingOrder[(seatingOrder.indexOf(s) + 1) % 4];
    const prevClockwise = (s) => seatingOrder[(seatingOrder.indexOf(s) + 3) % 4];
    const topSeat = opposite(bottomSeat);
    const leftSeat = nextClockwise(bottomSeat);
    const rightSeat = prevClockwise(bottomSeat);

    const slotMapping = [
      { slot: 'south', seat: bottomSeat },
      { slot: 'north', seat: topSeat },
      { slot: 'west',  seat: leftSeat },
      { slot: 'east',  seat: rightSeat }
    ];

    // Define gameArea early so renderDealAndBidding can use it
    const gameArea = host.querySelector('[data-game-area]');

    const updateActionIndicator = () => {
      const targetButtons = new Set();
      const targetPanels = new Set();
      const targetLabels = new Set();
      const targetToggles = new Set();

      const markSeat = (seat, { highlightToggle } = {}) => {
        const mapping = slotMapping.find(m => m.seat === seat);
        if (mapping) {
          const panel = visualPanels[mapping.slot];
          if (panel) {
            targetPanels.add(panel);
            const btn = panel.querySelector('.player-name-button');
            if (btn) targetButtons.add(btn);
          }
          const label = host.querySelector(`.hcp-label.hcp-${mapping.slot}`);
          if (label) targetLabels.add(label);
        }

        const toggle = host.querySelector(`[data-ready-toggle="${seat}"]`);
        if (toggle && highlightToggle) {
          targetToggles.add(toggle);
        }
      };

      const dealerSeat = seatOrder[0];
      const storedBidding = loadBiddingState(currentTable.id);
      const storedDeal = loadDealState(currentTable.id);

      // If no deal yet, highlight dealer who needs to mark ready
      if (!storedDeal) {
        markSeat(dealerSeat, { highlightToggle: !playerReadyState[dealerSeat] });
      }
      // If deal exists but all not ready, highlight players who need to mark ready
      else if (storedDeal && !storedBidding) {
        ['north', 'south', 'east', 'west'].forEach(seat => {
          if (!playerReadyState[seat]) {
            markSeat(seat, { highlightToggle: true });
          }
        });
      }
      // If bidding state exists, highlight current bidder
      else if (storedBidding && !storedBidding.ended) {
        markSeat(storedBidding.currentSeat);
      }

      const syncClass = (selector, targets) => {
        host.querySelectorAll(selector).forEach(el => {
          if (!targets.has(el)) el.classList.remove('action-required');
        });
        targets.forEach(el => el.classList.add('action-required'));
      };

      syncClass('.player-name-button.action-required, .player-name-button', targetButtons);
      syncClass('.player-position-panel.action-required, .player-position-panel', targetPanels);
      syncClass('.hcp-label.action-required, .hcp-label', targetLabels);
      syncClass('.toggle-switch.action-required, .toggle-switch', targetToggles);
    };

    const renderDealAndBidding = () => {
      const storedDeal = loadDealState(currentTable.id);
      const storedBidding = loadBiddingState(currentTable.id);
      if (!storedDeal) return; // No deal yet

      // Disable deal during an active deal/bidding round
      const dealBtn = host.querySelector('[data-action="deal-cards"]');
      if (dealBtn) {
        dealBtn.disabled = true;
        dealBtn.classList.remove('dealer-ready');
      }

      // Ensure status shows bidding phase
      const statusEl = host.querySelector('[data-status-text]');
      const hourglassIcon = host.querySelector('[data-hourglass-icon]');
      if (statusEl) statusEl.textContent = 'Waiting for bidding...';
      if (hourglassIcon) hourglassIcon.classList.add('hourglass-spinning');

      // Hide ready panels
      ['north', 'south', 'west', 'east'].forEach(position => {
        const panel = host.querySelector(`[data-player-position="${position}"]`);
        if (panel) panel.style.display = 'none';
      });

      currentDeal = {
        dealNumber: storedDeal.dealNumber,
        hands: storedDeal.hands,
        isEvenDeal: storedDeal.isEvenDeal
      };
      hcpScores = storedDeal.hcpScores || { north: 0, east: 0, south: 0, west: 0 };

      // Update vulnerability indicators for current deal
      updateVulnerabilityIndicators(host, ctx, currentDeal.dealNumber);

      const isRedBack = currentDeal.isEvenDeal;

      // Render hands for all four slots
      const renderHandForSlot = (slotName, seatName) => {
        const container = host.querySelector(`[data-cards-${slotName}]`);
        if (!container) return;
        container.innerHTML = '';
        
        // Always show player name and position
        const nameLabel = document.createElement('div');
        nameLabel.className = `hcp-label hcp-${slotName}`;
        
        // North and South on one line; West and East on two lines with center align
        if (['west', 'east'].includes(slotName)) {
          // Side players: text on two lines, centered
          nameLabel.style.textAlign = 'center';
          if (viewerSeat === seatName) {
            nameLabel.innerHTML = `${positionLabels[seatName]}<br>${getSeatPlayerName(seatName)}: ${hcpScores[seatName]}`;
          } else {
            nameLabel.innerHTML = `${positionLabels[seatName]}<br>${getSeatPlayerName(seatName)}`;
          }
        } else {
          // North and South: text on one line
          if (viewerSeat === seatName) {
            nameLabel.innerHTML = `${positionLabels[seatName]} – ${getSeatPlayerName(seatName)}: ${hcpScores[seatName]}`;
          } else {
            nameLabel.innerHTML = `${positionLabels[seatName]} – ${getSeatPlayerName(seatName)}`;
          }
        }
        container.appendChild(nameLabel);
        
        // Render cards: face-up for viewer, face-down (backs) for others
        const hand = createCardDisplay(
          currentDeal.hands[seatName],
          slotName,
          viewerSeat === seatName, // Show face-up only for viewer's seat
          isRedBack
        );
        container.appendChild(hand);
      };

      renderHandForSlot('north', topSeat);
      renderHandForSlot('south', bottomSeat);
      renderHandForSlot('west', leftSeat);
      renderHandForSlot('east', rightSeat);

      // Always render bidding panel (create default state if missing)
      const dealerSeat = seatOrder[(currentDeal.dealNumber - 1) % seatOrder.length];
      biddingState = storedBidding || {
        dealer: dealerSeat,
        currentSeat: dealerSeat,
        bids: [],
        passCount: 0,
        ended: false
      };

      const biddingTemplate = document.createElement('div');
      biddingTemplate.className = 'bidding-panel';
      biddingTemplate.innerHTML = `
        <div class="bidding-left">
          <div class="bidding-history-table" data-bidding-history>
            <table class="bid-table">
              <thead>
                <tr class="bid-table-header" data-bid-header></tr>
              </thead>
              <tbody class="bid-table-body" data-bid-body></tbody>
            </table>
          </div>
        </div>
        <div class="bidding-right">
          <div class="bid-grid" data-bid-grid></div>
          <div class="call-row" data-call-row></div>
        </div>
      `;

      gameArea.innerHTML = '';
      gameArea.appendChild(biddingTemplate);

      const historyEl = gameArea.querySelector('[data-bidding-history]');
      const bidGrid = gameArea.querySelector('[data-bid-grid]');
      const callRow = gameArea.querySelector('[data-call-row]');

        const suitSymbols = { C: '♣', D: '♦', H: '♥', S: '♠', NT: 'NT' };

        const getSeatName = (seat) => currentTable.players[seat] || positionLabels[seat] || seat;
        const nextSeat = (seat) => seatOrder[(seatOrder.indexOf(seat) + 1) % seatOrder.length];

        function formatCall(call) {
          if (call === 'pass') return ctx.t('pass');
          if (call === 'double') return ctx.t('double');
          if (call === 'redouble') return ctx.t('redouble');
          const { level, strain } = parseBid(call);
          const symbol = suitSymbols[strain] || strain;
          if (strain === 'NT') {
            return `<span class="bid-level">${level}</span><span class="bid-suit nt">${symbol}</span>`;
          }
          return `<span class="bid-level">${level}</span><span class="bid-suit">${symbol}</span>`;
        }

        function callCssClass(call) {
          if (call === 'pass') return 'call-pass';
          if (call === 'double') return 'call-double';
          if (call === 'redouble') return 'call-redouble';
          const { strain } = parseBid(call);
          return `call-suit-${strain.toLowerCase()}`;
        }

        const classifyCall = (call) => {
          if (call === 'pass') return 'pass';
          if (call === 'double') return 'double';
          if (call === 'redouble') return 'redouble';
          return 'bid';
        };

        const lastNonPass = () => {
          for (let i = biddingState.bids.length - 1; i >= 0; i--) {
            if (biddingState.bids[i].type !== 'pass') return biddingState.bids[i];
          }
          return null;
        };

        const lastCall = () => biddingState.bids[biddingState.bids.length - 1] || null;

        const canDouble = () => {
          const recent = lastNonPass();
          const recentCall = lastCall();
          if (!recent || recent.type !== 'bid') return false;
          if (recentCall && (recentCall.type === 'double' || recentCall.type === 'redouble')) return false;
          return !sameTeam(biddingState.currentSeat, recent.seat);
        };

        const canRedouble = () => {
          const recentCall = lastCall();
          if (!recentCall || recentCall.type !== 'double') return false;
          return !sameTeam(biddingState.currentSeat, recentCall.seat);
        };

        const lastBid = () => {
          for (let i = biddingState.bids.length - 1; i >= 0; i--) {
            if (biddingState.bids[i].type === 'bid') return biddingState.bids[i];
          }
          return null;
        };

        // --- Bidding-to-Play Transition Integration ---
        function toAuctionCalls(bids) {
          // Transform local bid objects to auction.js format
          return bids.map(b => {
            if (b.type === 'bid') {
              // b.call: e.g. '2H', '3NT'
              const level = Number(b.call[0]);
              const strain = b.call.slice(1);
              return { type: CallType.BID, level, strain, seat: b.seat.charAt(0).toUpperCase() };
            } else if (b.type === 'pass') {
              return { type: CallType.PASS, seat: b.seat.charAt(0).toUpperCase() };
            } else if (b.type === 'double') {
              return { type: CallType.DOUBLE, seat: b.seat.charAt(0).toUpperCase() };
            } else if (b.type === 'redouble') {
              return { type: CallType.REDOUBLE, seat: b.seat.charAt(0).toUpperCase() };
            }
          });
        }

        function checkAuctionEndAndTransition() {
          if (!biddingState.ended) return;
          // Dealer seat in auction.js is 'N'/'E'/'S'/'W'
          const dealerMap = { north: 'N', east: 'E', south: 'S', west: 'W' };
          const dealerSeat = dealerMap[biddingState.dealer];
          const calls = toAuctionCalls(biddingState.bids);
          const result = DetermineAuctionResult(calls, dealerSeat);
          if (result.result === 'PassedOut') {
            // Show passed out message, reset for next deal
            const statusEl = host.querySelector('[data-status-text]');
            if (statusEl) statusEl.textContent = 'Passed Out – No play.';
            playState.inProgress = false;
          } else if (result.result === 'Contract') {
            // Store contract, declarer, dummy, openingLeader in state for play phase
            playState.contract = result.contract;
            playState.declarer = result.declarer;
            playState.dummy = result.dummy;
            playState.openingLeader = result.openingLeader;
            playState.tricksNS = 0;
            playState.tricksEW = 0;
            playState.inProgress = true;

            const statusEl = host.querySelector('[data-status-text]');
            if (statusEl) {
              statusEl.textContent = `Contract: ${result.contract.level}${result.contract.strain}${result.contract.doubled !== 'None' ? (result.contract.doubled === 'Doubled' ? 'X' : 'XX') : ''} by ${result.declarer} (Dummy: ${result.dummy}, Lead: ${result.openingLeader})`;
            }

            // Update vulnerability indicators with contract and tricks
            updateVulnerabilityWithContract(host, ctx, currentDeal.dealNumber, playState);
          }
        }

        // --- End Integration ---

        const renderHistory = () => {
          if (!historyEl) return;
          const headerRow = historyEl.querySelector('[data-bid-header]');
          const bodyEl = historyEl.querySelector('[data-bid-body]');
          const escapeAttr = (value) => String(value)
            .replace(/&/g, '&amp;')
            .replace(/"/g, '&quot;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');

          const dealerIdx = seatOrder.indexOf(biddingState.dealer);
          const columnOrder = [];
          for (let i = 0; i < 4; i++) {
            columnOrder.push(seatOrder[(dealerIdx + i) % 4]);
          }

          headerRow.innerHTML = columnOrder
            .map((seat) => {
              const name = getSeatName(seat);
              const safeName = escapeAttr(name);
              return `<th title="${safeName}">${safeName}</th>`;
            })
            .join('');

          const bidsBySeat = { north: [], east: [], south: [], west: [] };
          biddingState.bids.forEach(bid => {
            bidsBySeat[bid.seat].push(bid.call);
          });

          const maxRows = Math.max(...columnOrder.map(seat => bidsBySeat[seat].length), 1);

          const rows = [];
          for (let rowIdx = 0; rowIdx < maxRows; rowIdx++) {
            const cells = columnOrder.map(seat => {
              const call = bidsBySeat[seat][rowIdx];
              if (!call) return '<td></td>';
              const formatted = formatCall(call);
              const cssClass = callCssClass(call);
              return `<td><span class="bid-call ${cssClass}">${formatted}</span></td>`;
            });
            rows.push(`<tr>${cells.join('')}</tr>`);
          }

          bodyEl.innerHTML = rows.join('');
        };

        const updateButtons = () => {
          const highestBid = lastBid();
          const isMyTurn = viewerSeat === biddingState.currentSeat;
          
          const bidButtons = bidGrid.querySelectorAll('[data-call]');
          bidButtons.forEach((btn) => {
            const call = btn.getAttribute('data-call');
            // Button is enabled only if it's my turn, bidding hasn't ended, and bid is valid
            const allowed = isMyTurn && !biddingState.ended && isHigherBid(call, highestBid?.call);
            btn.disabled = !allowed;
          });

          const passBtn = callRow.querySelector('[data-call="pass"]');
          const doubleBtn = callRow.querySelector('[data-call="double"]');
          const redoubleBtn = callRow.querySelector('[data-call="redouble"]');

          // Only enable control buttons if it's my turn
          if (passBtn) passBtn.disabled = !isMyTurn || biddingState.ended;
          if (doubleBtn) doubleBtn.disabled = !isMyTurn || biddingState.ended || !canDouble();
          if (redoubleBtn) redoubleBtn.disabled = !isMyTurn || biddingState.ended || !canRedouble();
        };

        const updateTurnIndicator = () => {
          // Remove active-turn class from all panels
          slotMapping.forEach(({ slot }) => {
            const panel = visualPanels[slot];
            if (panel) {
              panel.classList.remove('active-turn');
              const badge = panel.querySelector('.turn-indicator-badge');
              if (badge) badge.remove();
            }
          });

          // Add active-turn class to current player's panel
          if (!biddingState.ended) {
            const mapping = slotMapping.find(m => {
              const seat = ['north', 'south', 'west', 'east'].find(s => currentTable.players[s] && biddingState.currentSeat === s);
              return m.seat === seat;
            });
            
            if (mapping) {
              const panel = visualPanels[mapping.slot];
              if (panel) {
                panel.classList.add('active-turn');
                // Add badge showing it's their turn
                const badge = document.createElement('div');
                badge.className = 'turn-indicator-badge';
                badge.innerHTML = '→';
                badge.title = `${getSeatPlayerName(biddingState.currentSeat)}'s turn`;
                panel.appendChild(badge);
              }
            }
          }
        };

        const commitState = () => {
          currentDeal.bidding = { ...biddingState };
          currentDeal.bidHistory = [...biddingState.bids];
        };

        const handleCall = (call) => {
          // Only allow current player to make a call
          if (viewerSeat !== biddingState.currentSeat) return;
          if (biddingState.ended) return;
          const type = classifyCall(call);

          if (type === 'bid' && !isHigherBid(call, lastBid()?.call)) return;
          if (type === 'double' && !canDouble()) return;
          if (type === 'redouble' && !canRedouble()) return;

          biddingState.bids.push({
            seat: biddingState.currentSeat,
            call,
            type
          });

          biddingState.passCount = type === 'pass' ? biddingState.passCount + 1 : 0;
          biddingState.ended = biddingState.passCount >= 3 && biddingState.bids.some((b) => b.type === 'bid');
          console.log('[bidding] call=', call, 'type=', type, 'passCount=', biddingState.passCount, 'ended=', biddingState.ended);
          biddingState.currentSeat = nextSeat(biddingState.currentSeat);

          commitState();
          persistBiddingState(currentTable.id, biddingState);
          renderHistory();
          updateButtons();
          updateTurnIndicator();
          updateActionIndicator();

          // Check if bidding ended and update status
          if (biddingState.ended) {
            dealBtn.disabled = false;
            dealBtn.classList.add('dealer-ready');
            const hourglassIcon = host.querySelector('[data-hourglass-icon]');
            if (hourglassIcon) hourglassIcon.classList.remove('hourglass-spinning');
            checkAuctionEndAndTransition();
          }
        };

        // Build bid buttons 1C-7NT
        for (let level = 1; level <= 7; level++) {
          suitOrder.forEach((strain) => {
            const call = `${level}${strain}`;
            const btn = document.createElement('button');
            btn.className = `btn bid-button ${callCssClass(call)}`;
            btn.innerHTML = formatCall(call);
            btn.setAttribute('data-call', call);
            btn.addEventListener('click', () => handleCall(call));
            bidGrid.appendChild(btn);
          });
        }

        // Pass, Double, Redouble row
        const calls = [
          { key: 'pass', label: ctx.t('pass') },
          { key: 'double', label: ctx.t('double') },
          { key: 'redouble', label: ctx.t('redouble') }
        ];

        calls.forEach(({ key, label }) => {
          const btn = document.createElement('button');
          btn.className = `btn call-button ${callCssClass(key)}`;
          btn.textContent = label;
          btn.setAttribute('data-call', key);
          btn.addEventListener('click', () => {
            handleCall(key);
            // Check if bidding has ended and update UI
            if (biddingState.ended) {
              const statusEl = host.querySelector('[data-status-text]');
              const hourglassIcon = host.querySelector('[data-hourglass-icon]');
              if (statusEl) statusEl.textContent = 'Waiting to play...';
              if (hourglassIcon) {
                hourglassIcon.classList.remove('hourglass-spinning');
              }
            }
          });
          callRow.appendChild(btn);
        });

        renderHistory();
        updateButtons();
        updateTurnIndicator();
        updateActionIndicator();
    };

    const syncReadyUI = () => {
      syncReadyState(currentTable.id, playerReadyState);
      const toggles = host.querySelectorAll('[data-ready-toggle]');
      toggles.forEach((tg) => {
        const seat = tg.getAttribute('data-ready-toggle');
        if (!seat) return;
        if (playerReadyState[seat]) tg.classList.add('enabled'); else tg.classList.remove('enabled');
      });
      checkAllPlayersReady();
      updateActionIndicator();
    };

    slotMapping.forEach(({ slot, seat }) => {
      const panel = visualPanels[slot];
      if (!panel || !seat) return;
      panel.innerHTML = '';
      const playerName = currentTable.players[seat] || ctx.t('seatOpen');
      const btn = document.createElement('button');
      btn.className = 'player-name-button';
      
      // North and South on one line; West and East on two lines with center align
      if (['west', 'east'].includes(slot)) {
        btn.innerHTML = `${positionLabels[seat]}<br>${playerName}`;
        btn.style.textAlign = 'center';
      } else {
        btn.innerHTML = `${positionLabels[seat]} – ${playerName}`;
      }
      
      btn.type = 'button';
      panel.appendChild(btn);

      // Create ready toggle container
      const readyContainer = document.createElement('div');
      readyContainer.className = 'player-ready-container';
      readyContainer.textContent = ctx.t('ready');

      const toggle = document.createElement('div');
      const isViewerSeat = viewerSeat === seat;
      const enabledClass = playerReadyState[seat] ? 'enabled' : '';
      toggle.className = `toggle-switch ${isViewerSeat ? '' : 'disabled'} ${enabledClass}`.trim();
      toggle.setAttribute('data-ready-toggle', seat);
      toggle.innerHTML = '<div class="toggle-switch-knob"></div>';

      // Only current viewer seat can toggle
      if (isViewerSeat) {
        toggle.addEventListener('click', () => {
          const isEnabled = toggle.classList.contains('enabled');
          if (isEnabled) {
            toggle.classList.remove('enabled');
            playerReadyState[seat] = false;
          } else {
            toggle.classList.add('enabled');
            playerReadyState[seat] = true;
          }
          persistReadyState(currentTable.id, playerReadyState);
          checkAllPlayersReady();
        });
      }

      readyContainer.appendChild(toggle);
      panel.appendChild(readyContainer);
    });

    const updateSeatLabels = () => {
      slotMapping.forEach(({ slot, seat }) => {
        const panel = visualPanels[slot];
        if (!panel || !seat) return;
        const btn = panel.querySelector('.player-name-button');
        if (!btn) return;
        const name = getSeatPlayerName(seat);
        if (['west', 'east'].includes(slot)) {
          btn.innerHTML = `${positionLabels[seat]}<br>${name}`;
        } else {
          btn.innerHTML = `${positionLabels[seat]} – ${name}`;
        }
      });

      const storedDeal = loadDealState(currentTable.id);
      const currentDealNumber = storedDeal?.dealNumber || dealNumber;
      updateVulnerabilityIndicators(host, ctx, currentDealNumber);
    };
    
    // Check if all players are ready
    const checkAllPlayersReady = () => {
      const allReady = Object.values(playerReadyState).every((r) => r === true);
      const dealBtn = host.querySelector('[data-action="deal-cards"]');
      const dealerSeat = seatOrder[0]; // Dealer for first round (actual seat)
      const isDealerViewer = dealerSeat === viewerSeat;

      if (dealBtn) {
        if (allReady && isDealerViewer) {
          dealBtn.disabled = false;
          dealBtn.classList.add('dealer-ready');
        } else {
          dealBtn.disabled = true;
          dealBtn.classList.remove('dealer-ready');
        }
      }
      
      // Update action-required indicator
      updateActionIndicator();
    };
    
    // Initialize check
    syncReadyUI();
    updateSeatLabels();

    const getDealRaw = () => localStorage.getItem(`tableDealState:${currentTable.id}`);
    const getBiddingRaw = () => localStorage.getItem(`tableBiddingState:${currentTable.id}`);
    let lastDealRaw = getDealRaw();
    let lastBiddingRaw = getBiddingRaw();

    const maybeRenderDealAndBidding = () => {
      const dealRaw = getDealRaw();
      const biddingRaw = getBiddingRaw();
      if (dealRaw !== lastDealRaw || biddingRaw !== lastBiddingRaw) {
        lastDealRaw = dealRaw;
        lastBiddingRaw = biddingRaw;
        renderDealAndBidding();
      }
    };

    // Listen for storage updates from other tabs to sync ready state in near real time
    const storageHandler = (event) => {
      if (event.key === `tableReadyState:${currentTable.id}`) {
        syncReadyUI();
      }
      if (event.key === `tableDealState:${currentTable.id}` || event.key === `tableBiddingState:${currentTable.id}`) {
        maybeRenderDealAndBidding();
        // Update vulnerability indicators when deal state changes
        const newStoredDeal = loadDealState(currentTable.id);
        if (newStoredDeal) {
          updateVulnerabilityIndicators(host, ctx, newStoredDeal.dealNumber);
        }
      }
      if (event.key === `tableVulnerability:${currentTable.id}`) {
        const vulnState = loadVulnerabilityState(currentTable.id);
        if (vulnState) {
          updateVulnerabilityIndicators(host, ctx, vulnState.dealNumber);
        }
      }
    };
    window.addEventListener('storage', storageHandler);

    let realtimeChannel = null;
    if (ctx.supabaseClient && currentTable.id) {
      realtimeChannel = ctx.supabaseClient
        .channel(`table-seats-${currentTable.id}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'room_seats', filter: `room_id=eq.${currentTable.id}` }, async () => {
          await loadRoomPlayers(ctx, currentTable.id);
          updateSeatLabels();
        })
        .subscribe();
    }

    // Fallback polling to keep state fresh if storage events are missed
    const readySyncInterval = setInterval(() => {
      syncReadyUI();
      maybeRenderDealAndBidding();
    }, 2000);

    // Initial render if deal already exists
    renderDealAndBidding();

    // Back button
    const backBtn = host.querySelector('[data-action="back-lobby"]');
    if (backBtn) {
      backBtn.addEventListener('click', () => {
        // Get current player info
        const currentPlayer = getCurrentPlayer();
        
        if (currentPlayer) {
          // Free up the seat in the table
          const tableId = currentPlayer.tableId;
          currentTable.players[currentPlayer.seat] = null;

          if (ctx.supabaseClient && tableId) {
            ctx.supabaseClient
              .from('room_seats')
              .update({ profile_id: null, seated_at: null })
              .eq('room_id', tableId)
              .eq('seat_position', currentPlayer.seat);
          }
          
          // Clear all table state for this table (deal, bidding, ready, vulnerability)
          localStorage.removeItem(`tableDealState:${tableId}`);
          localStorage.removeItem(`tableBiddingState:${tableId}`);
          localStorage.removeItem(`tableReadyState:${tableId}`);
          localStorage.removeItem(`tableVulnerability:${tableId}`);
        }
        
        // Clear current player info
        localStorage.removeItem('currentPlayer');
        
        // Navigate back to lobby
        ctx.navigate('/lobby');
      });
    }

    // Chat toggle button in header
    let chatToggleClick = null; // Will be set after chat drawer is created

    // Observers indicator in header
    const observersIndicator = host.querySelector('[data-observers-indicator]');
    if (observersIndicator) {
      const hasObservers = currentTable.observers.length > 0;
      const observerNames = hasObservers ? currentTable.observers.join(', ') : 'No observers';
      
      // Create tooltip element
      const tooltip = document.createElement('div');
      tooltip.className = 'observers-tooltip';
      tooltip.textContent = observerNames;
      
      observersIndicator.innerHTML = `<i class="bi ${hasObservers ? 'bi-eye-fill' : 'bi-eye'}"></i>`;
      observersIndicator.className = `observers-indicator ${hasObservers ? 'has-observers' : ''}`;
      observersIndicator.appendChild(tooltip);
      
      // Tooltip show/hide on hover
      observersIndicator.addEventListener('mouseenter', () => {
        tooltip.style.opacity = '1';
        tooltip.style.visibility = 'visible';
        tooltip.style.transform = 'translateX(-50%) translateY(0)';
      });
      
      observersIndicator.addEventListener('mouseleave', () => {
        tooltip.style.opacity = '0';
        tooltip.style.visibility = 'hidden';
        tooltip.style.transform = 'translateX(-50%) translateY(8px)';
      });
    }

    // Deal button
    const dealBtn = host.querySelector('[data-action="deal-cards"]');

    if (dealBtn) {
      dealBtn.addEventListener('click', () => {
        // Reset ready state for next round
        ['north', 'south', 'east', 'west'].forEach((seat) => {
          playerReadyState[seat] = false;
        });
        persistReadyState(currentTable.id, playerReadyState);
        const readyToggles = host.querySelectorAll('.toggle-switch');
        readyToggles.forEach((tg) => tg.classList.remove('enabled'));

        currentDeal = dealCards(dealNumber);
        // Calculate HCP for all hands and store for the current deal
        hcpScores.north = computeHCP(currentDeal.hands.north);
        hcpScores.east  = computeHCP(currentDeal.hands.east);
        hcpScores.south = computeHCP(currentDeal.hands.south);
        hcpScores.west  = computeHCP(currentDeal.hands.west);
        
        // Update vulnerability indicators for current deal
        updateVulnerabilityIndicators(host, ctx, dealNumber);
        
        dealNumber++;
        
        // Persist deal state for other tabs to sync
        persistDealState(currentTable.id, {
          dealNumber: currentDeal.dealNumber,
          hands: currentDeal.hands,
          isEvenDeal: currentDeal.isEvenDeal,
          hcpScores
        });
        
        // Update status to bidding and start hourglass animation
        const statusEl = host.querySelector('[data-status-text]');
        const hourglassIcon = host.querySelector('[data-hourglass-icon]');
        if (statusEl) statusEl.textContent = 'Waiting for bidding...';
        if (hourglassIcon) {
          hourglassIcon.classList.add('hourglass-spinning');
        }

        // Hide player position panels and deal button, show bidding panel
        ['north', 'south', 'west', 'east'].forEach(position => {
          const panel = host.querySelector(`[data-player-position="${position}"]`);
          if (panel) panel.style.display = 'none';
        });
        
        // Render hands
        const isRedBack = currentDeal.isEvenDeal;

        // Build visual mapping based on viewer position
        const order = ['north','east','south','west'];
        const idx = Math.max(0, order.indexOf(viewPosition));
        const bottomSeat = viewPosition === 'observer' || idx === -1 ? 'south' : order[idx];
        const opposite = (s) => ({ north:'south', south:'north', east:'west', west:'east' }[s]);
        const nextClockwise = (s) => order[(order.indexOf(s) + 1) % 4];
        const prevClockwise = (s) => order[(order.indexOf(s) + 3) % 4];
        const topSeat = opposite(bottomSeat);
        const leftSeat = nextClockwise(bottomSeat);
        const rightSeat = prevClockwise(bottomSeat);

        // North (top visual)
        const northContainer = host.querySelector('[data-cards-north]');
        northContainer.innerHTML = '';
        const northHcpLabel = document.createElement('div');
        northHcpLabel.className = 'hcp-label hcp-north';
        northHcpLabel.innerHTML = viewerSeat === topSeat
          ? `${getSeatPlayerName(topSeat)}: ${hcpScores[topSeat]}`
          : `${getSeatPlayerName(topSeat)}`;
        northContainer.appendChild(northHcpLabel);
        const northHand = createCardDisplay(
          currentDeal.hands[topSeat],
          'north',
          isObserver || viewPosition === topSeat,
          isRedBack
        );
        northContainer.appendChild(northHand);
        applyTranslations(northContainer, ctx.language);

        // South (bottom visual)
        const southContainer = host.querySelector('[data-cards-south]');
        southContainer.innerHTML = '';
        const southHcpLabel = document.createElement('div');
        southHcpLabel.className = 'hcp-label hcp-south';
        southHcpLabel.innerHTML = viewerSeat === bottomSeat
          ? `${getSeatPlayerName(bottomSeat)}: ${hcpScores[bottomSeat]}`
          : `${getSeatPlayerName(bottomSeat)}`;
        southContainer.appendChild(southHcpLabel);
        const southHand = createCardDisplay(
          currentDeal.hands[bottomSeat],
          'south',
          isObserver || viewPosition === bottomSeat,
          isRedBack
        );
        southContainer.appendChild(southHand);
        applyTranslations(southContainer, ctx.language);

        // West (left visual)
        const westContainer = host.querySelector('[data-cards-west]');
        westContainer.innerHTML = '';
        const westHcpLabel = document.createElement('div');
        westHcpLabel.className = 'hcp-label hcp-west';
        westHcpLabel.innerHTML = viewerSeat === leftSeat
          ? `${getSeatPlayerName(leftSeat)}: ${hcpScores[leftSeat]}`
          : `${getSeatPlayerName(leftSeat)}`;
        westContainer.appendChild(westHcpLabel);
        const westHand = createCardDisplay(
          currentDeal.hands[leftSeat],
          'west',
          isObserver || viewPosition === leftSeat,
          isRedBack
        );
        westContainer.appendChild(westHand);
        applyTranslations(westContainer, ctx.language);

        // East (right visual)
        const eastContainer = host.querySelector('[data-cards-east]');
        eastContainer.innerHTML = '';
        const eastHcpLabel = document.createElement('div');
        eastHcpLabel.className = 'hcp-label hcp-east';
        eastHcpLabel.innerHTML = viewerSeat === rightSeat
          ? `${getSeatPlayerName(rightSeat)}: ${hcpScores[rightSeat]}`
          : `${getSeatPlayerName(rightSeat)}`;
        eastContainer.appendChild(eastHcpLabel);
        const eastHand = createCardDisplay(
          currentDeal.hands[rightSeat],
          'east',
          isObserver || viewPosition === rightSeat,
          isRedBack
        );
        eastContainer.appendChild(eastHand);
        applyTranslations(eastContainer, ctx.language);

        // Disable deal button during bidding, but keep it visible
        dealBtn.disabled = true;
        dealBtn.classList.remove('dealer-ready');

        const dealerSeat = seatOrder[(currentDeal.dealNumber - 1) % seatOrder.length];

        biddingState = {
          dealer: dealerSeat,
          currentSeat: dealerSeat,
          bids: [],
          passCount: 0,
          ended: false
        };

        // Persist initial bidding state so other tabs/observer can render immediately
        persistBiddingState(currentTable.id, biddingState);

        const biddingTemplate = document.createElement('div');
        biddingTemplate.className = 'bidding-panel';
        biddingTemplate.innerHTML = `
          <div class="bidding-left">
            <div class="bidding-history-table" data-bidding-history>
              <table class="bid-table">
                <thead>
                  <tr class="bid-table-header" data-bid-header></tr>
                </thead>
                <tbody class="bid-table-body" data-bid-body></tbody>
              </table>
            </div>
          </div>
          <div class="bidding-right">
            <div class="bid-grid" data-bid-grid></div>
            <div class="call-row" data-call-row></div>
          </div>
        `;

        gameArea.innerHTML = '';
        gameArea.appendChild(biddingTemplate);
        applyTranslations(gameArea, ctx.language);

        const historyEl = gameArea.querySelector('[data-bidding-history]');
        const bidGrid = gameArea.querySelector('[data-bid-grid]');
        const callRow = gameArea.querySelector('[data-call-row]');

        const classifyCall = (call) => {
          if (call === 'pass') return 'pass';
          if (call === 'double') return 'double';
          if (call === 'redouble') return 'redouble';
          return 'bid';
        };

        const lastNonPass = () => {
          for (let i = biddingState.bids.length - 1; i >= 0; i--) {
            if (biddingState.bids[i].type !== 'pass') return biddingState.bids[i];
          }
          return null;
        };

        const lastBid = () => {
          for (let i = biddingState.bids.length - 1; i >= 0; i--) {
            if (biddingState.bids[i].type === 'bid') return biddingState.bids[i];
          }
          return null;
        };

        const lastCall = () => biddingState.bids[biddingState.bids.length - 1] || null;

        const canDouble = () => {
          const recent = lastNonPass();
          const recentCall = lastCall();
          if (!recent || recent.type !== 'bid') return false;
          if (recentCall && (recentCall.type === 'double' || recentCall.type === 'redouble')) return false;
          return !sameTeam(biddingState.currentSeat, recent.seat);
        };

        const canRedouble = () => {
          const recentCall = lastCall();
          if (!recentCall || recentCall.type !== 'double') return false;
          return !sameTeam(biddingState.currentSeat, recentCall.seat);
        };

        const renderHistory = () => {
          if (!historyEl) return;
          const headerRow = historyEl.querySelector('[data-bid-header]');
          const bodyEl = historyEl.querySelector('[data-bid-body]');
          const escapeAttr = (value) => String(value)
            .replace(/&/g, '&amp;')
            .replace(/"/g, '&quot;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
          
          // Build column order starting from dealer
          const dealerIdx = seatOrder.indexOf(dealerSeat);
          const columnOrder = [];
          for (let i = 0; i < 4; i++) {
            columnOrder.push(seatOrder[(dealerIdx + i) % 4]);
          }

          // Render header
          headerRow.innerHTML = columnOrder
            .map((seat) => {
              const name = getSeatName(seat);
              const safeName = escapeAttr(name);
              return `<th title="${safeName}">${safeName}</th>`;
            })
            .join('');

          // Group bids by seat
          const bidsBySeat = { north: [], east: [], south: [], west: [] };
          biddingState.bids.forEach(bid => {
            bidsBySeat[bid.seat].push(bid.call);
          });

          // Find max rows needed
          const maxRows = Math.max(...columnOrder.map(seat => bidsBySeat[seat].length), 1);

          // Build rows
          const rows = [];
          for (let rowIdx = 0; rowIdx < maxRows; rowIdx++) {
            const cells = columnOrder.map(seat => {
              const call = bidsBySeat[seat][rowIdx];
              if (!call) return '<td></td>';
              const formatted = formatCall(call);
              const cssClass = callCssClass(call);
              return `<td><span class="bid-call ${cssClass}">${formatted}</span></td>`;
            });
            rows.push(`<tr>${cells.join('')}</tr>`);
          }

          bodyEl.innerHTML = rows.join('');
        };

        const updateButtons = () => {
          const highestBid = lastBid();
          const isMyTurn = viewerSeat === biddingState.currentSeat;
          
          const bidButtons = bidGrid.querySelectorAll('[data-call]');
          bidButtons.forEach((btn) => {
            const call = btn.getAttribute('data-call');
            // Button is enabled only if it's my turn, bidding hasn't ended, and bid is valid
            const allowed = isMyTurn && !biddingState.ended && isHigherBid(call, highestBid?.call);
            btn.disabled = !allowed;
          });

          const passBtn = callRow.querySelector('[data-call="pass"]');
          const doubleBtn = callRow.querySelector('[data-call="double"]');
          const redoubleBtn = callRow.querySelector('[data-call="redouble"]');

          // Only enable control buttons if it's my turn
          if (passBtn) passBtn.disabled = !isMyTurn || biddingState.ended;
          if (doubleBtn) doubleBtn.disabled = !isMyTurn || biddingState.ended || !canDouble();
          if (redoubleBtn) redoubleBtn.disabled = !isMyTurn || biddingState.ended || !canRedouble();
        };

        const commitState = () => {
          currentDeal.bidding = { ...biddingState };
          currentDeal.bidHistory = [...biddingState.bids];
        };

        const handleCall = (call) => {
          // Only allow current player to make a call
          if (viewerSeat !== biddingState.currentSeat) return;
          if (biddingState.ended) return;
          const type = classifyCall(call);

          if (type === 'bid' && !isHigherBid(call, lastBid()?.call)) return;
          if (type === 'double' && !canDouble()) return;
          if (type === 'redouble' && !canRedouble()) return;

          biddingState.bids.push({
            seat: biddingState.currentSeat,
            call,
            type
          });

          biddingState.passCount = type === 'pass' ? biddingState.passCount + 1 : 0;
          biddingState.ended = biddingState.passCount >= 3 && biddingState.bids.some((b) => b.type === 'bid');
          biddingState.currentSeat = nextSeat(biddingState.currentSeat);

          commitState();
          persistBiddingState(currentTable.id, biddingState);
          renderHistory();
          updateButtons();
          updateTurnIndicator();
          updateActionIndicator();

          // Check if bidding ended and transition to play phase
          if (biddingState.ended) {
            // Dealer seat in auction.js is 'N'/'E'/'S'/'W'
            const dealerMap = { north: 'N', east: 'E', south: 'S', west: 'W' };
            const dealerSeatCode = dealerMap[biddingState.dealer];
            
            // Transform local bid objects to auction.js format
            const auctionCalls = biddingState.bids.map(b => {
              if (b.type === 'bid') {
                const level = Number(b.call[0]);
                const strain = b.call.slice(1);
                return { type: CallType.BID, level, strain, seat: b.seat.charAt(0).toUpperCase() };
              } else if (b.type === 'pass') {
                return { type: CallType.PASS, seat: b.seat.charAt(0).toUpperCase() };
              } else if (b.type === 'double') {
                return { type: CallType.DOUBLE, seat: b.seat.charAt(0).toUpperCase() };
              } else if (b.type === 'redouble') {
                return { type: CallType.REDOUBLE, seat: b.seat.charAt(0).toUpperCase() };
              }
            });
            
            console.log('[auction] calls=', auctionCalls, 'dealer=', dealerSeatCode);
            const result = DetermineAuctionResult(auctionCalls, dealerSeatCode);
            console.log('[auction] result=', result);
            
            if (result.result === 'PassedOut') {
              const statusEl = host.querySelector('[data-status-text]');
              if (statusEl) statusEl.textContent = 'Passed Out – No play.';
              playState.inProgress = false;
            } else if (result.result === 'Contract') {
              playState.contract = result.contract;
              playState.declarer = result.declarer;
              playState.dummy = result.dummy;
              playState.openingLeader = result.openingLeader;
              playState.tricksNS = 0;
              playState.tricksEW = 0;
              playState.inProgress = true;

              const statusEl = host.querySelector('[data-status-text]');
              if (statusEl) {
                statusEl.textContent = `Contract: ${result.contract.level}${result.contract.strain}${result.contract.doubled !== 'None' ? (result.contract.doubled === 'Doubled' ? 'X' : 'XX') : ''} by ${result.declarer} (Dummy: ${result.dummy}, Lead: ${result.openingLeader})`;
              }

              // Persist playState so other tabs/observers can pick it up
              try { localStorage.setItem(`tablePlayState:${currentTable.id}`, JSON.stringify(playState)); } catch (e) { console.warn('Failed to persist playState', e); }
              // Update vulnerability indicators with contract and tricks
              console.log('[play] storing playState and updating vulnerability', playState);
              updateVulnerabilityWithContract(host, ctx, currentDeal.dealNumber, playState);
            }
          }
        };

        // Build bid buttons 1C-7NT
        for (let level = 1; level <= 7; level++) {
          suitOrder.forEach((strain) => {
            const call = `${level}${strain}`;
            const btn = document.createElement('button');
            btn.className = `btn bid-button ${callCssClass(call)}`;
            btn.innerHTML = formatCall(call);
            btn.setAttribute('data-call', call);
            btn.addEventListener('click', () => handleCall(call));
            bidGrid.appendChild(btn);
          });
        }

        // Pass, Double, Redouble row
        const calls = [
          { key: 'pass', label: ctx.t('pass') },
          { key: 'double', label: ctx.t('double') },
          { key: 'redouble', label: ctx.t('redouble') }
        ];

        calls.forEach(({ key, label }) => {
          const btn = document.createElement('button');
          btn.className = `btn call-button ${callCssClass(key)}`;
          btn.textContent = label;
          btn.setAttribute('data-call', key);
          btn.addEventListener('click', () => {
            handleCall(key);
            // Check if bidding has ended and update UI
            if (biddingState.ended) {
              const statusEl = host.querySelector('[data-status-text]');
              const hourglassIcon = host.querySelector('[data-hourglass-icon]');
              if (statusEl) statusEl.textContent = 'Waiting to play...';
              if (hourglassIcon) {
                hourglassIcon.classList.remove('hourglass-spinning');
              }
            }
          });
          callRow.appendChild(btn);
        });

        renderHistory();
        updateButtons();
        updateTurnIndicator();
        updateActionIndicator();
        
        // Update status when bidding ends and play phase begins
        const checkBiddingComplete = () => {
          if (biddingState.ended) {
            const statusEl = host.querySelector('[data-status-text]');
            const hourglassIcon = host.querySelector('[data-hourglass-icon]');
            if (statusEl) statusEl.textContent = 'Waiting to play...';
            if (hourglassIcon) {
              hourglassIcon.classList.remove('hourglass-spinning');
            }
            // Re-enable Deal Cards button for next round
            dealBtn.disabled = false;
            dealBtn.classList.add('dealer-ready');
          }
        };
      });
    }

    // Observers section
    const observersSection = host.querySelector('[data-observers-section]');
    if (observersSection) {
      observersSection.style.display = 'none';
    }

    // Chat drawer - offcanvas panel (v2)
    let chatContainer = host.querySelector('[data-chat-container]');
    
    const chatDrawer = document.createElement('div');
    chatDrawer.className = 'chat-drawer';
    chatDrawer.innerHTML = `
      <div class="chat-drawer-header" data-chat-header>
        <div class="chat-tabs">
          <button class="chat-tab active" data-chat-tab="table" style="background: rgba(31, 156, 117, 0.8); color: #fff; border: none; padding: 0.5rem 1rem; border-radius: 8px; cursor: pointer; font-weight: 600;"><span data-i18n="chatTable"></span></button>
          <button class="chat-tab" data-chat-tab="lobby" style="background: rgba(31, 156, 117, 0.5); color: #fff; border: none; padding: 0.5rem 1rem; border-radius: 8px; cursor: pointer; font-weight: 600;"><span data-i18n="chatLobby"></span></button>
        </div>
      </div>
      <div class="chat-drawer-body" data-chat-body-wrapper>
        <div class="chat-body" data-chat-body></div>
        <div class="chat-input d-flex gap-2">
          <input type="text" class="form-control form-control-sm" data-chat-input maxlength="50" placeholder="${ctx.t('chatPlaceholder')}">
          <button class="btn btn-primary btn-sm" data-chat-send>${ctx.t('chatSend')}</button>
        </div>
      </div>
    `;

    if (chatContainer) {
      console.log('Using existing chat container');
      chatContainer.appendChild(chatDrawer);
    } else {
      console.log('Creating new chat container');
      // Create chat container if it doesn't exist
      chatContainer = document.createElement('div');
      chatContainer.className = 'chat-drawer-container';
      chatContainer.setAttribute('data-chat-container', '');
      chatContainer.appendChild(chatDrawer);
      host.appendChild(chatContainer);
    }

    let activeTab = 'table';
    let isOpen = false;  // Start hidden
    let chatTableChannel = null;
    let chatLobbyChannel = null;

    const chatBody = chatDrawer.querySelector('[data-chat-body]');
    const chatInput = chatDrawer.querySelector('[data-chat-input]');
    const chatSend = chatDrawer.querySelector('[data-chat-send]');
    const chatHeader = chatDrawer.querySelector('[data-chat-header]');
    const tabButtons = chatDrawer.querySelectorAll('[data-chat-tab]');

    // Initialize chat as hidden
    chatContainer.classList.remove('open');
    chatDrawer.classList.remove('open');

    // Connect header toggle button - search after DOM is fully constructed
    const chatToggleHeaderBtn = host.querySelector('[data-action="toggle-chat"]');

    function trimMessages(list) {
      while (list.length > MAX_CHAT_MESSAGES) list.shift();
    }

    const normalizeMessage = (msg) => ({
      id: msg.id,
      author: msg.author || 'Unknown',
      text: msg.text || msg.message || ''
    });

    function renderChat() {
      const source = activeTab === 'table' ? tableChatMessages : lobbyChatMessages;
      const lastMessages = source.slice(-MAX_CHAT_MESSAGES);
      chatBody.innerHTML = lastMessages
        .map((msg) => `<div class="chat-message"><strong>${msg.author}:</strong> ${msg.text}</div>`)
        .join('');
      chatBody.scrollTop = chatBody.scrollHeight;
      chatHeader.classList.remove('blink');
    }

    const getChatAuthor = () => {
      if (viewerSeat && currentTable.players?.[viewerSeat]) {
        return currentTable.players[viewerSeat];
      }
      try {
        const storedSessionUser = sessionStorage.getItem('currentUser');
        if (storedSessionUser) {
          const currentUser = JSON.parse(storedSessionUser);
          if (currentUser?.username) return currentUser.username;
          if (currentUser?.display_name) return currentUser.display_name;
        }

        const currentUser = JSON.parse(localStorage.getItem('currentUser'));
        if (currentUser?.username) return currentUser.username;
        if (currentUser?.display_name) return currentUser.display_name;
      } catch (err) {
        console.warn('Failed to read current user', err);
      }
      return 'Player';
    };

    const applyMessages = (target, rows) => {
      const normalized = rows.map(normalizeMessage);
      target.splice(0, target.length, ...normalized);
      trimMessages(target);
    };

    const loadChatMessages = async (scope) => {
      if (!ctx.supabaseClient) return;
      const query = ctx.supabaseClient
        .from('chat_messages')
        .select('id, scope, room_id, author, message, created_at')
        .eq('scope', scope)
        .order('created_at', { ascending: true })
        .limit(MAX_CHAT_MESSAGES);

      if (scope === 'table') {
        query.eq('room_id', currentTable.id);
      }

      if (scope === 'lobby') {
        query.is('room_id', null);
      }

      const { data, error } = await query;
      if (error) {
        console.error('Failed to load chat messages', error);
        return;
      }

      if (scope === 'table') {
        applyMessages(tableChatMessages, data || []);
      } else {
        applyMessages(lobbyChatMessages, data || []);
      }
    };

    async function addMessage(text) {
      if (!text) return;

      if (!ctx.supabaseClient) {
        const target = activeTab === 'table' ? tableChatMessages : lobbyChatMessages;
        target.push({ author: 'You', text });
        trimMessages(target);
        renderChat();
        return;
      }

      let profileId = null;
      try {
        const storedSessionUser = sessionStorage.getItem('currentUser');
        if (storedSessionUser) {
          const sessionUser = JSON.parse(storedSessionUser);
          profileId = sessionUser?.id || null;
        }
        if (!profileId) {
          const currentUser = JSON.parse(localStorage.getItem('currentUser'));
          profileId = currentUser?.id || null;
        }
      } catch (err) {
        console.warn('Failed to read current user', err);
      }

      const payload = {
        scope: activeTab,
        room_id: activeTab === 'table' ? currentTable.id : null,
        profile_id: profileId,
        author: getChatAuthor(),
        message: text
      };

      const { error } = await ctx.supabaseClient
        .from('chat_messages')
        .insert(payload);

      if (error) {
        console.error('Failed to send chat message', error);
      }
    }

    tabButtons.forEach((btn) => {
      btn.addEventListener('click', () => {
        activeTab = btn.dataset.chatTab;
        tabButtons.forEach((b) => b.classList.toggle('active', b === btn));
        renderChat();
      });
    });

    // Connect header toggle button
    if (chatToggleHeaderBtn) {
      chatToggleHeaderBtn.addEventListener('click', (e) => {
        e.preventDefault();
        isOpen = !isOpen;
        console.log('Chat toggle clicked, isOpen:', isOpen);
        chatContainer.classList.toggle('open', isOpen);
        chatDrawer.classList.toggle('open', isOpen);
        if (isOpen) {
          renderChat();
        }
      });
    } else {
      console.warn('Chat toggle button not found in DOM');
    }

    chatSend.addEventListener('click', async () => {
      const value = chatInput.value.trim().slice(0, 50);
      if (!value) return;
      await addMessage(value);
      chatInput.value = '';
    });

    chatInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        chatSend.click();
      }
    });

    if (ctx.supabaseClient) {
      await loadChatMessages('table');
      await loadChatMessages('lobby');

      chatTableChannel = ctx.supabaseClient
        .channel(`chat-table-${currentTable.id}`)
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_messages', filter: `room_id=eq.${currentTable.id}` }, (payload) => {
          if (payload.new?.scope !== 'table') return;
          tableChatMessages.push(normalizeMessage(payload.new));
          trimMessages(tableChatMessages);
          if (activeTab === 'table' && isOpen) {
            renderChat();
          } else {
            chatHeader.classList.add('blink');
          }
        })
        .subscribe();

      chatLobbyChannel = ctx.supabaseClient
        .channel('chat-lobby')
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_messages', filter: 'scope=eq.lobby' }, (payload) => {
          if (payload.new?.scope !== 'lobby') return;
          lobbyChatMessages.push(normalizeMessage(payload.new));
          trimMessages(lobbyChatMessages);
          if (activeTab === 'lobby' && isOpen) {
            renderChat();
          } else {
            chatHeader.classList.add('blink');
          }
        })
        .subscribe();
    }

    renderChat();
    applyTranslations(chatDrawer, ctx.language);

    container.append(host);

    return () => {
      window.removeEventListener('storage', storageHandler);
      clearInterval(readySyncInterval);
      if (realtimeChannel) {
        ctx.supabaseClient.removeChannel(realtimeChannel);
      }
      if (chatTableChannel) {
        ctx.supabaseClient.removeChannel(chatTableChannel);
      }
      if (chatLobbyChannel) {
        ctx.supabaseClient.removeChannel(chatLobbyChannel);
      }
    };
  }
};
