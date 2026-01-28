// Bridge Auction Logic
// Handles auction state, contract determination, declarer, dummy, and opening leader

export const CallType = {
  PASS: 'PASS',
  BID: 'BID',
  DOUBLE: 'DOUBLE',
  REDOUBLE: 'REDOUBLE'
};

export const Strain = {
  CLUBS: 'C',
  DIAMONDS: 'D',
  HEARTS: 'H',
  SPADES: 'S',
  NOTRUMP: 'NT'
};

export function getPartner(seat) {
  switch (seat) {
    case 'N': return 'S';
    case 'S': return 'N';
    case 'E': return 'W';
    case 'W': return 'E';
    default: return null;
  }
}

export function DetermineAuctionResult(calls, dealerSeat) {
  if (calls.length < 4) return { result: 'AuctionInProgress' };
  if (calls.slice(0, 4).every(c => c.type === CallType.PASS)) {
    return { result: 'PassedOut' };
  }
  let lastNonPass = -1;
  for (let i = calls.length - 1; i >= 0; --i) {
    if (calls[i].type !== CallType.PASS) {
      lastNonPass = i;
      break;
    }
  }
  if (lastNonPass === -1) return { result: 'PassedOut' };
  if (calls.length === lastNonPass + 4 && calls.slice(lastNonPass + 1).every(c => c.type === CallType.PASS)) {
    const contract = DetermineContract(calls);
    if (!contract) return { result: 'PassedOut' };
    const declarer = DetermineDeclarer(calls, contract);
    const dummy = getPartner(declarer);
    const openingLeader = DetermineOpeningLeader(declarer);
    return { result: 'Contract', contract, declarer, dummy, openingLeader };
  }
  return { result: 'AuctionInProgress' };
}

export function DetermineContract(calls) {
  let lastBid = null;
  let doubled = 'None';
  for (let i = 0; i < calls.length; ++i) {
    const c = calls[i];
    if (c.type === CallType.BID) {
      lastBid = c;
      doubled = 'None';
    } else if (c.type === CallType.DOUBLE && lastBid) {
      doubled = 'Doubled';
    } else if (c.type === CallType.REDOUBLE && lastBid && doubled === 'Doubled') {
      doubled = 'Redoubled';
    }
  }
  if (!lastBid) return null;
  const declaringSide = (lastBid.seat === 'N' || lastBid.seat === 'S') ? 'NS' : 'EW';
  return {
    level: lastBid.level,
    strain: lastBid.strain,
    doubled,
    declaringSide
  };
}

export function DetermineDeclarer(calls, contract) {
  for (const c of calls) {
    if (c.type === CallType.BID &&
        c.strain === contract.strain &&
        ((contract.declaringSide === 'NS' && (c.seat === 'N' || c.seat === 'S')) ||
         (contract.declaringSide === 'EW' && (c.seat === 'E' || c.seat === 'W')))) {
      return c.seat;
    }
  }
  return null;
}

export function DetermineOpeningLeader(declarerSeat) {
  const order = ['N', 'E', 'S', 'W'];
  const idx = order.indexOf(declarerSeat);
  return order[(idx + 1) % 4];
}
