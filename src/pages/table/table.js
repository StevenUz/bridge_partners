import template from './table.html?raw';
import './table.css';
import './table-cards.css';
import { applyTranslations, languages } from '../../i18n/i18n.js';
import { dealCards } from './card-dealer.js';
import { DetermineAuctionResult, DetermineContract, DetermineDeclarer, DetermineOpeningLeader, CallType } from '../../bridge/auction.js';
import { createCardElement } from './card-renderer.js';
import { 
  findExistingCycle, 
  createNewCycle, 
  updateCycleAfterDeal, 
  getCurrentPlayers,
  dbCycleToLocal 
} from '../../bridge/imp-cycle.js';

const seatOrder = ['south', 'west', 'north', 'east'];
const suitOrder = ['C', 'D', 'H', 'S', 'NT'];

function getDealerSeatForDeal(dealNum) {
  const index = (dealNum - 1) % seatOrder.length;
  return seatOrder[index];
}

function getNextDealNumber(tableId, fallback) {
  const storedDeal = loadDealState(tableId);
  if (storedDeal?.dealNumber) return storedDeal.dealNumber + 1;
  const lastDeal = loadLastDealNumber(tableId);
  if (lastDeal) return lastDeal + 1;
  return fallback || 1;
}

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
  currentTurn: null,     // 'N'/'E'/'S'/'W'
  currentTrick: [],      // [{ seat: 'N', card: { rank, suit } }]
  playedCounts: { north: 0, east: 0, south: 0, west: 0 },
  trickLocked: false,
  lastTrickWinner: null,
  firstLeadPlayed: false,
  tricksNS: 0,
  tricksEW: 0,
  inProgress: false,
  // HCP and fits calculated at deal time (before any cards played)
  hcpNS: 0,
  hcpEW: 0,
  fitsNS: 0,
  fitsEW: 0,
  // Original hands at deal time (for showing all cards in results)
  originalHands: null
};

// Flag to track if player is viewing results
let viewingResults = false;

// Vulnerability cycle - 16 deals pattern
// "0" = neither vulnerable, "-" = EW vulnerable, "|" = NS vulnerable, "+" = both vulnerable
const vulnerabilityPattern = "0_-_|_+_-_|_+_0_|_+_0_-_+_0_-_|";
const vulnerabilityStates = vulnerabilityPattern.split('_').filter(s => s !== '');

// IMP cycle tracking - 16 games in 4x4 table
// Sequence: A1-B1-C1-D1-B2-C2-D2-A2-C3-D3-A3-B3-D4-A4-B4-C4
const impCycleSequence = [
  'A1', 'B1', 'C1', 'D1',  // Games 1-4
  'B2', 'C2', 'D2', 'A2',  // Games 5-8
  'C3', 'D3', 'A3', 'B3',  // Games 9-12
  'D4', 'A4', 'B4', 'C4'   // Games 13-16
];

function createEmptyImpCycleData() {
  return {
    cycleId: null,
    cycleNumber: 1,
    currentGame: 1,
    table: {
      A1: null, A2: null, A3: null, A4: null,
      B1: null, B2: null, B3: null, B4: null,
      C1: null, C2: null, C3: null, C4: null,
      D1: null, D2: null, D3: null, D4: null
    }
  };
}

let impCycleData = {
  ...createEmptyImpCycleData()
};

function loadImpCycleData(tableId) {
  try {
    const raw = localStorage.getItem(`tableImpCycle:${tableId}`);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (err) {
    console.warn('Failed to load IMP cycle data', err);
    return null;
  }
}

function persistImpCycleData(tableId, data) {
  try {
    localStorage.setItem(`tableImpCycle:${tableId}`, JSON.stringify(data));
  } catch (err) {
    console.warn('Failed to persist IMP cycle data', err);
  }
}

async function recordImpResult(tableId, impForNS, supabaseClient) {
  console.log(`[IMP] recordImpResult called: tableId=${tableId}, impForNS=${impForNS}`);

  // Guard: prevent duplicate записи за една и съща раздавка
  const storedDeal = loadDealState(tableId);
  const dealNumberForImp = storedDeal?.dealNumber || 1;
  const impRecordedKey = `tableImpRecorded:${tableId}:${dealNumberForImp}`;
  if (localStorage.getItem(impRecordedKey)) {
    console.log(`[IMP] Skipping duplicate record for deal ${dealNumberForImp}`);
    return;
  }
  
  // Load current cycle data
  const stored = loadImpCycleData(tableId);
  if (stored) {
    impCycleData = {
      ...createEmptyImpCycleData(),
      ...stored,
      table: { ...createEmptyImpCycleData().table, ...(stored.table || {}) }
    };
  } else {
    // Critical: if localStorage was cleared (e.g. via "Нулирай таблицата"),
    // do NOT keep stale in-memory values. Start a fresh cycle.
    impCycleData = createEmptyImpCycleData();
  }
  
  console.log(`[IMP] Current cycle data:`, JSON.stringify(impCycleData, null, 2));
  
  // Get current cell in sequence
  const gameIndex = (impCycleData.currentGame - 1) % 16;
  const cellId = impCycleSequence[gameIndex];
  
  console.log(`[IMP] Game ${impCycleData.currentGame}/16, Cell: ${cellId}`);
  
  // Running cumulative total across the sequence:
  // cell(n) = cell(n-1) + current deal IMP (NS perspective)
  const previousGameIndex = gameIndex === 0 ? -1 : gameIndex - 1;
  const previousCellId = previousGameIndex >= 0 ? impCycleSequence[previousGameIndex] : null;
  const previousRunningTotal = previousCellId ? (impCycleData.table[previousCellId] || 0) : 0;

  // Store cumulative IMP (from NS perspective)
  impCycleData.table[cellId] = previousRunningTotal + impForNS;

  console.log(`[IMP] Cell ${cellId}: ${previousRunningTotal} + ${impForNS} = ${impCycleData.table[cellId]} (prevCell=${previousCellId || 'none'})`);
  
  const currentGameBeforeAdvance = impCycleData.currentGame;
  
  // Advance to next game
  impCycleData.currentGame++;
  
  // Check if cycle completed
  if (impCycleData.currentGame > 16) {
    impCycleData.cycleNumber++;
    impCycleData.currentGame = 1;
    // Reset table for new cycle
    Object.keys(impCycleData.table).forEach(key => {
      impCycleData.table[key] = null;
    });
  }
  
  // Persist locally
  persistImpCycleData(tableId, impCycleData);
  console.log(`[IMP] Persisted to localStorage: tableImpCycle:${tableId}`);

  // Mark this deal as recorded
  localStorage.setItem(impRecordedKey, '1');
  
  // Dispatch custom event for same-tab updates (storage events don't fire in same tab)
  window.dispatchEvent(new CustomEvent('imp-cycle-updated', { 
    detail: { tableId, impForNS, cellId } 
  }));
  console.log(`[IMP] Dispatched imp-cycle-updated event`);
  
  // Update database if we have a cycle ID and Supabase client
  if (impCycleData.cycleId && supabaseClient) {
    await updateCycleAfterDeal(
      supabaseClient,
      impCycleData.cycleId,
      impForNS,
      currentGameBeforeAdvance,
      impCycleData.table
    );
  }
}

function getImpValueForPerspective(cellValue, isNS) {
  if (cellValue === null) return '';
  // NS sees positive values as-is, EW sees them inverted
  const value = isNS ? cellValue : -cellValue;
  return value >= 0 ? `+${value}` : `${value}`;
}

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

function persistLastDealNumber(tableId, dealNumberValue) {
  try {
    if (typeof dealNumberValue === 'number' && Number.isFinite(dealNumberValue)) {
      localStorage.setItem(`tableLastDealNumber:${tableId}`, String(dealNumberValue));
    }
  } catch (err) {
    console.warn('Failed to persist last deal number', err);
  }
}

function loadLastDealNumber(tableId) {
  try {
    const raw = localStorage.getItem(`tableLastDealNumber:${tableId}`);
    if (!raw) return null;
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : null;
  } catch (err) {
    console.warn('Failed to load last deal number', err);
    return null;
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

function loadPlayState(tableId) {
  try {
    const raw = localStorage.getItem(`tablePlayState:${tableId}`);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (err) {
    console.warn('Failed to load play state', err);
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

function getCurrentUserProfileId() {
  try {
    const sessionUser = sessionStorage.getItem('currentUser');
    const localUser = localStorage.getItem('currentUser');
    const user = JSON.parse(sessionUser || localUser || 'null');
    return user?.id || null;
  } catch {
    return null;
  }
}

async function validateCurrentPlayerSeat(ctx, roomId, currentPlayer) {
  if (!ctx?.supabaseClient || !roomId || !currentPlayer?.seat) return false;

  const currentUserId = getCurrentUserProfileId();
  if (!currentUserId) return false;

  const { data, error } = await ctx.supabaseClient
    .from('room_seats')
    .select('profile_id')
    .eq('room_id', roomId)
    .eq('seat_position', currentPlayer.seat)
    .maybeSingle();

  if (error || !data?.profile_id) return false;
  return data.profile_id === currentUserId;
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
    if (card?.rank) cardEl.dataset.rank = card.rank;
    if (card?.suit) cardEl.dataset.suit = card.suit;
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
    let persistentDealBtn = host.querySelector('[data-action="deal-cards"]');
    let autoDealStartPending = false;

    const tableId = getTableId();
    currentTable.id = tableId;
    
    // Declare currentPlayer at top so it's accessible throughout render
    let currentPlayer = getCurrentPlayer();

    const tableTitleEl = host.querySelector('.table-header .header-left h1 span');
    const numericTableId = Number(tableId);
    const fallbackTitle = Number.isFinite(numericTableId)
      ? `${ctx.t('table')} ${numericTableId}`
      : ctx.t('table');

    if (tableTitleEl) {
      tableTitleEl.textContent = fallbackTitle;
    }

    // Load room name async (don't block rendering)
    if (ctx.supabaseClient && tableTitleEl) {
      ctx.supabaseClient
        .from('rooms')
        .select('name')
        .eq('id', tableId)
        .single()
        .then(({ data, error }) => {
          if (!error && data?.name) {
            tableTitleEl.textContent = data.name;
          }
        })
        .catch(err => {
          console.warn('Failed to load room name for table title', err);
        });
    }
    
    // Load IMP cycle data for this table
    const storedImpData = loadImpCycleData(tableId);
    if (storedImpData) {
      impCycleData = storedImpData;
    }
    
    // Declare channels at top level for access in functions
    let realtimeChannel = null;
    let roomStateChannel = null;

    const storedPlayState = loadPlayState(currentTable.id);
    if (storedPlayState) {
      playState = { ...playState, ...storedPlayState };
    }
    if (!playState.playedCounts) {
      playState.playedCounts = { north: 0, east: 0, south: 0, west: 0 };
    }
    if (typeof playState.trickLocked !== 'boolean') {
      playState.trickLocked = false;
    }
    if (!('lastTrickWinner' in playState)) {
      playState.lastTrickWinner = null;
    }
    if (playState?.inProgress && !playState.currentTurn && playState.openingLeader) {
      playState.currentTurn = playState.openingLeader;
    }

    const storedDealAtLoad = loadDealState(currentTable.id);
    if (!storedDealAtLoad) {
      playState = {
        contract: null,
        declarer: null,
        dummy: null,
        openingLeader: null,
        currentTurn: null,
        currentTrick: [],
        playedCounts: { north: 0, east: 0, south: 0, west: 0 },
        trickLocked: false,
        lastTrickWinner: null,
        firstLeadPlayed: false,
        tricksNS: 0,
        tricksEW: 0,
        inProgress: false,
        hcpNS: 0,
        hcpEW: 0,
        fitsNS: 0,
        fitsEW: 0,
        originalHands: null
      };
      try { localStorage.removeItem(`tablePlayState:${currentTable.id}`); } catch (e) { /* no-op */ }
      const statusEl = host.querySelector('[data-status-text]');
      const hourglassIcon = host.querySelector('[data-hourglass-icon]');
      if (statusEl) statusEl.textContent = 'Waiting for dealing...';
      if (hourglassIcon) hourglassIcon.classList.add('hourglass-spinning');
    }

    await loadRoomPlayers(ctx, tableId);

    if (currentPlayer) {
      const hasSeat = await validateCurrentPlayerSeat(ctx, tableId, currentPlayer);
      if (!hasSeat) {
        localStorage.removeItem('currentPlayer');
        sessionStorage.removeItem('currentPlayer');
        currentPlayer = null;
      }
    }

    // Check if all 4 players are present and initialize IMP cycle
    const allSeatsOccupied = currentTable.players.north && currentTable.players.south && 
                             currentTable.players.east && currentTable.players.west;
    if (allSeatsOccupied) {
      const players = getCurrentPlayers(currentTable);
      
      // Check for existing cycle
      try {
        const existingCycle = await findExistingCycle(ctx.supabaseClient, players);
        
        if (existingCycle) {
          // Load existing cycle data
          const loadedData = dbCycleToLocal(existingCycle);
          if (loadedData) {
            impCycleData = loadedData;
            persistImpCycleData(tableId, impCycleData);
            console.log('✓ Loaded existing IMP cycle:', impCycleData.cycleNumber, 'game', impCycleData.currentGame);
          }
        } else {
          // Create new cycle
          const newCycle = await createNewCycle(ctx.supabaseClient, players, tableId);
          if (newCycle) {
            const createdData = dbCycleToLocal(newCycle);
            if (createdData) {
              impCycleData = createdData;
              persistImpCycleData(tableId, impCycleData);
              console.log('✓ Created new IMP cycle:', impCycleData.cycleId);
            }
          } else {
            console.warn('Failed to create IMP cycle in database, using local only');
          }
        }
      } catch (err) {
        console.error('Failed to initialize IMP cycle:', err);
      }
    }
    
    // Ensure impCycleData has valid structure (fallback to default)
    if (!impCycleData || !impCycleData.table) {
      console.log('[IMP] Initializing default IMP cycle data');
      impCycleData = {
        cycleId: null,
        cycleNumber: 1,
        currentGame: 1,
        table: {
          A1: null, A2: null, A3: null, A4: null,
          B1: null, B2: null, B3: null, B4: null,
          C1: null, C2: null, C3: null, C4: null,
          D1: null, D2: null, D3: null, D4: null
        }
      };
      persistImpCycleData(tableId, impCycleData);
    }

    try {
      // Keep DB seat assignments as the only source of truth for player labels.
      if (currentPlayer) {
        console.log(`✓ Viewing table ${currentPlayer.tableId} as ${currentPlayer.seat}`);
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

    const statusLine = host.querySelector('[data-status-line]');
    const contractPill = host.querySelector('[data-contract-pill]');
    const contractValueEl = host.querySelector('[data-contract-value]');
    const contractTooltipEl = host.querySelector('[data-contract-tooltip]');

    const formatContractLabel = (contract) => {
      if (!contract) return '';
      const level = contract.level;
      const strain = contract.strain;
      const isBg = ctx.language === 'bg';
      
      let strainHTML;
      if (strain === 'NT') {
        strainHTML = `<span class="contract-strain nt">${isBg ? 'БК' : 'NT'}</span>`;
      } else {
        const symbol = suitSymbols[strain] || strain;
        const colorClass = (strain === 'S' || strain === 'C') ? 'black-suit' : 'red-suit';
        strainHTML = `<span class="contract-strain ${colorClass}">${symbol}</span>`;
      }

      let label = `${level} ${strainHTML}`;
      if (contract.doubled === 'Doubled') label += ' X';
      if (contract.doubled === 'Redoubled') label += ' XX';
      return label;
    };

    const formatBidForTooltip = (bid) => {
      if (bid.type === 'bid') return formatCall(bid.call);
      if (bid.type === 'pass') return ctx.t('pass');
      if (bid.type === 'double') return ctx.t('double');
      if (bid.type === 'redouble') return ctx.t('redouble');
      return '';
    };

    const buildBiddingTooltipTable = () => {
      if (!biddingState) return '';
      const dealerIdx = seatOrder.indexOf(biddingState.dealer);
      const columnOrder = [];
      for (let i = 0; i < 4; i++) {
        columnOrder.push(seatOrder[(dealerIdx + i) % 4]);
      }

      const bidsBySeat = { north: [], east: [], south: [], west: [] };
      biddingState.bids.forEach((bid) => {
        bidsBySeat[bid.seat].push(bid);
      });

      const maxRows = Math.max(...columnOrder.map(seat => bidsBySeat[seat].length), 1);

      const header = columnOrder
        .map((seat) => `<th>${getSeatPlayerName(seat)}</th>`)
        .join('');

      const rows = [];
      for (let rowIdx = 0; rowIdx < maxRows; rowIdx++) {
        const cells = columnOrder.map((seat) => {
          const bid = bidsBySeat[seat][rowIdx];
          if (!bid) return '<td></td>';
          const label = formatBidForTooltip(bid);
          const css = callCssClass(bid.type === 'bid' ? bid.call : bid.type);
          return `<td><span class="bid-chip ${css}">${label}</span></td>`;
        }).join('');
        rows.push(`<tr>${cells}</tr>`);
      }

      return `
        <table>
          <thead><tr>${header}</tr></thead>
          <tbody>${rows.join('')}</tbody>
        </table>
      `;
    };

    const updateContractDisplay = () => {
      if (!contractPill || !contractValueEl) return;
      if (!playState?.contract || !playState?.inProgress || !currentDeal?.hands) {
        contractPill.classList.add('d-none');
        if (statusLine) statusLine.classList.remove('d-none');
        return;
      }
      
      // Get declaring pair names
      const contractTitleEl = contractPill.querySelector('.contract-title');
      if (contractTitleEl && playState?.declarer) {
        const declarerSeat = playState.declarer === 'N' || playState.declarer === 'S' ? 'NS' : 'EW';
        const names = declarerSeat === 'NS' 
          ? `${getSeatPlayerName('north')}-${getSeatPlayerName('south')}`
          : `${getSeatPlayerName('east')}-${getSeatPlayerName('west')}`;
        contractTitleEl.textContent = names;
      }
      
      contractValueEl.innerHTML = formatContractLabel(playState.contract);
      if (contractTooltipEl) {
        contractTooltipEl.innerHTML = buildBiddingTooltipTable();
      }
      contractPill.classList.remove('d-none');
      if (statusLine) statusLine.classList.add('d-none');
    };

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
    const broadcastPlayStateUpdate = () => {
      if (!roomStateChannel) return;
      roomStateChannel.send({
        type: 'broadcast',
        event: 'play-state-update',
        payload: { ...playState }
      }).catch(err => {
        console.warn('Failed to broadcast playState', err);
      });
    };
    const clearTableState = () => {
      try {
        localStorage.removeItem(`tableReadyState:${currentTable.id}`);
        localStorage.removeItem(`tableDealState:${currentTable.id}`);
        localStorage.removeItem(`tableBiddingState:${currentTable.id}`);
        localStorage.removeItem(`tableVulnerability:${currentTable.id}`);
        localStorage.removeItem(`tablePlayState:${currentTable.id}`);
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
        currentTurn: null,
        currentTrick: [],
        playedCounts: { north: 0, east: 0, south: 0, west: 0 },
        firstLeadPlayed: false,
        trickLocked: false,
        lastTrickWinner: null,
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

      // Reset header UI
      const statusEl = host.querySelector('[data-status-text]');
      const hourglassIcon = host.querySelector('[data-hourglass-icon]');
      if (statusEl) statusEl.textContent = 'Waiting for dealing...';
      if (hourglassIcon) hourglassIcon.classList.add('hourglass-spinning');
      if (statusLine) statusLine.classList.remove('d-none');
      if (contractPill) contractPill.classList.add('d-none');

      // Clear turn indicators and contract pill
      updateContractDisplay();
      updatePlayTurnIndicator();
      updateActionIndicator();

      // Sync cleared play state to database
      syncPlayStateToDatabase();
    };

    const resetForNextDeal = () => {
      const storedDeal = loadDealState(currentTable.id);
      if (storedDeal?.dealNumber) {
        persistLastDealNumber(currentTable.id, storedDeal.dealNumber);
      }

      try {
        localStorage.removeItem(`tableReadyState:${currentTable.id}`);
        localStorage.removeItem(`tableDealState:${currentTable.id}`);
        localStorage.removeItem(`tableBiddingState:${currentTable.id}`);
        localStorage.removeItem(`tableVulnerability:${currentTable.id}`);
        localStorage.removeItem(`tablePlayState:${currentTable.id}`);
      } catch (err) {
        console.warn('Failed to clear round state', err);
      }

      currentDeal = null;
      biddingState = null;
      playState = {
        contract: null,
        declarer: null,
        dummy: null,
        openingLeader: null,
        currentTurn: null,
        currentTrick: [],
        playedCounts: { north: 0, east: 0, south: 0, west: 0 },
        firstLeadPlayed: false,
        trickLocked: false,
        lastTrickWinner: null,
        tricksNS: 0,
        tricksEW: 0,
        inProgress: false
      };
      hcpScores = { north: 0, east: 0, south: 0, west: 0 };
      viewingResults = false;
      ['north', 'south', 'east', 'west'].forEach((seat) => {
        playerReadyState[seat] = false;
      });
      persistReadyState(currentTable.id, playerReadyState);

      const statusEl = host.querySelector('[data-status-text]');
      const hourglassIcon = host.querySelector('[data-hourglass-icon]');
      if (statusEl) statusEl.textContent = 'Waiting for dealing...';
      if (hourglassIcon) hourglassIcon.classList.add('hourglass-spinning');
      if (statusLine) statusLine.classList.remove('d-none');
      if (contractPill) contractPill.classList.add('d-none');

      updateContractDisplay();
      updatePlayTurnIndicator();
      updateActionIndicator();
      updateTrickCounters();
      updateVulnerabilityIndicators(host, ctx, getNextDealNumber(currentTable.id, dealNumber));
      syncPlayStateToDatabase();
    };

    const resetGameState = () => {
      clearTableState();

      if (roomStateChannel) {
        roomStateChannel.send({
          type: 'broadcast',
          event: 'table-reset',
          payload: { tableId: currentTable.id }
        }).catch(err => {
          console.warn('Failed to broadcast table reset', err);
        });
      }

      setTimeout(() => {
        window.location.reload();
      }, 150);
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
    const lastDealNumber = loadLastDealNumber(currentTable.id);
    const currentDealNumber = storedDeal?.dealNumber || lastDealNumber || dealNumber;
    console.log(`[Init] currentDealNumber: ${currentDealNumber} (storedDeal=${storedDeal?.dealNumber}, lastDeal=${lastDealNumber}, fallback=${dealNumber})`);
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

    const seatCodeMap = { N: 'north', E: 'east', S: 'south', W: 'west' };
    const seatNameToCode = { north: 'N', east: 'E', south: 'S', west: 'W' };
    const slotLetterMap = { south: 'S', north: 'N', west: 'W', east: 'E' };
    const normalizeSeatCode = (seat) => (seat ? (seatNameToCode[seat] || seat) : seat);
    const normalizeSeatName = (seat) => (seat ? (seatCodeMap[seat] || seat) : seat);
    const getTrickSlotLetterForSeat = (seatCode) => {
      const seatName = normalizeSeatName(seatCode);
      const mapping = slotMapping.find((m) => m.seat === seatName);
      return mapping ? slotLetterMap[mapping.slot] : seatCode;
    };
    const normalizeSuit = (suit) => {
      if (!suit) return suit;
      const map = { '♣': 'C', '♦': 'D', '♥': 'H', '♠': 'S' };
      return map[suit] || suit;
    };
    const rankValue = (rank) => {
      const map = { A: 14, K: 13, Q: 12, J: 11, T: 10 };
      if (typeof rank === 'number') return rank;
      const r = String(rank).toUpperCase();
      if (map[r]) return map[r];
      const num = Number(r);
      return Number.isNaN(num) ? 0 : num;
    };
    
    // Obligation table: [HCP][fits][vulnerable]
    const obligationTable = {
      20: { 0: { nv: null, v: null }, 1: { nv: 80, v: 80 }, 2: { nv: 110, v: 110 } },
      21: { 0: { nv: 70, v: 70 }, 1: { nv: 110, v: 110 }, 2: { nv: 270, v: 270 } },
      22: { 0: { nv: 80, v: 80 }, 1: { nv: 110, v: 110 }, 2: { nv: 290, v: 290 } },
      23: { 0: { nv: 90, v: 90 }, 1: { nv: 270, v: 290 }, 2: { nv: 400, v: 600 } },
      24: { 0: { nv: 270, v: 270 }, 1: { nv: 290, v: 320 }, 2: { nv: 410, v: 610 } },
      25: { 0: { nv: 290, v: 290 }, 1: { nv: 400, v: 600 }, 2: { nv: 410, v: 610 } },
      26: { 0: { nv: 400, v: 600 }, 1: { nv: 410, v: 610 }, 2: { nv: 430, v: 630 } },
      27: { 0: { nv: 400, v: 600 }, 1: { nv: 430, v: 630 }, 2: { nv: 460, v: 660 } },
      28: { 0: { nv: 430, v: 630 }, 1: { nv: 430, v: 630 }, 2: { nv: 460, v: 660 } },
      29: { 0: { nv: 460, v: 660 }, 1: { nv: 460, v: 660 }, 2: { nv: 960, v: 1400 } },
      30: { 0: { nv: 460, v: 660 }, 1: { nv: 460, v: 660 }, 2: { nv: 960, v: 1400 } },
      31: { 0: { nv: 460, v: 660 }, 1: { nv: 960, v: 1400 }, 2: { nv: 980, v: 1430 } },
      32: { 0: { nv: 460, v: 660 }, 1: { nv: 960, v: 1400 }, 2: { nv: 980, v: 1430 } },
      33: { 0: { nv: 980, v: 1430 }, 1: { nv: 980, v: 1430 }, 2: { nv: 1480, v: 2180 } },
      34: { 0: { nv: 980, v: 1430 }, 1: { nv: 980, v: 1430 }, 2: { nv: 1480, v: 2180 } },
      35: { 0: { nv: 980, v: 1430 }, 1: { nv: 1480, v: 2180 }, 2: { nv: 1480, v: 2180 } },
      36: { 0: { nv: 980, v: 1430 }, 1: { nv: 1480, v: 2180 }, 2: { nv: 1480, v: 2180 } },
      37: { 0: { nv: 1480, v: 2180 }, 1: { nv: 1480, v: 2180 }, 2: { nv: 1480, v: 2180 } },
      38: { 0: { nv: 1480, v: 2180 }, 1: { nv: 1480, v: 2180 }, 2: { nv: 1480, v: 2180 } },
      39: { 0: { nv: 1480, v: 2180 }, 1: { nv: 1480, v: 2180 }, 2: { nv: 1480, v: 2180 } },
      40: { 0: { nv: 1480, v: 2180 }, 1: { nv: 1480, v: 2180 }, 2: { nv: 1480, v: 2180 } }
    };
    
    const countFits = (hand1, hand2) => {
      const suits = ['S', 'H', 'D', 'C'];
      let fits = 0;
      suits.forEach(suit => {
        const count1 = hand1.filter(c => normalizeSuit(c.suit) === suit).length;
        const count2 = hand2.filter(c => normalizeSuit(c.suit) === suit).length;
        if (count1 + count2 >= 8) fits++;
      });
      return fits;
    };
    
    const calculateObligation = () => {
      // Use HCP and fits calculated at deal time (from playState)
      const hcpNS = playState.hcpNS || 0;
      const hcpEW = playState.hcpEW || 0;
      const fitsNS = playState.fitsNS || 0;
      const fitsEW = playState.fitsEW || 0;
      
      // If no HCP data available, cannot calculate obligation
      if (hcpNS === 0 && hcpEW === 0) {
        return {
          side: null,
          points: 0,
          fits: 0,
          value: 0,
          hcpNS: 0,
          hcpEW: 0,
          fitsNS: 0,
          fitsEW: 0
        };
      }
      
      // Determine who has the obligation
      let obligationSide = null;
      let obligationPoints = 0;
      let obligationFits = 0;
      let isVulnerable = false;
      
      if (hcpNS > hcpEW) {
        obligationSide = 'NS';
        obligationPoints = hcpNS;
        obligationFits = fitsNS;
        const nsVuln = host.querySelector('[data-vulnerability-ns]');
        isVulnerable = nsVuln?.classList.contains('vulnerable') || false;
      } else if (hcpEW > hcpNS) {
        obligationSide = 'EW';
        obligationPoints = hcpEW;
        obligationFits = fitsEW;
        const ewVuln = host.querySelector('[data-vulnerability-ew]');
        isVulnerable = ewVuln?.classList.contains('vulnerable') || false;
      } else {
        // Equal HCP (both 20)
        if (fitsNS > fitsEW) {
          obligationSide = 'NS';
          obligationPoints = hcpNS;
          obligationFits = fitsNS;
          const nsVuln = host.querySelector('[data-vulnerability-ns]');
          isVulnerable = nsVuln?.classList.contains('vulnerable') || false;
        } else if (fitsEW > fitsNS) {
          obligationSide = 'EW';
          obligationPoints = hcpEW;
          obligationFits = fitsEW;
          const ewVuln = host.querySelector('[data-vulnerability-ew]');
          isVulnerable = ewVuln?.classList.contains('vulnerable') || false;
        } else {
          // Equal HCP and fits - no obligation
          return {
            side: null,
            points: 0,
            fits: 0,
            value: 0,
            hcpNS,
            hcpEW,
            fitsNS,
            fitsEW
          };
        }
      }
      
      // Lookup obligation value from table
      const hcpKey = Math.min(Math.max(obligationPoints, 20), 40);
      const fitsKey = Math.min(obligationFits, 2);
      const vulnKey = isVulnerable ? 'v' : 'nv';
      const obligationValue = obligationTable[hcpKey]?.[fitsKey]?.[vulnKey] || 0;
      
      return {
        side: obligationSide,
        points: obligationPoints,
        fits: obligationFits,
        value: obligationValue,
        hcpNS,
        hcpEW,
        fitsNS,
        fitsEW,
        isVulnerable
      };
    };
    
    // IMP conversion table
    const impTable = [
      { min: 0, max: 10, imp: 0 },
      { min: 20, max: 40, imp: 1 },
      { min: 50, max: 80, imp: 2 },
      { min: 90, max: 120, imp: 3 },
      { min: 130, max: 160, imp: 4 },
      { min: 170, max: 210, imp: 5 },
      { min: 220, max: 260, imp: 6 },
      { min: 270, max: 310, imp: 7 },
      { min: 320, max: 360, imp: 8 },
      { min: 370, max: 410, imp: 9 },
      { min: 420, max: 490, imp: 10 },
      { min: 500, max: 590, imp: 11 },
      { min: 600, max: 740, imp: 12 },
      { min: 750, max: 890, imp: 13 },
      { min: 900, max: 1090, imp: 14 },
      { min: 1100, max: 1190, imp: 15 },
      { min: 1200, max: 1490, imp: 16 },
      { min: 1500, max: 1740, imp: 17 },
      { min: 1750, max: 1990, imp: 18 },
      { min: 2000, max: 2240, imp: 19 },
      { min: 2250, max: 2490, imp: 20 },
      { min: 2500, max: 2990, imp: 21 },
      { min: 3000, max: 3490, imp: 22 },
      { min: 3500, max: 3990, imp: 23 },
      { min: 4000, max: Infinity, imp: 24 }
    ];
    
    const convertToIMP = (points) => {
      const absPoints = Math.abs(points);
      const entry = impTable.find(e => absPoints >= e.min && absPoints <= e.max);
      return entry ? entry.imp : 0;
    };
    
    const calculateContractPoints = (contract, tricksWon, isVulnerable) => {
      if (!contract) return { basePoints: 0, bonuses: 0, total: 0, overtricks: 0, undertricks: 0 };
      
      const level = contract.level;
      const strain = contract.strain;
      const doubled = contract.doubled; // 'None', 'Doubled', 'Redoubled'
      const requiredTricks = 6 + level;
      const tricksDiff = tricksWon - requiredTricks;
      
      // Determine if contract was made
      const made = tricksDiff >= 0;
      const overtricks = made ? tricksDiff : 0;
      const undertricks = made ? 0 : Math.abs(tricksDiff);
      
      let basePoints = 0;
      let bonuses = 0;
      
      if (made) {
        // Calculate base points for contract tricks
        if (strain === 'NT') {
          basePoints = 40 + (level - 1) * 30; // First trick 40, rest 30
        } else if (strain === 'S' || strain === 'H') {
          basePoints = level * 30; // Majors
        } else {
          basePoints = level * 20; // Minors
        }
        
        // Double/Redouble multiplier for base points
        if (doubled === 'Doubled') basePoints *= 2;
        if (doubled === 'Redoubled') basePoints *= 4;
        
        // Level/Game/Slam bonuses
        const isGame = basePoints >= 100;
        const isSmallSlam = level === 6;
        const isGrandSlam = level === 7;
        
        if (isGrandSlam) {
          bonuses += isVulnerable ? 1500 : 1000;
          bonuses += isVulnerable ? 500 : 300; // Add game bonus
        } else if (isSmallSlam) {
          bonuses += isVulnerable ? 750 : 500;
          bonuses += isVulnerable ? 500 : 300; // Add game bonus
        } else if (isGame) {
          bonuses += isVulnerable ? 500 : 300;
        } else {
          // Part-score bonuses (under game)
          if (level <= 2 && strain !== 'NT') {
            // Levels 1-2 in suits (not 2NT)
            bonuses += 50;
          } else if (level === 1 && strain === 'NT') {
            // 1NT
            bonuses += 50;
          } else if (level === 2 && strain === 'NT') {
            // 2NT
            bonuses += 200;
          } else if (level === 3 && strain !== 'NT') {
            // 3 in suit (C/D/H/S)
            bonuses += 200;
          } else if (level === 4 && (strain === 'C' || strain === 'D')) {
            // 4 minors
            bonuses += 250;
          }
        }
        
        // Bonus for making doubled/redoubled contract (only if made exactly)
        if (overtricks === 0) {
          if (doubled === 'Doubled') bonuses += 50;
          if (doubled === 'Redoubled') bonuses += 100;
        }
        
        // Overtrick points
        if (overtricks > 0) {
          let overtrickValue = 0;
          if (doubled === 'None') {
            // Regular overtricks
            if (strain === 'NT') {
              // NT: first overtrick 40, rest 30
              for (let i = 0; i < overtricks; i++) {
                overtrickValue += (i === 0) ? 40 : 30;
              }
              bonuses += overtrickValue;
            } else if (strain === 'S' || strain === 'H') {
              bonuses += overtricks * 30;
            } else {
              bonuses += overtricks * 20;
            }
          } else if (doubled === 'Doubled') {
            overtrickValue = isVulnerable ? 200 : 100;
            bonuses += overtricks * overtrickValue;
          } else if (doubled === 'Redoubled') {
            overtrickValue = isVulnerable ? 400 : 200;
            bonuses += overtricks * overtrickValue;
          }
        }
      } else {
        // Contract failed - calculate undertrick penalties
        let penalties = 0;
        
        if (doubled === 'None') {
          penalties = undertricks * (isVulnerable ? 100 : 50);
        } else if (doubled === 'Doubled') {
          // First undertrick
          penalties += isVulnerable ? 200 : 100;
          // Subsequent undertricks
          if (undertricks > 1) {
            penalties += (undertricks - 1) * (isVulnerable ? 300 : 200);
          }
        } else if (doubled === 'Redoubled') {
          // First undertrick
          penalties += isVulnerable ? 400 : 200;
          // Subsequent undertricks
          if (undertricks > 1) {
            penalties += (undertricks - 1) * (isVulnerable ? 600 : 400);
          }
        }
        
        basePoints = -penalties;
      }
      
      return {
        basePoints,
        bonuses,
        total: basePoints + bonuses,
        overtricks,
        undertricks,
        made
      };
    };

    const determineTrickWinner = (trickCards, trumpStrain) => {
      if (!Array.isArray(trickCards) || trickCards.length === 0) return null;
      const leadSuit = normalizeSuit(trickCards[0].card?.suit);
      const trump = trumpStrain && trumpStrain !== 'NT' ? trumpStrain : null;

      let winner = trickCards[0];
      trickCards.forEach((entry) => {
        const suit = normalizeSuit(entry.card?.suit);
        const winSuit = normalizeSuit(winner.card?.suit);
        const entryIsTrump = trump && suit === trump;
        const winnerIsTrump = trump && winSuit === trump;

        if (entryIsTrump && !winnerIsTrump) {
          winner = entry;
          return;
        }
        if (!entryIsTrump && winnerIsTrump) return;

        const suitToCompare = entryIsTrump ? trump : leadSuit;
        if (suit !== suitToCompare || winSuit !== suitToCompare) return;

        if (rankValue(entry.card?.rank) > rankValue(winner.card?.rank)) {
          winner = entry;
        }
      });

      return winner?.seat || null;
    };
    const updateTrickCounters = () => {
      const nsEl = host.querySelector('[data-vulnerability-ns]');
      const ewEl = host.querySelector('[data-vulnerability-ew]');
      if (!nsEl || !ewEl) return;

      const contractLevel = playState.contract?.level || null;
      const declarerSide = playState.declarer
        ? (['N', 'S'].includes(playState.declarer) ? 'NS' : 'EW')
        : null;
      const requiredDeclarer = contractLevel ? 6 + Number(contractLevel) : null;
      const expectedDefenders = requiredDeclarer ? 13 - requiredDeclarer : null;

      const buildCounterHTML = (base, bonus, bonusClass) => {
        if (!bonus || bonus <= 0) {
          return `<span class="count-main">${base}</span>`;
        }
        return `
          <span class="count-main">${base}</span>
          <span class="count-plus"> + </span>
          <span class="count-bonus ${bonusClass}">${bonus}</span>
        `;
      };

      let nsBadge = nsEl.querySelector('.trick-counter.ns');
      if (!nsBadge) {
        nsBadge = document.createElement('div');
        nsBadge.className = 'trick-counter ns';
        nsEl.appendChild(nsBadge);
      }

      let ewBadge = ewEl.querySelector('.trick-counter.ew');
      if (!ewBadge) {
        ewBadge = document.createElement('div');
        ewBadge.className = 'trick-counter ew';
        ewEl.appendChild(ewBadge);
      }

      if (requiredDeclarer && expectedDefenders && declarerSide) {
        const nsTricks = playState.tricksNS || 0;
        const ewTricks = playState.tricksEW || 0;
        const nsIsDeclarer = declarerSide === 'NS';
        const nsRequired = nsIsDeclarer ? requiredDeclarer : expectedDefenders;
        const ewRequired = nsIsDeclarer ? expectedDefenders : requiredDeclarer;
        
        // Show current tricks count, but format as "required + bonus" when exceeded
        const nsBonus = Math.max(0, nsTricks - nsRequired);
        const ewBonus = Math.max(0, ewTricks - ewRequired);
        const nsBase = nsBonus > 0 ? nsRequired : nsTricks;
        const ewBase = ewBonus > 0 ? ewRequired : ewTricks;

        nsBadge.innerHTML = buildCounterHTML(nsBase, nsBonus, nsIsDeclarer ? 'good' : 'bad');
        ewBadge.innerHTML = buildCounterHTML(ewBase, ewBonus, nsIsDeclarer ? 'bad' : 'good');
      } else {
        nsBadge.textContent = String(playState.tricksNS || 0);
        ewBadge.textContent = String(playState.tricksEW || 0);
      }
    };
    updateTrickCounters();
    const getDummySeat = () => (playState?.dummy ? normalizeSeatName(playState.dummy) : null);
    const shouldRevealDummy = (seatName) => playState?.inProgress && playState?.firstLeadPlayed && getDummySeat() === seatName;
    const shouldShowHcp = (seatName) => {
      const dummySeat = getDummySeat();
      if (viewerSeat === seatName) return true;
      if (playState?.inProgress && playState?.firstLeadPlayed && dummySeat === seatName && viewerSeat !== dummySeat) return true;
      return false;
    };
    const getOpeningLeaderSeat = () => (playState?.openingLeader ? normalizeSeatName(playState.openingLeader) : null);
    const getCurrentTurnSeatName = () => (playState?.currentTurn ? normalizeSeatName(playState.currentTurn) : getOpeningLeaderSeat());
    
    const getLegalCards = (handCards) => {
      // If this is the first card of the trick, all cards are legal
      if (!playState?.currentTrick || playState.currentTrick.length === 0) {
        return handCards.map(() => true);
      }
      
      // Get the lead suit (first card played in this trick)
      const leadCard = playState.currentTrick[0]?.card;
      if (!leadCard) {
        return handCards.map(() => true);
      }
      
      const leadSuit = normalizeSuit(leadCard.suit);
      
      // Check if player has any cards in the lead suit
      const hasLeadSuit = handCards.some(card => normalizeSuit(card.suit) === leadSuit);
      
      // If player has cards in lead suit, only those cards are legal
      if (hasLeadSuit) {
        return handCards.map(card => normalizeSuit(card.suit) === leadSuit);
      }
      
      // If player has no cards in lead suit, all cards are legal
      return handCards.map(() => true);
    };
    
    const syncHandsFromTrick = () => {
      if (!currentDeal?.hands || !Array.isArray(playState?.currentTrick)) return;
      playState.currentTrick.forEach((entry) => {
        const seatName = seatCodeMap[entry.seat];
        if (!seatName || !currentDeal.hands?.[seatName]) return;
        const hand = currentDeal.hands[seatName];
        const idx = hand.findIndex(c => String(c.rank) === String(entry.card?.rank)
          && String(c.suit) === String(entry.card?.suit));
        if (idx >= 0) {
          hand.splice(idx, 1);
        }
      });
    };

    const showDealResults = () => {
      console.log('[Results] showDealResults called');
      if (!gameArea) {
        console.warn('[Results] gameArea is null, cannot show results');
        return;
      }
      
      console.log('[Results] gameArea found, rendering results');
      // Mark that player is viewing results
      viewingResults = true;
      
      const contract = playState?.contract;
      const tricksNS = playState?.tricksNS || 0;
      const tricksEW = playState?.tricksEW || 0;
      const declarerSide = playState?.declarer ? (['N', 'S'].includes(playState.declarer) ? 'NS' : 'EW') : null;
      
      const obligation = calculateObligation();
      const t = (key) => ctx.t(key) || key;
      
      // Check if this was "4 passes" (no contract)
      const isFourPasses = !contract || !declarerSide;
      
      // Format fit display
      const formatFits = (fits) => {
        if (fits === 0) return t('no_fit');
        return `${fits} ${t('fit')}${fits > 1 ? 's' : ''}`;
      };
      
      // Calculate final scores
      let scoreNS = 0;
      let scoreEW = 0;
      let impValue = 0;
      let contractResult = null;
      
      if (isFourPasses) {
        // For 4 passes, result is just the obligation value
        const obligationValue = obligation?.value || 0;
        if (obligation?.side === 'NS') {
          scoreNS = -obligationValue;
          scoreEW = obligationValue;
        } else if (obligation?.side === 'EW') {
          scoreNS = obligationValue;
          scoreEW = -obligationValue;
        }
        // No IMP for 4 passes with 0 obligation
        if (obligationValue !== 0) {
          impValue = convertToIMP(obligationValue);
        }
      } else {
        // Calculate contract result
        const declarerTricks = declarerSide === 'NS' ? tricksNS : tricksEW;
        const declarerIsVulnerable = declarerSide === 'NS' 
          ? (host.querySelector('[data-vulnerability-ns]')?.classList.contains('vulnerable') || false)
          : (host.querySelector('[data-vulnerability-ew]')?.classList.contains('vulnerable') || false);
        
        contractResult = calculateContractPoints(contract, declarerTricks, declarerIsVulnerable);
        
        // Get obligation values
        const obligationValue = obligation?.value || 0;
        
        // Calculate final scores based on who has obligation and who declared
        // The obligation penalty is always subtracted from the side that has it
        let nsBaseScore = 0;
        let ewBaseScore = 0;
        
        // First, calculate base scores from contract result
        if (declarerSide === 'NS') {
          nsBaseScore = contractResult.total;
          ewBaseScore = -contractResult.total;
        } else {
          ewBaseScore = contractResult.total;
          nsBaseScore = -contractResult.total;
        }
        
        // Then apply obligation penalty to the side that has it
        if (obligation?.side === 'NS') {
          scoreNS = nsBaseScore - obligationValue;
          scoreEW = ewBaseScore + obligationValue;
        } else if (obligation?.side === 'EW') {
          scoreEW = ewBaseScore - obligationValue;
          scoreNS = nsBaseScore + obligationValue;
        } else {
          // No obligation
          scoreNS = nsBaseScore;
          scoreEW = ewBaseScore;
        }
        
        // Calculate IMP from absolute score (the winning side's score)
        const absScore = Math.max(Math.abs(scoreNS), Math.abs(scoreEW));
        impValue = convertToIMP(absScore);
      }
      
      // Determine IMP from NS perspective (positive if NS wins, negative if EW wins)
      const impForNS = scoreNS > scoreEW ? impValue : (scoreEW > scoreNS ? -impValue : 0);
      
      // Record IMP result in cycle table - ONLY by North player to avoid duplicates
      if (viewPosition === 'north') {
        recordImpResult(currentTable.id, impForNS, ctx.supabaseClient).then(() => {
          console.log('✓ IMP result recorded by North:', impForNS);
          // Broadcast IMP update to sync all players' tables
          if (realtimeChannel) {
            realtimeChannel.send({
              type: 'broadcast',
              event: 'imp-table-updated',
              payload: { tableId: currentTable.id }
            });
          }
        }).catch(err => {
          console.warn('Failed to record IMP result in database:', err);
        });
      }
      
      gameArea.innerHTML = `
        <div class="deal-results">
          <h2 class="results-title">${t('deal_results')}</h2>
          
          <div class="results-table">
            ${!isFourPasses ? `
            <div class="results-row">
              <div class="results-label">${t('contract')}:</div>
              <div class="results-value">${formatContractLabel(contract)}</div>
            </div>
            
            <div class="results-row">
              <div class="results-label">${t('declarer')}:</div>
              <div class="results-value">${declarerSide === 'NS' ? 'N-S' : 'E-W'}</div>
            </div>
            
            <div class="results-section">
              <h3>${t('tricks_won')}</h3>
              <div class="results-row">
                <div class="results-label">N-S:</div>
                <div class="results-value">${tricksNS}</div>
              </div>
              <div class="results-row">
                <div class="results-label">E-W:</div>
                <div class="results-value">${tricksEW}</div>
              </div>
            </div>
            ` : `
            <div class="results-row">
              <div class="results-label">${t('bidding_result')}:</div>
              <div class="results-value">${t('four_passes')}</div>
            </div>
            `}
            
            <div class="results-section">
              <h3>${t('partnership_data')}</h3>
              ${obligation?.side ? `
                <div class="results-row">
                  <div class="results-label">${obligation.side} ${t('points')}:</div>
                  <div class="results-value">${obligation.points} HCP</div>
                </div>
                <div class="results-row">
                  <div class="results-label">${obligation.side} ${t('fit')}:</div>
                  <div class="results-value">${formatFits(obligation.fits)}</div>
                </div>
              ` : `
                <div class="results-row">
                  <div class="results-label">N-S ${t('points')}:</div>
                  <div class="results-value">${obligation?.hcpNS || 0} HCP</div>
                </div>
                <div class="results-row">
                  <div class="results-label">N-S ${t('fit')}:</div>
                  <div class="results-value">${formatFits(obligation?.fitsNS || 0)}</div>
                </div>
                <div class="results-row">
                  <div class="results-label">E-W ${t('points')}:</div>
                  <div class="results-value">${obligation?.hcpEW || 0} HCP</div>
                </div>
                <div class="results-row">
                  <div class="results-label">E-W ${t('fit')}:</div>
                  <div class="results-value">${formatFits(obligation?.fitsEW || 0)}</div>
                </div>
              `}
            </div>
            
            <div class="results-section">
              <h3>${t('obligation')}</h3>
              <div class="results-row">
                <div class="results-label">${t('belongs_to')}:</div>
                <div class="results-value">
                  ${obligation?.side ? `${obligation.side} (${obligation.points} HCP, ${formatFits(obligation.fits)})` : t('no_obligation')}
                </div>
              </div>
              ${obligation?.value ? `
              <div class="results-row">
                <div class="results-label">${t('obligation_value')}:</div>
                <div class="results-value">${obligation.value}</div>
              </div>
              ` : ''}
            </div>
            
            <div class="results-section">
              <h3>${t('result')}</h3>
              ${isFourPasses ? `
              <div class="results-row">
                <div class="results-label">${t('final_score')}:</div>
                <div class="results-value">N-S: ${scoreNS >= 0 ? '+' : ''}${scoreNS}, E-W: ${scoreEW >= 0 ? '+' : ''}${scoreEW}</div>
              </div>
              ${impValue > 0 ? `
              <div class="results-row">
                <div class="results-label">IMP:</div>
                <div class="results-value">${impValue}</div>
              </div>
              ` : ''}
              ` : `
              <div class="results-row">
                <div class="results-label">${t('contract_result')}:</div>
                <div class="results-value">
                  ${contractResult?.made 
                    ? (contractResult.overtricks > 0 
                      ? `${t('made_with_overtricks')} (+${contractResult.overtricks})`
                      : t('made_exactly'))
                    : `${t('failed')} (-${contractResult.undertricks})`
                  }
                </div>
              </div>
              <div class="results-row">
                <div class="results-label">${t('contract_points')}:</div>
                <div class="results-value">${contractResult?.basePoints >= 0 ? '+' : ''}${contractResult?.basePoints}</div>
              </div>
              ${contractResult?.bonuses > 0 ? `
              <div class="results-row">
                <div class="results-label">${t('bonuses')}:</div>
                <div class="results-value">+${contractResult.bonuses}</div>
              </div>
              ` : ''}
              <div class="results-row">
                <div class="results-label">${t('final_score')}:</div>
                <div class="results-value">
                  ${(() => {
                    const declarerScore = declarerSide === 'NS' ? scoreNS : scoreEW;
                    const declarerObligation = obligation?.side === declarerSide;
                    const obligationValue = obligation?.value || 0;
                    const contractTotal = contractResult.total;
                    
                    // Format obligation part
                    let obligationPart = '';
                    if (declarerObligation) {
                      // Declarer has obligation - negative
                      obligationPart = `-${obligationValue}`;
                    } else if (obligation?.side) {
                      // Other side has obligation - positive for declarer
                      obligationPart = `+${obligationValue}`;
                    } else {
                      // No obligation
                      obligationPart = '0';
                    }
                    
                    // Format contract points part
                    const contractSign = contractTotal >= 0 ? '+' : '';
                    const contractPart = `${contractSign}${contractTotal}`;
                    
                    // Format final score
                    const finalSign = declarerScore >= 0 ? '+' : '';
                    const finalPart = `${finalSign}${declarerScore}`;
                    
                    return `${declarerSide}: ${obligationPart} ${contractPart} = ${finalPart}`;
                  })()}
                </div>
              </div>
              <div class="results-row">
                <div class="results-label">IMP:</div>
                <div class="results-value">${scoreNS > scoreEW ? `N-S: +${impValue}` : `E-W: +${impValue}`}</div>
              </div>
              `}
            </div>
          </div>
          
          <button class="btn-next-deal">${t('next_deal')}</button>
        </div>
      `;
      
      console.log('[Results] HTML rendered, querying Next Deal button');
      const nextBtn = gameArea.querySelector('.btn-next-deal');
      console.log(`[Results] Next Deal button found: ${!!nextBtn}`);
      if (nextBtn) {
        console.log('[Results] Adding click listener to Next Deal button');
        nextBtn.addEventListener('click', () => {
          console.log('[Next Deal] Button clicked!');
          // Mark this player as ready for next deal
          const mySeat = viewerSeat;
          console.log(`[Next Deal] mySeat=${mySeat}, viewerSeat=${viewerSeat}`);
          if (!mySeat || mySeat === 'observer') {
            console.log('Observer cannot trigger next deal');
            return;
          }
          
          console.log(`[Next Deal] Setting ${mySeat} ready and clearing states`);
          // Set ready state for this player
          playerReadyState[mySeat] = true;
          persistReadyState(currentTable.id, playerReadyState);
          
          // Mark that player is no longer viewing results
          viewingResults = false;
          
          // Clear original hands for next deal
          playState.originalHands = null;

          // Persist last completed deal number and clear stale round state.
          // This prevents refresh from landing on "Waiting for bidding..." from a finished deal,
          // while preserving the ready-state needed for the next-deal coordination.
          try {
            const lastDeal = loadDealState(currentTable.id);
            if (lastDeal?.dealNumber) {
              console.log(`[Next Deal] Persisting lastDealNumber: ${lastDeal.dealNumber}`);
              persistLastDealNumber(currentTable.id, lastDeal.dealNumber);
            }
            localStorage.removeItem(`tableDealState:${currentTable.id}`);
            localStorage.removeItem(`tableBiddingState:${currentTable.id}`);
            localStorage.removeItem(`tablePlayState:${currentTable.id}`);
            localStorage.removeItem(`tableVulnerability:${currentTable.id}`);
            console.log(`[Next Deal] Cleared round state (kept ready state) for table ${currentTable.id}`);
          } catch (err) {
            console.warn('Failed to clear stale round state after results', err);
          }
          
          // Broadcast ready state to other players
          console.log(`[Next Deal] roomStateChannel available: ${!!roomStateChannel}`);
          if (roomStateChannel) {
            roomStateChannel.send({
              type: 'broadcast',
              event: 'player-ready-next-deal',
              payload: { seat: mySeat }
            });
            console.log(`[Next Deal] Broadcast player-ready-next-deal for ${mySeat}`);
          } else {
            console.warn('[Next Deal] roomStateChannel is null, cannot broadcast!');
          }
          
          console.log('Player marked ready for next deal:', mySeat, 'Current ready state:', playerReadyState);
          
          // Dealer should render the Deal screen immediately, others wait
          const nextDealNumber = getNextDealNumber(currentTable.id, dealNumber);
          const dealerSeat = getDealerSeatForDeal(nextDealNumber);
          const isDealer = dealerSeat === mySeat;
          
          if (isDealer) {
            console.log('[Next Deal] Dealer showing ready screen with Deal button');
            // Show ready screen for dealer with visible panels and Deal button
            const statusEl = host.querySelector('[data-status-text]');
            const hourglassIcon = host.querySelector('[data-hourglass-icon]');
            if (statusEl) statusEl.textContent = 'Waiting for dealing...';
            if (hourglassIcon) hourglassIcon.classList.add('hourglass-spinning');
            
            // Show ready panels
            ['north', 'south', 'west', 'east'].forEach(position => {
              const panel = host.querySelector(`[data-player-position="${position}"]`);
              if (panel) panel.style.display = '';
            });
            
            // Clear game area
            if (gameArea) gameArea.innerHTML = '';
          } else {
            console.log('[Next Deal] Non-dealer showing waiting screen');
            // Show waiting message for non-dealer players
            gameArea.innerHTML = `
              <div class="waiting-for-others">
                <h2>${t('waiting_for_others')}</h2>
                <p>${t('other_players_viewing_results')}</p>
                <div class="hourglass-icon hourglass-spinning">
                  <i class="bi bi-hourglass-split"></i>
                </div>
              </div>
            `;
          }
          
          // Check if all players are ready to trigger auto-deal
          checkAllPlayersReady();
        });
      }
    };

    const renderPlayArea = () => {
      if (!gameArea) return;
      gameArea.innerHTML = `
        <div class="play-area">
          <div class="trick-area">
            <div class="trick-slot" data-trick-slot="N"></div>
            <div class="trick-slot" data-trick-slot="E"></div>
            <div class="trick-slot" data-trick-slot="S"></div>
            <div class="trick-slot" data-trick-slot="W"></div>
          </div>
        </div>
      `;

      const trickMap = new Map((playState?.currentTrick || []).map(entry => [entry.seat, entry.card]));
      trickMap.forEach((card, seat) => {
        const slotLetter = getTrickSlotLetterForSeat(seat);
        const slot = gameArea.querySelector(`[data-trick-slot="${slotLetter}"]`);
        if (!slot || !card) return;
        slot.innerHTML = '';
        slot.appendChild(createCardElement(card, true, false));
      });
    };

    let trickClearTimeout = null;

    const animateCardToSlot = (cardEl, targetSlot) => {
      if (!cardEl || !targetSlot) return;
      const sourceRect = cardEl.getBoundingClientRect();
      const targetRect = targetSlot.getBoundingClientRect();

      const ghost = cardEl.cloneNode(true);
      ghost.style.position = 'fixed';
      ghost.style.left = `${sourceRect.left}px`;
      ghost.style.top = `${sourceRect.top}px`;
      ghost.style.width = `${sourceRect.width}px`;
      ghost.style.height = `${sourceRect.height}px`;
      ghost.style.margin = '0';
      ghost.style.zIndex = '9999';
      ghost.style.transition = 'transform 320ms ease, opacity 320ms ease';
      document.body.appendChild(ghost);

      const deltaX = targetRect.left - sourceRect.left + (targetRect.width - sourceRect.width) / 2;
      const deltaY = targetRect.top - sourceRect.top + (targetRect.height - sourceRect.height) / 2;

      requestAnimationFrame(() => {
        ghost.style.transform = `translate(${deltaX}px, ${deltaY}px)`;
      });

      ghost.addEventListener('transitionend', () => {
        ghost.remove();
      }, { once: true });
    };

    const updatePlayTurnIndicator = () => {
      slotMapping.forEach(({ slot }) => {
        const panel = visualPanels[slot];
        if (panel) {
          panel.classList.remove('active-turn');
          const badge = panel.querySelector('.turn-indicator-badge');
          if (badge) badge.remove();
        }
      });

      if (!playState?.inProgress) return;
      const currentTurnSeat = getCurrentTurnSeatName();
      if (!currentTurnSeat) return;
      const mapping = slotMapping.find((m) => m.seat === currentTurnSeat);
      if (!mapping) return;
      const panel = visualPanels[mapping.slot];
      if (!panel) return;
      panel.classList.add('active-turn');
      const badge = document.createElement('div');
      badge.className = 'turn-indicator-badge';
      badge.innerHTML = '→';
      badge.title = `${getSeatPlayerName(currentTurnSeat)}'s turn`;
      panel.appendChild(badge);
    };

    const renderHandsForPlayPhase = () => {
      if (!currentDeal?.hands) return;
      const isRedBack = currentDeal.isEvenDeal;

      slotMapping.forEach(({ slot, seat }) => {
        const container = host.querySelector(`[data-cards-${slot}]`);
        if (!container || !seat) return;
        container.innerHTML = '';

        const nameLabel = document.createElement('div');
        nameLabel.className = `hcp-label hcp-${slot}`;
        if (['west', 'east'].includes(slot)) {
          nameLabel.style.textAlign = 'center';
          if (shouldShowHcp(seat)) {
            nameLabel.innerHTML = `${positionLabels[seat]}<br>${getSeatPlayerName(seat)}: ${hcpScores[seat]}`;
          } else {
            nameLabel.innerHTML = `${positionLabels[seat]}<br>${getSeatPlayerName(seat)}`;
          }
        } else {
          if (shouldShowHcp(seat)) {
            nameLabel.innerHTML = `${positionLabels[seat]} – ${getSeatPlayerName(seat)}: ${hcpScores[seat]}`;
          } else {
            nameLabel.innerHTML = `${positionLabels[seat]} – ${getSeatPlayerName(seat)}`;
          }
        }
        container.appendChild(nameLabel);

        const isVisible = viewerSeat === seat || shouldRevealDummy(seat);
        const hiddenCount = currentDeal.hands?.[seat]?.length || 0;
        const displayHand = isVisible
          ? currentDeal.hands[seat]
          : Array.from({ length: hiddenCount }, () => ({}));

        const hand = createCardDisplay(
          displayHand,
          slot,
          isVisible,
          isRedBack
        );
        container.appendChild(hand);

        const currentTurnSeat = getCurrentTurnSeatName();
        const dummySeat = getDummySeat();
        const isDeclarer = viewerSeat && playState?.declarer && normalizeSeatCode(viewerSeat) === normalizeSeatCode(playState.declarer);
        const isDummyHand = dummySeat === seat;
        const canPlayThisHand = playState?.inProgress && !playState.trickLocked && (
          (currentTurnSeat === seat && viewerSeat === seat) ||
          (isDeclarer && currentTurnSeat === seat && isDummyHand)
        );

        if (canPlayThisHand) {
          const handCards = currentDeal.hands[seat];
          const legalCards = getLegalCards(handCards);
          
          hand.querySelectorAll('.playing-card').forEach((cardEl, idx) => {
            const isLegal = legalCards[idx];
            
            if (isLegal) {
              cardEl.classList.add('playable-card');
            } else {
              cardEl.classList.add('disabled-card');
            }
            
            cardEl.addEventListener('click', () => {
              if (!playState?.inProgress) return;
              if (getCurrentTurnSeatName() !== seat) return;

              const rank = cardEl.dataset.rank;
              const suit = cardEl.dataset.suit;
              const handCards = currentDeal.hands[seat];
              const cardIndex = handCards.findIndex(c => String(c.rank) === String(rank) && String(c.suit) === String(suit));
              if (cardIndex === -1) return;
              
              // Check if this card is legal to play
              const legalCards = getLegalCards(handCards);
              if (!legalCards[cardIndex]) {
                return;
              }

              const [playedCard] = handCards.splice(cardIndex, 1);
              const seatCode = seatNameToCode[seat];
              playState.currentTrick = Array.isArray(playState.currentTrick) ? playState.currentTrick : [];
              playState.currentTrick.push({ seat: seatCode, card: playedCard });

              if (!playState.playedCounts) {
                playState.playedCounts = { north: 0, east: 0, south: 0, west: 0 };
              }
              playState.playedCounts[seat] = (playState.playedCounts[seat] || 0) + 1;

              const trickCount = playState.currentTrick.length;
              if (trickCount < 4) {
                const nextSeatName = nextSeat(seat);
                playState.currentTurn = seatNameToCode[nextSeatName];
              }

              try {
                localStorage.setItem(`tablePlayState:${currentTable.id}`, JSON.stringify(playState));
              } catch (e) {
                console.warn('Failed to persist playState', e);
              }

              broadcastPlayStateUpdate();

              renderHandsForPlayPhase();
              renderPlayArea();
              updateActionIndicator();

              const targetSlotLetter = getTrickSlotLetterForSeat(seatCode);
              const targetSlot = gameArea?.querySelector(`[data-trick-slot="${targetSlotLetter}"]`);
              animateCardToSlot(cardEl, targetSlot);

              if (trickCount === 4) {
                const winnerSeatCode = determineTrickWinner(playState.currentTrick, playState.contract?.strain);
                if (winnerSeatCode) {
                  playState.lastTrickWinner = winnerSeatCode;
                  playState.currentTurn = winnerSeatCode;
                  if (winnerSeatCode === 'N' || winnerSeatCode === 'S') {
                    playState.tricksNS += 1;
                  } else {
                    playState.tricksEW += 1;
                  }
                }

                playState.trickLocked = true;
                try {
                  localStorage.setItem(`tablePlayState:${currentTable.id}`, JSON.stringify(playState));
                } catch (e) {
                  console.warn('Failed to persist playState', e);
                }

                broadcastPlayStateUpdate();
                updateTrickCounters();
                updatePlayTurnIndicator();

                if (trickClearTimeout) {
                  clearTimeout(trickClearTimeout);
                }
                trickClearTimeout = setTimeout(() => {
                  playState.currentTrick = [];
                  playState.trickLocked = false;
                  
                  // Check if all 13 tricks have been played
                  const totalTricks = (playState.tricksNS || 0) + (playState.tricksEW || 0);
                  console.log(`[Trick Clear] Total tricks: ${totalTricks} (NS=${playState.tricksNS}, EW=${playState.tricksEW})`);
                  if (totalTricks === 13) {
                    // Deal is complete, show results
                    console.log('[Trick Clear] ✓ 13 tricks completed, ending game');
                    playState.inProgress = false;
                    try {
                      localStorage.setItem(`tablePlayState:${currentTable.id}`, JSON.stringify(playState));
                    } catch (e) {
                      console.warn('Failed to persist playState', e);
                    }
                    broadcastPlayStateUpdate();
                    console.log('[Trick Clear] ✓ Broadcasting end-of-game state and showing results');
                    showDealResults();
                    return;
                  }
                  
                  try {
                    localStorage.setItem(`tablePlayState:${currentTable.id}`, JSON.stringify(playState));
                  } catch (e) {
                    console.warn('Failed to persist playState', e);
                  }
                  broadcastPlayStateUpdate();
                  renderHandsForPlayPhase();
                  renderPlayArea();
                  updateActionIndicator();
                  updatePlayTurnIndicator();
                }, 3000);
              }
            }, { once: true });
          });
        }

        container.classList.toggle('dummy-hand', shouldRevealDummy(seat));
        const disableSelf = viewerSeat === seat && shouldRevealDummy(seat);
        const disableDeclarerOnDummyTurn = isDeclarer && viewerSeat === seat && currentTurnSeat === dummySeat;
        container.classList.toggle('hand-disabled', disableSelf || disableDeclarerOnDummyTurn);
      });

      const openingLeaderSeat = getOpeningLeaderSeat();
      if (playState?.inProgress && !playState?.firstLeadPlayed && viewerSeat && viewerSeat === openingLeaderSeat) {
        const leaderMapping = slotMapping.find((m) => m.seat === openingLeaderSeat);
        const leaderContainer = leaderMapping
          ? host.querySelector(`[data-cards-${leaderMapping.slot}]`)
          : null;

        if (leaderContainer) {
          leaderContainer.addEventListener('click', (event) => {
            const card = event.target.closest('.playing-card');
            if (!card) return;
            if (playState.firstLeadPlayed) return;

            playState.firstLeadPlayed = true;
            try {
              localStorage.setItem(`tablePlayState:${currentTable.id}`, JSON.stringify(playState));
            } catch (err) {
              console.warn('Failed to persist playState', err);
            }

            broadcastPlayStateUpdate();

            renderHandsForPlayPhase();
          }, { once: true });
        }
      }
    };

    // Sync playState to database
    const syncPlayStateToDatabase = async (client = ctx.supabaseClient) => {
      if (!client || !currentTable?.id || !playState) return;
      
      try {
        const updateData = {
          contract_level: playState.contract?.level || null,
          contract_strain: playState.contract?.strain || null,
          contract_doubled: playState.contract?.doubled || 'None',
          declarer_seat: playState.declarer || null,
          dummy_seat: playState.dummy || null,
          opening_leader_seat: playState.openingLeader || null,
          current_deal_number: currentDeal?.dealNumber || 1,
          play_in_progress: playState.inProgress || false,
          first_lead_played: playState.firstLeadPlayed || false,
          tricks_ns: playState.tricksNS || 0,
          tricks_ew: playState.tricksEW || 0,
          status: playState.inProgress ? 'playing' : 'waiting'
        };

        const { error } = await client
          .from('rooms')
          .update(updateData)
          .eq('id', currentTable.id);

        if (error) {
          console.warn('Failed to sync playState to database:', error);
        } else {
          console.log('✓ playState synced to database');
        }
      } catch (err) {
        console.warn('Error syncing playState:', err);
      }
    };

    const applyContractResult = (contract, declarer, dummy, openingLeader) => {
      if (!contract || !declarer || !dummy || !openingLeader) return;
      
      // Load deal state to get HCP and fits
      const storedDeal = loadDealState(currentTable.id);
      
      playState.contract = contract;
      playState.declarer = declarer;
      playState.dummy = dummy;
      playState.openingLeader = openingLeader;
      playState.currentTurn = openingLeader;
      playState.currentTrick = [];
      playState.playedCounts = { north: 0, east: 0, south: 0, west: 0 };
      playState.trickLocked = false;
      playState.lastTrickWinner = null;
      playState.firstLeadPlayed = false;
      playState.tricksNS = 0;
      playState.tricksEW = 0;
      playState.inProgress = true;
      
      // Store HCP and fits from deal state
      if (storedDeal) {
        playState.hcpNS = storedDeal.hcpNS || 0;
        playState.hcpEW = storedDeal.hcpEW || 0;
        playState.fitsNS = storedDeal.fitsNS || 0;
        playState.fitsEW = storedDeal.fitsEW || 0;
        
        // Store original hands if available
        if (storedDeal.hands) {
          playState.originalHands = {
            north: JSON.parse(JSON.stringify(storedDeal.hands.north || [])),
            east: JSON.parse(JSON.stringify(storedDeal.hands.east || [])),
            south: JSON.parse(JSON.stringify(storedDeal.hands.south || [])),
            west: JSON.parse(JSON.stringify(storedDeal.hands.west || []))
          };
        }
      }

      updateVulnerabilityWithContract(host, ctx, currentDeal.dealNumber, playState);
      try { localStorage.setItem(`tablePlayState:${currentTable.id}`, JSON.stringify(playState)); } catch (e) { console.warn('Failed to persist playState', e); }
      
      // Sync to database
      syncPlayStateToDatabase();
      
      // Broadcast to other players
      console.log('Broadcasting playState to other players...', playState);
      broadcastPlayStateUpdate();
      
      renderHandsForPlayPhase();
      renderPlayArea();
      updateTrickCounters();
      updateContractDisplay();
      updatePlayTurnIndicator();
      updateActionIndicator();
    };

    const resolveContractFallback = () => {
      if (!biddingState?.bids?.length) return null;
      const calls = biddingState.bids.map(b => {
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

      const contract = DetermineContract(calls);
      if (!contract) return null;
      const declarer = DetermineDeclarer(calls, contract);
      const dummy = declarer ? (declarer === 'N' ? 'S' : declarer === 'S' ? 'N' : declarer === 'E' ? 'W' : 'E') : null;
      const openingLeader = declarer ? DetermineOpeningLeader(declarer) : null;
      return { contract, declarer, dummy, openingLeader };
    };

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

      const storedBidding = loadBiddingState(currentTable.id);
      const storedDeal = loadDealState(currentTable.id);
      const nextDealNumber = getNextDealNumber(currentTable.id, dealNumber);
      const dealerSeat = getDealerSeatForDeal(nextDealNumber);

      if (playState?.inProgress) {
        const currentTurnSeat = getCurrentTurnSeatName();
        if (currentTurnSeat) {
          markSeat(currentTurnSeat);
        }
      }

      // If no deal yet, highlight dealer who needs to mark ready
      if (!storedDeal && !playState?.inProgress) {
        markSeat(dealerSeat, { highlightToggle: !playerReadyState[dealerSeat] });
      }
      // If deal exists but all not ready, highlight players who need to mark ready
      else if (storedDeal && !storedBidding && !playState?.inProgress) {
        ['north', 'south', 'east', 'west'].forEach(seat => {
          if (!playerReadyState[seat]) {
            markSeat(seat, { highlightToggle: true });
          }
        });
      }
      // If bidding state exists, highlight current bidder
      else if (storedBidding && !storedBidding.ended && !playState?.inProgress) {
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

      const dealHands = (playState?.inProgress && currentDeal?.hands)
        ? currentDeal.hands
        : storedDeal.hands;

      currentDeal = {
        dealNumber: storedDeal.dealNumber,
        hands: dealHands,
        isEvenDeal: storedDeal.isEvenDeal
      };
      syncHandsFromTrick();
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
          if (shouldShowHcp(seatName)) {
            nameLabel.innerHTML = `${positionLabels[seatName]}<br>${getSeatPlayerName(seatName)}: ${hcpScores[seatName]}`;
          } else {
            nameLabel.innerHTML = `${positionLabels[seatName]}<br>${getSeatPlayerName(seatName)}`;
          }
        } else {
          // North and South: text on one line
          if (shouldShowHcp(seatName)) {
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
          viewerSeat === seatName || shouldRevealDummy(seatName),
          isRedBack
        );
        container.appendChild(hand);

        container.classList.toggle('dummy-hand', shouldRevealDummy(seatName));
        container.classList.toggle('hand-disabled', viewerSeat === seatName && shouldRevealDummy(seatName));
      };

      renderHandForSlot('north', topSeat);
      renderHandForSlot('south', bottomSeat);
      renderHandForSlot('west', leftSeat);
      renderHandForSlot('east', rightSeat);

      if (playState?.inProgress) {
        renderHandsForPlayPhase();
        renderPlayArea();
        updateActionIndicator();
        return;
      }

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
          console.log('[checkAuctionEndAndTransition] called, biddingState.ended=', biddingState.ended);
          if (!biddingState.ended) return;
          // Dealer seat in auction.js is 'N'/'E'/'S'/'W'
          const dealerMap = { north: 'N', east: 'E', south: 'S', west: 'W' };
          const dealerSeat = dealerMap[biddingState.dealer];
          const calls = toAuctionCalls(biddingState.bids);
          console.log('[checkAuctionEndAndTransition] dealerSeat=', dealerSeat, 'calls=', calls);
          const result = DetermineAuctionResult(calls, dealerSeat);
          console.log('[checkAuctionEndAndTransition] result=', result);
          if (result.result === 'PassedOut') {
            // Show passed out message, reset for next deal
            const statusEl = host.querySelector('[data-status-text]');
            if (statusEl) statusEl.textContent = 'Passed Out – No play.';
            playState.inProgress = false;
          } else if (result.result === 'Contract') {
            // Use applyContractResult which properly sets currentTurn, currentTrick,
            // playedCounts, broadcasts state, and syncs to database
            applyContractResult(result.contract, result.declarer, result.dummy, result.openingLeader);
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
          console.log('[handleCall] About to check if bidding ended. biddingState.ended=', biddingState.ended);
          if (biddingState.ended) {
            console.log('[handleCall] Bidding has ended! Calling checkAuctionEndAndTransition...');
            checkAuctionEndAndTransition();
            console.log('[handleCall] checkAuctionEndAndTransition completed');
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
      const lastDealNumber = loadLastDealNumber(currentTable.id);
      const currentDealNumber = storedDeal?.dealNumber || lastDealNumber || dealNumber;
      updateVulnerabilityIndicators(host, ctx, currentDealNumber);
    };
    
    // Check if all players are ready
    const checkAllPlayersReady = () => {
      const allReady = Object.values(playerReadyState).every((r) => r === true);
      const dealBtn = host.querySelector('[data-action="deal-cards"]');
      const nextDealNumber = getNextDealNumber(currentTable.id, dealNumber);
      const dealerSeat = getDealerSeatForDeal(nextDealNumber);
      const isDealerViewer = dealerSeat === viewerSeat;

      console.log(`[Ready Check] allReady=${allReady}, nextDeal=${nextDealNumber}, dealer=${dealerSeat}, viewer=${viewerSeat}, isDealer=${isDealerViewer}, readyState=${JSON.stringify(playerReadyState)}`);

      if (dealBtn) {
        if (allReady && isDealerViewer) {
          dealBtn.disabled = false;
          dealBtn.classList.add('dealer-ready');
        } else {
          dealBtn.disabled = true;
          dealBtn.classList.remove('dealer-ready');
        }
      }

      if (!allReady || !isDealerViewer) {
        autoDealStartPending = false;
      }

      if (allReady && isDealerViewer && !autoDealStartPending) {
        autoDealStartPending = true;
        console.log('✓ All players ready - auto-starting next deal as dealer');
        setTimeout(() => {
          const newDealBtn = host.querySelector('[data-action="deal-cards"]');
          const clickableDealBtn = newDealBtn || persistentDealBtn;
          if (!clickableDealBtn) {
            console.warn('✗ Deal button not found in DOM');
            autoDealStartPending = false;
            return;
          }
          // Ensure click handler fires even if UI is lagging
          if (clickableDealBtn.disabled) clickableDealBtn.disabled = false;
          console.log('✓ Clicking deal button now');
          clickableDealBtn.click();
          autoDealStartPending = false;
        }, 150);
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
      // Don't render if player is viewing results
      if (viewingResults) {
        return;
      }
      
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
      if (event.key === `tablePlayState:${currentTable.id}`) {
        const newPlayState = loadPlayState(currentTable.id);
        if (newPlayState) {
          playState = { ...playState, ...newPlayState };
          if (!playState.playedCounts) {
            playState.playedCounts = { north: 0, east: 0, south: 0, west: 0 };
          }
          syncHandsFromTrick();
          
          // Check if deal is complete (all 13 tricks played)
          const totalTricks = (playState.tricksNS || 0) + (playState.tricksEW || 0);
          console.log(`[Play Broadcast] Total tricks: ${totalTricks}, tricksNS=${playState.tricksNS}, tricksEW=${playState.tricksEW}, inProgress=${playState.inProgress}`);
          if (totalTricks === 13 && !playState.inProgress) {
            // Deal is complete, show results
            console.log('[Play Broadcast] ✓ 13 tricks completed, showing results');
            showDealResults();
            return;
          }
          
          renderDealAndBidding();
          updateContractDisplay();
          updatePlayTurnIndicator();
          updateActionIndicator();
          updateTrickCounters();
          if (playState?.inProgress) {
            renderHandsForPlayPhase();
            renderPlayArea();
          }
        }
      }
    };
    window.addEventListener('storage', storageHandler);

    // Same-tab IMP reset (triggered from header popup)
    window.addEventListener('imp-cycle-reset', (event) => {
      const tableId = event?.detail?.tableId;
      if (!tableId || String(tableId) !== String(currentTable.id)) return;
      console.log('✓ IMP cycle reset received (same tab)');
      impCycleData = createEmptyImpCycleData();
      // Note: clearTableState() should NOT be called here - IMP reset should only
      // clear IMP data, not interrupt active gameplay. Deal/vulnerability reset is
      // handled by header.js removing tableLastDealNumber and tableVulnerability.
    });

    // Setup realtime channels
    if (ctx.supabaseClient && currentTable.id) {
      realtimeChannel = ctx.supabaseClient
        .channel(`table-seats-${currentTable.id}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'room_seats', filter: `room_id=eq.${currentTable.id}` }, async () => {
          await loadRoomPlayers(ctx, currentTable.id);
          updateSeatLabels();
        })
        .subscribe();
      
      // Broadcast channel for real-time playState sync
      roomStateChannel = ctx.supabaseClient
        .channel(`table-play-state-${currentTable.id}`, {
          config: {
            broadcast: { self: false }
          }
        })
        .on('broadcast', { event: 'play-state-update' }, (payload) => {
          console.log('✓ Play state broadcast received:', payload);
          
          if (payload.payload) {
            // Update playState with broadcast data
            playState = { ...playState, ...payload.payload };
            syncHandsFromTrick();
            
            console.log('✓ Updated playState:', playState);
            
            // Persist to localStorage
            try { 
              localStorage.setItem(`tablePlayState:${currentTable.id}`, JSON.stringify(playState)); 
            } catch (e) { 
              console.warn('Failed to persist playState', e); 
            }
            
            // Check if deal is complete (all 13 tricks played)
            const totalTricks = (playState.tricksNS || 0) + (playState.tricksEW || 0);
            console.log(`[Play Broadcast] Total tricks: ${totalTricks} (NS=${playState.tricksNS}, EW=${playState.tricksEW}), inProgress=${playState.inProgress}`);
            if (totalTricks === 13 && !playState.inProgress) {
              // Deal is complete, show results
              console.log('[Play Broadcast] ✓ 13 tricks completed, showing results');
              showDealResults();
              return;
            }
            
            // Re-render UI
            renderDealAndBidding();
            updateContractDisplay();
            updateTrickCounters();
            updatePlayTurnIndicator();
            updateActionIndicator();
            if (playState.inProgress) {
              renderHandsForPlayPhase();
              renderPlayArea();
            }
          }
        })
        .on('broadcast', { event: 'table-reset' }, (payload) => {
          if (payload?.payload?.tableId !== currentTable.id) return;
          console.log('✓ Table reset broadcast received');
          clearTableState();
          setTimeout(() => {
            window.location.reload();
          }, 150);
        })
        .on('broadcast', { event: 'round-reset' }, (payload) => {
          if (payload?.payload?.tableId !== currentTable.id) return;
          console.log('✓ Round reset broadcast received');
          resetForNextDeal();
          renderDealAndBidding();
        })
        .on('broadcast', { event: 'player-ready-next-deal' }, (payload) => {
          const readySeat = payload?.payload?.seat;
          if (!readySeat) return;
          console.log('✓ Player ready for next deal broadcast received:', readySeat);
          
          // Update ready state
          playerReadyState[readySeat] = true;
          persistReadyState(currentTable.id, playerReadyState);
          syncReadyUI();
          
          // Check if all players are ready to trigger auto-deal
          // Small delay to ensure all clients have synced ready state
          setTimeout(() => {
            checkAllPlayersReady();
          }, 50);
        })
        .subscribe((status) => {
          console.log('✓ Room state channel status:', status);
        });
    }

    // Fallback polling to keep state fresh if storage events are missed
    const readySyncInterval = setInterval(() => {
      syncReadyUI();
      maybeRenderDealAndBidding();
    }, 2000);

    // Initial render if deal already exists
    renderDealAndBidding();
    updateContractDisplay();
    // updatePlayTurnIndicator will be called after contract is determined

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
    const dealBtn = persistentDealBtn || host.querySelector('[data-action="deal-cards"]');
    persistentDealBtn = dealBtn || persistentDealBtn;

    if (dealBtn) {
      dealBtn.addEventListener('click', () => {
        // Load current deal number from storage to ensure sync
        const nextDealNumber = getNextDealNumber(currentTable.id, dealNumber);
        console.log(`[Deal Click] dealNumber before: ${dealNumber}, nextDealNumber from storage: ${nextDealNumber}`);
        dealNumber = nextDealNumber;
        console.log(`[Deal] Starting deal ${dealNumber}`);
        
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
        
        // Calculate and store HCP and fits in playState for obligation calculation
        const hcpNS = hcpScores.north + hcpScores.south;
        const hcpEW = hcpScores.east + hcpScores.west;
        const fitsNS = countFits(currentDeal.hands.north, currentDeal.hands.south);
        const fitsEW = countFits(currentDeal.hands.east, currentDeal.hands.west);
        
        // Store original hands for display in results (deep copy)
        playState.originalHands = {
          north: JSON.parse(JSON.stringify(currentDeal.hands.north)),
          east: JSON.parse(JSON.stringify(currentDeal.hands.east)),
          south: JSON.parse(JSON.stringify(currentDeal.hands.south)),
          west: JSON.parse(JSON.stringify(currentDeal.hands.west))
        };
        
        // Update vulnerability indicators for current deal
        console.log(`[Deal] Updating vulnerability for dealNumber: ${dealNumber}`);
        updateVulnerabilityIndicators(host, ctx, dealNumber);
        
        dealNumber++;
        
        // Persist deal state for other tabs to sync
        persistDealState(currentTable.id, {
          dealNumber: currentDeal.dealNumber,
          hands: currentDeal.hands,
          isEvenDeal: currentDeal.isEvenDeal,
          hcpScores,
          hcpNS,
          hcpEW,
          fitsNS,
          fitsEW
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
              applyContractResult(result.contract, result.declarer, result.dummy, result.openingLeader);
            } else if (biddingState.ended) {
              const fallback = resolveContractFallback();
              if (fallback) {
                applyContractResult(fallback.contract, fallback.declarer, fallback.dummy, fallback.openingLeader);
              }
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
      if (roomStateChannel) {
        ctx.supabaseClient.removeChannel(roomStateChannel);
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
