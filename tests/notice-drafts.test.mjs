/* Notice drafts (§38).

   A notice used to have exactly one outcome: pressing the button published it.
   There was no way to write one and hold it. These tests pin the two things
   that make a draft safe:

     • saving a draft is a distinct act from publishing, and says so;
     • a draft never reaches a student — enforced at loadNotices(), the single
       read point every other module goes through, rather than at each call site.
*/

import test, { before } from 'node:test';
import assert from 'node:assert/strict';
import { loadPage } from './jsdom-harness.mjs';
import { provisionStaff, seedStaffSession } from './staff-harness.mjs';
import { ROSTER_KEY, NOTICES_KEY, loadNotices, loadAllNotices } from '../js/office-data.js';
import { adminStudents } from '../js/admin-data.js';

let ctx;
const $ = sel => ctx.$(sel);
const $$ = sel => ctx.$$(sel);
const stored = () => JSON.parse(ctx.window.localStorage.getItem(NOTICES_KEY) || '[]');
const byTitle = title => stored().find(notice => notice.title === title);

before(async () => {
  ctx = await loadPage('manager.html', { seed: { [ROSTER_KEY]: JSON.stringify(adminStudents) } });
  await provisionStaff('manager');
  seedStaffSession(ctx.window, 'manager');
  await import('../js/manager.js');
  await ctx.waitFor(() => $('#managerShell').hidden === false);
  ctx.click($('[data-manager-view="notices"]'));
  await ctx.flush();
});

test('the composer offers two distinct outcomes, not one', () => {
  const actions = $$('#managerNoticeForm [data-save-notice]').map(button => button.dataset.saveNotice);
  assert.deepEqual(actions.sort(), ['draft', 'published'],
    'saving a draft and publishing are separate buttons');
  assert.equal($('#managerNoticeForm [data-save-notice="published"]').classList.contains('primary'), true,
    'and publishing is still the primary action');
});

test('saving a draft holds the notice back instead of publishing it', async () => {
  ctx.type($('#managerNoticeForm [name="title"]'), 'খসড়া নোটিশ');
  ctx.type($('#managerNoticeForm [name="body"]'), 'এখনো চূড়ান্ত নয়।');
  ctx.click($('#managerNoticeForm [data-save-notice="draft"]'));
  ctx.submit($('#managerNoticeForm'));
  await ctx.waitFor(() => Boolean(byTitle('খসড়া নোটিশ')));

  assert.equal(byTitle('খসড়া নোটিশ').status, 'draft', 'it is stored as a draft');
  assert.equal(loadAllNotices().some(notice => notice.title === 'খসড়া নোটিশ'), true,
    'the Manager still sees its own draft');
  assert.equal(loadNotices().some(notice => notice.title === 'খসড়া নোটিশ'), false,
    'and the shared read path — the one students go through — does not return it');
});

test('the Manager list marks the draft and offers the way to publish it', async () => {
  await ctx.waitFor(() => Boolean($('#managerNoticeList [data-manager-action="publish-notice"]')));
  const card = $('#managerNoticeList .manager-record');
  assert.match(card.textContent, /খসড়া/, 'the card is labelled a draft');
  assert.match(card.textContent, /শিক্ষার্থীরা এখনো দেখবে না/, 'and says nobody has received it');
  assert.ok(card.querySelector('.badge'), 'with the same badge the panel uses elsewhere');
});

test('publishing the draft makes it visible through the shared read path', async () => {
  ctx.click($('#managerNoticeList [data-manager-action="publish-notice"]'));
  await ctx.waitFor(() => byTitle('খসড়া নোটিশ')?.status === 'published');

  assert.equal(loadNotices().some(notice => notice.title === 'খসড়া নোটিশ'), true,
    'now every reader, students included, sees it');
  assert.equal($('#managerNoticeList [data-manager-action="publish-notice"]'), null,
    'and the publish action goes away once there is nothing left to publish');
});

test('publishing straight away still works exactly as before', async () => {
  ctx.type($('#managerNoticeForm [name="title"]'), 'সরাসরি প্রকাশিত নোটিশ');
  ctx.type($('#managerNoticeForm [name="body"]'), 'এটি সঙ্গে সঙ্গে চলে যাবে।');
  ctx.click($('#managerNoticeForm [data-save-notice="published"]'));
  ctx.submit($('#managerNoticeForm'));
  await ctx.waitFor(() => Boolean(byTitle('সরাসরি প্রকাশিত নোটিশ')));

  assert.equal(byTitle('সরাসরি প্রকাশিত নোটিশ').status, 'published');
  assert.equal(loadNotices().some(notice => notice.title === 'সরাসরি প্রকাশিত নোটিশ'), true,
    'a published notice reaches readers immediately');
});

test('a notice written before drafts existed is still treated as published', () => {
  /* Existing records carry status: 'published' already, and anything that is not
     exactly 'draft' keeps showing — so upgrading changes nothing for old data. */
  const legacy = { id: 'NOT-LEGACY', title: 'পুরোনো নোটিশ', body: 'আগে লেখা', audience: 'সকল শিক্ষার্থী', createdAt: new Date().toISOString() };
  ctx.window.localStorage.setItem(NOTICES_KEY, JSON.stringify([...stored(), legacy]));
  assert.equal(loadNotices().some(notice => notice.id === 'NOT-LEGACY'), true,
    'a record with no status field is not hidden by the new filter');
});
