import { authenticateStaff, saveStaffSession, hasStaffSession, clearStaffSession } from './staff-auth.js';
import { openStaffPasswordDialog } from './staff-password-dialog.js';
import { loadRoster, saveRoster, syncAccountStatus } from './office-data.js';
import { examRepository } from './exam-data.js';
import { enabledClasses } from './config.js';
import { escapeHtml } from './sanitize.js';
import { registerServiceWorker } from './service-worker.js';
import { initFixedShell } from './fixed-shell.js';
import { initExamManager } from './exam-manager.js';

registerServiceWorker();
initFixedShell();
const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];
let students = loadRoster();
let examReady = false;
let examManagerStarted = false;

function setView(view) {
  $$('[data-view-panel]').forEach(section => section.classList.toggle('active', section.dataset.viewPanel === view));
  $$('[data-manager-view]').forEach(button => {
    const active = button.dataset.managerView === view;
    button.classList.toggle('active', active);
    if (active) button.setAttribute('aria-current', 'page'); else button.removeAttribute('aria-current');
  });
  $('#managerMain')?.scrollTo({ top: 0, behavior: 'smooth' });
}
function toast(text) {
  const el = $('#managerToast');
  if (!el) return;
  el.textContent = text;
  el.hidden = false;
  window.setTimeout(() => { el.hidden = true; }, 2600);
}
function renderQueue() {
  const pending = students.filter(student => student.status === 'pending');
  $('#managerPendingCount').textContent = String(pending.length);
  $('#managerStudentQueue').innerHTML = pending.length ? pending.map(student => `
    <article class="admin-card manager-student-card">
      <div class="admin-card-head"><div><p class="eyebrow">${escapeHtml(student.id || 'Student')}</p><h2>${escapeHtml(student.name || student.nameBn || 'নাম নেই')}</h2></div><span class="badge badge-pending">অপেক্ষমাণ</span></div>
      <p><strong>শ্রেণি:</strong> ${escapeHtml(student.className || '—')} ${student.group ? `• ${escapeHtml(student.group)}` : ''}</p>
      <p><strong>মোবাইল:</strong> ${escapeHtml(student.mobile || student.studentMobile || '—')}</p>
      <p><strong>অভিভাবক:</strong> ${escapeHtml(student.guardianMobile || '—')}</p>
      <div class="exam-actions manager-decision-actions"><button class="admin-btn primary" type="button" data-manager-decision="approved" data-id="${escapeHtml(student.id)}">অনুমোদন</button><button class="admin-btn ghost" type="button" data-manager-decision="rejected" data-id="${escapeHtml(student.id)}">বাতিল</button></div>
    </article>`).join('') : '<div class="admin-card"><p>এখন কোনো শিক্ষার্থী অনুমোদনের অপেক্ষায় নেই।</p></div>';
}
async function renderReports() {
  const approved = students.filter(student => student.status === 'approved');
  const byClass = enabledClasses.map(className => {
    const rows = approved.filter(student => student.className === className);
    if (!rows.length) return '';
    const averages = rows.map(student => Number(student.average)).filter(Number.isFinite);
    const attendance = rows.map(student => Number(student.attendance)).filter(Number.isFinite);
    const avg = averages.length ? averages.reduce((sum, value) => sum + value, 0) / averages.length : null;
    const present = attendance.length ? attendance.reduce((sum, value) => sum + value, 0) / attendance.length : null;
    return `<article class="admin-card manager-report-row"><strong>${escapeHtml(className)}</strong><span>${rows.length} শিক্ষার্থী</span><span>গড় ফলাফল ${avg === null ? '—' : `${avg.toFixed(1)}%`}</span><span>উপস্থিতি ${present === null ? '—' : `${present.toFixed(1)}%`}</span></article>`;
  }).filter(Boolean);
  let exams = [];
  try { exams = (await examRepository.list()).exams || []; } catch {}
  const published = exams.filter(exam => exam.status === 'published').length;
  const pending = exams.filter(exam => exam.status === 'pending').length;
  $('#managerPendingExamCount').textContent = String(pending);
  $('#managerAcademicReport').innerHTML = `
    <div class="admin-hero-stats manager-report-summary"><article class="admin-stat-tile tone-mint"><p class="tile-label">অনুমোদিত শিক্ষার্থী</p><strong class="tile-value">${approved.length}</strong></article><article class="admin-stat-tile tone-blue"><p class="tile-label">প্রকাশিত পরীক্ষা</p><strong class="tile-value">${published}</strong></article></div>
    <div class="manager-report-list">${byClass.join('') || '<p class="finance-hint">এখনো শ্রেণিভিত্তিক একাডেমিক তথ্য নেই।</p>'}</div>
    <p class="teacher-local-note">এই রিপোর্টে শুধু শিক্ষার্থী অগ্রগতি ও পরীক্ষা আছে; ফি/লেনদেনের তথ্য অন্তentionally দেখানো হয় না।</p>`;
}
async function refresh() {
  students = loadRoster();
  renderQueue();
  await renderReports();
}
async function enterManager(remember = true) {
  if (!(await saveStaffSession('manager', remember))) {
    $('#managerLoginError').textContent = 'সেশন সংরক্ষণ করা যায়নি। ব্রাউজারের স্টোরেজ পরীক্ষা করুন।';
    $('#managerLoginError').hidden = false;
    return;
  }
  $('#managerLogin').hidden = true;
  $('#managerShell').hidden = false;
  $('#managerToday').textContent = new Intl.DateTimeFormat('bn-BD', { dateStyle: 'medium' }).format(new Date());
  if (!examManagerStarted) { initExamManager('#managerExamWorkspace', 'manager'); examManagerStarted = true; }
  await refresh();
}
$('#managerLoginForm')?.addEventListener('submit', async event => {
  event.preventDefault();
  const username = $('#managerUsername').value;
  const password = $('#managerPassword').value;
  const result = await authenticateStaff('manager', username, password);
  if (!result.ok) {
    $('#managerLoginError').textContent = 'Manager username অথবা password সঠিক নয়।';
    $('#managerLoginError').hidden = false;
    return;
  }
  const remember = $('#managerRemember').checked;
  $('#managerLoginError').hidden = true;
  if (result.needsSetup) {
    $('#managerLoginError').textContent = 'Manager ID Admin account setup-এর সময় তৈরি হবে। Admin-এর কাছ থেকে ID নিন।';
    $('#managerLoginError').hidden = false;
    return;
  }
  if (result.needsPasswordChange) {
    openStaffPasswordDialog({ role: 'manager', mode: 'change', onDone: () => enterManager(remember) });
    return;
  }
  await enterManager(remember);
});
$('#managerTogglePassword')?.addEventListener('click', () => {
  const input = $('#managerPassword');
  input.type = input.type === 'password' ? 'text' : 'password';
});
$('#managerLogout')?.addEventListener('click', () => {
  clearStaffSession('manager');
  $('#managerPassword').value = '';
  $('#managerShell').hidden = true;
  $('#managerLogin').hidden = false;
});
$$('[data-manager-view]').forEach(button => button.addEventListener('click', () => setView(button.dataset.managerView)));
$('#managerStudentQueue')?.addEventListener('click', async event => {
  const button = event.target.closest('[data-manager-decision]');
  if (!button) return;
  const student = students.find(row => row.id === button.dataset.id);
  if (!student || student.status !== 'pending') return;
  const status = button.dataset.managerDecision;
  if (!['approved', 'rejected'].includes(status)) return;
  student.status = status;
  student.reviewedAt = new Date().toISOString();
  student.reviewedBy = 'manager.apc';
  saveRoster(students);
  await syncAccountStatus(student.id, status);
  renderQueue();
  await renderReports();
  toast(status === 'approved' ? 'শিক্ষার্থী অনুমোদিত হয়েছে।' : 'শিক্ষার্থীর আবেদন বাতিল হয়েছে।');
});
window.addEventListener('storage', event => {
  if (event.key === 'activePlus.admin.students.v1' || event.key === 'activePlus.exams.v1') void refresh();
});
(async () => {
  if (await hasStaffSession('manager')) await enterManager(true);
})();
