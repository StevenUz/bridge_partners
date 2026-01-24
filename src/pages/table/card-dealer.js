// Bridge card dealing system

const SUITS = ['♠', '♥', '♦', '♣'];
const RANKS = ['A', 'K', 'Q', 'J', '10', '9', '8', '7', '6', '5', '4', '3', '2'];

export class Card {
  constructor(suit, rank) {
    this.suit = suit;
    this.rank = rank;
  }

  toString() {
    return `${this.rank}${this.suit}`;
  }

  isRed() {
    return this.suit === '♥' || this.suit === '♦';
  }
}

export function createDeck() {
  const deck = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      deck.push(new Card(suit, rank));
    }
  }
  return deck;
}

export function shuffleDeck(deck) {
  const shuffled = [...deck];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

export function dealCards(dealNumber = 1) {
  const deck = createDeck();
  const shuffled = shuffleDeck(deck);

  const hands = {
    north: shuffled.slice(0, 13),
    east: shuffled.slice(13, 26),
    south: shuffled.slice(26, 39),
    west: shuffled.slice(39, 52)
  };

  // Sort each hand by suit then rank for better readability
  Object.keys(hands).forEach(pos => {
    hands[pos].sort((a, b) => {
      const suitOrder = ['♠', '♥', '♦', '♣'];
      const rankOrder = RANKS;
      const suitDiff = suitOrder.indexOf(a.suit) - suitOrder.indexOf(b.suit);
      if (suitDiff !== 0) return suitDiff;
      return rankOrder.indexOf(a.rank) - rankOrder.indexOf(b.rank);
    });
    
    // For vertical positions (West/East), reverse so strongest (A) is at top
    if (pos === 'west' || pos === 'east') {
      hands[pos].reverse();
    }
  });

  return {
    hands,
    dealNumber,
    isEvenDeal: dealNumber % 2 === 0
  };
}

export function renderCard(card, faceVisible = true) {
  if (!faceVisible) {
    return {
      front: '',
      back: card.isRed ? 'red' : 'blue'
    };
  }

  const suitClass = card.suit === '♥' || card.suit === '♦' ? 'red' : 'black';
  return {
    front: `<div class="card-front ${suitClass}"><div class="card-rank">${card.rank}</div><div class="card-suit">${card.suit}</div></div>`,
    back: null
  };
}
