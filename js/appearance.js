/* Light + dark appearance, stored per device.
   Pattern: html[data-theme] + CSS `color-scheme` + theme-color meta stay in
   sync, the first run follows the system preference, and every later change is
   an explicit choice that survives reloads. The pre-paint half that stops a
   dark theme from flashing light lives in js/appearance-boot.js and must keep
   using the exact same storage key (guarded by tests/appearance.test.mjs). */

export const APPEARANCE_KEY = 'active-plus-appearance-v2';
export const THEME_COLOR = Object.freeze({ light: '#04795a', dark: '#000000' });

function normalize(theme) {
  return theme === 'dark' ? 'dark' : 'light';
}

export function getStoredTheme() {
  try {
    const value = window.localStorage.getItem(APPEARANCE_KEY);
    if (value === 'light' || value === 'dark') return value;
  } catch { /* private mode — fall back to the system preference */ }
  return null;
}

export function systemPrefersDark() {
  try {
    return typeof window.matchMedia === 'function'
      && window.matchMedia('(prefers-color-scheme: dark)').matches === true;
  } catch { return false; }
}

export function getTheme() {
  return getStoredTheme() || 'dark';
}

export function themeColorFor(theme) {
  return THEME_COLOR[normalize(theme)];
}

function paintThemeColor(theme) {
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', themeColorFor(theme));
}

function syncControls(theme) {
  for (const control of document.querySelectorAll('[data-theme-toggle]')) {
    control.setAttribute('aria-pressed', String(theme === 'dark'));
    control.setAttribute('aria-label', theme === 'dark' ? 'লাইট মোড চালু করুন' : 'ডার্ক মোড চালু করুন');
  }
  const checkbox = document.getElementById('darkModeToggle');
  if (checkbox) checkbox.checked = theme === 'dark';
}

export function applyTheme(theme) {
  const next = normalize(theme);
  const root = document.documentElement;
  root.dataset.theme = next;
  try { root.style.colorScheme = next; } catch { /* older engines ignore this */ }
  paintThemeColor(next);
  syncControls(next);
  return next;
}

export function setTheme(theme) {
  const next = normalize(theme);
  try { window.localStorage.setItem(APPEARANCE_KEY, next); } catch { /* private mode */ }
  applyTheme(next);
  window.dispatchEvent(new CustomEvent('apc:theme', { detail: next }));
  return next;
}

export function toggleTheme() {
  return setTheme(getTheme() === 'dark' ? 'light' : 'dark');
}

export function initAppearance() {
  applyTheme(getTheme());

  document.addEventListener('click', event => {
    const trigger = event.target.closest('[data-theme-toggle]');
    if (!trigger) return;
    event.preventDefault();
    toggleTheme();
  });

  const checkbox = document.getElementById('darkModeToggle');
  if (checkbox) {
    checkbox.addEventListener('change', () => {
      setTheme(checkbox.checked ? 'dark' : 'light');
    });
  }

  // While this device has no stored choice, keep following the system setting.
  try {
    const query = window.matchMedia('(prefers-color-scheme: dark)');
    const followSystem = event => {
      if (!getStoredTheme()) applyTheme(event.matches ? 'dark' : 'light');
    };
    if (typeof query.addEventListener === 'function') query.addEventListener('change', followSystem);
    else if (typeof query.addListener === 'function') query.addListener(followSystem);
  } catch { /* matchMedia missing — the stored theme is enough */ }
}
