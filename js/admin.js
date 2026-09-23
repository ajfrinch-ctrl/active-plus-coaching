/* Admin panel. Username and password are required; the roster, notices and
   routine start empty and stay on this device. */
import { enabledClasses, DEFAULT_APP_SETTINGS, ADMIN_ID, DEFAULT_PIN } from './config.js';
import { toBanglaNumber } from './ui.js';
import { classCodes, dayNames, feeCategories, paymentMethods } from './admin-data.js';
import { loadAppConfig, saveAppConfig, loadAccount, saveAccount } from './storage.js';
import { loadRoster, saveRoster, syncAccountStatus, loadNotices, saveNotices, loadRoutine, saveRoutine } from './office-data.js';
import { verifyStaffCredentials, saveStaffSession, hasStaffSession, clearStaffSession, goToLoginPage } from './staff-auth.js';
import { financeRepository, monthLabel, dateLabel, searchStudents, studentFeeSummary, newestTransactions, stampTransaction, TRANSACTIONS_KEY } from './finance-data.js';
import { newId } from './database.js';
import { receiptMarkup, downloadReceipt } from './finance-receipt.js';
import { downloadReportPDF, downloadCSV } from './report-generator.js';
import { examRepository, totalMarks, examResults, EXAM_KEY } from './exam-data.js';
import { teachingRepository, displayDate, PROGRESS_LABELS, TEACHING_KEY } from './teaching-data.js';
import { initExamManager } from './exam-manager.js';
import { registerServiceWorker } from './service-worker.js';
import { initFixedShell } from './fixed-shell.js';

initFixedShell();
registerServiceWorker();
initExamManager('#adminExamWorkspace', 'admin');

const bn = toBanglaNumber;
const $ = selector => document.querySelector(selector);
const $$ = selector => Array.from(document.querySelectorAll(selector));

const REPORT_LIST_PAGE = 20; // report rows shown on screen before "show more"

const state = {
  students: loadRoster(),
  notices: loadNotices(),
  transactions: [],
  routine: loadRoutine(),
  enabled: new Set(enabledClasses),
  appConfig: loadAppConfig(),
  activeView: 'dashboard',
  activeDay: 'sat',
  activeFinanceTab: 'collection',
  feeStudentId: null,
  financeReady: false,
  savingFee: false,
  ledgerFilter: 'all',
  reportFilters: {
    month: monthLabel(),
    className: 'all',
    feeType: 'all',
    method: 'all',
    listLimit: REPORT_LIST_PAGE
  },
  filter: 'all',
  classFilter: 'all',
  examDb: null,
  teachingDb: null,
  query: ''
};

/* ---------- Feedback toast ---------- */

let toastTimer;
function toast(message) {
  $('.admin-toast')?.remove();
  const el = document.createElement('div');
  el.className = 'admin-toast';
  el.setAttribute('role', 'status');
  el.textContent = message;
  document.body.append(el);
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => el.remove(), 2800);
}

function persistStudents() { saveRoster(state.students); }
function persistNotices() { saveNotices(state.notices); }
function persistRoutine() { saveRoutine(state.routine); }

function enterPanel() {
  $('#adminEntry').hidden = true;
  $('#adminShell').hidden = false;
  renderAll();
  setView(state.activeView);
  toast('এডমিন প্যানেলে সফলভাবে প্রবেশ করা হয়েছে');
}

function exitPanel() {
  clearStaffSession('admin');
  // Logout always returns to the shared login page, never to a panel entry form.
  $('#adminShell').hidden = true;
  const pin = $('#adminLoginPin');
  if (pin) pin.value = '';
  goToLoginPage();
}

/* ---------- View switching ---------- */

const moreViews = new Set(['notices', 'app-management', 'classes', 'exams', 'reports']);
function setView(view) {
  if (!$$('.admin-view').some(panel => panel.dataset.viewPanel === view)) return;
  state.activeView = view;
  $$('.admin-view').forEach(panel => panel.classList.toggle('active', panel.dataset.viewPanel === view));
  $$('.admin-bottom-item').forEach(item => {
    const isMore = item.classList.contains('admin-bottom-item') && item.dataset.adminView === 'more' && moreViews.has(view);
    const active = item.dataset.adminView === view || isMore;
    item.classList.toggle('active', active);
    if (active) item.setAttribute('aria-current', 'page');
    else item.removeAttribute('aria-current');
  });
  $('#adminMain').scrollTo({ top: 0, behavior: 'instant' });
}

/* ---------- Dashboard ---------- */

function pendingStudents() {
  return state.students.filter(student => student.status === 'pending');
}

function renderDashboard() {
  $('#dashStudentCount').textContent = bn(state.students.length);
  const pendingCount = pendingStudents().length;
  $('#dashPendingCount').textContent = bn(pendingCount);
  $('#dashPendingCount').classList.toggle('has-pending', pendingCount > 0);
  $('#dashClassCount').textContent = bn(state.enabled.size);
  const today = new Date();
  $('#adminTodayDate').textContent = dateLabel(today);
  $('#adminTodayDate').dateTime = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  renderFinanceSummary();
}

/* Dashboard money summary: today and this month at a glance. */
function renderFinanceSummary() {
  const money = value => '৳' + bn(Math.round(value).toLocaleString('en-US'));
  const today = dateLabel(new Date());
  const month = monthLabel();
  const todayTx = state.transactions.filter(tx => tx.date === today);
  const monthTx = state.transactions.filter(tx => tx.month === month);
  const todayTotal = todayTx.reduce((sum, tx) => sum + Number(tx.amount || 0), 0);
  const monthTotal = monthTx.reduce((sum, tx) => sum + Number(tx.amount || 0), 0);
  const grandTotal = state.transactions.reduce((sum, tx) => sum + Number(tx.amount || 0), 0);
  const monthDue = state.students.filter(s => s.status === 'approved')
    .reduce((sum, student) => sum + studentFeeSummary(student, state.transactions).due, 0);
  if ($('#dashTodayAmount')) {
    $('#dashTodayAmount').textContent = money(todayTotal);
    $('#dashTodaySub').textContent = `${bn(todayTx.length)} টি লেনদেন`;
    $('#dashMonthAmount').textContent = money(monthTotal);
    $('#dashMonthSub').textContent = month;
    $('#dashMonthDue').textContent = money(monthDue);
    $('#dashTotalAmount').textContent = money(grandTotal);
  }
}

/* ---------- Students ---------- */

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function normalizeDigitsOnly(text) {
  return String(text || '')
    .replace(/[০-৯]/g, d => '০১২৩৪৫৬৭৮৯'.indexOf(d))
    .replace(/[^0-9]/g, '');
}

const statusMeta = Object.freeze({
  approved: { label: 'অনুমোদিত', className: 'badge-approved' },
  pending: { label: 'অপেক্ষমাণ', className: 'badge-pending' },
  rejected: { label: 'বাতিল', className: 'badge-rejected' }
});

function visibleStudents() {
  const rawQuery = state.query.trim().toLowerCase();
  const digitQuery = normalizeDigitsOnly(rawQuery);

  return state.students.filter(student => {
    const matchesFilter = state.filter === 'all' || student.status === state.filter;
    if (!matchesFilter) return false;
    // Class filter (student management made easy: pick a class, see only that class).
    if (state.classFilter !== 'all' && student.className !== state.classFilter) return false;
    if (!rawQuery) return true;

    // 1. Check Student ID (ID string, numeric digits, Bangla numerals)
    const idStr = String(student.id || '').toLowerCase();
    const idDigits = normalizeDigitsOnly(student.id);
    const idBn = toBanglaNumber(student.id).toLowerCase();

    if (
      idStr.includes(rawQuery) ||
      (digitQuery && idDigits.includes(digitQuery)) ||
      idBn.includes(rawQuery)
    ) {
      return true;
    }

    // 2. Check Name (Bangla & English) and Father's Name
    const nameBn = (student.name || '').toLowerCase();
    const nameEn = (student.nameEn || '').toLowerCase();
    const fatherName = (student.fatherName || '').toLowerCase();
    if (nameBn.includes(rawQuery) || nameEn.includes(rawQuery) || fatherName.includes(rawQuery)) {
      return true;
    }

    // 3. Check Mobile and Guardian Mobile (both English digits & Bangla digits)
    const mobileNorm = normalizeDigitsOnly(student.mobile);
    const guardianMobileNorm = normalizeDigitsOnly(student.guardianMobile);
    const mobileBn = toBanglaNumber(student.mobile);
    const guardianMobileBn = toBanglaNumber(student.guardianMobile);

    if (
      (digitQuery && (mobileNorm.includes(digitQuery) || guardianMobileNorm.includes(digitQuery))) ||
      (student.mobile && student.mobile.toLowerCase().includes(rawQuery)) ||
      (student.guardianMobile && student.guardianMobile.toLowerCase().includes(rawQuery)) ||
      mobileBn.includes(rawQuery) ||
      guardianMobileBn.includes(rawQuery)
    ) {
      return true;
    }

    // 4. Check Class & Group
    const className = (student.className || '').toLowerCase();
    const group = (student.group || '').toLowerCase();
    if (className.includes(rawQuery) || group.includes(rawQuery)) {
      return true;
    }

    // Auto-hide non-matching students
    return false;
  });
}

function renderStudents() {
  const list = visibleStudents();
  const clearBtn = $('#studentSearchClear');
  const countBadge = $('#studentCountBadge');

  if (clearBtn) {
    clearBtn.hidden = !state.query.trim();
  }

  if (countBadge) {
    const count = list.length;
    if (state.query.trim()) {
      countBadge.textContent = count > 0
        ? `${bn(count)} জন শিক্ষার্থী পাওয়া গেছে`
        : 'কোনো ফলাফল মেলেনি';
    } else {
      countBadge.textContent = `${bn(count)} জন শিক্ষার্থী`;
    }
  }

  $('#studentList').innerHTML = list.length
    ? list.map(student => `
      <article class="student-row student-row-locked">
        <span class="student-avatar locked" aria-hidden="true"><svg viewBox="0 0 24 24"><use href="#icon-lock"></use></svg></span>
        <div class="student-copy">
          <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;">
            <strong class="student-name-hidden">গোপন রাখা হয়েছে</strong>
            <span class="audit-id-badge">ID: ${student.id}</span>
          </div>
          <small>ব্যক্তিগত তথ্য লুকানো — দেখতে "তথ্য দেখুন" চাপুন</small>
        </div>
        <div class="student-side">
          <span class="badge ${statusMeta[student.status].className}">${statusMeta[student.status].label}</span>
          <div class="student-actions">
            <button class="mini-btn" type="button" data-action="view" data-id="${student.id}">তথ্য দেখুন</button>
            <button class="mini-btn" type="button" data-action="edit" data-id="${student.id}">সম্পাদনা</button>
            ${student.status === 'pending' ? `
              <button class="mini-btn approve" type="button" data-action="approve" data-id="${student.id}">অনুমোদন</button>
              <button class="mini-btn danger" type="button" data-action="reject" data-id="${student.id}">বাতিল</button>` : ''}
            <button class="mini-btn" type="button" data-action="reset-pin" data-id="${student.id}">পাসওয়ার্ড রিসেট</button>
          </div>
        </div>
      </article>`).join('')
    : state.query.trim()
      ? `<div class="admin-empty-search">
          <p>🔍 "<strong>${escapeHtml(state.query.trim())}</strong>" দিয়ে কোনো শিক্ষার্থী পাওয়া যায়নি</p>
          <small>নামের বানান বা ১১ ডিজিটের মোবাইল নম্বর (যেমন: ০১৭... বা 017...) দিয়ে খুঁজুন। অমিল রেকর্ড স্বয়ংক্রিয়ভাবে লুকানো রয়েছে (অটো হাইড)।</small>
        </div>`
      : '<p class="admin-empty">কোনো শিক্ষার্থী পাওয়া যায়নি।</p>';
}

function findStudent(id) {
  return state.students.find(student => student.id === id);
}

function setStatus(id, status, message) {
  const student = findStudent(id);
  if (!student) return;
  student.status = status;
  persistStudents();
  syncAccountStatus(id, status);
  renderFeeProfile();
  renderFinanceStats();
  renderStudents();
  renderDashboard();
  toast(message);
}

/* ---------- Student detail and পাসওয়ার্ড reset modal ---------- */

function openStudentDetail(student) {
  const classCode = classCodes[student.className] || 'CLS-GEN';
  const rows = [
    ['Student Unique ID', `<span class="audit-id-badge">${student.id}</span>`],
    ['অডিট ট্র্যাকিং কোড', `<span class="audit-id-badge amber">AUD-STU-${student.id.replace(/[^0-9A-Za-z]/g, '')}</span>`],
    ['নাম (বাংলা)', student.name],
    ['নাম (English)', student.nameEn],
    ['পিতার নাম', student.fatherName],
    ['শ্রেণি ও কোড', `${student.className} <span class="audit-id-badge purple">${classCode}</span>`],
    ['বিভাগ / গ্রুপ', student.group],
    ['মোবাইল', bn(student.mobile)],
    ['অভিভাবকের মোবাইল', bn(student.guardianMobile)],
    ['ঠিকানা', student.address],
    ['রেজিস্ট্রেশন', student.enrolledAt],
    ['সর্বশেষ সক্রিয়', student.lastActive],
    ['স্ট্যাটাস', statusMeta[student.status].label]
  ];
  const performance = student.status === 'approved'
    ? `উপস্থিতি ${bn(student.attendance)}% • গড় ফলাফল ${bn(student.average)}%`
    : 'অনুমোদনের পরে থেকে দেখা যাবে';
  openModal(
    'শিক্ষার্থী রেকর্ড (Audit Ready)',
    student.name,
    `
      <dl class="detail-grid">
        ${rows.map(([label, value]) => `<div><dt>${label}</dt><dd>${value}</dd></div>`).join('')}
        <div><dt>অগ্রগতি</dt><dd>${performance}</dd></div>
      </dl>
      <div class="modal-actions">
        ${student.status === 'pending' ? '<button class="admin-btn primary" type="button" data-modal-action="approve">অনুমোদন করুন</button>' : ''}
        <button class="admin-btn primary" type="button" data-modal-action="edit">সম্পাদনা করুন</button>
        <button class="admin-btn ghost" type="button" data-modal-action="reset-pin">পাসওয়ার্ড রিসেট</button>
        <button class="admin-btn ghost" type="button" data-modal-action="close">বন্ধ করুন</button>
      </div>`
  );
  const actions = $('#adminModalBody').querySelectorAll('[data-modal-action]');
  actions.forEach(button => {
    button.addEventListener('click', () => {
      const action = button.dataset.modalAction;
      if (action === 'approve') {
        setStatus(student.id, 'approved', `${student.name} অনুমোদিত হয়েছে — এখন শিক্ষার্থী অ্যাপ ব্যবহার করতে পারবে`);
      } else if (action === 'reset-pin') {
        openPinReset(student);
        return;
      } else if (action === 'edit') {
        openStudentEdit(student);
        return;
      }
      closeModal();
    });
  });
}

/* ---------- Student edit modal ---------- */

const editableClasses = enabledClasses;

function openStudentEdit(student) {
  const fee = student.monthlyFee ?? '';
  openModal(
    'শিক্ষার্থী তথ্য সম্পাদনা',
    `${student.name} — ${student.id}`,
    `
      <form id="studentEditForm" class="student-edit-form" novalidate>
        <div class="form-grid-2">
          <div>
            <label for="editStudentName">নাম (বাংলা) *</label>
            <input id="editStudentName" type="text" maxlength="120" value="${escapeHtml(student.name)}" required>
          </div>
          <div>
            <label for="editStudentNameEn">নাম (English)</label>
            <input id="editStudentNameEn" type="text" maxlength="120" value="${escapeHtml(student.nameEn || '')}">
          </div>
        </div>
        <label for="editStudentFather">পিতার নাম</label>
        <input id="editStudentFather" type="text" maxlength="120" value="${escapeHtml(student.fatherName || '')}">
        <div class="form-grid-2">
          <div>
            <label for="editStudentClass">শ্রেণি *</label>
            <select id="editStudentClass" required>
              ${editableClasses.map(className => `<option value="${escapeHtml(className)}" ${className === student.className ? 'selected' : ''}>${escapeHtml(className)}</option>`).join('')}
            </select>
          </div>
          <div>
            <label for="editStudentGroup">বিভাগ / গ্রুপ</label>
            <input id="editStudentGroup" type="text" maxlength="80" value="${escapeHtml(student.group || '')}">
          </div>
        </div>
        <div class="form-grid-2">
          <div>
            <label for="editStudentMobile">মোবাইল *</label>
            <input id="editStudentMobile" type="tel" inputmode="numeric" maxlength="14" value="${escapeHtml(student.mobile || '')}" required>
          </div>
          <div>
            <label for="editStudentGuardianMobile">অভিভাবকের মোবাইল</label>
            <input id="editStudentGuardianMobile" type="tel" inputmode="numeric" maxlength="14" value="${escapeHtml(student.guardianMobile || '')}">
          </div>
        </div>
        <label for="editStudentAddress">ঠিকানা</label>
        <input id="editStudentAddress" type="text" maxlength="300" value="${escapeHtml(student.address || '')}">
        <label for="editStudentFee">নির্ধারিত মাসিক ফি (৳) — খালি রাখলে ডিফল্ট ৳১,৫০০</label>
        <input id="editStudentFee" type="number" min="0" max="1000000" step="1" value="${escapeHtml(String(fee))}" placeholder="1500">
        <p id="studentEditError" class="finance-error" role="alert" hidden></p>
        <div class="modal-actions">
          <button class="admin-btn primary" type="submit">সংরক্ষণ করুন</button>
          <button class="admin-btn ghost" type="button" data-edit-cancel>বাতিল</button>
        </div>
      </form>`
  );
  $('#adminModalBody [data-edit-cancel]').addEventListener('click', () => { closeModal(); });
  $('#studentEditForm').addEventListener('submit', event => {
    event.preventDefault();
    saveStudentEdit(student);
  });
}

function saveStudentEdit(student) {
  const name = $('#editStudentName').value.trim();
  const mobile = normalizeDigitsOnly($('#editStudentMobile').value);
  const guardianMobile = normalizeDigitsOnly($('#editStudentGuardianMobile').value);
  const error = $('#studentEditError');
  const fail = message => {
    error.textContent = message;
    error.hidden = false;
  };
  if (!name) return fail('শিক্ষার্থীর নাম দিন।');
  if (mobile.length !== 11 || !mobile.startsWith('01')) return fail('মোবাইল নম্বরটি ০১ দিয়ে শুরু হওয়া ১১ সংখ্যার হতে হবে।');
  if (guardianMobile && (guardianMobile.length !== 11 || !guardianMobile.startsWith('01'))) return fail('অভিভাবকের মোবাইল নম্বরটি সঠিক নয় (১১ সংখ্যা)।');
  const feeRaw = $('#editStudentFee').value.trim();
  let monthlyFee = null;
  if (feeRaw !== '') {
    monthlyFee = Number(feeRaw);
    if (!Number.isFinite(monthlyFee) || monthlyFee < 0 || monthlyFee > 1000000) return fail('মাসিক ফি সঠিক সংখ্যা দিন।');
  }
  const className = $('#editStudentClass').value;
  Object.assign(student, {
    name,
    nameEn: $('#editStudentNameEn').value.trim(),
    fatherName: $('#editStudentFather').value.trim(),
    className,
    group: $('#editStudentGroup').value.trim(),
    mobile,
    guardianMobile,
    address: $('#editStudentAddress').value.trim(),
    monthlyFee
  });
  persistStudents();
  closeModal();
  renderStudents();
  renderFinance();
  renderDashboard();
  toast(`${name} এর তথ্য সম্পাদনা করা হয়েছে`);
}

function openPinReset(student) {
  const account = loadAccount();
  const isLocal = account?.student?.id === student.id || account?.studentId === student.id;
  openModal(
    'অ্যাকাউন্ট নিরাপত্তা',
    `${student.name} — ডিফল্ট পাসওয়ার্ড`,
    `<p class="modal-copy">${isLocal ? 'নিশ্চিত করলে এই ব্রাউজারের অ্যাকাউন্টের পাসওয়ার্ড নিচের ডিফল্ট পাসওয়ার্ড হবে। নিবন্ধনের মোবাইল অপরিবর্তিত থাকবে।' : 'ডিফল্ট পাসওয়ার্ড নিচে দেওয়া আছে। এই শিক্ষার্থীর অ্যাকাউন্ট এই ব্রাউজারে নেই; এটি শুধু ডেমো, আসল পাসওয়ার্ড পরিবর্তন হবে না।'}</p>
      <div class="pin-box" aria-label="নতুন পাসওয়ার্ড">${bn(DEFAULT_PIN)}</div>
      <p id="pinResetError" class="finance-error" role="alert" hidden></p>
      <div class="modal-actions"><button class="admin-btn primary" type="button" data-modal-action="done">${isLocal ? 'রিসেট নিশ্চিত করুন' : 'বুঝেছি'}</button></div>`
  );
  $('#adminModalBody [data-modal-action="done"]').addEventListener('click', () => {
    if (isLocal) {
      const latest = loadAccount();
      if ((latest?.student?.id !== student.id && latest?.studentId !== student.id) || !saveAccount({ ...latest, pin: DEFAULT_PIN })) {
        $('#pinResetError').textContent = 'পাসওয়ার্ড সংরক্ষণ হয়নি। আবার চেষ্টা করুন।';
        $('#pinResetError').hidden = false;
        return;
      }
    }
    closeModal();
    toast(isLocal ? `${student.name} এর পাসওয়ার্ড রিসেট হয়েছে` : 'ডেমো ডিফল্ট পাসওয়ার্ড দেখানো হয়েছে');
  });
}

let modalTrigger;
function openModal(kicker, title, bodyHtml) {
  if ($('#adminModalBackdrop').hidden) modalTrigger = document.activeElement;
  $('#adminModalKicker').textContent = kicker;
  $('#adminModalTitle').textContent = title;
  $('#adminModalBody').innerHTML = bodyHtml;
  $('#adminModalBackdrop').hidden = false;
  document.body.classList.add('admin-modal-open');
  window.setTimeout(() => $('#adminModalClose').focus(), 50);
}

function closeModal() {
  $('#adminModalBackdrop').hidden = true;
  document.body.classList.remove('admin-modal-open');
  const canRestore = modalTrigger?.isConnected && modalTrigger.matches('button, input, select, textarea, a[href], [tabindex]') && !modalTrigger.disabled && modalTrigger.getClientRects().length;
  const target = canRestore ? modalTrigger : $('#feeProfileCollect');
  target?.focus({ preventScroll: true });
}

/* ---------- Notices ---------- */

function renderNotices() {
  $('#noticeList').innerHTML = state.notices.length
    ? state.notices.map(notice => `
      <article class="notice-item">
        <div class="notice-item-top">
          <div>
            <div style="display:flex;align-items:center;gap:6px;margin-bottom:3px;flex-wrap:wrap;">
              <strong>${notice.title}</strong>
              <span class="audit-id-badge amber">${notice.id}</span>
            </div>
          </div>
          <button class="icon-btn" type="button" data-action="delete-notice" data-id="${notice.id}" aria-label="${notice.title} নোটিশটি মুছুন">
            <svg aria-hidden="true" viewBox="0 0 24 24"><use href="#icon-trash"></use></svg>
          </button>
        </div>
        <p>${notice.body}</p>
        <div class="notice-meta">
          <span class="audience-chip">${notice.audience}</span>
          <small>${notice.date}</small>
        </div>
      </article>`).join('')
    : '<p class="admin-empty">এখনও কোনো নোটিশ প্রকাশ হয়নি।</p>';
}

function publishNotice(event) {
  event.preventDefault();
  const title = $('#noticeTitle').value.trim();
  const body = $('#noticeBody').value.trim();
  const audience = $('#noticeAudience').value;
  if (!title || !body) {
    toast('নোটিশের শিরোনাম ও বিবরণ দিন');
    return;
  }
  const now = new Date();
  const noticeUniqueId = newId('NOT');
  state.notices.unshift({
    id: noticeUniqueId,
    title,
    body,
    audience,
    date: dateLabel(now),
    createdAt: now.toISOString()
  });
  event.target.reset();
  persistNotices();
  renderNotices();
  renderDashboard();
  toast(`নোটিশ [${noticeUniqueId}] প্রকাশিত হয়েছে`);
}

/* ---------- Routine ---------- */

function toBengaliTime(value) {
  const [hour, minute] = value.split(':').map(Number);
  const period = hour < 4 ? 'ভোর' : hour < 12 ? 'সকাল' : hour < 16 ? 'বিকেল' : 'সন্ধ্যা';
  const hour12 = hour % 12 === 0 ? 12 : hour % 12;
  const time = bn(`${String(hour12).padStart(2, '0')}:${String(minute).padStart(2, '0')}`);
  return { time, period };
}

function routineTeachers() {
  return [...new Set(Object.values(state.routine).flatMap(info => info.classes.map(cls => cls.teacher).filter(Boolean)))];
}

function routineSubjects() {
  return [...new Set(Object.values(state.routine).flatMap(info => info.classes.map(cls => cls.subject).filter(Boolean)))];
}

function renderRoutine() {
  $('#routineDayTabs').innerHTML = Object.keys(state.routine).map(day => `
    <button class="day-tab ${day === state.activeDay ? 'active' : ''}" type="button" data-routine-day="${day}">
      ${dayNames[day]}<small>${bn(state.routine[day].classes.length)}</small>
    </button>`).join('');

  $('#addRoutineHeading').textContent = `নতুন ক্লাস যোগ করুন — ${dayNames[state.activeDay]}`;

  // Which class the new class is for — dropdown from the enabled class list.
  const classSelect = $('#routineClass');
  if (classSelect && classSelect.options.length <= 1) {
    classSelect.innerHTML = '<option value="" disabled selected>শ্রেণি নির্বাচন করুন</option>' +
      enabledClasses.map(className => `<option value="${escapeHtml(className)}">${escapeHtml(className)}</option>`).join('');
  }
  const teacherList = $('#routineTeacherList');
  if (teacherList) {
    teacherList.innerHTML = routineTeachers().map(teacher => `<option value="${escapeHtml(teacher)}"></option>`).join('');
  }
  // Subject autofill: previously typed subjects become suggestions while typing.
  const subjectList = $('#routineSubjectList');
  if (subjectList) subjectList.innerHTML = routineSubjects().map(subject => `<option value="${escapeHtml(subject)}"></option>`).join('');

  const classes = state.routine[state.activeDay].classes;
  $('#routineList').innerHTML = classes.length
    ? classes.map((cls, index) => `
      <div class="routine-row">
        <div class="routine-time"><strong>${cls.time}</strong><small>${cls.period}</small></div>
        <div class="routine-copy">
          <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;">
            <strong>${cls.subject}</strong>
            ${cls.className ? `<span class="audit-id-badge purple">${escapeHtml(cls.className)}</span>` : ''}
            <span class="audit-id-badge blue">${cls.id || `RTN-${state.activeDay.toUpperCase()}-${String(index + 1).padStart(2, '0')}`}</span>
          </div>
          <small>${cls.teacher} • ${cls.room}</small>
        </div>
        <span class="routine-tag">${cls.tag}</span>
        <button class="icon-btn" type="button" data-action="delete-routine" data-index="${index}" aria-label="এই ক্লাসটি মুছুন">
          <svg aria-hidden="true" viewBox="0 0 24 24"><use href="#icon-trash"></use></svg>
        </button>
      </div>`).join('')
    : '<p class="admin-empty">এই দিনে এখনও কোনো ক্লাস যোগ করা হয়নি।</p>';
}

function addRoutineClass(event) {
  event.preventDefault();
  const className = $('#routineClass').value;
  const subject = $('#routineSubject').value.trim();
  const teacher = $('#routineTeacher').value.trim();
  const room = $('#routineRoom').value.trim();
  const time = $('#routineTime').value;
  if (!className || !subject || !teacher || !room || !time) {
    toast('শ্রেণি, বিষয়, শিক্ষক, রুম ও সময় নির্বাচন/লিখুন');
    return;
  }
  const { time: bengaliTime, period } = toBengaliTime(time);
  const classUniqueId = newId('RTN');
  state.routine[state.activeDay].classes.push({
    id: classUniqueId,
    className,
    time: bengaliTime,
    period,
    subject,
    teacher,
    room,
    tag: 'নতুন',
    tone: 'green',
    createdAt: new Date().toISOString()
  });
  // Keep subject and class handy for the next entry; reset only the rest.
  const nextSubject = subject;
  event.target.reset();
  $('#routineTime').value = '18:00';
  $('#routineSubject').value = nextSubject;
  persistRoutine();
  renderRoutine();
  renderDashboard();
  toast(`${className} • ${subject} [${classUniqueId}] রুটিনে যোগ হয়েছে`);
}

/* ---------- Classes ---------- */

function renderClasses() {
  $('#classesCount').textContent = `${bn(state.enabled.size)} / ${bn(enabledClasses.length)} চালু`;
  $('#classList').innerHTML = enabledClasses.map(className => {
    const count = state.students.filter(student => student.className === className && student.status !== 'rejected').length;
    const enabled = state.enabled.has(className);
    const code = classCodes[className] || 'CLS-GEN';
    return `
      <div class="class-row">
        <div class="class-copy">
          <div style="display:flex;align-items:center;gap:6px;">
            <strong>${className}</strong>
            <span class="audit-id-badge purple">${code}</span>
          </div>
          <small>${bn(count)} শিক্ষার্থী</small>
        </div>
        <label class="switch" aria-label="${className} চালু বা বন্ধ করুন">
          <input type="checkbox" data-class-name="${className}" ${enabled ? 'checked' : ''}>
          <span class="switch-track"></span>
        </label>
      </div>`;
  }).join('');
}

function toggleClass(event) {
  const input = event.target;
  if (input.tagName !== 'INPUT') return;
  const className = input.dataset.className;
  if (input.checked) state.enabled.add(className);
  else state.enabled.delete(className);
  renderClasses();
  renderDashboard();
  toast(`${className} [${classCodes[className] || 'CLS-GEN'}] ${input.checked ? 'চালু' : 'বন্ধ'} করা হয়েছে (ডেমো)`);
}

/* ---------- Finance & Fee Collection & Reports ---------- */

function setFinanceTab(tab) {
  state.activeFinanceTab = tab;
  $$('#financeSubNav .chip').forEach(btn =>
    btn.classList.toggle('active', btn.dataset.financeTab === tab)
  );
  $$('.finance-panel').forEach(panel =>
    panel.classList.toggle('active', panel.dataset.financeView === tab)
  );
}

async function loadFinanceTransactions() {
  try {
    state.transactions = await financeRepository.listTransactions();
    state.financeReady = true;
    $('#financeLoadError').hidden = true;
    populateFinanceMonths();
    populateReportFilterOptions();
    renderFinance();
    renderDashboard();
  } catch {
    state.financeReady = false;
    $('#financeLoadError').textContent = 'লেনদেনের ডেটা পড়া যায়নি। ব্রাউজারের স্টোরেজ চালু করে পেজ রিফ্রেশ করুন। ডেটা নিরাপদ রাখতে পেমেন্ট বন্ধ আছে।';
    $('#financeLoadError').hidden = false;
    renderFeeProfile();
  }
}

function populateFinanceMonths() {
  const selectedMonth = $('#feeMonth').value;
  const now = new Date();
  const months = new Set();
  for (let offset = 1; offset >= -12; offset--) {
    months.add(monthLabel(new Date(now.getFullYear(), now.getMonth() + offset, 1)));
  }
  state.transactions.forEach(tx => months.add(tx.month));
  const options = [...months].map(month => `<option value="${escapeHtml(month)}">${escapeHtml(month)}</option>`).join('');
  $('#feeMonth').innerHTML = options;
  $('#feeMonth').value = months.has(selectedMonth) ? selectedMonth : monthLabel();
  $('#reportMonth').innerHTML = '<option value="all">সব সময়</option>' + options;
  $('#reportMonth').value = months.has(state.reportFilters.month) || state.reportFilters.month === 'all' ? state.reportFilters.month : monthLabel();
  state.reportFilters.month = $('#reportMonth').value;
}

/* Filter dropdowns for the collection report — filled from the shared dataset. */
function populateReportFilterOptions() {
  const classSelect = $('#reportClass');
  if (classSelect && classSelect.options.length <= 1) {
    classSelect.innerHTML = '<option value="all">সব শ্রেণি</option>' +
      enabledClasses.map(className => `<option value="${escapeHtml(className)}">${escapeHtml(className)}</option>`).join('');
    classSelect.value = state.reportFilters.className;
  }
  const feeTypeSelect = $('#reportFeeType');
  if (feeTypeSelect && feeTypeSelect.options.length <= 1) {
    feeTypeSelect.innerHTML = '<option value="all">সব ধরন</option>' +
      feeCategories.map(feeType => `<option value="${escapeHtml(feeType)}">${escapeHtml(feeType)}</option>`).join('');
    feeTypeSelect.value = state.reportFilters.feeType;
  }
  const methodSelect = $('#reportMethod');
  if (methodSelect && methodSelect.options.length <= 1) {
    methodSelect.innerHTML = '<option value="all">সব মাধ্যম</option>' +
      paymentMethods.map(method => `<option value="${escapeHtml(method)}">${escapeHtml(method)}</option>`).join('');
    methodSelect.value = state.reportFilters.method;
  }
}

function renderFinanceStats() {
  const totalCollected = state.transactions.reduce((sum, tx) => sum + Number(tx.amount || 0), 0);
  const monthCollected = state.transactions.filter(tx => tx.month === monthLabel())
    .reduce((sum, tx) => sum + Number(tx.amount || 0), 0);
  const totalDue = state.students.filter(s => s.status === 'approved')
    .reduce((sum, student) => sum + studentFeeSummary(student, state.transactions).due, 0);
  $('#financeTotalCollected').textContent = '৳' + bn(totalCollected.toLocaleString('en-US'));
  $('#financeMonthCollected').textContent = '৳' + bn(monthCollected.toLocaleString('en-US'));
  $('#financeMonthCollected').nextElementSibling.textContent = `চলতি মাস (${monthLabel()})`;
  $('#financeTotalDue').textContent = '৳' + bn(totalDue.toLocaleString('en-US'));
  $('#financeTrxCount').textContent = bn(state.transactions.length) + ' টি';
  $('#trxCountBadge').textContent = bn(Math.min(5, state.transactions.length)) + ' টি আদায়';
}

function renderFeeSearch() {
  const query = $('#feeStudentSearch').value.trim();
  const matches = searchStudents(state.students, query);
  $('#feeSearchStatus').textContent = !query ? '' : matches.length ? `${bn(matches.length)} জন শিক্ষার্থী পাওয়া গেছে` : 'কোনো শিক্ষার্থী পাওয়া যায়নি';
  $('#feeSearchResults').innerHTML = matches.map(student => `
    <button class="fee-search-result" type="button" data-fee-student="${escapeHtml(student.id)}" aria-pressed="${student.id === state.feeStudentId}">
      <span class="student-avatar" aria-hidden="true">${escapeHtml(student.name.charAt(0))}</span>
      <span><strong>${escapeHtml(student.name)}</strong><small>Student ID: ${escapeHtml(student.id)} • ${escapeHtml(student.className)}</small></span>
    </button>`).join('');
}

function selectFeeStudent(id) {
  if (state.savingFee) return;
  state.feeStudentId = id;
  $('#feeCollectionForm').reset();
  $('#feeCollectionForm').hidden = true;
  $('#feeSaveError').hidden = true;
  renderFeeSearch();
  renderFeeProfile();
  $('#feeQuickProfile').scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  $('#feeProfileCollect')?.focus({ preventScroll: true });
}

function renderFeeProfile() {
  const student = state.students.find(s => s.id === state.feeStudentId);
  if (!student) {
    $('#feeQuickProfile').innerHTML = '<p class="admin-empty">উপরে সার্চ করে শিক্ষার্থীর নামের উপর ক্লিক করুন।</p>';
    return;
  }
  const summary = studentFeeSummary(student, state.transactions);
  const status = statusMeta[student.status] || { label: student.status || 'অজানা', className: '' };
  const money = value => '৳' + bn(value.toLocaleString('en-US'));
  $('#feeQuickProfile').innerHTML = `
    <div class="fee-profile-heading">
      <span class="student-avatar" aria-hidden="true">${escapeHtml(student.name.charAt(0))}</span>
      <div><h3>${escapeHtml(student.name)}</h3><small>Student ID: ${escapeHtml(student.id)}</small></div>
      <span class="badge ${status.className}">${escapeHtml(status.label)}</span>
    </div>
    <dl class="fee-profile-details">
      <div><dt>শ্রেণি ও বিভাগ</dt><dd>${escapeHtml(student.className)} • ${escapeHtml(student.group || '—')}</dd></div>
      <div><dt>মোবাইল নম্বর</dt><dd>${escapeHtml(student.mobile || '—')}</dd></div>
      <div><dt>সর্বশেষ পেমেন্টের তারিখ</dt><dd>${escapeHtml(summary.lastPayment?.date || 'এখনও পেমেন্ট নেই')}</dd></div>
      <div><dt>সর্বশেষ পেমেন্টের মাধ্যম</dt><dd>${escapeHtml(summary.lastPayment?.method || '—')}</dd></div>
    </dl>
    <dl class="fee-balance-grid">
      <div><dt>নির্ধারিত মাসিক ফি</dt><dd>${money(summary.monthlyFee)}</dd></div>
      <div><dt>চলতি মাসে পরিশোধ</dt><dd>${money(summary.paid)}</dd></div>
      <div class="${summary.due ? 'has-due' : ''}"><dt>বর্তমান মাসের বকেয়া</dt><dd>${money(summary.due)}</dd></div>
    </dl>
    <p class="finance-hint">${summary.month} • বকেয়া শুধু মাসিক বেতনের; অন্যান্য ফি বেতন থেকে বাদ যায় না।</p>
    <button id="feeProfileCollect" class="admin-btn primary fee-profile-collect" type="button" ${!state.financeReady || state.savingFee ? 'disabled' : ''}>পেমেন্ট গ্রহণ</button>`;
}

function beginFeePayment() {
  const student = state.students.find(s => s.id === state.feeStudentId);
  if (!student || !state.financeReady || state.savingFee) return;
  const summary = studentFeeSummary(student, state.transactions);
  $('#feeCollectionForm').reset();
  $('#feeStudent').value = student.id;
  $('#feeMonth').value = monthLabel();
  $('#feeAmount').value = summary.due || summary.monthlyFee || '';
  $('#feePaymentFor').textContent = `${student.name} • Student ID: ${student.id}`;
  $('#feeSaveError').hidden = true;
  $('#feeCollectionForm').hidden = false;
  $('#feeType').focus();
}

function renderRecentTransactions() {
  const listEl = $('#recentTrxList');
  if (!listEl) return;

  listEl.innerHTML = state.transactions.length
    ? newestTransactions(state.transactions).slice(0, 5).map(tx => `
      <div class="trx-item">
        <div class="trx-left">
          <span class="trx-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24"><use href="#icon-receipt"></use></svg>
          </span>
          <div class="trx-info">
            <strong>${escapeHtml(tx.studentName)}</strong>
            <small>${escapeHtml(tx.className)} • ${escapeHtml(tx.feeType)} (${escapeHtml(tx.month)}) • ${escapeHtml(tx.method)}</small>
          </div>
        </div>
        <div class="trx-right">
          <span class="trx-amount">৳${bn(Number(tx.amount).toLocaleString('en-US'))}</span>
          <span class="trx-date">${escapeHtml(tx.date)}</span>
          <button class="mini-btn" type="button" data-action="view-receipt" data-trx-id="${escapeHtml(tx.id)}">রসিদ দেখুন</button>
          <button class="mini-btn" type="button" data-action="download-receipt" data-trx-id="${escapeHtml(tx.id)}">ডাউনলোড</button>
        </div>
      </div>`).join('')
    : '<p class="admin-empty">এখনও কোনো ফি কালেকশন রেকর্ড নেই।</p>';
}

function renderStudentLedger() {
  const listEl = $('#studentLedgerList');
  if (!listEl) return;

  const studentsWithStatus = state.students.map(student => {
    const summary = studentFeeSummary(student, state.transactions);
    return { ...student, paidAmount: summary.tuitionPaid, dueAmount: summary.due, isPaid: summary.due === 0 };
  });

  const query = ($('#ledgerSearch')?.value || '').trim();
  const searched = query ? searchStudents(studentsWithStatus, query) : studentsWithStatus;

  const filtered = searched.filter(s => {
    if (state.ledgerFilter === 'due') return !s.isPaid;
    if (state.ledgerFilter === 'paid') return s.isPaid;
    return true;
  });

  listEl.innerHTML = filtered.length
    ? filtered.map(student => `
      <article class="ledger-item">
        <div class="student-copy">
          <strong>${student.name}</strong>
          <small>${student.className} • ${student.group} • 📞 ${bn(student.mobile)}</small>
          <small style="margin-top:2px;color:${student.isPaid ? 'var(--forest)' : '#c05b4b'};font-weight:700;">
            ${monthLabel()}: ${student.isPaid ? 'পরিশোধিত (৳' + bn(student.paidAmount) + ')' : 'বকেয়া: ৳' + bn(student.dueAmount)}
          </small>
        </div>
        <div class="student-side">
          <span class="badge ${student.isPaid ? 'badge-approved' : 'badge-pending'}">
            ${student.isPaid ? 'পরিশোধিত' : 'বকেয়া'}
          </span>
          <div class="student-actions">
            ${!student.isPaid ? `
              <button class="mini-btn approve" type="button" data-action="quick-collect" data-id="${student.id}">
                ফি গ্রহণ
              </button>` : `
              <button class="mini-btn" type="button" data-action="view-student-receipts" data-id="${student.id}">
                রসিদ দেখুন
              </button>`}
          </div>
        </div>
      </article>`).join('')
    : '<p class="admin-empty">কোনো শিক্ষার্থী পাওয়া যায়নি।</p>';
}

function filteredReportTransactions() {
  const { month, className, feeType, method } = state.reportFilters;
  return newestTransactions(state.transactions.filter(tx =>
    (month === 'all' || tx.month === month) &&
    (className === 'all' || tx.className === className) &&
    (feeType === 'all' || tx.feeType === feeType) &&
    (method === 'all' || tx.method === method)
  ));
}

function renderReportGenerator() {
  const filtered = filteredReportTransactions();
  const total = filtered.reduce((sum, tx) => sum + Number(tx.amount || 0), 0);
  const money = value => `৳${bn(value.toLocaleString('en-US'))}`;
  $('#reportPeriod').textContent = state.reportFilters.month === 'all' ? 'সব সময়ের হিসাব' : state.reportFilters.month;
  $('#reportTrxCount').textContent = `${bn(filtered.length)} টি`;
  $('#reportGrandTotal').textContent = money(total);
  $('#reportAverage').textContent = money(filtered.length ? Math.round(total / filtered.length) : 0);
  const limit = state.reportFilters.listLimit;
  const visible = filtered.slice(0, limit);
  const moreButton = $('#reportListMore');
  if (moreButton) {
    const remaining = filtered.length - visible.length;
    moreButton.hidden = remaining <= 0;
    moreButton.textContent = remaining > 0 ? `আরও ${bn(Math.min(REPORT_LIST_PAGE, remaining))} টি লেনদেন দেখুন` : '';
  }
  $('#reportCollectionList').innerHTML = visible.length ? visible.map(tx => `
    <article class="report-payment" role="listitem">
      <div class="report-payment-head"><strong>${escapeHtml(tx.studentName)}</strong><b>${money(Number(tx.amount))}</b></div>
      <small>${escapeHtml(tx.studentId)} • ${escapeHtml(tx.className)}</small>
      <p>${escapeHtml(tx.feeType)} • ${escapeHtml(tx.month)}</p>
      <small>${escapeHtml(tx.date || '—')} • ${escapeHtml(tx.method)}</small>
      <div class="report-payment-actions">
        <button class="mini-btn" type="button" data-action="view-receipt" data-trx-id="${escapeHtml(tx.id)}">রসিদ দেখুন</button>
        <button class="mini-btn" type="button" data-action="download-receipt" data-trx-id="${escapeHtml(tx.id)}">রসিদ ডাউনলোড</button>
      </div>
    </article>`).join('') : '<p class="admin-empty" role="status">কোনো কালেকশন রেকর্ড পাওয়া যায়নি।</p>';
}

/* ---------- Report Center: downloadable PDF / CSV for every report ---------- */

const collectionColumns = [
  { label: 'তারিখ', width: 1.2 },
  { label: 'শিক্ষার্থী', width: 1.5 },
  { label: 'শ্রেণি', width: 1.1 },
  { label: 'ফি ও মাস', width: 1.5 },
  { label: 'মাধ্যম', width: 1.2 },
  { label: 'টাকা', width: 0.9 }
];
const collectionRow = tx => [tx.date || '—', `${tx.studentName} (${tx.studentId})`, tx.className, `${tx.feeType} • ${tx.month}`, tx.method, money(tx.amount)];

function money(amount) {
  return `৳${bn(Number(amount || 0).toLocaleString('en-US'))}`;
}

function reportDataSets() {
  const month = monthLabel();
  const today = dateLabel();
  const collection = filteredReportTransactions();
  const todayTx = newestTransactions(state.transactions.filter(tx => tx.date === today));
  const dues = state.students
    .filter(s => s.status === 'approved')
    .map(student => ({ student, summary: studentFeeSummary(student, state.transactions) }))
    .filter(entry => entry.summary.due > 0);
  const routineRows = Object.entries(state.routine).flatMap(([day, info]) =>
    info.classes.length
      ? info.classes.map(cls => [dayNames[day], cls.subject, cls.className || 'সব শ্রেণি', cls.teacher, cls.room, `${cls.time} (${cls.period})`])
      : [[dayNames[day], '— কোনো ক্লাস নেই —', '', '', '', '']]
  );
  return {
    collection: {
      title: 'ফি কালেকশন রিপোর্ট',
      subtitle: 'নির্বাচিত ফিল্টার অনুযায়ী সমস্ত লেনদেন',
      period: state.reportFilters.month === 'all' ? 'সব সময়' : state.reportFilters.month,
      columns: collectionColumns,
      rows: collection.map(collectionRow),
      summary: [
        { label: 'মোট আদায়', value: money(collection.reduce((sum, tx) => sum + Number(tx.amount || 0), 0)) },
        { label: 'লেনদেন', value: `${bn(collection.length)} টি` },
        { label: 'গড় আদায়', value: money(collection.length ? Math.round(collection.reduce((sum, tx) => sum + Number(tx.amount || 0), 0) / collection.length) : 0) }
      ],
      note: 'নোট: রসিদভিত্তিক বিস্তারিত Admin প্যানেলের কালেকশন রিপোর্ট তালিকায় দেখা যায়।'
    },
    today: {
      title: 'আজকের কালেকশন রিপোর্ট',
      subtitle: 'আজকের সব ফি আদায়',
      period: today,
      columns: collectionColumns,
      rows: todayTx.map(collectionRow),
      summary: [
        { label: 'আজকের আদায়', value: money(todayTx.reduce((sum, tx) => sum + Number(tx.amount || 0), 0)) },
        { label: 'লেনদেন', value: `${bn(todayTx.length)} টি` }
      ]
    },
    dues: {
      title: 'বকেয়া রিপোর্ট',
      subtitle: `চলতি মাসের (${month}) মাসিক বেতনের বকেয়া — শুধু অনুমোদিত শিক্ষার্থী`,
      period: month,
      columns: [
        { label: 'শিক্ষার্থী', width: 1.6 },
        { label: 'Student ID', width: 1.2 },
        { label: 'শ্রেণি', width: 1.2 },
        { label: 'মাসিক ফি', width: 1 },
        { label: 'পরিশোধিত', width: 1 },
        { label: 'বকেয়া', width: 1 }
      ],
      rows: dues.map(({ student, summary }) => [student.name, student.id, `${student.className} • ${student.group || '—'}`, money(summary.monthlyFee), money(summary.tuitionPaid), money(summary.due)]),
      summary: [
        { label: 'মোট বকেয়া', value: money(dues.reduce((sum, entry) => sum + entry.summary.due, 0)) },
        { label: 'বকেয়া শিক্ষার্থী', value: `${bn(dues.length)} জন` }
      ]
    },
    students: {
      title: 'শিক্ষার্থী তালিকা রিপোর্ট',
      subtitle: 'সব শিক্ষার্থীর পূর্ণ তালিকা (নাম, শ্রেণি, যোগাযোগ ও অবস্থা)',
      period: `${dateLabel()} • মোট ${bn(state.students.length)} জন`,
      columns: [
        { label: 'নাম', width: 1.5 },
        { label: 'Student ID', width: 1.2 },
        { label: 'শ্রেণি ও বিভাগ', width: 1.6 },
        { label: 'মোবাইল', width: 1.2 },
        { label: 'অভিভাবক', width: 1.2 },
        { label: 'অবস্থা', width: 0.9 }
      ],
      rows: state.students.map(student => [
        `${student.name} (${student.nameEn || '—'})`, student.id,
        `${student.className} • ${student.group || '—'}`,
        bn(student.mobile || '—'),
        student.guardianMobile ? bn(student.guardianMobile) : '—',
        statusMeta[student.status]?.label || student.status
      ]),
      summary: [
        { label: 'মোট শিক্ষার্থী', value: `${bn(state.students.length)} জন` },
        { label: 'অনুমোদিত', value: `${bn(state.students.filter(s => s.status === 'approved').length)} জন` },
        { label: 'অপেক্ষমাণ', value: `${bn(state.students.filter(s => s.status === 'pending').length)} জন` }
      ]
    },
    routine: {
      title: 'সাপ্তাহিক ক্লাস রুটিন রিপোর্ট',
      subtitle: 'শনিবার থেকে বৃহস্পতিবার — সব শ্রেণির ক্লাস',
      period: `মোট ${bn(routineRows.length)} সারি`,
      columns: [
        { label: 'দিন', width: 1 },
        { label: 'বিষয়', width: 1.3 },
        { label: 'শ্রেণি', width: 1.3 },
        { label: 'শিক্ষক', width: 1.5 },
        { label: 'রুম', width: 1 },
        { label: 'সময়', width: 1.1 }
      ],
      rows: routineRows
    },
    class: (() => {
      const students = classReportStudents();
      const classLabel = $('#classReportClass')?.value || 'all';
      const groupLabel = $('#classReportGroup')?.value || 'all';
      return {
        title: 'শ্রেণি অনুযায়ী শিক্ষার্থী রিপোর্ট',
        subtitle: `${classLabel === 'all' ? 'সব শ্রেণি' : classLabel} • ${groupLabel === 'all' ? 'সব বিভাগ' : groupLabel}`,
        period: `মোট ${bn(students.length)} জন শিক্ষার্থী`,
        columns: [
          { label: 'নাম', width: 1.5 },
          { label: 'Student ID', width: 1.1 },
          { label: 'বিভাগ', width: 1 },
          { label: 'মোবাইল', width: 1.1 },
          { label: 'অবস্থা', width: 0.9 },
          { label: 'উপস্থিতি', width: 0.9 },
          { label: 'ফলাফল', width: 0.9 },
          { label: 'বকেয়া', width: 0.9 }
        ],
        rows: students.map(student => {
          const summary = studentFeeSummary(student, state.transactions);
          return [
            student.name,
            student.id,
            student.group || '—',
            bn(student.mobile || '—'),
            statusMeta[student.status]?.label || student.status,
            `${bn(student.attendance ?? 0)}%`,
            `${bn(student.average ?? 0)}%`,
            money(summary.due)
          ];
        }),
        summary: [
          { label: 'মোট শিক্ষার্থী', value: `${bn(students.length)} জন` },
          { label: 'অনুমোদিত', value: `${bn(students.filter(s => s.status === 'approved').length)} জন` },
          { label: 'মোট বকেয়া', value: money(students.reduce((sum, student) => sum + studentFeeSummary(student, state.transactions).due, 0)) },
          { label: 'গড় উপস্থিতি', value: `${bn(students.length ? Math.round(students.reduce((sum, student) => sum + Number(student.attendance || 0), 0) / students.length) : 0)}%` }
        ],
        note: 'নোট: উপস্থিতি ও ফলাফল শিক্ষার্থী রেকর্ডের সর্বশেষ হিসাব; বকেয়া চলতি মাসের মাসিক বেতন।'
      };
    })(),
    results: selectedResultReport(),
    attendance: selectedAttendanceReport()
  };
}

function renderReportCards() {
  const sets = reportDataSets();
  const today = sets.today;
  const dues = sets.dues;
  const meta = (key, text) => { const el = $(`#reportMeta-${key}`); if (el) el.textContent = text; };
  meta('today', `${today.rows.length ? bn(today.rows.length) + ' টি লেনদেন' : 'আজ এখনও কোনো আদায় নেই'} • ${today.summary[0].value}`);
  meta('dues', `${bn(dues.rows.length)} জনের বকেয়া • ${dues.summary[0].value}`);
  meta('students', `মোট ${bn(state.students.length)} জন • অনুমোদিত ${bn(state.students.filter(s => s.status === 'approved').length)} জন`);
  meta('routine', `${bn(Object.values(state.routine).reduce((sum, info) => sum + info.classes.length, 0))} টি ক্লাস সাপ্তাহিক রুটিনে`);
}

/* ---------- Class-wise students, exam results and attendance reports ---------- */

function onlineResultExams() {
  return (state.examDb?.exams || [])
    .filter(exam => exam.status === 'published')
    .sort((a, b) => b.startAt - a.startAt);
}

function teachingResultExams() {
  return (state.teachingDb?.activities || [])
    .filter(activity => activity.type === 'exam' && activity.status === 'published'
      && Object.values(activity.progress).some(entry => Number.isFinite(Number(entry?.value))))
    .sort((a, b) => String(b.date).localeCompare(String(a.date)));
}

function attendanceSessions() {
  return (state.teachingDb?.activities || [])
    .filter(activity => activity.type === 'routine' && activity.status === 'published' && Object.keys(activity.progress).length)
    .sort((a, b) => String(b.date).localeCompare(String(a.date)) || String(b.time).localeCompare(String(a.time)));
}

function classExamDateLabel(startAt) {
  return new Date(startAt).toISOString().slice(0, 10);
}

function populateAcademicReportSelectors() {
  const classSelect = $('#classReportClass');
  if (classSelect) {
    const previous = classSelect.value || 'all';
    classSelect.innerHTML = '<option value="all">সব শ্রেণি</option>' +
      enabledClasses.map(className => `<option value="${escapeHtml(className)}">${escapeHtml(className)}</option>`).join('');
    classSelect.value = enabledClasses.includes(previous) || previous === 'all' ? previous : 'all';
  }
  const groupSelect = $('#classReportGroup');
  if (groupSelect) {
    const previous = groupSelect.value || 'all';
    const selectedClass = classSelect?.value || 'all';
    const groups = [...new Set(state.students
      .filter(student => selectedClass === 'all' || student.className === selectedClass)
      .map(student => student.group).filter(Boolean))];
    groupSelect.innerHTML = '<option value="all">সব বিভাগ</option>' +
      groups.map(group => `<option value="${escapeHtml(group)}">${escapeHtml(group)}</option>`).join('');
    groupSelect.value = groups.includes(previous) || previous === 'all' ? previous : 'all';
  }
  const examSelect = $('#resultExamSelect');
  if (examSelect) {
    const previous = examSelect.value;
    const options = [
      ...onlineResultExams().map(exam => ({ value: `online:${exam.id}`, label: `${exam.title} • ${exam.subject} (${displayDate(classExamDateLabel(exam.startAt))})` })),
      ...teachingResultExams().map(activity => ({ value: `teaching:${activity.id}`, label: `${activity.title} • ${activity.className} (${displayDate(activity.date)})` }))
    ];
    examSelect.innerHTML = '<option value="">পরীক্ষা নির্বাচন করুন</option>' +
      options.map(option => `<option value="${escapeHtml(option.value)}">${escapeHtml(option.label)}</option>`).join('');
    examSelect.value = options.some(option => option.value === previous) ? previous : '';
  }
  const classFilter = $('#resultClassFilter');
  if (classFilter) {
    const previous = classFilter.value || 'all';
    classFilter.innerHTML = '<option value="all">সব শ্রেণি</option>' +
      enabledClasses.map(className => `<option value="${escapeHtml(className)}">${escapeHtml(className)}</option>`).join('');
    classFilter.value = enabledClasses.includes(previous) || previous === 'all' ? previous : 'all';
  }
  const sessionSelect = $('#attendanceSessionSelect');
  if (sessionSelect) {
    const previous = sessionSelect.value;
    const options = attendanceSessions().map(activity => ({
      value: activity.id,
      label: `${activity.title} • ${displayDate(activity.date)} • ${bn(activity.time)}`
    }));
    sessionSelect.innerHTML = '<option value="">ক্লাস সেশন নির্বাচন করুন</option>' +
      options.map(option => `<option value="${escapeHtml(option.value)}">${escapeHtml(option.label)}</option>`).join('');
    sessionSelect.value = options.some(option => option.value === previous) ? previous : '';
  }
}

function classReportStudents() {
  const className = $('#classReportClass')?.value || 'all';
  const group = $('#classReportGroup')?.value || 'all';
  return state.students
    .filter(student => (className === 'all' || student.className === className)
      && (group === 'all' || (student.group || '') === group))
    .slice()
    .sort((a, b) => a.className.localeCompare(b.className, 'bn') || a.name.localeCompare(b.name, 'bn'));
}

function selectedResultReport() {
  const key = $('#resultExamSelect')?.value || '';
  if (!key) return null;
  const classFilter = $('#resultClassFilter')?.value || 'all';
  const columns = [
    { label: 'র‍্যাংক', width: 0.7 },
    { label: 'শিক্ষার্থী', width: 1.7 },
    { label: 'শ্রেণি/বিভাগ', width: 1.5 },
    { label: 'প্রাপ্ত নম্বর', width: 1 },
    { label: 'গ্রেড', width: 0.7 },
    { label: 'অবস্থা', width: 1.1 }
  ];
  if (key.startsWith('online:')) {
    const exam = onlineResultExams().find(item => item.id === key.slice(7));
    if (!exam) return null;
    const max = totalMarks(exam);
    const ranked = examResults(state.examDb, exam)
      .filter(row => classFilter === 'all' || row.className === classFilter);
    const submittedIds = new Set(ranked.map(row => row.studentId));
    const absent = (exam.participants || [])
      .filter(person => !submittedIds.has(person.id) && (classFilter === 'all' || person.className === classFilter));
    const rows = [
      ...ranked.map(row => [bn(row.rank), `${row.name} (${row.studentId})`, row.className || '—', `${bn(row.score)} / ${bn(max)}`, row.grade, 'জমা দিয়েছে']),
      ...absent.map(person => ['—', `${person.name} (${person.id})`, person.className || '—', '—', '—', 'অনুপস্থিত'])
    ];
    const scores = ranked.map(row => Number(row.score) || 0);
    return {
      title: 'ফলাফল রিপোর্ট',
      subtitle: `${exam.title} • ${exam.subject} • পূর্ণমান ${bn(max)}`,
      period: displayDate(classExamDateLabel(exam.startAt)),
      columns,
      rows,
      summary: [
        { label: 'অংশগ্রহণ', value: `${bn(ranked.length + absent.length)} জন` },
        { label: 'জমা দিয়েছে', value: `${bn(ranked.length)} জন` },
        { label: 'অনুপস্থিত', value: `${bn(absent.length)} জন` },
        { label: 'গড় নম্বর', value: scores.length ? `${bn((scores.reduce((sum, value) => sum + value, 0) / scores.length).toFixed(1))} / ${bn(max)}` : '—' }
      ]
    };
  }
  const activity = teachingResultExams().find(item => item.id === key.slice(9));
  if (!activity) return null;
  const entries = Object.entries(activity.progress)
    .map(([studentId, entry]) => ({ studentId, score: Number(entry?.value) }))
    .filter(entry => Number.isFinite(entry.score) && (classFilter === 'all' || (state.students.find(s => s.id === entry.studentId)?.className || activity.className) === classFilter))
    .sort((a, b) => b.score - a.score);
  const rows = entries.map((entry, index) => {
    const student = state.students.find(item => item.id === entry.studentId);
    const percent = activity.totalMarks ? entry.score / activity.totalMarks * 100 : 0;
    const grade = percent < 33 ? 'F' : percent >= 80 ? 'A+' : percent >= 70 ? 'A' : percent >= 60 ? 'A−' : percent >= 50 ? 'B' : percent >= 40 ? 'C' : 'D';
    return [bn(index + 1), `${student ? student.name : entry.studentId} (${entry.studentId})`, `${activity.className} • ${student?.group || '—'}`, `${bn(entry.score)} / ${bn(activity.totalMarks)}`, grade, 'জমা দিয়েছে'];
  });
  const scores = entries.map(entry => entry.score);
  return {
    title: 'ফলাফল রিপোর্ট',
    subtitle: `${activity.title} • ${activity.subject} • ${activity.className} • পূর্ণমান ${bn(activity.totalMarks)}`,
    period: displayDate(activity.date),
    columns,
    rows,
    summary: [
      { label: 'মূল্যায়িত', value: `${bn(entries.length)} জন` },
      { label: 'গড় নম্বর', value: scores.length ? `${bn((scores.reduce((sum, value) => sum + value, 0) / scores.length).toFixed(1))} / ${bn(activity.totalMarks)}` : '—' },
      { label: 'সর্বোচ্চ', value: scores.length ? `${bn(Math.max(...scores))} / ${bn(activity.totalMarks)}` : '—' }
    ]
  };
}

function selectedAttendanceReport() {
  const id = $('#attendanceSessionSelect')?.value || '';
  if (!id) return null;
  const session = attendanceSessions().find(item => item.id === id);
  if (!session) return null;
  const statusOrder = { present: 0, late: 1, absent: 2 };
  const entries = Object.entries(session.progress)
    .map(([studentId, entry]) => ({ studentId, value: entry?.value, student: state.students.find(item => item.id === studentId) }))
    .sort((a, b) => (statusOrder[a.value] ?? 9) - (statusOrder[b.value] ?? 9)
      || String(a.student?.id || a.studentId).localeCompare(String(b.student?.id || b.studentId)));
  const rows = entries.map(entry => [
    `${entry.student ? entry.student.name : entry.studentId} (${entry.studentId})`,
    entry.student ? `${entry.student.className} • ${entry.student.group || '—'}` : session.className,
    PROGRESS_LABELS[entry.value] || entry.value || '—'
  ]);
  const counts = { present: 0, late: 0, absent: 0 };
  for (const entry of entries) if (entry.value && entry.value in counts) counts[entry.value]++;
  const total = entries.length;
  const rate = total ? Math.round((counts.present + counts.late) / total * 100) : 0;
  return {
    title: 'উপস্থিতি-অনুপস্থিতি রিপোর্ট',
    subtitle: `${session.title} • ${session.subject} • ${session.className}${session.group ? ` • ${session.group}` : ''}`,
    period: `${displayDate(session.date)} • সময়: ${bn(session.time)}${session.room ? ` • ${session.room}` : ''}`,
    columns: [
      { label: 'শিক্ষার্থী', width: 1.7 },
      { label: 'শ্রেণি/বিভাগ', width: 1.5 },
      { label: 'উপস্থিতি', width: 1.2 }
    ],
    rows,
    summary: [
      { label: 'উপস্থিত', value: `${bn(counts.present)} জন` },
      { label: 'অনুপস্থিত', value: `${bn(counts.absent)} জন` },
      { label: 'দেরিতে', value: `${bn(counts.late)} জন` },
      { label: 'উপস্থিতির হার', value: `${bn(rate)}%` }
    ]
  };
}

function renderAcademicReports() {
  populateAcademicReportSelectors();
  const meta = (key, text) => { const el = $(`#reportMeta-${key}`); if (el) el.textContent = text; };
  const classStudents = classReportStudents();
  const classDue = classStudents.reduce((sum, student) => sum + studentFeeSummary(student, state.transactions).due, 0);
  const avgAttendance = classStudents.length
    ? Math.round(classStudents.reduce((sum, student) => sum + Number(student.attendance || 0), 0) / classStudents.length)
    : 0;
  const classLabel = $('#classReportClass')?.value || 'all';
  meta('class', `${bn(classStudents.length)} জন • বকেয়া ৳${bn(classDue.toLocaleString('en-US'))} • গড় উপস্থিতি ${bn(avgAttendance)}% (${classLabel === 'all' ? 'সব শ্রেণি' : classLabel})`);

  const examSelect = $('#resultExamSelect');
  if (!examSelect || examSelect.options.length <= 1) meta('results', 'এখনও কোনো প্রকাশিত পরীক্ষার ফলাফল নেই।');
  else if (!examSelect.value) meta('results', 'ফলাফল দেখতে পরীক্ষা নির্বাচন করুন।');
  else {
    const results = selectedResultReport();
    const submitted = results?.summary.find(item => item.label === 'জমা দিয়েছে')?.value
      || results?.summary.find(item => item.label === 'মূল্যায়িত')?.value || '—';
    const absent = results?.summary.find(item => item.label === 'অনুপস্থিত')?.value || '০ জন';
    meta('results', `জমা ${submitted} • অনুপস্থিত ${absent}`);
  }

  const sessionSelect = $('#attendanceSessionSelect');
  if (!sessionSelect || sessionSelect.options.length <= 1) meta('attendance', 'এখনও কোনো ক্লাস সেশনে উপস্থিতি নেওয়া হয়নি (শিক্ষক প্যানেলে উপস্থিতি দিলে এখানে দেখা যাবে)।');
  else if (!sessionSelect.value) meta('attendance', 'উপস্থিতি দেখতে ক্লাস সেশন নির্বাচন করুন।');
  else {
    const attendance = selectedAttendanceReport();
    const present = attendance?.summary.find(item => item.label === 'উপস্থিত')?.value || '—';
    const absent = attendance?.summary.find(item => item.label === 'অনুপস্থিত')?.value || '—';
    const rate = attendance?.summary.find(item => item.label === 'উপস্থিতির হার')?.value || '—';
    meta('attendance', `উপস্থিত ${present} • অনুপস্থিত ${absent} • হার ${rate}`);
  }
}

async function loadAcademicData() {
  const [examResult, teachingResult] = await Promise.allSettled([examRepository.list(), teachingRepository.list()]);
  state.examDb = examResult.status === 'fulfilled' ? examResult.value : null;
  state.teachingDb = teachingResult.status === 'fulfilled' ? teachingResult.value : null;
  renderAcademicReports();
}

const reportFileStamps = () => new Date().toISOString().slice(0, 10);

async function handleReportDownload(button) {
  const key = button.dataset.reportPdf || button.dataset.reportCsv;
  const format = button.dataset.reportPdf ? 'pdf' : 'csv';
  if (!key || button.disabled) return;
  const data = reportDataSets()[key];
  if (!data) {
    toast('আগে প্রয়োজনীয় পরীক্ষা বা সেশন নির্বাচন করুন।');
    return;
  }
  if (!data.rows.length) {
    toast('এই রিপোর্টে দেখানোর মতো কোনো তথ্য নেই।');
    return;
  }
  const label = button.textContent;
  button.disabled = true;
  button.textContent = format === 'pdf' ? 'তৈরি হচ্ছে…' : 'সাজানো হচ্ছে…';
  button.setAttribute('aria-busy', 'true');
  try {
    const data = reportDataSets()[key];
    const filename = `APC-${key}-report-${reportFileStamps()}.${format === 'pdf' ? 'pdf' : 'csv'}`;
    if (format === 'pdf') await downloadReportPDF(filename, data);
    else downloadCSV(filename, data.columns, data.rows);
    toast(`${button.closest('.admin-card')?.querySelector('h2')?.textContent || 'রিপোর্ট'} ডাউনলোড হয়েছে`);
  } catch {
    toast('রিপোর্ট ডাউনলোড হয়নি। আবার চেষ্টা করুন।');
  } finally {
    button.disabled = false;
    button.textContent = label;
    button.removeAttribute('aria-busy');
  }
}

async function collectFee(event) {
  event.preventDefault();
  const form = event.currentTarget;
  if (state.savingFee || !state.financeReady || form.hidden) return;
  if (!form.reportValidity()) return;
  const student = state.students.find(s => s.id === $('#feeStudent').value && s.id === state.feeStudentId);
  const amount = Number($('#feeAmount').value);
  const feeType = $('#feeType').value;
  const method = $('#feeMethod').value;
  if (!student || !Number.isSafeInteger(amount) || amount <= 0 || amount > 10000000 || !feeCategories.includes(feeType) || !paymentMethods.includes(method) || !$('#feeMonth').value) {
    toast('শিক্ষার্থী ও পেমেন্টের তথ্য সঠিকভাবে পূরণ করুন');
    return;
  }
  const now = new Date();
  const token = crypto.randomUUID();
  const prefix = `${String(now.getFullYear()).slice(-2)}${String(now.getMonth() + 1).padStart(2, '0')}`;
  const tx = stampTransaction({
    id: `TRX-${token}`,
    receiptNo: `REC-${prefix}-${now.getTime().toString(36).toUpperCase()}-${token.slice(0, 8).toUpperCase()}`,
    studentId: student.id,
    studentName: student.name,
    className: student.className,
    feeType,
    month: $('#feeMonth').value,
    amount,
    method,
    trxRef: $('#feeTrxId').value.trim(),
    date: dateLabel(now),
    collectedBy: 'এডমিন',
    note: $('#feeNote').value.trim()
  }, now);
  state.savingFee = true;
  form.setAttribute('aria-busy', 'true');
  $('#feeSaveError').hidden = true;
  const controls = [...form.querySelectorAll('input, select, button')];
  controls.forEach(control => { control.disabled = true; });
  $('#feeSaveButton').textContent = 'সংরক্ষণ হচ্ছে…';
  $('#feeStudentSearch').disabled = true;
  renderFeeProfile();
  try {
    // Only update the UI and issue a receipt after durable storage succeeds.
    state.transactions = await financeRepository.saveTransaction(tx);
  } catch {
    $('#feeSaveError').textContent = 'পেমেন্ট সংরক্ষণ হয়নি। ব্রাউজারের স্টোরেজ/খালি জায়গা পরীক্ষা করে আবার চেষ্টা করুন।';
    $('#feeSaveError').hidden = false;
    return;
  } finally {
    state.savingFee = false;
    form.removeAttribute('aria-busy');
    controls.forEach(control => { control.disabled = false; });
    $('#feeSaveButton').textContent = 'ফি গ্রহণ ও রসিদ তৈরি করুন';
    $('#feeStudentSearch').disabled = false;
    renderFeeProfile();
  }
  form.reset();
  form.hidden = true;
  renderFinance();
  toast(`${student.name}-এর ৳${bn(amount)} ফি সফলভাবে জমা নেওয়া হয়েছে`);
  openReceiptModal(tx);
}

async function saveReceiptFile(tx, button) {
  if (button.disabled) return;
  const label = button.textContent;
  button.disabled = true;
  button.textContent = 'ডাউনলোড তৈরি হচ্ছে…';
  button.setAttribute('aria-busy', 'true');
  try { await downloadReceipt(tx); }
  catch { toast('রসিদ ডাউনলোড হয়নি। আবার ডাউনলোড বাটনে চাপ দিন।'); }
  finally {
    button.disabled = false;
    button.textContent = label;
    button.removeAttribute('aria-busy');
  }
}

function openReceiptModal(tx) {
  openModal('মানি রসিদ', `রসিদ নং: ${tx.receiptNo || tx.id}`, `
    <div class="modal-actions receipt-actions">
      <button class="admin-btn primary" type="button" data-modal-action="download-receipt">রসিদ ডাউনলোড</button>
      <button class="admin-btn ghost" type="button" data-modal-action="close">বন্ধ করুন</button>
    </div>
    <p class="receipt-download-hint">এক চাপেই লোগোসহ রসিদ PDF ফাইলে ডাউনলোড করুন।</p>
    ${receiptMarkup(tx)}`);
  $('#adminModalBody [data-modal-action="download-receipt"]').addEventListener('click', event => saveReceiptFile(tx, event.currentTarget));
  $('#adminModalBody [data-modal-action="close"]').addEventListener('click', closeModal);
}

function renderFinance() {
  renderFinanceStats();
  renderFeeSearch();
  renderFeeProfile();
  renderRecentTransactions();
  renderStudentLedger();
  renderReportGenerator();
  renderReportCards();
  renderAcademicReports();
}

/* ---------- Student App Management ---------- */

/* Teacher registration control: on/off switch + current teacher list. */
function routineTeacherNames() {
  return [...new Set(Object.values(state.routine).flatMap(info => info.classes.map(cls => cls.teacher).filter(Boolean)))];
}

function renderTeacherRegistrationControl(cfg = state.appConfig || loadAppConfig()) {
  const allowed = cfg.allowTeacherRegistration !== false;
  if ($('#cfgTeacherRegistration')) $('#cfgTeacherRegistration').checked = allowed;
  if ($('#teacherRegBadge')) {
    $('#teacherRegBadge').textContent = allowed ? 'খোলা আছে' : 'বন্ধ আছে';
    $('#teacherRegBadge').className = `badge ${allowed ? 'badge-approved' : 'badge-rejected'}`;
  }
  if ($('#teacherRegList')) {
    const teachers = routineTeacherNames();
    $('#teacherRegList').innerHTML = teachers.length
      ? teachers.map(teacher => `<span class="teacher-chip">${escapeHtml(teacher)}</span>`).join('')
      : '<span class="finance-hint">রুটিনে এখনও কোনো শিক্ষক যোগ করা হয়নি।</span>';
  }
}

function renderAppManagement() {
  const cfg = state.appConfig || loadAppConfig();

  // Status & Access
  if ($('#cfgMaintenanceMode')) $('#cfgMaintenanceMode').checked = !!cfg.maintenanceMode;
  if ($('#cfgMaintenanceMsg')) $('#cfgMaintenanceMsg').value = cfg.maintenanceMessage || '';
  if ($('#cfgAllowRegistration')) $('#cfgAllowRegistration').checked = cfg.allowRegistration !== false;
  if ($('#cfgSkipSecurity')) $('#cfgSkipSecurity').checked = cfg.skipSecurityCheck !== false;
  renderTeacherRegistrationControl(cfg);
  if ($('#appStatusLiveBadge')) {
    $('#appStatusLiveBadge').textContent = cfg.maintenanceMode ? '🔴 রক্ষণাবেক্ষণ মোড' : '🟢 অ্যাপ লাইভ';
    $('#appStatusLiveBadge').className = `badge ${cfg.maintenanceMode ? 'badge-rejected' : 'badge-approved'}`;
  }

  // Broadcast
  if ($('#cfgBroadcastAlert')) $('#cfgBroadcastAlert').checked = cfg.broadcastAlert !== false;
  if ($('#cfgBroadcastMsg')) $('#cfgBroadcastMsg').value = cfg.broadcastMessage || '';
  if ($('#cfgBroadcastTone')) $('#cfgBroadcastTone').value = cfg.broadcastTone || 'green';
  if ($('#cfgBroadcastBadge')) {
    $('#cfgBroadcastBadge').textContent = cfg.broadcastAlert !== false ? 'সক্রিয়' : 'নিষ্ক্রিয়';
    $('#cfgBroadcastBadge').className = `badge ${cfg.broadcastAlert !== false ? 'badge-approved' : 'badge-pending'}`;
  }

  // Modules
  if ($('#cfgModRoutine')) $('#cfgModRoutine').checked = cfg.modules?.routine !== false;
  if ($('#cfgModCourses')) $('#cfgModCourses').checked = cfg.modules?.courses !== false;
  if ($('#cfgModResults')) $('#cfgModResults').checked = cfg.modules?.results !== false;
  if ($('#cfgModInstall')) $('#cfgModInstall').checked = cfg.modules?.installPrompt !== false;

  // Branding & Contacts
  if ($('#cfgTagline')) $('#cfgTagline').value = cfg.tagline || 'শিখতে থাকো, এগিয়ে যাও';
  if ($('#cfgHelpline')) $('#cfgHelpline').value = cfg.helplineMobile || ADMIN_ID || '01819486966';
  if ($('#cfgWhatsapp')) $('#cfgWhatsapp').value = cfg.whatsappNumber || ADMIN_ID || '01819486966';
  if ($('#cfgEmail')) $('#cfgEmail').value = cfg.officialEmail || 'activeplus.coaching@gmail.com';
  if ($('#cfgAddress')) $('#cfgAddress').value = cfg.campusAddress || 'দিনাজপুর সদর, দিনাজপুর';

  // Theme Mode
  if ($('#cfgThemeMode')) $('#cfgThemeMode').value = cfg.themeMode || 'auto';
}

function saveAppSettingsFromForm() {
  const maintenanceMode = $('#cfgMaintenanceMode')?.checked || false;
  const maintenanceMessage = $('#cfgMaintenanceMsg')?.value.trim() || DEFAULT_APP_SETTINGS.maintenanceMessage;
  const allowRegistration = $('#cfgAllowRegistration')?.checked !== false;
  const allowTeacherRegistration = $('#cfgTeacherRegistration')?.checked !== false;
  const skipSecurityCheck = $('#cfgSkipSecurity')?.checked !== false;

  const broadcastAlert = $('#cfgBroadcastAlert')?.checked !== false;
  const broadcastMessage = $('#cfgBroadcastMsg')?.value.trim() || DEFAULT_APP_SETTINGS.broadcastMessage;
  const broadcastTone = $('#cfgBroadcastTone')?.value || 'green';

  const routine = $('#cfgModRoutine')?.checked !== false;
  const courses = $('#cfgModCourses')?.checked !== false;
  const results = $('#cfgModResults')?.checked !== false;
  const installPrompt = $('#cfgModInstall')?.checked !== false;

  const tagline = $('#cfgTagline')?.value.trim() || DEFAULT_APP_SETTINGS.tagline;
  const helplineMobile = $('#cfgHelpline')?.value.trim() || DEFAULT_APP_SETTINGS.helplineMobile;
  const whatsappNumber = $('#cfgWhatsapp')?.value.trim() || DEFAULT_APP_SETTINGS.whatsappNumber;
  const officialEmail = $('#cfgEmail')?.value.trim() || DEFAULT_APP_SETTINGS.officialEmail;
  const campusAddress = $('#cfgAddress')?.value.trim() || DEFAULT_APP_SETTINGS.campusAddress;

  const themeMode = $('#cfgThemeMode')?.value || 'auto';

  state.appConfig = {
    maintenanceMode,
    maintenanceMessage,
    allowRegistration,
    allowTeacherRegistration,
    skipSecurityCheck,
    broadcastAlert,
    broadcastMessage,
    broadcastTone,
    tagline,
    helplineMobile,
    whatsappNumber,
    officialEmail,
    campusAddress,
    themeMode,
    modules: {
      routine,
      courses,
      results,
      installPrompt
    }
  };

  saveAppConfig(state.appConfig);
  renderAppManagement();
  renderDashboard();
  toast(allowTeacherRegistration
    ? 'সেটিংস সংরক্ষিত — শিক্ষক রেজিস্ট্রেশন ও প্যানেল প্রবেশ খোলা আছে'
    : 'সেটিংস সংরক্ষিত — শিক্ষক রেজিস্ট্রেশন ও প্যানেল প্রবেশ বন্ধ করা হয়েছে');
}

function resetAppSettingsToDefault() {
  state.appConfig = {
    ...DEFAULT_APP_SETTINGS,
    modules: { ...DEFAULT_APP_SETTINGS.modules }
  };
  saveAppConfig(state.appConfig);
  renderAppManagement();
  renderDashboard();
  toast('শিক্ষার্থী অ্যাপের ডিফল্ট সেটিংস সফলভাবে প্রয়োগ করা হয়েছে');
}

/* ---------- Render everything ---------- */

function renderAll() {
  renderDashboard();
  renderStudents();
  renderNotices();
  renderRoutine();
  renderClasses();
  renderFinance();
  renderAppManagement();
}

/* ---------- Wiring ---------- */

$('#btnSaveAppSettings')?.addEventListener('click', saveAppSettingsFromForm);
$('#btnSaveTopAppSettings')?.addEventListener('click', saveAppSettingsFromForm);
$('#btnResetAppSettings')?.addEventListener('click', resetAppSettingsToDefault);

$('#cfgMaintenanceMode')?.addEventListener('change', event => {
  const isMaint = event.target.checked;
  if ($('#appStatusLiveBadge')) {
    $('#appStatusLiveBadge').textContent = isMaint ? '🔴 রক্ষণাবেক্ষণ মোড' : '🟢 অ্যাপ লাইভ';
    $('#appStatusLiveBadge').className = `badge ${isMaint ? 'badge-rejected' : 'badge-approved'}`;
  }
});

$('#cfgBroadcastAlert')?.addEventListener('change', event => {
  const isAlert = event.target.checked;
  if ($('#cfgBroadcastBadge')) {
    $('#cfgBroadcastBadge').textContent = isAlert ? 'সক্রিয়' : 'নিষ্ক্রিয়';
    $('#cfgBroadcastBadge').className = `badge ${isAlert ? 'badge-approved' : 'badge-pending'}`;
  }
});

$('#cfgTeacherRegistration')?.addEventListener('change', event => {
  renderTeacherRegistrationControl({ ...loadAppConfig(), allowTeacherRegistration: event.target.checked });
});

$('#adminLoginForm')?.addEventListener('submit', event => {
  event.preventDefault();
  const username = $('#adminLoginUser')?.value || '';
  const password = $('#adminLoginPin')?.value || '';
  if (!verifyStaffCredentials('admin', username, password)) {
    const box = $('#adminLoginError');
    if (box) {
      box.textContent = 'ইউজারনেম বা পাসওয়ার্ড সঠিক নয়।';
      box.hidden = false;
    }
    return;
  }
  const box = $('#adminLoginError');
  if (box) box.hidden = true;
  saveStaffSession('admin', $('#rememberAdmin')?.checked !== false);
  enterPanel();
});
$('#adminExitButton')?.addEventListener('click', exitPanel);
$$('[data-toggle-pin]').forEach(button => {
  button.addEventListener('click', () => {
    const input = $(`#${button.dataset.togglePin}`);
    if (!input) return;
    input.type = input.type === 'password' ? 'text' : 'password';
  });
});

$$('.admin-bottom-item').forEach(item => {
  item.addEventListener('click', () => setView(item.dataset.adminView));
});

$$('[data-admin-view]').forEach(button => {
  if (button.classList.contains('admin-bottom-item')) return;
  button.addEventListener('click', () => {
    if (button.dataset.studentScope === 'pending') {
      state.filter = 'pending';
      state.query = '';
      state.classFilter = 'all';
      $('#studentSearch').value = '';
      const classSelect = $('#studentClassFilter');
      if (classSelect) classSelect.value = 'all';
      $$('#studentFilterChips .chip').forEach(chip => chip.classList.toggle('active', chip.dataset.studentFilter === 'pending'));
      renderStudents();
    }
    setView(button.dataset.adminView);
    if (button.matches('.admin-more-item, .admin-more-back')) {
      const heading = $('.admin-view.active h1');
      heading?.setAttribute('tabindex', '-1');
      heading?.focus({ preventScroll: true });
    }
  });
});

$('#dashCollectFee').addEventListener('click', () => {
  setView('finance');
  setFinanceTab('collection');
  $('#feeStudentSearch').focus({ preventScroll: true });
});

$('#studentSearch').addEventListener('input', event => {
  state.query = event.target.value;
  renderStudents();
});

$('#studentSearchClear')?.addEventListener('click', () => {
  const input = $('#studentSearch');
  if (input) {
    input.value = '';
    state.query = '';
    renderStudents();
    input.focus();
  }
});

$('#studentFilterChips').addEventListener('click', event => {
  const chip = event.target.closest('[data-student-filter]');
  if (!chip) return;
  state.filter = chip.dataset.studentFilter;
  $$('#studentFilterChips .chip').forEach(item => item.classList.toggle('active', item === chip));
  renderStudents();
});

/* Class filter keeps student management simple: pick a class, see only that class. */
const studentClassFilter = $('#studentClassFilter');
if (studentClassFilter) {
  studentClassFilter.innerHTML = '<option value="all">সব শ্রেণির শিক্ষার্থী</option>' +
    enabledClasses.map(className => `<option value="${escapeHtml(className)}">${escapeHtml(className)}</option>`).join('');
  studentClassFilter.addEventListener('change', () => {
    state.classFilter = studentClassFilter.value;
    renderStudents();
  });
}

const studentAction = event => {
  const button = event.target.closest('[data-action]');
  if (!button) return;
  const { action, id } = button.dataset;
  const student = findStudent(id);
  if (!student) return;
  if (action === 'approve') {
    setStatus(id, 'approved', `${student.name} অনুমোদিত হয়েছে — এখন শিক্ষার্থী অ্যাপ ব্যবহার করতে পারবে`);
  } else if (action === 'reject') {
    setStatus(id, 'rejected', `${student.name} এর অনুরোধ বাতিল করা হয়েছে`);
  } else if (action === 'view') {
    openStudentDetail(student);
  } else if (action === 'edit') {
    openStudentEdit(student);
  } else if (action === 'reset-pin') {
    openPinReset(student);
  }
};
$('#studentList').addEventListener('click', studentAction);

$('#noticeForm').addEventListener('submit', publishNotice);
$('#noticeList').addEventListener('click', event => {
  const button = event.target.closest('[data-action="delete-notice"]');
  if (!button) return;
  state.notices = state.notices.filter(notice => notice.id !== button.dataset.id);
  persistNotices();
  renderNotices();
  renderDashboard();
  toast('নোটিশ মুছে ফেলা হয়েছে');
});

$('#routineDayTabs').addEventListener('click', event => {
  const tab = event.target.closest('[data-routine-day]');
  if (!tab) return;
  state.activeDay = tab.dataset.routineDay;
  renderRoutine();
});

$('#addRoutineForm').addEventListener('submit', addRoutineClass);

$('#routineList').addEventListener('click', event => {
  const button = event.target.closest('[data-action="delete-routine"]');
  if (!button) return;
  state.routine[state.activeDay].classes.splice(Number(button.dataset.index), 1);
  persistRoutine();
  renderRoutine();
  renderDashboard();
  toast('ক্লাসটি রুটিন থেকে মুছে ফেলা হয়েছে');
});

$('#classList').addEventListener('change', toggleClass);

/* ---------- Finance Wiring ---------- */

$('#financeSubNav')?.addEventListener('click', event => {
  const tab = event.target.closest('[data-finance-tab]');
  if (!tab) return;
  setFinanceTab(tab.dataset.financeTab);
});

$('#btnFinanceGoCollect')?.addEventListener('click', () => {
  setFinanceTab('collection');
  $('#feeStudentSearch')?.focus();
});

$('#btnFinanceGoReport')?.addEventListener('click', () => {
  setView('reports');
});

$('#feeCollectionForm')?.addEventListener('submit', collectFee);
$('#feeCollectionForm')?.addEventListener('click', event => {
  // Quick amount chips: full due, monthly fee, or a half payment.
  const chip = event.target.closest('[data-fee-quick]');
  if (!chip || state.savingFee || $('#feeCollectionForm').hidden) return;
  const student = state.students.find(s => s.id === $('#feeStudent').value);
  if (!student) return;
  const summary = studentFeeSummary(student, state.transactions);
  const base = summary.due > 0 ? summary.due : summary.monthlyFee;
  if (chip.dataset.feeQuick === 'due') $('#feeAmount').value = base || '';
  else if (chip.dataset.feeQuick === 'monthly') $('#feeAmount').value = summary.monthlyFee || '';
  else if (chip.dataset.feeQuick === 'half') $('#feeAmount').value = base ? Math.max(1, Math.round(base / 2)) : '';
});
$('#feeStudentSearch').addEventListener('input', () => {
  state.feeStudentId = null;
  $('#feeCollectionForm').hidden = true;
  $('#feeStudent').value = '';
  renderFeeSearch();
  renderFeeProfile();
});
$('#feeSearchResults').addEventListener('click', event => {
  const button = event.target.closest('[data-fee-student]');
  if (button) selectFeeStudent(button.dataset.feeStudent);
});
$('#feeQuickProfile').addEventListener('click', event => {
  if (event.target.closest('#feeProfileCollect')) beginFeePayment();
});


$('#ledgerFilterChips')?.addEventListener('click', event => {
  const chip = event.target.closest('[data-ledger-filter]');
  if (!chip) return;
  state.ledgerFilter = chip.dataset.ledgerFilter;
  $$('#ledgerFilterChips .chip').forEach(item => item.classList.toggle('active', item === chip));
  renderStudentLedger();
});

$('#ledgerSearch')?.addEventListener('input', renderStudentLedger);

['reportMonth', 'reportClass', 'reportFeeType', 'reportMethod'].forEach(id => {
  const el = document.getElementById(id);
  if (!el) return;
  el.addEventListener('change', () => {
    state.reportFilters.month = $('#reportMonth').value;
    state.reportFilters.className = $('#reportClass').value;
    state.reportFilters.feeType = $('#reportFeeType').value;
    state.reportFilters.method = $('#reportMethod').value;
    renderReportGenerator();
  });
});

function resetReportFilters() {
  state.reportFilters.month = monthLabel();
  state.reportFilters.className = 'all';
  state.reportFilters.feeType = 'all';
  state.reportFilters.method = 'all';
  state.reportFilters.listLimit = REPORT_LIST_PAGE;
  $('#reportMonth').value = state.reportFilters.month;
  $('#reportClass').value = 'all';
  $('#reportFeeType').value = 'all';
  $('#reportMethod').value = 'all';
  renderReportGenerator();
}

$('#reportFiltersReset')?.addEventListener('click', resetReportFilters);
$('#reportListMore')?.addEventListener('click', () => {
  state.reportFilters.listLimit += REPORT_LIST_PAGE;
  renderReportGenerator();
});

/* Report Center downloads (PDF + CSV) and class report → student list shortcut */
$('.admin-view[data-view-panel="reports"]')?.addEventListener('click', event => {
  const button = event.target.closest('[data-report-pdf], [data-report-csv]');
  if (button) {
    handleReportDownload(button);
    return;
  }
  if (event.target.closest('[data-action="open-class-students"]')) {
    // Jump to student management pre-filtered by the selected class/group search.
    const className = $('#classReportClass')?.value || 'all';
    const group = $('#classReportGroup')?.value || 'all';
    state.classFilter = className;
    state.query = group === 'all' ? '' : group;
    $('#studentSearch').value = state.query;
    const classSelect = $('#studentClassFilter');
    if (classSelect) classSelect.value = className;
    state.filter = 'all';
    $$('#studentFilterChips .chip').forEach(chip => chip.classList.toggle('active', chip.dataset.studentFilter === 'all'));
    renderStudents();
    setView('students');
  }
});

['classReportClass', 'classReportGroup', 'resultExamSelect', 'resultClassFilter', 'attendanceSessionSelect'].forEach(id => {
  document.getElementById(id)?.addEventListener('change', renderAcademicReports);
});

const handleFinanceClick = event => {
  const button = event.target.closest('[data-action]');
  if (!button) return;
  const { action, trxId, id } = button.dataset;

  if (action === 'view-receipt') {
    const tx = state.transactions.find(t => t.id === trxId);
    if (tx) openReceiptModal(tx);
  } else if (action === 'download-receipt') {
    const tx = state.transactions.find(t => t.id === trxId);
    if (tx) saveReceiptFile(tx, button);
  } else if (action === 'quick-collect') {
    setFinanceTab('collection');
    $('#feeStudentSearch').value = id;
    selectFeeStudent(id);
  } else if (action === 'view-student-receipts') {
    const studentTxs = newestTransactions(state.transactions.filter(t => t.studentId === id));
    if (studentTxs.length) {
      openReceiptModal(studentTxs[0]);
    } else {
      toast('এই শিক্ষার্থীর কোনো রসিদ পাওয়া যায়নি');
    }
  }
};
$('#recentTrxList')?.addEventListener('click', handleFinanceClick);
$('#studentLedgerList')?.addEventListener('click', handleFinanceClick);
$('#reportCollectionList')?.addEventListener('click', handleFinanceClick);

$('#adminModalClose').addEventListener('click', closeModal);
$('#adminModalBackdrop').addEventListener('click', event => {
  if (event.target === event.currentTarget) closeModal();
});
document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && !$('#adminModalBackdrop').hidden) closeModal();
});

// Trap modal keyboard focus while retaining the shared Escape/backdrop behavior.
document.addEventListener('keydown', event => {
  if (event.key !== 'Tab' || $('#adminModalBackdrop').hidden) return;
  const items = [...$('#adminModalBackdrop').querySelectorAll('button:not(:disabled), input:not(:disabled), select:not(:disabled), a[href], [tabindex="0"]')].filter(el => el.getClientRects().length);
  const first = items[0], last = items.at(-1);
  if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
  if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
});
$('#feeMonth').innerHTML = '';
populateFinanceMonths();
loadFinanceTransactions();
loadAcademicData();
window.addEventListener('storage', event => {
  if (!state.savingFee && (event.key === TRANSACTIONS_KEY || event.key === null)) loadFinanceTransactions();
  if (event.key === EXAM_KEY || event.key === TEACHING_KEY) loadAcademicData();
});

if (hasStaffSession('admin')) enterPanel();
