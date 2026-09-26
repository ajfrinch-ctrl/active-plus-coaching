/* jsdom harness for DOM regression tests that must exercise the real page +
   module (no browser download needed, unlike the Playwright specs).
   Only cosmetic browser APIs jsdom lacks are stubbed — never app logic. */
import { JSDOM, VirtualConsole } from 'jsdom';
import { readFileSync } from 'node:fs';
import { webcrypto } from 'node:crypto';

const GLOBAL_KEYS = [
  'window', 'document', 'navigator', 'location', 'localStorage', 'sessionStorage',
  'Event', 'CustomEvent', 'FormData', 'Node', 'Element', 'HTMLElement',
  'HTMLInputElement', 'HTMLSelectElement', 'HTMLFormElement', 'File', 'Blob',
  'Image', 'getComputedStyle', 'requestAnimationFrame', 'cancelAnimationFrame',
  'MutationObserver', 'DOMParser'
];

export async function loadPage(file, { seed = {} } = {}) {
  const html = readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
  const virtualConsole = new VirtualConsole();
  const jsdomErrors = [];
  virtualConsole.on('jsdomError', error => jsdomErrors.push(String(error.message)));
  const dom = new JSDOM(html, { url: 'http://localhost/', pretendToBeVisual: true, virtualConsole });
  const { window } = dom;

  Object.entries(seed).forEach(([key, value]) => window.localStorage.setItem(key, value));

  // jsdom ships crypto.getRandomValues but not crypto.subtle; the app hashes
  // passwords with Web Crypto, so the standard Node implementation stands in.
  if (!window.crypto || !window.crypto.subtle) {
    try {
      Object.defineProperty(window, 'crypto', { value: webcrypto, configurable: true });
    } catch { /* a jsdom that already locked crypto keeps its own object */ }
  }

  // Scrolling is a no-op in jsdom; the app only uses it for polish. Navigation
  // is left unstubbed on purpose: jsdom reports it, so tests can assert that a
  // handoff really tried to open the counter page.
  window.Element.prototype.scrollIntoView = function scrollIntoView() {};
  window.Element.prototype.scrollTo = function scrollTo() {};
  window.scrollTo = () => {};

  for (const key of GLOBAL_KEYS) {
    if (!(key in window)) continue;
    Object.defineProperty(globalThis, key, { value: window[key], configurable: true, writable: true });
  }

  const $ = selector => window.document.querySelector(selector);
  const $$ = selector => Array.from(window.document.querySelectorAll(selector));
  const click = element => element.dispatchEvent(new window.Event('click', { bubbles: true, cancelable: true }));
  const type = (element, value) => {
    element.value = value;
    element.dispatchEvent(new window.Event('input', { bubbles: true }));
  };
  const submit = form => form.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
  const flush = async (times = 6) => { for (let i = 0; i < times; i++) await Promise.resolve(); };
  // The budget is generous on purpose: password hashing (PBKDF2) and AES-GCM
  // run on real macrotasks, and the suite runs files in parallel on small
  // machines, so a UI change can take a while to appear.
  const waitFor = async (predicate, timeout = 20000) => {
    const started = Date.now();
    while (!predicate()) {
      if (Date.now() - started > timeout) throw new Error('waitFor timed out waiting for a UI change');
      await new Promise(resolve => setTimeout(resolve, 5));
    }
  };

  return { dom, window, document: window.document, jsdomErrors, $, $$, click, type, submit, flush, waitFor };
}
