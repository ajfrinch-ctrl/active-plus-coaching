/* One bottom navigation. Four portals each ship their own bar, and they had
   drifted: the student and Teacher labels were bare <span>s that only worked
   because the CSS special-cased `> span:not(.nav-chip)`, and the Manager's
   active tab never carried aria-current. Same job, three shapes.

   These tests read the real markup of all four portals and hold them to one
   structure: a bar, buttons with an icon chip and a labelled text node, and
   exactly one current page. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const dom = file => new JSDOM(readFileSync(path.join(ROOT, file), 'utf8')).window.document;

const PORTALS = [
  { file: 'index.html', role: 'student', bar: '.bottom-nav', item: '.bottom-link', tabs: 5 },
  { file: 'admin.html', role: 'admin', bar: '.admin-bottom', item: '.admin-bottom-item', tabs: 5 },
  { file: 'manager.html', role: 'manager', bar: '.admin-bottom', item: '.admin-bottom-item', tabs: 4 },
  { file: 'teacher.html', role: 'teacher', bar: '.admin-bottom', item: '.admin-bottom-item', tabs: 5 },
];

for (const { file, role, bar, item, tabs } of PORTALS) {
  test(`the ${role} bottom nav is one bar of ${tabs} labelled tabs`, () => {
    const doc = dom(file);
    const nav = doc.querySelector(bar);
    assert.ok(nav, `${file} has a ${bar}`);
    assert.equal(nav.getAttribute('aria-label') ? 1 : 0, 1, 'the bar names itself');

    const buttons = [...nav.querySelectorAll(`:scope > ${item}`)];
    assert.equal(buttons.length, tabs, `${role} ships ${tabs} tabs`);

    for (const button of buttons) {
      assert.equal(button.tagName, 'BUTTON', 'a tab is a button, not a link or div');
      assert.equal(button.getAttribute('type'), 'button', 'never an implicit submit');
      assert.ok(button.querySelector(':scope > .nav-chip'), 'with an icon chip');
      /* The label carries its class in every portal — that is what lets one CSS
         rule serve all four, instead of `> span:not(.nav-chip)`. */
      const label = button.querySelector(':scope > .nav-label');
      assert.ok(label, 'with a .nav-label');
      assert.ok(label.textContent.trim().length > 0, 'and the label has words');
      assert.equal(label.querySelector('svg'), null, 'the label is text only');
    }

    /* Exactly one tab is the current page — for the eye and for a screen reader. */
    const current = buttons.filter(button => button.getAttribute('aria-current') === 'page');
    assert.equal(current.length, 1, 'exactly one aria-current="page"');
    assert.ok(current[0].classList.contains('active'), 'and it is the visually active one');
  });
}

test('one CSS rule serves every portal’s nav label', () => {
  const css = readFileSync(path.join(ROOT, 'css/ui-wallet.css'), 'utf8');
  assert.match(css, /\.bottom-link > \.nav-label, \.admin-bottom-item > \.nav-label \{/);
  /* The workaround that existed only for the bare student/Teacher span is gone;
     if it comes back, a portal has drifted off the shared structure again. */
  assert.doesNotMatch(css, /:not\(\.nav-chip\)/);
});
