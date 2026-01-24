const STORAGE_KEY = 'bridge-partners-language';

export const languages = {
  en: 'English',
  bg: 'Български'
};

const translations = {
  en: {
    brand: 'Bridge Partners',
    navHome: 'Home',
    navLobby: 'Lobby',
    navTable: 'Table View',
    navStats: 'Statistics',
    language: 'Language',
    heroTitle: 'Play Bridge With Partners Anywhere',
    heroSubtitle: 'Register, join a lobby, sit at a table, and start the deal.',
    ctaRegister: 'Register & Enter Lobby',
    formName: 'Display Name',
    formPassword: 'Password',
    formRemember: 'Remember me on this device',
    lobbyTitle: 'Lobby',
    lobbyCreate: 'Create New Table',
    lobbyLimit: 'Up to 5 active tables',
    lobbyLimitReached: 'Table limit reached',
    lobbyLimitMessage: 'All 5 tables are currently active. Please wait for a spot to open up, or join an existing table as a player or observer.',
    lobbyAvailable: 'Available Tables',
    table: 'Table',
    tableSeats: 'Seats',
    tablePlayers: 'Players',
    tableObservers: 'Observers',
    tableJoin: 'Join Table',
    tableJoinAs: 'Join as',
    yourPosition: 'Your Position',
    observerMode: 'Observer Mode',
    chatLobby: 'Lobby chat',
    chatTable: 'Table chat',
    chatPlaceholder: 'Type a message (max 50 chars)',
    chatSend: 'Send',
    changePosition: 'Change perspective - click to see from another player\'s view',
    cards: 'cards',
    dealCards: 'Deal Cards',
    hcpBottom: 'Bottom points',
    hcpTop: 'Top points',
    hcpLeft: 'Left points',
    hcpRight: 'Right points',
    hcpSouth: 'South points',
    hcpNorth: 'North points',
    hcpWest: 'West points',
    hcpEast: 'East points',
    seatSouth: 'South',
    seatWest: 'West',
    seatNorth: 'North',
    seatEast: 'East',
    seatShortSouth: 'S',
    seatShortWest: 'W',
    seatShortNorth: 'N',
    seatShortEast: 'E',
    seatOpen: 'Open',
    seatObserver: 'Observer',
    tableViewTitle: 'Table View',
    tableStatusWaiting: 'Waiting for four players to start dealing.',
    statisticsTitle: 'Statistics',
    statisticsComingSoon: 'Player stats, boards, and scores will live here.',
    languagePicker: 'Choose language',
    saveLanguage: 'Save language'
  },
  bg: {
    brand: 'Bridge Partners',
    navHome: 'Начало',
    navLobby: 'Лоби',
    navTable: 'Маса',
    navStats: 'Статистика',
    language: 'Език',
    heroTitle: 'Играйте бридж с партньори навсякъде',
    heroSubtitle: 'Регистрирайте се, влезте в лоби, седнете на маса и започнете раздаването.',
    ctaRegister: 'Регистрация и вход в лобито',
    formName: 'Име за показване',
    formPassword: 'Парола',
    formRemember: 'Запомни ме на това устройство',
    lobbyTitle: 'Лоби',
    lobbyCreate: 'Нова маса',
    lobbyLimit: 'До 5 активни маси',
    lobbyLimitReached: 'Достигнат лимит на маси',
    lobbyLimitMessage: 'Всички 5 маси са заети в момента. Моля, изчакайте да се освободи място или се присъединете към съществуваща маса като играч или наблюдател.',
    lobbyAvailable: 'Свободни маси',
    table: 'Маса',
    tableSeats: 'Места',
    tablePlayers: 'Играчи',
    tableObservers: 'Наблюдатели',
    tableJoin: 'Влез на масата',
    tableJoinAs: 'Влез като',
    yourPosition: 'Вашата позиция',
    observerMode: 'Режим на наблюдател',
    chatLobby: 'Чат в лобито',
    chatTable: 'Чат за масата',
    chatPlaceholder: 'Въведи съобщение (до 50 символа)',
    chatSend: 'Изпрати',
    changePosition: 'Промени перспектива - кликни, за да видиш от друг играч',
    cards: 'карти',
    dealCards: 'Раздай картите',
    hcpBottom: 'Точки (долу)',
    hcpTop: 'Точки (горе)',
    hcpLeft: 'Точки (ляво)',
    hcpRight: 'Точки (дясно)',
    hcpSouth: 'Точки на Юг',
    hcpNorth: 'Точки на Север',
    hcpWest: 'Точки на Запад',
    hcpEast: 'Точки на Изток',
    seatSouth: 'Юг',
    seatWest: 'Запад',
    seatNorth: 'Север',
    seatEast: 'Изток',
    seatShortSouth: 'Ю',
    seatShortWest: 'З',
    seatShortNorth: 'С',
    seatShortEast: 'И',
    seatOpen: 'Свободно',
    seatObserver: 'Наблюдател',
    tableViewTitle: 'Изглед на маса',
    tableStatusWaiting: 'Изчакват се четирима играчи за старт.',
    statisticsTitle: 'Статистика',
    statisticsComingSoon: 'Тук ще бъдат резултати, бордове и точки.',
    languagePicker: 'Избери език',
    saveLanguage: 'Запази езика'
  }
};

export function getLanguage() {
  const stored = localStorage.getItem(STORAGE_KEY);
  return stored && languages[stored] ? stored : 'en';
}

export function setLanguage(language) {
  const value = languages[language] ? language : 'en';
  localStorage.setItem(STORAGE_KEY, value);
  return value;
}

export function t(language, key) {
  const lang = languages[language] ? language : 'en';
  return translations[lang][key] ?? translations.en[key] ?? key;
}

export function applyTranslations(root, language) {
  if (!root) return;
  root.querySelectorAll('[data-i18n]').forEach((node) => {
    const key = node.getAttribute('data-i18n');
    node.textContent = t(language, key);
  });
}
