// Card rendering component

export function createCardElement(card, faceVisible = true, isRedBack = false) {
  const container = document.createElement('div');
  container.className = 'playing-card';

  if (faceVisible) {
    const isRed = typeof card.isRed === 'function' ? card.isRed() : (card.suit === 'D' || card.suit === 'H' || card.suit === '♦' || card.suit === '♥');
    const suitClass = isRed ? 'red' : 'black';
    container.innerHTML = `
      <div class="card-inner">
        <div class="card-face ${suitClass}">
          <div class="card-corner top-left">
            <div class="card-rank">${card.rank}</div>
            <div class="card-suit">${card.suit}</div>
          </div>
          <div class="card-corner top-right">
            <div class="card-rank">${card.rank}</div>
            <div class="card-suit">${card.suit}</div>
          </div>
          <div class="card-center">
            <div class="card-pip">${card.suit}</div>
          </div>
          <div class="card-corner bottom-left">
            <div class="card-rank">${card.rank}</div>
            <div class="card-suit">${card.suit}</div>
          </div>
          <div class="card-corner bottom-right">
            <div class="card-rank">${card.rank}</div>
            <div class="card-suit">${card.suit}</div>
          </div>
        </div>
      </div>
    `;
  } else {
    const backStyle = isRedBack ? 'red-back' : 'blue-back';
    container.innerHTML = `
      <div class="card-inner">
        <div class="card-back ${backStyle}">
          <div class="card-back-pattern"></div>
        </div>
      </div>
    `;
  }

  return container;
}

export function createHandDisplay(hand, position, faceVisible = true, isRedBack = false) {
  const container = document.createElement('div');
  container.className = `hand-display hand-${position}`;

  const cards = hand.map(card => createCardElement(card, faceVisible, isRedBack));
  cards.forEach((card, idx) => {
    // For side hands, lower cards (higher idx) render on top, upper cards render behind
    if (position === 'west' || position === 'east') {
      card.style.zIndex = idx;
    }
    container.appendChild(card);
  });

  return container;
}
