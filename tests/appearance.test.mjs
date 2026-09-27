/* Light + dark appearance: first run follows the system preference, a stored
   device choice wins and survives, and the meta theme-color stays in sync.
   The last test pins js/appearance-boot.js to the same storage key so the
   pre-paint script can never drift from the module. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  APPEARANCE_KEY,
  getStoredTheme,
  getTheme,
  setTheme,
  toggleTheme,
  applyTheme,
  themeColorFor
} from '../js/appearance.js';

function freshBrowser({ systemDark = false } = {}) {
  const store = new Map();
  const meta = {
    content: null,
    setAttribute(name, value) { if (name === 'content') this.content = value; }
  };
  const root = { dataset: {}, style: {} };
  globalThis.window = {
    localStorage: {
      getItem: key => (store.has(key) ? store.get(key) : null),
      setItem: (key, value) => store.set(key, String(value)),
      removeItem: key => store.delete(key)
    },
    matchMedia: query => ({
      matches: systemDark && query.includes('color-scheme: dark'),
      addEventListener() {},
      addListener() {}
    }),
    dispatchEvent() {}
  };
  globalThis.CustomEvent = class CustomEvent {
    constructor(type, init = {}) { this.type = type; this.detail = init.detail; }
  };
  globalThis.document = {
    documentElement: root,
    querySelector: () => meta,
    querySelectorAll: () => [],
    getElementById: () => null,
    addEventListener() {}
  };
  return { store, meta, root };
}

test('the first run follows the system colour preference', () => {
  freshBrowser({ systemDark: false });
  assert.equal(getStoredTheme(), null);
  assert.equal(getTheme(), 'light');
  freshBrowser({ systemDark: true });
  assert.equal(getTheme(), 'dark');
});

test('an explicit device choice wins over the system preference and persists', () => {
  const env = freshBrowser({ systemDark: true });
  assert.equal(setTheme('light'), 'light');
  assert.equal(env.store.get(APPEARANCE_KEY), 'light');
  assert.equal(getTheme(), 'light');
  env.root.dataset = {};
  assert.equal(setTheme('dark'), 'dark');
  assert.equal(getTheme(), 'dark');
});

test('toggle flips the theme and keeps html + theme-color meta in sync', () => {
  const env = freshBrowser();
  assert.equal(toggleTheme(), 'dark');
  assert.equal(env.root.dataset.theme, 'dark');
  assert.equal(env.root.style.colorScheme, 'dark');
  assert.equal(env.meta.content, themeColorFor('dark'));
  assert.equal(toggleTheme(), 'light');
  assert.equal(env.root.dataset.theme, 'light');
  assert.equal(env.root.style.colorScheme, 'light');
  assert.equal(env.meta.content, themeColorFor('light'));
});

test('applyTheme normalises unknown values to light', () => {
  const env = freshBrowser();
  assert.equal(applyTheme('purple'), 'light');
  assert.equal(env.root.dataset.theme, 'light');
  assert.equal(themeColorFor('dark') !== themeColorFor('light'), true);
});

test('the pre-paint boot script uses the exact storage key of the module', () => {
  const boot = readFileSync(new URL('../js/appearance-boot.js', import.meta.url), 'utf8');
  assert.match(boot, new RegExp(`'${APPEARANCE_KEY}'`), 'appearance-boot.js must store under the shared key');
});
