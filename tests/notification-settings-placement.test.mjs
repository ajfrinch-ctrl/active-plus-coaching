/* Settings owns the notification screen.

   It used to hang off <main> on the staff panels, so it painted under every
   page — Dashboard, Students, Finance, all of them. This file keeps it where
   it belongs: one routed page, opened from the panel's profile page or from
   "আরও", and closed everywhere else. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadPage } from './jsdom-harness.mjs';
import { openStaffPanel } from './staff-harness.mjs';
import { ROSTER_KEY } from '../js/office-data.js';

const TOGGLES = ['noticeMasterToggle', 'noticeBackgroundToggle', 'noticeInAppToggle', 'noticeSoundToggle'];
/* The engine is started by js/realtime-sync-entry.js in the real page; jsdom
   does not run page scripts, so the test starts it the same way. A fresh
   module per page keeps each panel's storage its own. */
const startEngine = async () => (await import(`../js/notifications.js?settings-placement=${Math.random()}`)).initNotifications();

/* ---- the screen lives inside a page, never on the page frame ------------------ */

for (const page of [
  { file: 'manager.html', owner: 'notification-settings' },
  { file: 'teacher.html', owner: 'teacherNotificationSettings', byId: true },
  { file: 'admin.html', owner: 'profile' },
  { file: 'index.html', owner: 'notification-settings' }
]) {
  test(`${page.file} keeps notification settings inside a routed page`, async () => {
    const ctx = await loadPage(page.file);
    const mount = ctx.$('#notificationSettings');
    assert.ok(mount, 'the settings mount is missing');
    assert.equal(mount.parentElement.matches('main'), false, 'the mount must not hang off <main>, or it paints on every page');
    const view = mount.closest('section');
    assert.ok(view, 'the mount must live inside a page of the panel');
    assert.equal(page.byId ? view.id : view.dataset.viewPanel, page.owner);
  });
}

/* ---- Manager: closed on every working page, open from Settings ---------------- */

let manager;
async function managerPanel() {
  if (manager) return manager;
  manager = await loadPage('manager.html', { seed: { [ROSTER_KEY]: JSON.stringify([]) } });
  await openStaffPanel(manager, 'manager', { importPanel: () => import('../js/manager.js'), shellId: 'managerShell' });
  await startEngine();
  await manager.flush();
  return manager;
}

test('the Manager panel paints notification settings on no working page', async () => {
  const ctx = await managerPanel();
  const settingsPage = () => ctx.$('.manager-view[data-view-panel="notification-settings"]');
  for (const view of ['dashboard', 'students', 'approvals']) {
    ctx.click(ctx.$(`[data-manager-view="${view}"]`));
    await ctx.waitFor(() => ctx.$('.manager-view.active')?.dataset.viewPanel === view);
    assert.equal(settingsPage().hidden, true, `${view} must not carry the settings screen`);
    assert.equal(ctx.$('#notificationSettings').closest('section').hidden, true, `${view} hides the mount too`);
  }
  assert.deepEqual(ctx.jsdomErrors, []);
});

test('Manager reaches the screen from Settings and only there', async () => {
  const ctx = await managerPanel();
  const active = () => ctx.$('.manager-view.active')?.dataset.viewPanel;
  ctx.click(ctx.$('.manager-bottom [data-manager-view="more"]'));
  await ctx.waitFor(() => active() === 'more');
  ctx.click(ctx.$('#managerMoreMenu [data-manager-view="profile"]'));
  await ctx.waitFor(() => active() === 'profile');

  const entry = ctx.$('.manager-view[data-view-panel="profile"] [data-manager-view="notification-settings"]');
  assert.ok(entry, 'the profile page offers the settings entry');
  assert.match(entry.textContent, /নোটিফিকেশন সেটিংস/);
  ctx.click(entry);
  await ctx.waitFor(() => active() === 'notification-settings');
  assert.equal(ctx.window.location.hash, '#notification-settings', 'the open page lives in the URL');
  assert.equal(ctx.$('.manager-bottom [data-manager-view="more"]').classList.contains('active'), true, 'the bottom bar keeps "আরও" lit');

  await ctx.waitFor(() => ctx.$$('#notificationSettings .notice-setting-row').length >= 4, 5000);
  assert.deepEqual(ctx.$$('#notificationSettings input[type=checkbox]').map(input => input.id), TOGGLES);
  assert.ok(ctx.$('#notificationSettings .notice-history-list'), 'the history list is on the page');

  // The back arrow returns to the page the entry lives on.
  ctx.click(ctx.$('#managerNotificationSettingsView .pay-back'));
  await ctx.waitFor(() => active() === 'profile');
  assert.deepEqual(ctx.jsdomErrors, []);
});

test('the Manager "আরও" list opens the same Settings page', async () => {
  const ctx = await managerPanel();
  ctx.click(ctx.$('.manager-bottom [data-manager-view="more"]'));
  await ctx.waitFor(() => ctx.$('.manager-view.active')?.dataset.viewPanel === 'more');
  const row = ctx.$('#managerMoreMenu [data-manager-view="notification-settings"]');
  assert.ok(row, 'the আরও list names the settings page');
  ctx.click(row);
  await ctx.waitFor(() => ctx.$('.manager-view.active')?.dataset.viewPanel === 'notification-settings');
  assert.equal(ctx.$('#managerNotificationSettingsView').hidden, false);
  assert.deepEqual(ctx.jsdomErrors, []);
});

/* ---- Teacher: the same promise on the second staff panel ---------------------- */

let teacher;
async function teacherPanel() {
  if (teacher) return teacher;
  teacher = await loadPage('teacher.html', { seed: { [ROSTER_KEY]: JSON.stringify([]) } });
  await openStaffPanel(teacher, 'teacher', { importPanel: () => import('../js/teacher.js'), shellId: 'teacherShell' });
  await startEngine();
  await teacher.flush();
  return teacher;
}

test('the Teacher panel keeps notification settings behind its profile page', async () => {
  const ctx = await teacherPanel();
  const page = () => ctx.$('#teacherNotificationSettings');
  assert.equal(page().hidden, true, 'the settings page is closed at boot');

  ctx.click(ctx.$('.admin-bottom [data-teacher-view="home"]'));
  await ctx.waitFor(() => ctx.$('#teacherHome').hidden === false);
  assert.equal(page().hidden, true, 'the home page must not carry the settings screen');

  ctx.click(ctx.$('.admin-bottom [data-teacher-view="more"]'));
  await ctx.waitFor(() => ctx.$('#teacherMore').hidden === false);
  ctx.click(ctx.$('#teacherMore [data-teacher-view="profile"]'));
  await ctx.waitFor(() => ctx.$('#teacherProfile').hidden === false);

  const entry = ctx.$('#teacherProfile [data-teacher-view="notification-settings"]');
  assert.ok(entry, 'the profile page offers the settings entry');
  ctx.click(entry);
  await ctx.waitFor(() => page().hidden === false);
  assert.equal(ctx.$('#teacherProfile').hidden, true, 'only one page shows at a time');
  await ctx.waitFor(() => ctx.$$('#notificationSettings .notice-setting-row').length >= 4, 5000);
  assert.deepEqual(ctx.$$('#notificationSettings input[type=checkbox]').map(input => input.id), TOGGLES);

  ctx.click(ctx.$('#teacherNotificationSettings .pay-back'));
  await ctx.waitFor(() => ctx.$('#teacherProfile').hidden === false);
  assert.deepEqual(ctx.jsdomErrors, []);
});
