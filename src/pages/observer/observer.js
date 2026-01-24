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

// Sample table data (kept in sync with table view for demo)
const currentTable = {
  id: 1,
  players: {
    north: 'Marco',
    south: 'Elena',
    west: 'Ivan',
    east: 'Maria'
  }
};

function getTableId() {
  const params = new URLSearchParams(window.location.search);
  const idStr = params.get('id');
  const id = Number(idStr);
  return Number.isFinite(id) && id > 0 ? id : currentTable.id;
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
        return;
      }

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
        nameLabel.innerHTML = `${positionLabels[seatName]} – ${currentTable.players[seatName]}: ${hcpScores[seatName]}`;
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

    // Initial render
    renderAllHands();

    // Sync with storage updates and polling
    const storageHandler = (event) => {
      const tableId = getTableId();
      if (event.key === `tableDealState:${tableId}` || event.key === `tableBiddingState:${tableId}`) {
        renderAllHands();
      }
    };
    window.addEventListener('storage', storageHandler);

    const syncInterval = setInterval(renderAllHands, 2000);

    container.append(host);

    return () => {
      window.removeEventListener('storage', storageHandler);
      clearInterval(syncInterval);
    };
  }
};
