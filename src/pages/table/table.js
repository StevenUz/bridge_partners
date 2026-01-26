import template from './table.html?raw';
import './table-cards.css';
import { applyTranslations, languages } from '../../i18n/i18n.js';
import { dealCards } from './card-dealer.js';
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
    north: 'Marco',
    south: 'Elena',
    west: 'Ivan',
    east: 'Maria'
  },
  observers: ['Peter', 'Maya']
};

// Chat state
const lobbyChatMessages = [
  { author: 'Elena', text: 'Lobby chat is visible to everyone.' },
  { author: 'Marco', text: 'Ready to start soon.' }
];

const tableChatMessages = [
  { author: 'Ivan', text: 'Good luck!' },
  { author: 'Maria', text: 'Let\'s play fair.' }
];

const MAX_CHAT_MESSAGES = 15;

// Card game state
let currentDeal = null;
let dealNumber = 1;
let hcpScores = { north: 0, east: 0, south: 0, west: 0 };
let biddingState = null;

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

function getCurrentPlayer() {
  try {
    const playerData = localStorage.getItem('currentPlayer');
    if (playerData) {
      return JSON.parse(playerData);
    }
  } catch (err) {
    console.warn('Failed to read current player', err);
  }
  return null;
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
  render(container, ctx) {
    const host = document.createElement('section');
    host.innerHTML = template;

    try {
      // Update current table with joined player info
      const currentPlayer = getCurrentPlayer();
      if (currentPlayer) {
        const playerName = `Player ${currentPlayer.seat.charAt(0).toUpperCase()}`;
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

    const getSeatName = (seat) => currentTable.players[seat] || seat;
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
            nameLabel.innerHTML = `${positionLabels[seatName]}<br>${currentTable.players[seatName]}: ${hcpScores[seatName]}`;
          } else {
            nameLabel.innerHTML = `${positionLabels[seatName]}<br>${currentTable.players[seatName]}`;
          }
        } else {
          // North and South: text on one line
          if (viewerSeat === seatName) {
            nameLabel.innerHTML = `${positionLabels[seatName]} – ${currentTable.players[seatName]}: ${hcpScores[seatName]}`;
          } else {
            nameLabel.innerHTML = `${positionLabels[seatName]} – ${currentTable.players[seatName]}`;
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

        const getSeatName = (seat) => currentTable.players[seat] || seat;
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

          // Check if bidding ended and update status
          if (biddingState.ended) {
            dealBtn.disabled = false;
            dealBtn.classList.add('dealer-ready');
            const statusEl = host.querySelector('[data-status-text]');
            const hourglassIcon = host.querySelector('[data-hourglass-icon]');
            if (statusEl) statusEl.textContent = 'Waiting to play...';
            if (hourglassIcon) {
              hourglassIcon.classList.remove('hourglass-spinning');
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
    };

    slotMapping.forEach(({ slot, seat }) => {
      const panel = visualPanels[slot];
      if (!panel || !seat) return;
      panel.innerHTML = '';
      const playerName = currentTable.players[seat];
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
      readyContainer.textContent = ctx.language === 'bg' ? 'Готов/а?' : 'Ready?';

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
    };
    
    // Initialize check
    syncReadyUI();

    // Listen for storage updates from other tabs to sync ready state in near real time
    const storageHandler = (event) => {
      if (event.key === `tableReadyState:${currentTable.id}`) {
        syncReadyUI();
      }
      if (event.key === `tableDealState:${currentTable.id}` || event.key === `tableBiddingState:${currentTable.id}`) {
        renderDealAndBidding();
      }
    };
    window.addEventListener('storage', storageHandler);

    // Fallback polling to keep state fresh if storage events are missed
    const readySyncInterval = setInterval(() => {
      syncReadyUI();
      renderDealAndBidding();
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
          
          // Clear all table state for this table (deal, bidding, ready)
          localStorage.removeItem(`tableDealState:${tableId}`);
          localStorage.removeItem(`tableBiddingState:${tableId}`);
          localStorage.removeItem(`tableReadyState:${tableId}`);
        }
        
        // Clear current player info
        localStorage.removeItem('currentPlayer');
        
        // Navigate back to lobby
        ctx.navigate('/lobby');
      });
    }

    // Chat toggle button in header
    const chatToggleHeaderBtn = host.querySelector('[data-action="toggle-chat"]');
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
        northHcpLabel.innerHTML = `${currentTable.players[topSeat]}: ${hcpScores[topSeat]}`;
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
        southHcpLabel.innerHTML = `${currentTable.players[bottomSeat]}: ${hcpScores[bottomSeat]}`;
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
        westHcpLabel.innerHTML = `${currentTable.players[leftSeat]}: ${hcpScores[leftSeat]}`;
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
        eastHcpLabel.innerHTML = `${currentTable.players[rightSeat]}: ${hcpScores[rightSeat]}`;
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
    const chatContainer = host.querySelector('[data-chat-container]');
    
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
      chatContainer.appendChild(chatDrawer);
    } else {
      host.append(chatContainer);
      chatContainer.appendChild(chatDrawer);
    }

    let activeTab = 'table';
    let isOpen = false;  // Start hidden

    const chatBody = chatDrawer.querySelector('[data-chat-body]');
    const chatInput = chatDrawer.querySelector('[data-chat-input]');
    const chatSend = chatDrawer.querySelector('[data-chat-send]');
    const chatHeader = chatDrawer.querySelector('[data-chat-header]');
    const tabButtons = chatDrawer.querySelectorAll('[data-chat-tab]');

    // Initialize chat as hidden
    chatContainer.classList.remove('open');

    function trimMessages(list) {
      while (list.length > MAX_CHAT_MESSAGES) list.shift();
    }

    function renderChat() {
      const source = activeTab === 'table' ? tableChatMessages : lobbyChatMessages;
      const lastMessages = source.slice(-MAX_CHAT_MESSAGES);
      chatBody.innerHTML = lastMessages
        .map((msg) => `<div class="chat-message"><strong>${msg.author}:</strong> ${msg.text}</div>`)
        .join('');
      chatBody.scrollTop = chatBody.scrollHeight;
      chatHeader.classList.remove('blink');
    }

    function addMessage(text) {
      if (!text) return;
      const target = activeTab === 'table' ? tableChatMessages : lobbyChatMessages;
      target.push({ author: 'You', text });
      trimMessages(target);
      renderChat();
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
      chatToggleHeaderBtn.addEventListener('click', () => {
        isOpen = !isOpen;
        chatContainer.classList.toggle('open', isOpen);
        if (isOpen) {
          renderChat();
        }
      });
    }

    chatSend.addEventListener('click', () => {
      const value = chatInput.value.trim().slice(0, 50);
      if (!value) return;
      addMessage(value);
      chatInput.value = '';
    });

    chatInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        chatSend.click();
      }
    });

    renderChat();
    applyTranslations(chatDrawer, ctx.language);

    container.append(host);
  }
};
