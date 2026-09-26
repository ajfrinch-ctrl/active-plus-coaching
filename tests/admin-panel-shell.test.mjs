/* Admin Panel shell — permission-driven UI on the real admin.html + js/admin.js
   (jsdom, so no browser download is needed).

   Covers the acceptance list that can be checked without a device:
     • only the sections the Admin role holds are rendered
     • nothing role-specific survives anywhere in the DOM (menus, cards,
       shortcuts, cross-panel links, list rows)
     • every bottom-bar entry carries a generated icon + a readable label
     • the dashboard grid is generated from the same permission model
     • a hash route opens only when the role may open it
   The browser-only parts (active-state animation, 320–430px layout) live in
   tests/admin-navigation.spec.cjs and tests/mobile-layout.spec.cjs. */
import test, { before } from 'node:test';
import assert from 'node:assert/strict';
import { loadPage } from './jsdom-harness.mjs';
import { adminStudents } from '../js/admin-data.js';
import { ROSTER_KEY } from '../js/office-data.js';
import { provisionStaff, seedStaffSession } from './staff-harness.mjs';
import {
  CAPABILITIES,
  createAccess,
  routeFromHash,
  enforceCapabilities,
  VIEW_CAPABILITIES
} from '../js/admin-permissions.js';

let ctx;

before(async () => {
  ctx = await loadPage('admin.html', {
    seed: { 'activePlus.demo.autofill.v1': 'off', [ROSTER_KEY]: JSON.stringify(adminStudents) }
  });
  await provisionStaff('admin');
  seedStaffSession(ctx.window, 'admin');
  await import('../js/admin.js');
  await ctx.waitFor(() => ctx.$('#adminShell').hidden === false);
  await ctx.waitFor(() => ctx.$$('#adminFeatureGrid .admin-feature-tile').length > 0);
});

test('the Admin role grants reports, users and management — and nothing else', () => {
  const access = createAccess('admin');
  for (const capability of [
    CAPABILITIES.DASHBOARD,
    CAPABILITIES.STUDENTS_VIEW,
    CAPABILITIES.STUDENTS_MANAGE,
    CAPABILITIES.FINANCE_VIEW,
    CAPABILITIES.FINANCE_COLLECT,
    CAPABILITIES.REPORTS_VIEW,
    CAPABILITIES.NOTICES_MANAGE,
    CAPABILITIES.ROUTINE_MANAGE,
    CAPABILITIES.CLASSES_MANAGE,
    CAPABILITIES.APP_MANAGE,
    CAPABILITIES.EXAMS_VIEW
  ]) {
    assert.equal(access.has(capability), true, `Admin must keep ${capability}`);
  }
  // Manager / Teacher / Payment-counter territory.
  for (const capability of [
    CAPABILITIES.STUDENTS_APPROVE,
    CAPABILITIES.EXAMS_PUBLISH,
    CAPABILITIES.TEACHING_PANEL,
    CAPABILITIES.PAYMENT_PANEL
  ]) {
    assert.equal(access.has(capability), false, `Admin must not hold ${capability}`);
  }
  assert.equal(createAccess('manager').allowsView('finance'), false);
  assert.equal(createAccess('admin').allowsView('finance'), true);
  assert.equal(createAccess('admin').defaultView(), 'dashboard');
});

test('the panel boots without markup or module errors', () => {
  assert.deepEqual(ctx.jsdomErrors, []);
});

test('hash routes resolve only to known views', () => {
  assert.equal(routeFromHash('#finance'), 'finance');
  assert.equal(routeFromHash('#') + '', 'null');
  assert.equal(routeFromHash('#approvals'), null);
  assert.equal(routeFromHash('#/students'), 'students');
  for (const view of Object.keys(VIEW_CAPABILITIES)) assert.equal(routeFromHash(`#${view}`), view);
});

test('the bottom bar renders one icon + label per permitted tab', () => {
  const items = ctx.$$('.admin-bottom button');
  assert.deepEqual(items.map(button => button.dataset.adminView), ['dashboard', 'students', 'finance', 'routine', 'more']);
  for (const button of items) {
    const icon = button.querySelector('img.nav-icon');
    const label = button.querySelector('.nav-label');
    assert.ok(icon, `${button.dataset.adminView} has no generated icon`);
    assert.match(icon.getAttribute('src'), /^assets\/icons\//);
    assert.equal(icon.getAttribute('alt'), '');
    assert.ok(label && label.textContent.trim().length > 1, `${button.dataset.adminView} has no label`);
  }
  // The active tab is marked for both CSS and assistive tech.
  assert.equal(ctx.$$('.admin-bottom [aria-current="page"]').length, 1);
  assert.equal(ctx.$('.admin-bottom [aria-current="page"]').dataset.adminView, 'dashboard');
});

test('the dashboard grid is generated from the permission model', () => {
  const tiles = ctx.$$('#adminFeatureGrid .admin-feature-tile');
  assert.deepEqual(tiles.map(tile => tile.dataset.adminView), [
    'students', 'finance', 'reports', 'notices', 'routine', 'exams', 'classes', 'app-management'
  ]);
  for (const tile of tiles) {
    const icon = tile.querySelector('.admin-feature-icon img');
    assert.ok(icon, `${tile.dataset.adminView} tile has no icon`);
    assert.match(icon.getAttribute('src'), /^assets\/icons\//);
    assert.ok(tile.querySelector('.admin-feature-label')?.textContent.trim().length > 1);
    assert.ok(tile.dataset.adminCap, `${tile.dataset.adminView} tile carries no capability`);
  }
  // Hero and fee-collection card use the same generated language.
  assert.ok(ctx.$('.admin-hero-icon img'));
  assert.ok(ctx.$('#dashCollectFee .admin-dashboard-collect-icon img'));
  assert.equal(ctx.$$('.admin-hero-stats .tile-icon img').length, 2);
});

test('nothing outside the Admin role survives in the DOM', () => {
  // Approval workflow belongs to the Manager portal.
  assert.equal(ctx.$('#dashPendingCount'), null);
  assert.equal(ctx.$('.admin-hero-foot'), null);
  assert.equal(ctx.$$('.manager-approval-note').length, 0);
  // Cross-panel entries belong to their own roles.
  assert.equal(ctx.$('.teacher-panel-link'), null);
  assert.equal(ctx.$('.pay-panel-link'), null);
  assert.equal(ctx.$$('[data-admin-cap="teaching.panel"]').length, 0);
  assert.equal(ctx.$$('[data-admin-cap="payment.panel"]').length, 0);
  // Granted sections are untouched.
  for (const view of ['dashboard', 'students', 'finance', 'routine', 'more', 'exams', 'notices', 'reports', 'app-management', 'classes']) {
    assert.equal(ctx.$$(`[data-admin-view="${view}"]`).length > 0, true, `${view} should still be reachable`);
  }
});

test('the exam workspace lists exams without any approval/publish control', () => {
  const workspace = ctx.$('#adminExamWorkspace');
  assert.ok(workspace);
  assert.equal(workspace.querySelectorAll('[data-review-form]').length, 0);
  const labels = ctx.$$('#adminExamWorkspace button').map(button => button.textContent);
  for (const label of labels) {
    assert.doesNotMatch(label, /প্রকাশ|অনুমোদন দিয়ে/, 'Admin must not publish or approve exams');
  }
});

test('a hash route opens a permitted view and moves the active tab', async () => {
  ctx.window.location.hash = '#finance';
  await ctx.waitFor(() => ctx.$('.admin-view[data-view-panel="finance"]').classList.contains('active'));
  assert.equal(ctx.$('.admin-bottom [aria-current="page"]').dataset.adminView, 'finance');

  ctx.window.location.hash = '#reports';
  await ctx.waitFor(() => ctx.$('.admin-view[data-view-panel="reports"]').classList.contains('active'));
  assert.equal(ctx.$('.admin-bottom [aria-current="page"]').dataset.adminView, 'more');

  // An unknown route never moves the panel.
  ctx.window.location.hash = '#approvals';
  await ctx.flush();
  assert.equal(ctx.$('.admin-view[data-view-panel="reports"]').classList.contains('active'), true);
  ctx.window.location.hash = '';
});

test('a role with no capability leaves the panel empty — menus, cards and routes', async () => {
  // A fresh, untouched copy of the panel: nothing has been rendered yet, so the
  // capability layer is the only thing that has touched the markup.
  const fresh = await loadPage('admin.html', { seed: { 'activePlus.demo.autofill.v1': 'off' } });
  const empty = createAccess('student');
  const removed = enforceCapabilities({ root: fresh.document, access: empty });
  // Every capability-gated section is gone; only the "More" container (which has
  // no capability of its own) is left for the shell to decide about.
  assert.deepEqual(fresh.$$('.admin-view').map(view => view.dataset.viewPanel), ['more']);
  assert.equal(fresh.$$('.admin-more-item').length, 0);
  assert.equal(fresh.$$('#adminFeatureGrid .admin-feature-tile').length, 0);
  assert.equal(fresh.$$('[data-admin-cap]').length, 0);
  assert.ok(removed.views.length > 0);
  assert.ok(removed.elements.length > 0);

  // Building the shell with the same empty access leaves no navigation at all:
  // not a tab, not a tile, not even the bar itself.
  const { initAdminPanelShell } = await import('../js/admin-panel-ui.js');
  const built = initAdminPanelShell({ access: empty, onNavigate: () => {} });
  assert.equal(built.bottomButtons.length, 0);
  assert.deepEqual(built.bottomEntries, []);
  assert.equal(built.tiles.length, 0);
  assert.equal(built.moreItems.length, 0);
  assert.equal(fresh.$$('.admin-bottom button').length, 0);
  assert.equal(fresh.$('.admin-bottom').hidden, true);
  assert.equal(fresh.$$('.admin-view').length, 0);
});
