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
    south: 'Elena',
    west: 'Marco',
    north: 'Ivan',
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

function computeHCP(hand) {
  const values = { A: 4, K: 3, Q: 2, J: 1 };
  return hand.reduce((sum, card) => sum + (values[card.rank] || 0), 0);
}

// Get player position from URL
function getPlayerPosition() {
  const params = new URLSearchParams(window.location.search);
  return params.get('position') || 'observer';
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

    const viewPosition = getPlayerPosition();
    const isObserver = true; // TEMP: show all hands as observer for tuning

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

    // Back button
    const backBtn = host.querySelector('[data-action="back-lobby"]');
    if (backBtn) {
      backBtn.addEventListener('click', () => ctx.navigate('/lobby'));
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
    const gameArea = host.querySelector('[data-game-area]');

    if (dealBtn) {
      dealBtn.addEventListener('click', () => {
        currentDeal = dealCards(dealNumber);
        // Calculate HCP for all hands and store for the current deal
        hcpScores.north = computeHCP(currentDeal.hands.north);
        hcpScores.east  = computeHCP(currentDeal.hands.east);
        hcpScores.south = computeHCP(currentDeal.hands.south);
        hcpScores.west  = computeHCP(currentDeal.hands.west);
        dealNumber++;
        
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

        // Hide deal button, show bidding panel
        dealBtn.style.display = 'none';

        const dealerSeat = seatOrder[(currentDeal.dealNumber - 1) % seatOrder.length];

        biddingState = {
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
            <div class="bidding-header">
              <div class="bidding-title">${ctx.t('biddingTitle')}</div>
            </div>
            <div class="bidding-status" data-bidding-status></div>
            <div class="bidding-dealer">${ctx.t('dealer')}: ${getSeatName(dealerSeat)}</div>
            <div class="bidding-history" data-bidding-history></div>
          </div>
          <div class="bidding-right">
            <div class="bid-grid" data-bid-grid></div>
            <div class="call-row" data-call-row></div>
          </div>
        `;

        gameArea.innerHTML = '';
        gameArea.appendChild(biddingTemplate);
        applyTranslations(gameArea, ctx.language);

        const statusEl = gameArea.querySelector('[data-bidding-status]');
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
          historyEl.innerHTML = biddingState.bids
            .map((bid) => {
              const callLabel = formatCall(bid.call);
              return `<div class="bid-row"><span class="bid-seat">${getSeatName(bid.seat)}</span><span class="bid-call ${callCssClass(bid.call)}">${callLabel}</span></div>`;
            })
            .join('');
        };

        const updateButtons = () => {
          const highestBid = lastBid();
          const bidButtons = bidGrid.querySelectorAll('[data-call]');
          bidButtons.forEach((btn) => {
            const call = btn.getAttribute('data-call');
            const allowed = !biddingState.ended && isHigherBid(call, highestBid?.call);
            btn.disabled = !allowed;
          });

          const passBtn = callRow.querySelector('[data-call="pass"]');
          const doubleBtn = callRow.querySelector('[data-call="double"]');
          const redoubleBtn = callRow.querySelector('[data-call="redouble"]');

          if (passBtn) passBtn.disabled = biddingState.ended;
          if (doubleBtn) doubleBtn.disabled = biddingState.ended || !canDouble();
          if (redoubleBtn) redoubleBtn.disabled = biddingState.ended || !canRedouble();
        };

        const updateStatus = () => {
          if (!statusEl) return;
          const contract = lastBid();
          if (biddingState.ended) {
            const contractText = contract ? formatCall(contract.call) : ctx.t('pass');
            statusEl.textContent = `${ctx.t('biddingEnded')}: ${contractText}`;
          } else {
            statusEl.textContent = `${ctx.t('biddingTurn')}: ${getSeatName(biddingState.currentSeat)} (${seatLabels[biddingState.currentSeat]})`;
          }
        };

        const commitState = () => {
          currentDeal.bidding = { ...biddingState };
          currentDeal.bidHistory = [...biddingState.bids];
        };

        const handleCall = (call) => {
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
          renderHistory();
          updateButtons();
          updateStatus();
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
          btn.addEventListener('click', () => handleCall(key));
          callRow.appendChild(btn);
        });

        renderHistory();
        updateButtons();
        updateStatus();
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
