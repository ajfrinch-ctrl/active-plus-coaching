/* One-click dummy Admin Panel for Active Plus Coaching.
   No password, no PIN: a single tap on the entry button opens the panel.
   All data is local demo data from js/admin-data.js — future API work can
   replace the dataset without changing this UI. */
import { enabledClasses, schedule, DEFAULT_APP_SETTINGS, ADMIN_ID } from './config.js';
import { toBanglaNumber } from './ui.js';
import { adminStudents, adminNotices, classEnrollment, classCodes, dayNames, feeCategories, paymentMethods, initialTransactions } from './admin-data.js';
import { loadAppConfig, saveAppConfig } from './storage.js';

const bn = toBanglaNumber;
const $ = selector => document.querySelector(selector);
const $$ = selector => Array.from(document.querySelectorAll(selector));

const state = {
  students: adminStudents.map(student => ({ ...student })),
  notices: adminNotices.map(notice => ({ ...notice })),
  transactions: initialTransactions.map(tx => ({ ...tx })),
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
  ledgerFilter: 'all',
  reportFilters: {
    month: 'সেপ্টেম্বর ২০২৬',
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
  window.scrollTo(0, 0);
  toast('এডমিন প্যানেলে সফলভাবে প্রবেশ করা হয়েছে');
}

function exitPanel() {
  $('#adminShell').hidden = true;
  $('#adminEntry').hidden = false;
  window.scrollTo(0, 0);
}

/* ---------- View switching ---------- */

function setView(view) {
  state.activeView = view;
  $$('.admin-view').forEach(panel => panel.classList.toggle('active', panel.dataset.viewPanel === view));
  $$('.admin-nav-item, .admin-bottom-item').forEach(item =>
    item.classList.toggle('active', item.dataset.adminView === view)
  );
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

/* ---------- Dashboard ---------- */

function pendingStudents() {
  return state.students.filter(student => student.status === 'pending');
}

function renderDashboard() {
  const totalEnrolled = classEnrollment.reduce((sum, entry) => sum + entry.count, 0);
  $('#dashStudentCount').textContent = bn(totalEnrolled);
  $('#dashPendingCount').textContent = bn(pendingStudents().length);
  $('#dashClassCount').textContent = bn(state.enabled.size);
  $('#dashNoticeCount').textContent = bn(state.notices.length);
  $('#adminTodayDate').textContent = state.routine.sat.date;

  const pending = pendingStudents();
  $('#dashPendingCount').classList.toggle('has-pending', pending.length > 0);
  $('#dashPendingList').innerHTML = pending.length
    ? pending.map(student => `
      <div class="pending-row">
        <span class="student-avatar" aria-hidden="true">${student.name.charAt(0)}</span>
        <div class="pending-copy">
          <div style="display:flex;align-items:center;gap:5px;flex-wrap:wrap;">
            <strong>${student.name}</strong>
            <span class="audit-id-badge">ID: ${student.id}</span>
          </div>
          <small>${student.className} • ${student.group}</small>
        </div>
        <div class="pending-actions">
          <button class="mini-btn approve" type="button" data-action="approve" data-id="${student.id}">অনুমোদন</button>
          <button class="mini-btn danger" type="button" data-action="reject" data-id="${student.id}">বাতিল</button>
        </div>
      </div>`).join('')
    : '<p class="admin-empty">সব অনুরোধ সামলে নেওয়া হয়েছে — নতুন রেজিস্ট্রেশন এখানে দেখাবে।</p>';

  $('#dashTodayList').innerHTML = state.routine.sat.classes.length
    ? state.routine.sat.classes.map(cls => `
      <div class="today-row">
        <div class="today-time"><strong>${cls.time}</strong><small>${cls.period}</small></div>
        <div class="today-copy">
          <div style="display:flex;align-items:center;gap:5px;flex-wrap:wrap;">
            <strong>${cls.subject}</strong>
            <span class="audit-id-badge blue">${cls.id || 'RTN-SAT'}</span>
          </div>
          <small>${cls.teacher} • ${cls.room}</small>
        </div>
      </div>`).join('')
    : '<p class="admin-empty">আজ কোনো ক্লাস নেই।</p>';

  const cfg = state.appConfig || loadAppConfig();
  if ($('#dashAppLiveState')) {
    $('#dashAppLiveState').textContent = cfg.maintenanceMode ? '🔴 রক্ষণাবেক্ষণ মোড' : '🟢 লাইভ চালু';
  }
  if ($('#dashAppBroadcastState')) {
    $('#dashAppBroadcastState').textContent = cfg.broadcastAlert !== false ? 'সক্রিয়' : 'বন্ধ';
  }
  if ($('#dashAppRegState')) {
    $('#dashAppRegState').textContent = cfg.allowRegistration !== false ? 'অনুমোদিত' : 'স্থগিত';
  }
  if ($('#dashAppTaglineState')) {
    $('#dashAppTaglineState').textContent = cfg.tagline || 'শিখতে থাকো, এগিয়ে যাও';
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
  renderStudents();
  renderDashboard();
  updatePendingBadge();
  toast(message);
}

function updatePendingBadge() {
  const count = pendingStudents().length;
  const badge = $('#sidePendingBadge');
  badge.textContent = bn(count);
  badge.hidden = count === 0;
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
  const pin = String(1000 + Math.floor(Math.random() * 90000)).slice(0, 5);
  openModal(
    'অ্যাকাউন্ট নিরাপত্তা',
    `${student.name} — নতুন PIN`,
    `
      <p class="modal-copy">শিক্ষার্থীকে নিচের নতুন PIN জানিয়ে দিন। আগের PIN এখন আর কাজ করবে না (ডেমো)।</p>
      <div class="pin-box" aria-label="নতুন PIN">${bn(pin)}</div>
      <div class="modal-actions">
        <button class="admin-btn primary" type="button" data-modal-action="done">বুঝেছি</button>
      </div>`
  );
  $('#adminModalBody [data-modal-action="done"]')
    .addEventListener('click', () => {
      closeModal();
      toast(`${student.name} এর PIN রিসেট হয়েছে`);
    });
}

function openModal(kicker, title, bodyHtml) {
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

function renderFinanceStats() {
  const totalCollected = state.transactions.reduce((sum, tx) => sum + Number(tx.amount || 0), 0);
  const currentMonth = 'সেপ্টেম্বর ২০২৬';
  const monthCollected = state.transactions
    .filter(tx => (tx.month || '').includes('সেপ্টেম্বর'))
    .reduce((sum, tx) => sum + Number(tx.amount || 0), 0);

  const approvedStudents = state.students.filter(s => s.status === 'approved');
  const paidStudentIds = new Set(
    state.transactions
      .filter(tx => (tx.month || '').includes('সেপ্টেম্বর') && tx.feeType === 'মাসিক বেতন')
      .map(tx => tx.studentId)
  );
  const unpaidCount = approvedStudents.filter(s => !paidStudentIds.has(s.id)).length;
  const totalDue = unpaidCount * 1500;

  const totalEl = $('#financeTotalCollected');
  const monthEl = $('#financeMonthCollected');
  const dueEl = $('#financeTotalDue');
  const trxCountEl = $('#financeTrxCount');
  const badgeEl = $('#trxCountBadge');

  if (totalEl) totalEl.textContent = '৳' + bn(totalCollected.toLocaleString('en-US'));
  if (monthEl) monthEl.textContent = '৳' + bn(monthCollected.toLocaleString('en-US'));
  if (dueEl) dueEl.textContent = '৳' + bn(totalDue.toLocaleString('en-US'));
  if (trxCountEl) trxCountEl.textContent = bn(state.transactions.length) + ' টি';
  if (badgeEl) badgeEl.textContent = bn(state.transactions.length) + ' টি লেনদেন';
}

function populateStudentFeeSelect() {
  const select = $('#feeStudent');
  if (!select) return;
  const currentVal = select.value;
  select.innerHTML = '<option value="">শিক্ষার্থী সিলেক্ট করুন...</option>' +
    state.students.map(s => `
      <option value="${s.id}" data-name="${s.name}" data-class="${s.className}">
        ${s.name} — ${s.className} (${s.status === 'approved' ? 'অনুমোদিত' : 'অপেক্ষমাণ'})
      </option>`).join('');
  if (currentVal) select.value = currentVal;
}

function renderRecentTransactions() {
  const listEl = $('#recentTrxList');
  if (!listEl) return;

  listEl.innerHTML = state.transactions.length
    ? state.transactions.map(tx => `
      <div class="trx-item">
        <div class="trx-left">
          <span class="trx-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24"><use href="#icon-receipt"></use></svg>
          </span>
          <div class="trx-info">
            <strong>${tx.studentName}</strong>
            <small>${tx.className} • ${tx.feeType} (${tx.month}) • ${tx.method}</small>
          </div>
        </div>
        <div class="trx-right">
          <span class="trx-amount">৳${bn(Number(tx.amount).toLocaleString('en-US'))}</span>
          <span class="trx-date">${tx.date}</span>
          <button class="mini-btn" type="button" data-action="view-receipt" data-trx-id="${tx.id}">রসিদ</button>
        </div>
      </div>`).join('')
    : '<p class="admin-empty">এখনও কোনো ফি কালেকশন রেকর্ড নেই।</p>';
}

function renderStudentLedger() {
  const listEl = $('#studentLedgerList');
  if (!listEl) return;

  const septPayments = new Map();
  state.transactions
    .filter(tx => (tx.month || '').includes('সেপ্টেম্বর'))
    .forEach(tx => {
      septPayments.set(tx.studentId, (septPayments.get(tx.studentId) || 0) + Number(tx.amount));
    });

  const studentsWithStatus = state.students.map(student => {
    const paidAmount = septPayments.get(student.id) || 0;
    const monthlyFee = 1500;
    const isPaid = paidAmount >= monthlyFee;
    return {
      ...student,
      paidAmount,
      dueAmount: isPaid ? 0 : (monthlyFee - paidAmount),
      isPaid
    };
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
            সেপ্টেম্বর ২০২৬: ${student.isPaid ? 'পরিশোধিত (৳' + bn(student.paidAmount) + ')' : 'বকেয়া: ৳' + bn(student.dueAmount)}
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

function numberToBanglaWords(num) {
  const n = Math.floor(Number(num) || 0);
  if (n === 0) return 'কথায়: শূন্য টাকা মাত্র';

  const units = ['', 'এক', 'দুই', 'তিন', 'চার', 'পাঁচ', 'ছয়', 'সাত', 'আট', 'নয়', 'দশ',
    'এগারো', 'বারো', 'তেরো', 'চৌদ্দ', 'পনেরো', 'ষোলো', 'সতেরো', 'আঠারো', 'উনিশ', 'বিশ',
    'একুশ', 'বাইশ', 'তেইশ', 'চব্বিশ', 'পঁচিশ', 'ছাব্বিশ', 'সাতাশ', 'আটাশ', 'উনত্রিশ', 'ত্রিশ',
    'একত্রিশ', 'বত্রিশ', 'তেত্রিশ', 'চৌত্রিশ', 'পঁয়ত্রিশ', 'ছত্রিশ', 'সাঁইত্রিশ', 'আটত্রিশ', 'উনচল্লিশ', 'চল্লিশ',
    'একচল্লিশ', 'বিয়াল্লিশ', 'তেতাল্লিশ', 'চুয়াল্লিশ', 'পঁয়তাল্লিশ', 'ছেচল্লিশ', 'সাতচল্লিশ', 'আটচল্লিশ', 'উনপঞ্চাশ', 'পঞ্চাশ',
    'একান্ন', 'বায়ান্ন', 'তিপ্পান্ন', 'চুয়ান্ন', 'পঞ্চান্ন', 'ছাপ্পান্ন', 'সাতান্ন', 'আটান্ন', 'উনষাট', 'ষাট',
    'একষট্টি', 'বাষট্টি', 'তেষট্টি', 'চৌষট্টি', 'পঁয়ষট্টি', 'ছেষট্টি', 'সাতষট্টি', 'আটষট্টি', 'উনসত্তর', 'সত্তর',
    'একাত্তর', 'বাহাত্তর', 'তিয়াত্তর', 'চুয়াত্তর', 'পঁচাত্তর', 'ছিয়াত্তর', 'সাতাত্তর', 'আটাত্তর', 'উনআশি', 'আশি',
    'একাশি', 'বিরাশি', 'তিরাশি', 'চুরাশি', 'পঁচাশি', 'ছিয়াশি', 'সাতাশি', 'আটাশি', 'ঊননব্বই', 'নব্বই',
    'একানব্বই', 'বিরানব্বই', 'তিরানব্বই', 'চুরানব্বই', 'পঁচানব্বই', 'ছিয়ানব্বই', 'সাতানব্বই', 'আটানব্বই', 'নিরানব্বই'];

  function convertSmall(val) {
    if (val === 0) return '';
    let res = '';
    if (val >= 100) {
      const h = Math.floor(val / 100);
      res += (units[h] ? units[h] + ' শত ' : '');
      val %= 100;
    }
    if (val > 0) {
      res += units[val] + ' ';
    }
    return res;
  }

  let crore = Math.floor(n / 10000000);
  let rem = n % 10000000;
  let lakh = Math.floor(rem / 100000);
  rem %= 100000;
  let thousand = Math.floor(rem / 1000);
  rem %= 1000;
  let hundred = rem;

  let words = '';
  if (crore > 0) words += convertSmall(crore) + 'কোটি ';
  if (lakh > 0) words += convertSmall(lakh) + 'লাখ ';
  if (thousand > 0) words += convertSmall(thousand) + 'হাজার ';
  if (hundred > 0) words += convertSmall(hundred);

  return `কথায়: ${words.trim()} টাকা মাত্র`;
}

function renderReportGenerator() {
  const monthFilter = state.reportFilters.month;
  const classFilter = state.reportFilters.className;
  const feeTypeFilter = state.reportFilters.feeType;
  const methodFilter = state.reportFilters.method;

  const filtered = state.transactions.filter(tx => {
    const matchMonth = monthFilter === 'all' || (tx.month && tx.month.includes(monthFilter));
    const matchClass = classFilter === 'all' || tx.className === classFilter;
    const matchFee = feeTypeFilter === 'all' || tx.feeType === feeTypeFilter;
    const matchMethod = methodFilter === 'all' || (tx.method && tx.method.includes(methodFilter));
    return matchMonth && matchClass && matchFee && matchMethod;
  });

  const totalAmount = filtered.reduce((sum, tx) => sum + Number(tx.amount || 0), 0);
  const avgAmount = filtered.length ? Math.round(totalAmount / filtered.length) : 0;

  // Update Memo & Scope
  const memoEl = $('#padMemoNo');
  if (memoEl) memoEl.textContent = `APC/২০২৬-${String(100 + filtered.length)}`;

  const periodEl = $('#padPeriod');
  if (periodEl) periodEl.textContent = monthFilter === 'all' ? 'সব সময়' : monthFilter;

  const classScopeEl = $('#padClassScope');
  if (classScopeEl) classScopeEl.textContent = classFilter === 'all' ? 'সব শ্রেণি' : classFilter;

  const feeScopeEl = $('#padFeeTypeScope');
  if (feeScopeEl) feeScopeEl.textContent = feeTypeFilter === 'all' ? 'সব ধরন' : feeTypeFilter;

  // Update Pad Summary Box
  const countEl = $('#padTotalTrx');
  const grandTotalEl = $('#padGrandTotal');
  const avgEl = $('#padAvgCollection');
  const tableTotalEl = $('#padTableTotal');
  const wordsEl = $('#padAmountWords');

  if (countEl) countEl.textContent = `${bn(filtered.length)} টি`;
  if (grandTotalEl) grandTotalEl.textContent = `৳${bn(totalAmount.toLocaleString('en-US'))}`;
  if (avgEl) avgEl.textContent = `৳${bn(avgAmount.toLocaleString('en-US'))}`;
  if (tableTotalEl) tableTotalEl.textContent = `৳${bn(totalAmount.toLocaleString('en-US'))}`;
  if (wordsEl) wordsEl.textContent = numberToBanglaWords(totalAmount);

  // Render Pad Table Rows with clean, straightforward columns
  const tbody = $('#padTableBody');
  if (!tbody) return;

  tbody.innerHTML = filtered.length
    ? filtered.map((tx, idx) => `
      <tr>
        <td style="text-align:center;font-weight:700;color:var(--muted);">${bn(idx + 1)}</td>
        <td>${tx.date || '২২ সেপ্টেম্বর ২০২৬'}</td>
        <td><strong>${tx.studentName}</strong></td>
        <td>${tx.className}</td>
        <td>
          ${tx.feeType}
          <small style="display:block;color:var(--muted);font-size:9.5px;">${tx.month}</small>
        </td>
        <td>
          <span style="display:inline-block;padding:2px 7px;border-radius:4px;background:#eef6f1;color:#154d42;font-size:9.5px;font-weight:800;">${tx.method}</span>
        </td>
        <td style="text-align:right;">
          <strong>৳${bn(Number(tx.amount).toLocaleString('en-US'))}</strong>
        </td>
      </tr>`).join('')
    : '<tr><td colspan="7" style="text-align:center;padding:26px;color:var(--muted);">কোনো কালেকশন রেকর্ড পাওয়া যায়নি।</td></tr>';
}

function collectFee(event) {
  event.preventDefault();
  const studentId = $('#feeStudent').value;
  const feeType = $('#feeType').value;
  const month = $('#feeMonth').value;
  const amount = Number($('#feeAmount').value);
  const method = $('#feeMethod').value;
  const trxRef = $('#feeTrxId').value.trim() || `TRX-${Date.now().toString().slice(-4)}`;
  const note = $('#feeNote').value.trim() || 'ফি পরিশোধ';

  if (!studentId || !amount || amount <= 0) {
    toast('শিক্ষার্থী ও ফি এর পরিমাণ নির্বাচন করুন');
    return;
  }

  const student = state.students.find(s => s.id === studentId);
  if (!student) {
    toast('শিক্ষার্থী নির্বাচন করুন');
    return;
  }

  const newReceiptNo = `REC-2609-${String(state.transactions.length + 1).padStart(2, '0')}`;
  const newTxId = `TRX-${Date.now().toString().slice(-4)}`;
  const newTx = {
    id: newTxId,
    receiptNo: newReceiptNo,
    studentId: student.id,
    studentName: student.name,
    className: student.className,
    feeType,
    month,
    amount,
    method,
    trxRef,
    date: '২২ সেপ্টেম্বর ২০২৬',
    collectedBy: 'এডমিন',
    note
  };

  state.transactions.unshift(newTx);
  event.target.reset();
  $('#feeAmount').value = '1500';

  renderFinance();
  toast(`${student.name}-এর ৳${bn(amount)} ফি সফলভাবে জমা নেওয়া হয়েছে`);
  openReceiptModal(newTx);
}

function openReceiptModal(tx) {
  openModal(
    'মানি রসিদ',
    `রসিদ নং: ${tx.receiptNo || 'REC-১০১'}`,
    `
      <div class="receipt-modal-box" id="printReceiptBox">
        <div class="receipt-header">
          <div class="receipt-brand-title">Active Plus Coaching</div>
          <div class="receipt-sub">শিখতে থাকো, এগিয়ে যাও • দিনাজপুর</div>
          <div class="receipt-badge-title">মানি রসিদ (PAID)</div>
        </div>
        <dl class="receipt-meta-grid">
          <div><dt>রসিদ নং</dt><dd><strong>${tx.receiptNo || 'REC-১০১'}</strong></dd></div>
          <div><dt>তারিখ</dt><dd>${tx.date}</dd></div>
          <div><dt>শিক্ষার্থীর নাম</dt><dd><strong>${tx.studentName}</strong></dd></div>
          <div><dt>শ্রেণি</dt><dd>${tx.className}</dd></div>
          <div><dt>ফি এর ধরন</dt><dd>${tx.feeType} (${tx.month})</dd></div>
          <div><dt>পেমেন্ট মাধ্যম</dt><dd>${tx.method}</dd></div>
        </dl>
        <div class="receipt-amount-block">
          <div>
            <span>মোট পরিশোধিত টাকা</span>
            <strong>৳${bn(Number(tx.amount).toLocaleString('en-US'))}</strong>
          </div>
          <span class="receipt-paid-seal">✓ পরিশোধিত</span>
        </div>
        <p style="font-size:10px;color:var(--muted);margin-top:4px;">নোট: ${tx.note || 'ফি পরিশোধ সম্পন্ন'}</p>
        <div class="receipt-footer-sign">
          <div>আদায়কারী: ${tx.collectedBy || 'এডমিন'}</div>
          <div class="receipt-signature-line">কর্তৃপক্ষের স্বাক্ষর</div>
        </div>
      </div>
      <div class="modal-actions">
        <button class="admin-btn primary" type="button" data-modal-action="print-receipt">
          <svg aria-hidden="true" viewBox="0 0 24 24" style="width:14px;height:14px;"><use href="#icon-printer"></use></svg>
          রসিদ প্রিন্ট করুন
        </button>
        <button class="admin-btn ghost" type="button" data-modal-action="close">বন্ধ করুন</button>
      </div>`
  );

  $('#adminModalBody [data-modal-action="print-receipt"]')?.addEventListener('click', () => {
    window.print();
  });
  $('#adminModalBody [data-modal-action="close"]')?.addEventListener('click', () => {
    closeModal();
  });
}

function renderFinance() {
  renderFinanceStats();
  populateStudentFeeSelect();
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
  updatePendingBadge();
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

$$('[data-toggle-pin]').forEach(button => {
  button.addEventListener('click', () => {
    const input = $(`#${button.dataset.togglePin}`);
    if (!input) return;
    input.type = input.type === 'password' ? 'text' : 'password';
  });
});

$$('.admin-nav-item, .admin-bottom-item').forEach(item => {
  item.addEventListener('click', () => setView(item.dataset.adminView));
});

$$('[data-admin-view]').forEach(button => {
  if (button.classList.contains('admin-nav-item') || button.classList.contains('admin-bottom-item')) return;
  button.addEventListener('click', () => setView(button.dataset.adminView));
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
$('#dashPendingList').addEventListener('click', studentAction);

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
  $('#feeStudent')?.focus();
});

$('#btnFinanceGoReport')?.addEventListener('click', () => {
  setFinanceTab('reports');
});

$('#feeCollectionForm')?.addEventListener('submit', collectFee);

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

$('#btnPrintReport')?.addEventListener('click', () => {
  window.print();
});

const handleFinanceClick = event => {
  const button = event.target.closest('[data-action]');
  if (!button) return;
  const { action, trxId, id } = button.dataset;

  if (action === 'view-receipt') {
    const tx = state.transactions.find(t => t.id === trxId);
    if (tx) openReceiptModal(tx);
  } else if (action === 'quick-collect') {
    setFinanceTab('collection');
    if ($('#feeStudent')) {
      $('#feeStudent').value = id;
      $('#feeAmount').value = '1500';
      $('#feeAmount').focus();
    }
  } else if (action === 'view-student-receipts') {
    const studentTxs = state.transactions.filter(t => t.studentId === id);
    if (studentTxs.length) {
      openReceiptModal(studentTxs[0]);
    } else {
      toast('এই শিক্ষার্থীর কোনো রসিদ পাওয়া যায়নি');
    }
  }
};
$('#recentTrxList')?.addEventListener('click', handleFinanceClick);
$('#studentLedgerList')?.addEventListener('click', handleFinanceClick);
$('#reportTableBody')?.addEventListener('click', handleFinanceClick);

$('#adminModalClose').addEventListener('click', closeModal);
$('#adminModalBackdrop').addEventListener('click', event => {
  if (event.target === event.currentTarget) closeModal();
});
document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && !$('#adminModalBackdrop').hidden) closeModal();
});
