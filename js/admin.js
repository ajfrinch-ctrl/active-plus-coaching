import { prepareDemoData } from './demo-data.js';
import { initDemoForms } from './demo-forms.js';
/* One-click dummy Admin Panel for Active Plus Coaching.
   No password, no PIN: a single tap on the entry button opens the panel.
   Student data is local demo data; finance transactions persist through
   financeRepository, which can be replaced by an asynchronous API adapter. */
import { enabledClasses, schedule, DEFAULT_APP_SETTINGS, ADMIN_ID, DEFAULT_PIN } from './config.js';
import { toBanglaNumber } from './ui.js';
import { adminStudents, adminNotices, classEnrollment, classCodes, dayNames, feeCategories, paymentMethods } from './admin-data.js';
import { loadAppConfig, saveAppConfig, loadAccount, saveAccount } from './storage.js';
import { financeRepository, monthLabel, dateLabel, searchStudents, studentFeeSummary, newestTransactions, TRANSACTIONS_KEY } from './finance-data.js';
import { receiptMarkup, downloadReceipt } from './finance-receipt.js';
import { initExamManager } from './exam-manager.js';
import { registerServiceWorker } from './service-worker.js';
import { initFixedShell } from './fixed-shell.js';

const demoWarnings = await prepareDemoData();
initFixedShell();
registerServiceWorker();
initExamManager('#adminExamWorkspace', 'admin');

const bn = toBanglaNumber;
const $ = selector => document.querySelector(selector);
const $$ = selector => Array.from(document.querySelectorAll(selector));

const state = {
  students: adminStudents.map(student => ({ ...student })),
  notices: adminNotices.map(notice => ({ ...notice })),
  transactions: [],
  routine: Object.fromEntries(
    Object.entries(schedule).map(([day, info]) => [
      day,
      {
        ...info,
        classes: info.classes.map((cls, idx) => ({
          id: cls.id || `RTN-${day.toUpperCase()}-${String(idx + 1).padStart(2, '0')}`,
          ...cls
        }))
      }
    ])
  ),
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
    method: 'all'
  },
  filter: 'all',
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

/* ---------- One-click entry ---------- */

function enterPanel() {
  $('#adminEntry').hidden = true;
  $('#adminShell').hidden = false;
  renderAll();
  setView(state.activeView);
  toast('এডমিন প্যানেলে সফলভাবে প্রবেশ করা হয়েছে');
}

function exitPanel() {
  $('#adminShell').hidden = true;
  $('#adminEntry').hidden = false;
  $('#adminEntry').scrollTo({ top: 0, behavior: 'instant' });
}

/* ---------- View switching ---------- */

const moreViews = new Set(['notices', 'app-management', 'classes', 'exams']);
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
  const totalEnrolled = classEnrollment.reduce((sum, entry) => sum + entry.count, 0);
  $('#dashStudentCount').textContent = bn(totalEnrolled);
  const pendingCount = pendingStudents().length;
  $('#dashPendingCount').textContent = bn(pendingCount);
  $('#dashPendingCount').classList.toggle('has-pending', pendingCount > 0);
  $('#dashClassCount').textContent = bn(state.enabled.size);
  const today = new Date();
  $('#adminTodayDate').textContent = dateLabel(today);
  $('#adminTodayDate').dateTime = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
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
      <article class="student-row">
        <span class="student-avatar" aria-hidden="true">${student.name.charAt(0)}</span>
        <div class="student-copy">
          <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;">
            <strong>${student.name}</strong>
            <span class="audit-id-badge">ID: ${student.id}</span>
          </div>
          <small>${student.className} • ${student.group}</small>
          <small class="student-mobile">📞 ${bn(student.mobile)}</small>
        </div>
        <div class="student-side">
          <span class="badge ${statusMeta[student.status].className}">${statusMeta[student.status].label}</span>
          <div class="student-actions">
            <button class="mini-btn" type="button" data-action="view" data-id="${student.id}">দেখুন</button>
            ${student.status === 'pending' ? `
              <button class="mini-btn approve" type="button" data-action="approve" data-id="${student.id}">অনুমোদন</button>
              <button class="mini-btn danger" type="button" data-action="reject" data-id="${student.id}">বাতিল</button>` : ''}
            <button class="mini-btn" type="button" data-action="reset-pin" data-id="${student.id}">PIN রিসেট</button>
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
  renderFeeProfile();
  renderFinanceStats();
  renderStudents();
  renderDashboard();
  toast(message);
}

/* ---------- Student detail and PIN reset modal ---------- */

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
        <button class="admin-btn ghost" type="button" data-modal-action="reset-pin">PIN রিসেট</button>
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
      }
      closeModal();
    });
  });
}

function openPinReset(student) {
  const account = loadAccount();
  const isLocal = account?.student?.id === student.id || account?.studentId === student.id;
  openModal(
    'অ্যাকাউন্ট নিরাপত্তা',
    `${student.name} — ডিফল্ট PIN`,
    `<p class="modal-copy">${isLocal ? 'নিশ্চিত করলে এই ব্রাউজারের অ্যাকাউন্টের PIN নিচের ডিফল্ট PIN হবে। নিবন্ধনের মোবাইল অপরিবর্তিত থাকবে।' : 'ডিফল্ট PIN নিচে দেওয়া আছে। এই শিক্ষার্থীর অ্যাকাউন্ট এই ব্রাউজারে নেই; এটি শুধু ডেমো, আসল PIN পরিবর্তন হবে না।'}</p>
      <div class="pin-box" aria-label="নতুন PIN">${bn(DEFAULT_PIN)}</div>
      <p id="pinResetError" class="finance-error" role="alert" hidden></p>
      <div class="modal-actions"><button class="admin-btn primary" type="button" data-modal-action="done">${isLocal ? 'রিসেট নিশ্চিত করুন' : 'বুঝেছি'}</button></div>`
  );
  $('#adminModalBody [data-modal-action="done"]').addEventListener('click', () => {
    if (isLocal) {
      const latest = loadAccount();
      if ((latest?.student?.id !== student.id && latest?.studentId !== student.id) || !saveAccount({ ...latest, pin: DEFAULT_PIN })) {
        $('#pinResetError').textContent = 'PIN সংরক্ষণ হয়নি। আবার চেষ্টা করুন।';
        $('#pinResetError').hidden = false;
        return;
      }
    }
    closeModal();
    toast(isLocal ? `${student.name} এর PIN রিসেট হয়েছে` : 'ডেমো ডিফল্ট PIN দেখানো হয়েছে');
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
  const noticeUniqueId = `NOT-2609-${String(state.notices.length + 1).padStart(3, '0')}`;
  state.notices.unshift({
    id: noticeUniqueId,
    title,
    body,
    audience,
    date: '২২ সেপ্টেম্বর ২০২৬'
  });
  event.target.reset();
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

function renderRoutine() {
  $('#routineDayTabs').innerHTML = Object.keys(state.routine).map(day => `
    <button class="day-tab ${day === state.activeDay ? 'active' : ''}" type="button" data-routine-day="${day}">
      ${dayNames[day]}<small>${bn(state.routine[day].classes.length)}</small>
    </button>`).join('');

  $('#addRoutineHeading').textContent = `নতুন ক্লাস যোগ করুন — ${dayNames[state.activeDay]}`;

  const classes = state.routine[state.activeDay].classes;
  $('#routineList').innerHTML = classes.length
    ? classes.map((cls, index) => `
      <div class="routine-row">
        <div class="routine-time"><strong>${cls.time}</strong><small>${cls.period}</small></div>
        <div class="routine-copy">
          <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;">
            <strong>${cls.subject}</strong>
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
  const subject = $('#routineSubject').value.trim();
  const teacher = $('#routineTeacher').value.trim();
  const room = $('#routineRoom').value.trim();
  const time = $('#routineTime').value;
  if (!subject || !teacher || !room || !time) {
    toast('বিষয়, শিক্ষক, রুম ও সময় দিন');
    return;
  }
  const { time: bengaliTime, period } = toBengaliTime(time);
  const classUniqueId = `RTN-${state.activeDay.toUpperCase()}-${String(state.routine[state.activeDay].classes.length + 1).padStart(2, '0')}`;
  state.routine[state.activeDay].classes.push({
    id: classUniqueId,
    time: bengaliTime,
    period,
    subject,
    teacher,
    room,
    tag: 'নতুন',
    tone: 'green'
  });
  event.target.reset();
  $('#routineTime').value = '18:00';
  renderRoutine();
  renderDashboard();
  toast(`${subject} [${classUniqueId}] রুটিনে যোগ হয়েছে`);
}

/* ---------- Classes ---------- */

function renderClasses() {
  $('#classesCount').textContent = `${bn(state.enabled.size)} / ${bn(enabledClasses.length)} চালু`;
  $('#classList').innerHTML = enabledClasses.map(className => {
    const entry = classEnrollment.find(item => item.className === className);
    const enabled = state.enabled.has(className);
    const code = classCodes[className] || 'CLS-GEN';
    return `
      <div class="class-row">
        <div class="class-copy">
          <div style="display:flex;align-items:center;gap:6px;">
            <strong>${className}</strong>
            <span class="audit-id-badge purple">${code}</span>
          </div>
          <small>${bn(entry ? entry.count : 0)} শিক্ষার্থী</small>
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
    renderFinance();
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
  $('#reportMonth').value = state.reportFilters.month;
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

  const filtered = studentsWithStatus.filter(s => {
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

function renderReportGenerator() {
  const { month, className, feeType, method } = state.reportFilters;
  const filtered = newestTransactions(state.transactions.filter(tx =>
    (month === 'all' || tx.month === month) &&
    (className === 'all' || tx.className === className) &&
    (feeType === 'all' || tx.feeType === feeType) &&
    (method === 'all' || (tx.method || '').includes(method))
  ));
  const total = filtered.reduce((sum, tx) => sum + Number(tx.amount || 0), 0);
  const money = value => `৳${bn(value.toLocaleString('en-US'))}`;
  $('#reportPeriod').textContent = month === 'all' ? 'সব সময়ের হিসাব' : month;
  $('#reportTrxCount').textContent = `${bn(filtered.length)} টি`;
  $('#reportGrandTotal').textContent = money(total);
  $('#reportAverage').textContent = money(filtered.length ? Math.round(total / filtered.length) : 0);
  $('#reportCollectionList').innerHTML = filtered.length ? filtered.map(tx => `
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
  const tx = {
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
  };
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
}

/* ---------- Student App Management ---------- */

function renderAppManagement() {
  const cfg = state.appConfig || loadAppConfig();

  // Status & Access
  if ($('#cfgMaintenanceMode')) $('#cfgMaintenanceMode').checked = !!cfg.maintenanceMode;
  if ($('#cfgMaintenanceMsg')) $('#cfgMaintenanceMsg').value = cfg.maintenanceMessage || '';
  if ($('#cfgAllowRegistration')) $('#cfgAllowRegistration').checked = cfg.allowRegistration !== false;
  if ($('#cfgSkipSecurity')) $('#cfgSkipSecurity').checked = cfg.skipSecurityCheck !== false;
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
  toast('শিক্ষার্থী অ্যাপের সকল কনফিগারেশন সফলভাবে সংরক্ষিত ও সক্রিয় করা হয়েছে');
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

$('#adminLoginForm')?.addEventListener('submit', event => {
  event.preventDefault();
  enterPanel();
});
$('#adminEnterButton')?.addEventListener('click', enterPanel);
$('#adminExitButton')?.addEventListener('click', exitPanel);

$('#adminLoginPin').value = DEFAULT_PIN;
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
      $('#studentSearch').value = '';
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
  setFinanceTab('reports');
});

$('#feeCollectionForm')?.addEventListener('submit', collectFee);
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
window.addEventListener('storage', event => {
  if (!state.savingFee && (event.key === TRANSACTIONS_KEY || event.key === null)) loadFinanceTransactions();
});

initDemoForms(demoWarnings);
