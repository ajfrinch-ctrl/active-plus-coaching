/* Panel isolation — no panel ships a shortcut into another portal.
 *
 * Each role owns exactly one door: the Admin panel must not link to the
 * Manager, Teacher, Payment or offline-role portals, and the same is true the
 * other way round. A cross-panel entry would also be a permission hole: the
 * Admin role does not hold `payment.panel` / `teaching.panel`, so the markup is
 * removed at boot — but shipping it at all would paint the shortcut for a
 * moment and leak the other portal's existence, so it must not exist.
 *
 * Checked on the shipped markup of every page (not the booted DOM), which is
 * stricter than the runtime check in tests/admin-panel-shell.test.mjs.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { readFileSync, readdirSync } from 'node:fs';

const PANELS = Object.freeze(['admin.html', 'manager.html', 'teacher.html', 'payment.html', 'offline-roles.html']);
const PAGES = Object.freeze(['index.html', ...PANELS]);
const LINK_CLASSES = Object.freeze(['pay-panel-link', 'teacher-panel-link', 'manager-panel-link', 'admin-panel-link', 'portal-link']);
const CROSS_PANEL_CAPS = Object.freeze(['payment.panel', 'teaching.panel', 'manager.panel']);

const documentOf = file => new JSDOM(readFileSync(new URL(`../${file}`, import.meta.url), 'utf8')).window.document;

test('no page links to another portal', () => {
  for (const file of PAGES) {
    const document = documentOf(file);
    for (const anchor of document.querySelectorAll('a[href]')) {
      const href = String(anchor.getAttribute('href') || '').split('?')[0].split('#')[0];
      if (!href || /^(https?:|mailto:|tel:|data:|#)/.test(href)) continue;
      const target = href.split('/').pop();
      const other = PANELS.includes(target) && target !== file;
      assert.equal(other, false, `${file}: the page links to another portal (${href})`);
      assert.equal(/(^|\/)index\.html$/.test(href), false, `${file}: a portal may not link back to the login page from its UI`);
    }
  }
});

test('no cross-panel shortcut class or capability gate is left anywhere', () => {
  for (const file of PAGES) {
    const document = documentOf(file);
    for (const name of LINK_CLASSES) {
      assert.equal(document.querySelector(`.${name}`), null, `${file}: .${name} is still shipped`);
    }
    for (const capability of CROSS_PANEL_CAPS) {
      assert.equal(document.querySelector(`[data-admin-cap="${capability}"]`), null,
        `${file}: an element is gated on ${capability} (a cross-panel entry)`);
    }
  }
});

test('generated markup never builds a link to another portal either', () => {
  const jsDir = new URL('../js/', import.meta.url);
  for (const name of readdirSync(jsDir).filter(entry => entry.endsWith('.js'))) {
    const source = readFileSync(new URL(name, jsDir), 'utf8');
    for (const panel of PANELS) {
      const builtLink = new RegExp(`href=["'\`][^"'\`]*${panel.replace('.', '\\.')}`);
      assert.equal(builtLink.test(source), false, `js/${name}: builds a link to ${panel}`);
      // A plain path constant is fine (login routing needs it); a link is not.
      const anchorFor = new RegExp(`<a[^>]*${panel.replace('.', '\\.')}`);
      assert.equal(anchorFor.test(source), false, `js/${name}: renders an anchor to ${panel}`);
    }
  }
});
