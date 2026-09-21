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

const DAY_NAMES = ['রবিবার', 'সোমবার', 'মঙ্গলবার', 'বুধবার', 'বৃহস্পতিবার', 'শুক্রবার', 'শনিবার'];
const MONTH_NAMES = ['জানুয়ারি', 'ফেব্রুয়ারি', 'মার্চ', 'এপ্রিল', 'মে', 'জুন', 'জুলাই', 'আগস্ট', 'সেপ্টেম্বর', 'অক্টোবর', 'নভেম্বর', 'ডিসেম্বর'];
const DAILY_ADVICE = [
  'আজকের শেখা হোক আরও গোছানো।',
  'ছোট ছোট লক্ষ্যই বড় সাফল্যের শুরু।',
  'আজ ক্লাসে মনোযোগ দাও, আগামীকাল আত্মবিশ্বাস বাড়বে।',
  'প্রতিদিন একটু পড়া, পরীক্ষার সময় অনেক স্বস্তি।',
  'যা বুঝতে কষ্ট হয়, আজই প্রশ্ন করে জেনে নাও।',
  'তোমার নিয়মিত চেষ্টাই তোমার সবচেয়ে বড় শক্তি।',
  'আজকের সময়টুকু নিজের ভবিষ্যতের জন্য কাজে লাগাও।'
];

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
  const hour = now.getHours();
  const hour12 = hour % 12 || 12;
  const period = hour < 5 ? 'রাত' : hour < 12 ? 'সকাল' : hour < 15 ? 'দুপুর' : hour < 18 ? 'বিকেল' : hour < 20 ? 'সন্ধ্যা' : 'রাত';
  const dayOfYear = Math.floor((Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()) - Date.UTC(now.getFullYear(), 0, 0)) / 86400000);
  const formattedDate = `${toBanglaNumber(now.getDate())} ${MONTH_NAMES[now.getMonth()]} ${toBanglaNumber(now.getFullYear())}`;
  const formattedTime = `${toBanglaNumber(hour12).padStart(2, '০')}:${toBanglaNumber(now.getMinutes()).padStart(2, '০')} ${period}`;

  document.documentElement.dataset.timeTheme = theme;
  if ($('#dayGreeting')) $('#dayGreeting').textContent = TIME_THEMES[theme].greeting;
  if ($('#dailyAdvice')) $('#dailyAdvice').textContent = DAILY_ADVICE[dayOfYear % DAILY_ADVICE.length];
  if ($('#todayDay')) $('#todayDay').textContent = DAY_NAMES[now.getDay()];
  if ($('#todayDate')) $('#todayDate').textContent = formattedDate;
  if ($('#currentTime')) $('#currentTime').textContent = formattedTime;
  if ($('#homeScheduleDate')) $('#homeScheduleDate').textContent = `আজ, ${toBanglaNumber(now.getDate())} ${MONTH_NAMES[now.getMonth()]}`;
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
