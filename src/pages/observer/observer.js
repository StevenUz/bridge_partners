import template from './observer.html?raw';
import '../table/table-cards.css';
import { applyTranslations } from '../../i18n/i18n.js';
import { createCardElement } from '../table/card-renderer.js';

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

// Mutable table context, populated in render() from the URL and Supabase.
const currentTable = {
  id: null,
  name: '',
  players: {
    north: '',
    south: '',
    east: '',
    west: ''
  },
  observers: []
};

// Vulnerability cycle - 16 deals pattern (same as table.js)
const vulnerabilityPattern = "0_-_|_+_-_|_+_0_|_+_0_-_+_0_-_|";
const vulnerabilityStates = vulnerabilityPattern.split('_').filter(s => s !== '');

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

function getTableId() {
  const params = new URLSearchParams(window.location.search);
  // Table IDs are UUIDs — return the raw string, never convert to Number.
  return params.get('id') || null;
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

function persistDealState(tableId, state) {
  try { localStorage.setItem(`tableDealState:${tableId}`, JSON.stringify(state)); } catch (e) { /* ignore */ }
}

function persistBiddingState(tableId, state) {
  try { localStorage.setItem(`tableBiddingState:${tableId}`, JSON.stringify(state)); } catch (e) { /* ignore */ }
}

function getCurrentObserver() {
  try {
    const observerData = localStorage.getItem('currentObserver');
    if (observerData) {
      return JSON.parse(observerData);
    }
  } catch (err) {
    console.warn('Failed to read current observer', err);
  }
  return null;
}

function computeHCP(hand) {
  const values = { A: 4, K: 3, Q: 2, J: 1 };
  return hand.reduce((sum, card) => sum + (values[card.rank] || 0), 0);
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
}

export const observerPage = {
  path: '/observer',
  name: 'observer',
  render(container, ctx) {
    const host = document.createElement('section');
    host.innerHTML = template;

    applyTranslations(host, ctx.language);

    const positionLabels = {
      north: ctx.t('seatNorth'),
      south: ctx.t('seatSouth'),
      west: ctx.t('seatWest'),
      east: ctx.t('seatEast')
    };

    const suitSymbols = { C: '♣', D: '♦', H: '♥', S: '♠', NT: 'NT' };
    const getSeatName = (seat) => currentTable.players[seat] || seat;

    const centerArea = host.querySelector('[data-observer-center]');

    const formatCall = (call) => {
      if (call === 'pass') return ctx.t('pass');
      if (call === 'double') return ctx.t('double');
      if (call === 'redouble') return ctx.t('redouble');
      const { level, strain } = parseBid(call);
      const symbol = suitSymbols[strain] || strain;
      if (strain === 'NT') {
        return `<span class="bid-level">${level}</span><span class="bid-suit nt">${symbol}</span>`;
      }
      return `<span class="bid-level">${level}</span><span class="bid-suit">${symbol}</span>`;
    };

    const callCssClass = (call) => {
      if (call === 'pass') return 'call-pass';
      if (call === 'double') return 'call-double';
      if (call === 'redouble') return 'call-redouble';
      const { strain } = parseBid(call);
      return `call-suit-${strain.toLowerCase()}`;
    };

    const renderAllHands = () => {
      const tableId = getTableId();
      const storedDeal = loadDealState(tableId);
      const storedBidding = loadBiddingState(tableId);
      
      if (!storedDeal) {
        if (centerArea) centerArea.textContent = 'Waiting for deal...';
        // Initialize vulnerability indicators with default deal number 1
        updateVulnerabilityIndicators(host, ctx, 1);
        return;
      }

      // Update vulnerability indicators for current deal
      updateVulnerabilityIndicators(host, ctx, storedDeal.dealNumber);

      const hcpScores = storedDeal.hcpScores || {
        north: computeHCP(storedDeal.hands.north || []),
        east: computeHCP(storedDeal.hands.east || []),
        south: computeHCP(storedDeal.hands.south || []),
        west: computeHCP(storedDeal.hands.west || [])
      };

      const isRedBack = !!storedDeal.isEvenDeal;

      const renderSlot = (slotName, seatName) => {
        const container = host.querySelector(`[data-cards-${slotName}]`);
        if (!container) return;
        container.innerHTML = '';

        const nameLabel = document.createElement('div');
        nameLabel.className = `hcp-label hcp-${slotName}`;
        
        // North and South on one line; West and East on two lines with center align
        if (['west', 'east'].includes(slotName)) {
          nameLabel.style.textAlign = 'center';
          nameLabel.innerHTML = `${positionLabels[seatName]}<br>${currentTable.players[seatName]}: ${hcpScores[seatName]}`;
        } else {
          nameLabel.innerHTML = `${positionLabels[seatName]} – ${currentTable.players[seatName]}: ${hcpScores[seatName]}`;
        }
        
        container.appendChild(nameLabel);

        const hand = createCardDisplay(
          storedDeal.hands[seatName] || [],
          slotName,
          true, // Observer sees all faces
          isRedBack
        );
        container.appendChild(hand);
      };

      renderSlot('north', 'north');
      renderSlot('south', 'south');
      renderSlot('west', 'west');
      renderSlot('east', 'east');

      // Render bidding (show empty history if not yet started)
      const biddingData = storedBidding || {
        dealer: seatOrder[(storedDeal.dealNumber - 1) % seatOrder.length],
        currentSeat: seatOrder[(storedDeal.dealNumber - 1) % seatOrder.length],
        bids: [],
        passCount: 0,
        ended: false
      };

      centerArea.innerHTML = '';
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

      centerArea.appendChild(biddingTemplate);

      const historyEl = centerArea.querySelector('[data-bidding-history]');
      const bidGrid = centerArea.querySelector('[data-bid-grid]');
      const callRow = centerArea.querySelector('[data-call-row]');

      const renderHistory = () => {
        const headerRow = historyEl.querySelector('[data-bid-header]');
        const bodyEl = historyEl.querySelector('[data-bid-body]');
        const escapeAttr = (value) => String(value)
          .replace(/&/g, '&amp;')
          .replace(/"/g, '&quot;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;');

        const dealerIdx = seatOrder.indexOf(biddingData.dealer);
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
        biddingData.bids.forEach(bid => {
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

      // Render history and hide bid buttons (observer cannot bid)
      bidGrid.style.display = 'none';
      callRow.style.display = 'none';
      renderHistory();
    };

    // Setup table header
    const tableId = getTableId();

    // Initialise mutable currentTable for this render so module-level helpers see the right state.
    currentTable.id = tableId;
    currentTable.name = '';
    currentTable.players = { north: '', south: '', east: '', west: '' };
    currentTable.observers = [];

    const currentObserver = getCurrentObserver();

    const tableTitle = host.querySelector('[data-table-title]');
    if (tableTitle) {
      tableTitle.textContent = ctx.t('table');  // placeholder until DB responds
    }

    // Load room state and player names from Supabase in parallel
    if (ctx.supabaseClient && tableId) {
      Promise.all([
        ctx.supabaseClient
          .from('rooms')
          .select('name, game_phase, deal_data')
          .eq('id', tableId)
          .single(),
        ctx.supabaseClient
          .from('room_seats')
          .select('seat_position, profiles(username, display_name)')
          .eq('room_id', tableId)
      ]).then(([{ data: room }, { data: seats }]) => {
        // Update room title — use the room name directly (it already contains "Table N")
        if (room?.name && tableTitle) {
          currentTable.name = room.name;
          tableTitle.textContent = room.name;
        }

        // Seed localStorage with the current deal so renderAllHands() can show cards.
        // deal_data is non-null whenever a deal is in progress (dealing or playing phase).
        if (room?.deal_data) {
          persistDealState(tableId, room.deal_data);
        }

        // Populate player names
        if (seats) {
          seats.forEach((seat) => {
            if (seat.seat_position && seat.profiles) {
              currentTable.players[seat.seat_position] =
                seat.profiles.username || seat.profiles.display_name || '';
            }
          });
        }

        renderAllHands();
      });
    }

    // Add current observer to table if exists (FIRST)
    if (currentObserver && currentObserver.tableId === tableId) {
      if (!currentTable.observers.includes(currentObserver.name)) {
        currentTable.observers.push(currentObserver.name);
      }
    }

    // Observers indicator in header (AFTER adding observer)
    const observersIndicator = host.querySelector('[data-observers-indicator]');
    if (observersIndicator) {
      const hasObservers = currentTable.observers && currentTable.observers.length > 0;
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

    // Leave observer button
    const leaveBtn = host.querySelector('[data-action="leave-observer"]');
    if (leaveBtn) {
      leaveBtn.addEventListener('click', () => {
        // Remove current observer from table
        if (currentObserver) {
          const observerIndex = currentTable.observers.indexOf(currentObserver.name);
          if (observerIndex > -1) {
            currentTable.observers.splice(observerIndex, 1);
          }
          
          // Clear observer info
          localStorage.removeItem('currentObserver');
        }
        
        // Navigate back to lobby
        ctx.navigate('/lobby');
      });
    }

    // Chat drawer for observer - two tabs (table / lobby)
    const tableChatMessages = [
      { author: 'Ivan', text: 'Good luck!' },
      { author: 'Maria', text: "Let's play fair." }
    ];
    const lobbyChatMessages = [
      { author: 'System', text: ctx.t('navObserver') }
    ];
    let chatContainer = host.querySelector('[data-chat-container]');
    const chatDrawer = document.createElement('div');
    chatDrawer.className = 'chat-drawer';
    chatDrawer.innerHTML = `
      <div class="chat-drawer-header" data-chat-header>
        <div class="chat-tabs">
          <button class="chat-tab active" data-chat-tab="table" style="background: rgba(31, 156, 117, 0.8); color: #fff; border: none; padding: 0.5rem 1rem; border-radius: 8px; cursor: pointer; font-weight: 600;">${ctx.t('chatTable')}</button>
          <button class="chat-tab" data-chat-tab="lobby" style="background: rgba(31, 156, 117, 0.5); color: #fff; border: none; padding: 0.5rem 1rem; border-radius: 8px; cursor: pointer; font-weight: 600;">${ctx.t('chatLobby')}</button>
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
      // Create chat container if it doesn't exist
      chatContainer = document.createElement('div');
      chatContainer.className = 'chat-drawer-container';
      chatContainer.setAttribute('data-chat-container', '');
      chatContainer.appendChild(chatDrawer);
      host.appendChild(chatContainer);
    }

    let isChatOpen = false;
    let activeTab = 'table';
    const chatBody = chatDrawer.querySelector('[data-chat-body]');
    const chatInput = chatDrawer.querySelector('[data-chat-input]');
    const chatSend = chatDrawer.querySelector('[data-chat-send]');
    const tabButtons = chatDrawer.querySelectorAll('[data-chat-tab]');

    const renderChat = () => {
      const source = activeTab === 'table' ? tableChatMessages : lobbyChatMessages;
      chatBody.innerHTML = source
        .map((msg) => `<div class="chat-message"><strong>${msg.author}:</strong> ${msg.text}</div>`)
        .join('');
      chatBody.scrollTop = chatBody.scrollHeight;
    };

    const addMessage = (text) => {
      if (!text) return;
      const target = activeTab === 'table' ? tableChatMessages : lobbyChatMessages;
      target.push({ author: currentObserver ? currentObserver.name : 'You', text });
      if (target.length > 50) target.shift();
      renderChat();
    };

    tabButtons.forEach((btn) => {
      btn.addEventListener('click', () => {
        activeTab = btn.dataset.chatTab;
        tabButtons.forEach((b) => b.classList.toggle('active', b === btn));
        renderChat();
      });
    });

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

    const chatToggleBtn = host.querySelector('[data-action="toggle-chat"]');
    if (chatToggleBtn) {
      chatToggleBtn.addEventListener('click', (e) => {
        e.preventDefault();
        isChatOpen = !isChatOpen;
        console.log('Observer chat toggle clicked, isChatOpen:', isChatOpen);
        chatContainer.classList.toggle('open', isChatOpen);
        if (isChatOpen) {
          renderChat();
        }
      });
    } else {
      console.warn('Chat toggle button not found in observer DOM');
    }

    // Initialize chat hidden
    if (chatContainer) {
      chatContainer.classList.remove('open');
    }

    renderChat();

    // Apply translations and initialize vulnerability
    applyTranslations(host, ctx.language);
    
    // Initialize vulnerability indicators for current state  
    const storedDeal = loadDealState(tableId);
    const currentDealNumber = storedDeal?.dealNumber || 1;
    updateVulnerabilityIndicators(host, ctx, currentDealNumber);

    // Initial render
    renderAllHands();

    // Sync with storage updates (same-browser cross-tab) and light polling
    const storageHandler = (event) => {
      const currentTableId = getTableId();
      if (event.key === `tableDealState:${currentTableId}` || event.key === `tableBiddingState:${currentTableId}`) {
        renderAllHands();
      }
      if (event.key === `tableVulnerability:${currentTableId}`) {
        const vulnState = loadVulnerabilityState(currentTableId);
        if (vulnState) {
          updateVulnerabilityIndicators(host, ctx, vulnState.dealNumber);
        }
      }
    };
    window.addEventListener('storage', storageHandler);

    const syncInterval = setInterval(renderAllHands, 2000);

    // Subscribe to the same Supabase Realtime channel as the table players so
    // cross-device observation works without relying on localStorage.
    let observerChannel = null;
    if (ctx.supabaseClient && tableId) {
      observerChannel = ctx.supabaseClient
        .channel(`table-play-state-${tableId}`, {
          config: { broadcast: { self: false } }
        })
        .on('broadcast', { event: 'deal-started' }, (payload) => {
          if (!payload?.payload) return;
          persistDealState(tableId, payload.payload);
          renderAllHands();
        })
        .on('broadcast', { event: 'bidding-update' }, (payload) => {
          if (!payload?.payload) return;
          persistBiddingState(tableId, payload.payload);
          renderAllHands();
        })
        .on('broadcast', { event: 'play-state-update' }, (payload) => {
          if (!payload?.payload) return;
          try {
            localStorage.setItem(`tablePlayState:${tableId}`, JSON.stringify(payload.payload));
          } catch (e) { /* ignore */ }
          renderAllHands();
        })
        .on('broadcast', { event: 'round-reset' }, () => {
          renderAllHands();
        })
        .on('broadcast', { event: 'request-observer-announce' }, () => {
          // A player has joined/refreshed and wants to know who is observing.
          if (currentObserver?.name && observerChannel) {
            observerChannel.send({
              type: 'broadcast',
              event: 'observer-joined',
              payload: { name: currentObserver.name }
            }).catch(() => {});
          }
        })
        .subscribe((status) => {
          if (status === 'SUBSCRIBED' && currentObserver?.name) {
            // Announce presence to all players on the table channel.
            observerChannel.send({
              type: 'broadcast',
              event: 'observer-joined',
              payload: { name: currentObserver.name }
            }).catch(() => {});
          }
        });
    }

    // Leave observer button: broadcast observer-left before navigating away.
    // (The existing leaveBtn handler is set up earlier; we patch it here via the
    //  channel reference which is now available.)
    const leaveBtnForBroadcast = host.querySelector('[data-action="leave-observer"]');
    if (leaveBtnForBroadcast && currentObserver?.name) {
      leaveBtnForBroadcast.addEventListener('click', () => {
        if (observerChannel) {
          observerChannel.send({
            type: 'broadcast',
            event: 'observer-left',
            payload: { name: currentObserver.name }
          }).catch(() => {});
        }
      }, { once: true });
    }

    container.append(host);

    return () => {
      window.removeEventListener('storage', storageHandler);
      clearInterval(syncInterval);
      if (observerChannel) {
        if (currentObserver?.name) {
          observerChannel.send({
            type: 'broadcast',
            event: 'observer-left',
            payload: { name: currentObserver.name }
          }).catch(() => {});
        }
        ctx.supabaseClient?.removeChannel(observerChannel).catch(() => {});
      }
    };
  }
};
