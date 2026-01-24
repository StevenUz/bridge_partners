import template from './table.html?raw';
import './table-cards.css';
import { applyTranslations, languages } from '../../i18n/i18n.js';
import { dealCards } from './card-dealer.js';
import { createCardElement } from './card-renderer.js';

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
    const isObserver = viewPosition === 'observer';

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
        dealNumber++;
        
        // Render hands
        const isRedBack = currentDeal.isEvenDeal;

        // North
        const northContainer = host.querySelector('[data-cards-north]');
        northContainer.innerHTML = '';
        const northHand = createCardDisplay(
          currentDeal.hands.north,
          'north',
          isObserver,
          isRedBack
        );
        northContainer.appendChild(northHand);

        // South
        const southContainer = host.querySelector('[data-cards-south]');
        southContainer.innerHTML = '';
        const southHand = createCardDisplay(
          currentDeal.hands.south,
          'south',
          viewPosition === 'south' || isObserver,
          isRedBack
        );
        southContainer.appendChild(southHand);

        // West
        const westContainer = host.querySelector('[data-cards-west]');
        westContainer.innerHTML = '';
        const westHand = createCardDisplay(
          currentDeal.hands.west,
          'west',
          isObserver,
          isRedBack
        );
        westContainer.appendChild(westHand);

        // East
        const eastContainer = host.querySelector('[data-cards-east]');
        eastContainer.innerHTML = '';
        const eastHand = createCardDisplay(
          currentDeal.hands.east,
          'east',
          isObserver,
          isRedBack
        );
        eastContainer.appendChild(eastHand);

        // Hide deal button, show game info
        dealBtn.style.display = 'none';
        gameArea.innerHTML = `
          <div class="deal-info">
            <p><span data-i18n="dealCards"></span> #${dealNumber - 1}</p>
            <p>${isRedBack ? 'Red back' : 'Blue back'}</p>
          </div>
        `;
        applyTranslations(gameArea, ctx.language);
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
