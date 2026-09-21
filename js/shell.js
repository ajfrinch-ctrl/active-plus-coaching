/* App shell lifecycle and student identity rendering. */
import { $, $$, scrollToTop, toBanglaNumber } from './ui.js';
import { clearSession } from './storage.js';

export function renderStudent(student) {
  const firstName = String(student.name || 'শিক্ষার্থী').trim().split(/\s+/)[0] || 'শিক্ষার্থী';
  const initial = firstName.charAt(0) || 'শি';
  const meta = `${student.className} · ${student.group}`;

  $('#studentName') && ($('#studentName').textContent = firstName);
  $('#topbarStudentName') && ($('#topbarStudentName').textContent = student.name || firstName);
  $('#avatarInitial') && ($('#avatarInitial').textContent = initial);
  $('#profileAvatar') && ($('#profileAvatar').textContent = initial);
  $('#profileName') && ($('#profileName').textContent = student.name);
  $('#profileMeta') && ($('#profileMeta').textContent = meta);
  $('#routineClass') && ($('#routineClass').textContent = meta);
  $('#studentId') && ($('#studentId').textContent = student.id);
  $('#studentMobileValue') && ($('#studentMobileValue').textContent = toBanglaNumber(student.studentMobile || 'নম্বর নেই'));
  $('#guardianMobileValue') && ($('#guardianMobileValue').textContent = toBanglaNumber(student.guardianMobile || 'নম্বর নেই'));
  if ($('#editStudentId')) $('#editStudentId').value = student.id || '';
}

export function openStudentApp(state) {
  $('#authScreen') && ($('#authScreen').hidden = true);
  const app = $('#appShell');
  if (app) {
    app.hidden = false;
    app.classList.toggle('is-pending', state.account?.status === 'pending');
  }
  if (state.account?.status === 'pending' && $('#pendingStudentId')) {
    $('#pendingStudentId').textContent = state.account.studentId || state.student.id;
  }
  renderStudent(state.student);
  scrollToTop();
}

export function showAuthScreen() {
  $('#authScreen') && ($('#authScreen').hidden = false);
  const app = $('#appShell');
  if (app) {
    app.hidden = true;
    app.classList.remove('is-pending');
  }
  scrollToTop();
}

export function logout() {
  clearSession();
  showAuthScreen();
}

export function setView(viewName) {
  const panel = document.getElementById(`${viewName}View`);
  if (!panel) return;
  $$('[data-view-panel]').forEach(item => item.classList.toggle('active', item === panel));
  $$('.bottom-link').forEach(item => item.classList.toggle('active', item.dataset.view === viewName));
  scrollToTop();
}
