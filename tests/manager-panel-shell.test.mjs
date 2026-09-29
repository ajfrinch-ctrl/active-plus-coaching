import test, { before } from 'node:test';
import assert from 'node:assert/strict';
import { loadPage } from './jsdom-harness.mjs';
import { provisionStaff, seedStaffSession } from './staff-harness.mjs';
import { ROSTER_KEY } from '../js/office-data.js';
import { STAFF_ACCOUNTS } from '../js/staff-auth.js';
import { TEACHER_ASSIGNMENTS_KEY } from '../js/teacher-assignments.js';

let ctx;
const roster = [
  { id: 'S-PENDING', name: 'পেন্ডিং শিক্ষার্থী', className: 'অষ্টম শ্রেণি', group: 'A', mobile: '01700000000', guardianMobile: '01800000000', status: 'pending', createdAt: new Date().toISOString() },
  { id: 'S-APPROVED', name: 'অনুমোদিত শিক্ষার্থী', className: 'অষ্টম শ্রেণি', group: 'A', mobile: '01700000001', guardianMobile: '01800000001', status: 'approved', monthlyFee: 1500 }
];

before(async () => {
  ctx = await loadPage('manager.html', { seed: { [ROSTER_KEY]: JSON.stringify(roster), [STAFF_ACCOUNTS.teacher.accountKey]: JSON.stringify({ role: 'teacher', username: 'teacher.apc', fullName: 'Teacher profile', status: 'active' }) } });
  await provisionStaff('manager');
  seedStaffSession(ctx.window, 'manager');
  await import('../js/manager.js');
  await ctx.waitFor(() => ctx.$('#managerShell').hidden === false);
  await ctx.waitFor(() => ctx.$('#mgrTotalStudents').textContent === '২');
});

test('Manager boots on the operational dashboard with only its allow-listed sections', () => {
  assert.deepEqual(ctx.jsdomErrors, []);
  const views = ctx.$$('.manager-view').map(view => view.dataset.viewPanel);
  assert.deepEqual(views, ['dashboard', 'students', 'approvals', 'classes', 'teachers', 'finance', 'cash-counter', 'notices', 'routine', 'exams', 'results', 'reports', 'profile']);
  const routes = ctx.$$('[data-manager-view]').map(button => button.dataset.managerView);
  for (const forbidden of ['staff', 'roles', 'permissions', 'security', 'backup', 'restore', 'settings', 'admin']) assert.equal(routes.includes(forbidden), false);
  assert.equal(ctx.$('#managerMain a[href*="admin"]'), null);
  assert.equal(ctx.$('#mgrActiveStudents').textContent, '১');
  assert.equal(ctx.$('#mgrPendingStudents').textContent, '১ / ১');
});

test('Manager student approval updates only the pending registration through the Manager flow', async () => {
  ctx.click(ctx.$('.manager-bottom [data-manager-view="approvals"]'));
  await ctx.flush();
  assert.equal(ctx.$$('#managerStudentQueue [data-manager-action="approve-student"]').length, 1);
  ctx.click(ctx.$('#managerStudentQueue [data-manager-action="approve-student"]'));
  await ctx.waitFor(() => ctx.$$('#managerStudentQueue [data-manager-action="approve-student"]').length === 0);
  const saved = JSON.parse(ctx.window.localStorage.getItem(ROSTER_KEY));
  const decision = saved.find(student => student.id === 'S-PENDING');
  assert.equal(decision.status, 'approved');
  assert.equal(decision.reviewedBy, 'manager.apc');
  assert.ok(decision.reviewedAt);
  assert.equal(saved.find(student => student.id === 'S-APPROVED').status, 'approved');
});

test('Manager navigation refuses unknown or admin-only route identifiers', () => {
  const beforeView = ctx.$('.manager-view.active')?.dataset.viewPanel;
  for (const route of ['backup', 'security', 'staff', 'permissions', 'admin-management']) {
    assert.equal(ctx.$(`[data-view-panel="${route}"]`), null);
  }
  assert.equal(ctx.$('.manager-view.active')?.dataset.viewPanel, beforeView);
});

test('Manager alone assigns Teacher class/batch scope through the Teachers workflow', async () => {
  ctx.click(ctx.$('.manager-bottom [data-manager-view="more"]'));
  ctx.click(ctx.$('#managerMoreDrawer [data-manager-view="teachers"]'));
  await ctx.waitFor(() => ctx.$('#managerTeacherAssignmentForm [name=className]')?.options.length > 1);
  const form = ctx.$('#managerTeacherAssignmentForm');
  form.elements.className.value = 'দশম শ্রেণি'; form.elements.group.value = 'বিজ্ঞান বিভাগ'; form.elements.subject.value = 'গণিত';
  ctx.submit(form);
  await ctx.waitFor(() => ctx.window.localStorage.getItem(TEACHER_ASSIGNMENTS_KEY) !== null);
  const saved = JSON.parse(ctx.window.localStorage.getItem(TEACHER_ASSIGNMENTS_KEY));
  assert.equal(saved.length, 1); assert.equal(saved[0].teacherUsername, 'teacher.apc');
  assert.equal(saved[0].className, 'দশম শ্রেণি'); assert.equal(saved[0].group, 'বিজ্ঞান বিভাগ'); assert.equal(saved[0].subject, 'গণিত');
  assert.equal(ctx.$('#managerTeacherList').textContent.includes('দশম শ্রেণি'), true);
});

/* Tracking a student by the permanent Student ID in the Manager panel — the
   same box staff already use for names and mobile numbers. Bangla digits are
   what a Bangla keyboard produces, so they must find the student too. */
test('the Manager student search finds a student by Student ID, including Bangla digits', async () => {
  const box = ctx.$('#managerStudentSearch');
  const rows = () => ctx.$$('#managerStudentList [data-manager-student]');
  ctx.click(ctx.$('[data-manager-view="students"]'));
  await ctx.waitFor(() => ctx.$('.manager-view[data-view-panel="students"]').classList.contains('active'));

  ctx.type(box, 's-app');                        // a real Student ID prefix
  await ctx.waitFor(() => rows().length === 1);
  assert.equal(rows()[0].dataset.managerStudent, 'S-APPROVED');

  ctx.type(box, '০১৭০০০০০০০১');                   // Bangla digits for the mobile number
  await ctx.waitFor(() => rows().length === 1);
  assert.equal(rows()[0].dataset.managerStudent, 'S-APPROVED');

  ctx.type(box, 'S-PENDING');                     // the other student's id
  await ctx.waitFor(() => rows().length === 1);
  assert.equal(rows()[0].dataset.managerStudent, 'S-PENDING');

  ctx.type(box, 's-rej');                         // an id nobody has
  await ctx.waitFor(() => rows().length === 0);
  ctx.type(box, '');
  await ctx.waitFor(() => rows().length === 2);
});
