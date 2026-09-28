/* Pre-paint appearance apply. Runs as a classic script in <head> so a stored
   dark theme is on <html> before the first render and the screen never flashes
   light. No imports here on purpose; keep APPEARANCE_KEY and the dark colour
   identical to js/appearance.js — tests/appearance.test.mjs fails on drift. */
(function applyAppearanceEarly() {
  var APPEARANCE_KEY = 'active-plus-appearance-v2';
  var theme = 'light';
  try {
    var stored = window.localStorage.getItem(APPEARANCE_KEY);
    if (stored === 'dark' || stored === 'light') {
      theme = stored;
    } else if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
      theme = 'dark';
    }
  } catch (error) {
    // Private mode hides the stored choice: fall back to the device setting.
    try {
      if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) theme = 'dark';
    } catch (ignored) { /* stay light */ }
  }
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
})();
