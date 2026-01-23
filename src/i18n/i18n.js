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
    lobbyAvailable: 'Available Tables',
    tableSeats: 'Seats',
    tablePlayers: 'Players',
    tableObservers: 'Observers',
    tableJoin: 'Join Table',
    tableJoinAs: 'Join as',
    seatSouth: 'South',
    seatWest: 'West',
    seatNorth: 'North',
    seatEast: 'East',
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
    lobbyAvailable: 'Свободни маси',
    tableSeats: 'Места',
    tablePlayers: 'Играчи',
    tableObservers: 'Наблюдатели',
    tableJoin: 'Влез на масата',
    tableJoinAs: 'Влез като',
    seatSouth: 'Юг',
    seatWest: 'Запад',
    seatNorth: 'Север',
    seatEast: 'Изток',
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
