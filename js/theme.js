/* Dynamic time and weather theme. Weather is local-first today and can be replaced by an API later. */
import { $, toBanglaNumber } from './ui.js';
import { STORAGE_KEYS } from './config.js';

const TIME_THEMES = Object.freeze({
  morning: { from: 5, to: 11, greeting: 'শুভ সকাল' },
  day: { from: 12, to: 16, greeting: 'শুভ অপরাহ্ণ' },
  evening: { from: 17, to: 19, greeting: 'শুভ সন্ধ্যা' },
  night: { from: 20, to: 4, greeting: 'শুভ রাত্রি' }
});

const WEATHER = Object.freeze({
  clear: { label: 'স্বচ্ছ আকাশ', icon: '#icon-sun' },
  cloudy: { label: 'মেঘলা আকাশ', icon: '#icon-cloud' },
  rain: { label: 'বৃষ্টির আবহাওয়া', icon: '#icon-rain' }
});

function getTimeTheme(hour) {
  return Object.entries(TIME_THEMES).find(([, value]) => {
    if (value.from <= value.to) return hour >= value.from && hour <= value.to;
    return hour >= value.from || hour <= value.to;
  })?.[0] || 'day';
}

function loadWeather() {
  try {
    const stored = localStorage.getItem(STORAGE_KEYS.weather);
    return WEATHER[stored] ? stored : 'clear';
  } catch { return 'clear'; }
}

function applyTimeTheme() {
  const now = new Date();
  const theme = getTimeTheme(now.getHours());
  document.documentElement.dataset.timeTheme = theme;
  const greeting = $('#dayGreeting');
  if (greeting) greeting.textContent = TIME_THEMES[theme].greeting;
  const timeLabel = $('#timeThemeLabel');
  if (timeLabel) timeLabel.textContent = `${toBanglaNumber(now.getHours()).padStart(2, '০')}:${toBanglaNumber(now.getMinutes()).padStart(2, '০')}`;
}

function applyWeatherTheme(weatherKey = loadWeather()) {
  const weather = WEATHER[weatherKey] ? weatherKey : 'clear';
  const detail = WEATHER[weather];
  document.documentElement.dataset.weather = weather;
  const label = $('#weatherLabel');
  const icon = $('#weatherIcon use');
  const status = $('#weatherStatus');
  if (label) label.textContent = detail.label;
  if (icon) icon.setAttribute('href', detail.icon);
  if (status) status.setAttribute('aria-label', `আবহাওয়া: ${detail.label}`);
}

export function setOfflineWeather(weatherKey) {
  if (!WEATHER[weatherKey]) return;
  try { localStorage.setItem(STORAGE_KEYS.weather, weatherKey); } catch { /* no-op */ }
  applyWeatherTheme(weatherKey);
}

export function initDynamicTheme() {
  applyTimeTheme();
  applyWeatherTheme();
  window.setInterval(applyTimeTheme, 60 * 1000);
  // Future Admin/online weather adapters can update this without touching the UI.
  window.ActivePlusTheme = { setWeather: setOfflineWeather };
}
