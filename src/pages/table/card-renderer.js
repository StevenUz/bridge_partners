// Card rendering component

export function createCardElement(card, faceVisible = true, isRedBack = false) {
  const container = document.createElement('div');
  container.className = 'playing-card';

  if (faceVisible) {
    const suitClass = card.isRed() ? 'red' : 'black';
    container.innerHTML = `
      <div class="card-inner">
        <div class="card-face ${suitClass}">
          <div class="card-corner top">
            <div class="card-rank">${card.rank}</div>
            <div class="card-suit">${card.suit}</div>
          </div>
          <div class="card-pip">${card.suit}</div>
          <div class="card-corner bottom">
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
  cards.forEach(card => container.appendChild(card));

  return container;
}
