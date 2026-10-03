/* One button scale. Every button used to carry its own numbers — 44px here,
   42px there, 50px in the Pay skin, a 999px pill next to a 9px corner — so the
   same action was a different size and shape in every panel. The scale now
   lives once in foundation.css and every button rule points at it.

   jsdom cannot tell us what a button looks like, so this guards the thing that
   is checkable: the scale is declared exactly once, and no button rule outside
   it goes back to hard-coding a size. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const read = file => readFileSync(path.join(ROOT, file), 'utf8');

/* The stylesheets the app actually loads, in cascade order. ui-modern.css and
   ui-interior.css are not imported by anything, so they are not the app's CSS
   and are deliberately not held to the scale. */
const LOADED = read('css/design-system.css')
  .split('\n')
  .filter(line => line.startsWith('@import'))
  .map(line => 'css/' + line.match(/\.\/([a-z-]+\.css)/)[1]);

const SCALE = ['--btn-xs', '--btn-sm', '--btn-md', '--btn-lg', '--btn-radius', '--btn-border', '--btn-font'];

/* CSS comments are not selectors; without this the parser reads a banner
   comment as a rule and reports a phantom offender. */
const stripComments = css => css.replace(/\/\*[\s\S]*?\*\//g, '');

/* Rules that size a control the user taps. Badges, tags, tiles, rows and the
   keypad are not buttons and keep their own shapes on purpose. */
const BUTTON_SELECTORS = /(^|[,{}]\s*)(button|\.admin-btn|\.mini-btn|\.rc-back|\.auth-tab|\.auth-submit|\.modal-action|\.step-next|\.dashboard-primary-action|\.whatsapp-button|\.learning-filter button|\.chip-row button|\.teacher-type-tabs > button|\.student-filter-toggle|\.course-item-link|\.inline-link|\.quick-amount|\.teacher-list-more|\.apc-alert-choice > button|\.edit-button|\.help-card > button|\.class-context > button)\b/;

test('the app loads the stylesheets this file holds to the scale', () => {
  assert.ok(LOADED.length >= 10, `expected the full cascade, got ${LOADED.length}`);
  assert.ok(LOADED.includes('css/foundation.css'), 'the palette leads the cascade');
  assert.equal(LOADED[LOADED.length - 1], 'css/ui-wallet.css', 'the Pay skin loads last, so it wins');
  /* Guard the assumption that the dead files stay dead: if someone imports
     ui-modern.css again, its off-scale 42px/15px buttons come back with it. */
  assert.ok(!LOADED.includes('css/ui-modern.css'));
  assert.ok(!LOADED.includes('css/ui-interior.css'));
});

test('the button scale is declared exactly once, in the palette', () => {
  const declarations = LOADED.flatMap(file => {
    const css = stripComments(read(file));
    /* The palette packs several tokens on one line, so a declaration is a token
       followed by ':' after a line start, '{' or ';' — not a line of its own. */
    return SCALE.flatMap(token =>
      [...css.matchAll(new RegExp(`(?:^|[{;\\s])${token}:`, 'g'))].map(() => `${file} ${token}`));
  });
  for (const token of SCALE) {
    const where = declarations.filter(entry => entry.endsWith(token));
    assert.deepEqual(where, [`css/foundation.css ${token}`], `${token} must be declared once, in foundation.css`);
  }
});

test('the scale is ordered, and every step is a real number', () => {
  const css = read('css/foundation.css');
  const value = token => Number(css.match(new RegExp(`${token}:(\\d+)px`))[1]);
  const [xs, sm, md, lg] = ['--btn-xs', '--btn-sm', '--btn-md', '--btn-lg'].map(value);
  assert.ok(xs < sm && sm < md && md < lg, `sizes must ascend, got ${xs} ${sm} ${md} ${lg}`);
  assert.ok(xs >= 32, `the smallest button still meets the 32px touch floor, got ${xs}`);
});

test('no button rule hard-codes a size, radius or text size', () => {
  const offenders = [];
  for (const file of LOADED) {
    if (file === 'css/foundation.css') continue;              // that is the scale
    for (const block of stripComments(read(file)).matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      const [, selector, body] = block;
      if (!BUTTON_SELECTORS.test(selector)) continue;
      for (const prop of ['min-height', 'border-radius', 'font-size', 'font-weight']) {
        for (const decl of body.matchAll(new RegExp(`(?:^|;)\\s*${prop}:\\s*([^;]+)`, 'g'))) {
          const value = decl[1].trim();
          /* A var() is the scale. 0, inherit and 50% (the circular icon chip)
             are shapes, not sizes. Anything else is an invented number. */
          if (/^var\(--btn-/.test(value)) continue;
          if (['0', 'inherit', '50%'].includes(value)) continue;
          offenders.push(`${file} :: ${selector.trim().slice(0, 60)} { ${prop}: ${value} }`);
        }
      }
    }
  }
  assert.deepEqual(offenders, [], 'these button rules bypass the scale:\n' + offenders.join('\n'));
});

test('the buttons the panels actually render ask for a size from the scale', () => {
  /* The rule that every panel's buttons inherit, and the two that override it. */
  const forms = read('css/ui-forms.css');
  assert.match(forms, /button,\.admin-btn,\.mini-btn,\.rc-back\{min-height:var\(--btn-md\)/);
  const wallet = read('css/ui-wallet.css');
  assert.match(wallet, /min-height: var\(--btn-lg\); border-radius: var\(--btn-radius\)/, 'primary buttons');
  assert.match(wallet, /\.mini-btn \{ min-height: var\(--btn-sm\)/, 'in-row actions');
  /* One radius for buttons; badges keep the pill because they are not buttons. */
  assert.doesNotMatch(wallet, /\.mini-btn \{[^}]*999px/);
  assert.match(wallet, /\.saved-tag \{[^}]*999px/, 'a badge stays a pill');
});
