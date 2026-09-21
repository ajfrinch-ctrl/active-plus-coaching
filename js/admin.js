/* One-click dummy Admin Panel for Active Plus Coaching.
   No password, no PIN: a single tap on the entry button opens the panel.
   All data is local demo data from js/admin-data.js — future API work can
   replace the dataset without changing this UI. */
import { enabledClasses, schedule } from './config.js';
import { toBanglaNumber } from './ui.js';
import { adminStudents, adminNotices, classEnrollment, dayNames } from './admin-data.js';

const bn = toBanglaNumber;
const $ = selector => document.querySelector(selector);
const $$ = selector => Array.from(document.querySelectorAll(selector));

const state = {
  students: adminStudents.map(student => ({ ...student })),
  notices: adminNotices.map(notice => ({ ...notice })),
  routine: Object.fromEntries(
    Object.entries(schedule).map(([day, info]) => [day, { ...info, classes: info.classes.map(cls => ({ ...cls })) }])
  ),
  enabled: new Set(enabledClasses),
  activeView: 'dashboard',
  activeDay: 'sat',
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
  toast('এক ক্লিকে ডামি এডমিন প্যানেলে প্রবেশ করা হয়েছে');
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
  $('#dashPendingList').innerHTML = pending.length
    ? pending.map(student => `
      <div class="pending-row">
        <span class="student-avatar" aria-hidden="true">${student.name.charAt(0)}</span>
        <div class="pending-copy">
          <strong>${student.name}</strong>
          <small>${student.id} • ${student.className}</small>
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
          <strong>${cls.subject}</strong>
          <small>${cls.teacher} • ${cls.room}</small>
        </div>
      </div>`).join('')
    : '<p class="admin-empty">আজ কোনো ক্লাস নেই।</p>';

  const max = Math.max(...classEnrollment.map(entry => entry.count), 1);
  $('#dashEnrollment').innerHTML = classEnrollment.map(entry => `
    <div class="enrollment-row">
      <span class="enrollment-label">${entry.className}</span>
      <span class="enrollment-track"><span style="width: ${Math.max((entry.count / max) * 100, entry.count ? 6 : 2)}%"></span></span>
      <span class="enrollment-count">${bn(entry.count)}</span>
    </div>`).join('');
}

/* ---------- Students ---------- */

const statusMeta = Object.freeze({
  approved: { label: 'অনুমোদিত', className: 'badge-approved' },
  pending: { label: 'অপেক্ষমাণ', className: 'badge-pending' },
  rejected: { label: 'বাতিল', className: 'badge-rejected' }
});

function visibleStudents() {
  const query = state.query.trim().toLowerCase();
  return state.students.filter(student => {
    const matchesFilter = state.filter === 'all' || student.status === state.filter;
    const matchesQuery = !query || [student.name, student.nameEn, student.id, student.mobile].some(
      value => String(value).toLowerCase().includes(query)
    );
    return matchesFilter && matchesQuery;
  });
}

function renderStudents() {
  const list = visibleStudents();
  $('#studentList').innerHTML = list.length
    ? list.map(student => `
      <article class="student-row">
        <span class="student-avatar" aria-hidden="true">${student.name.charAt(0)}</span>
        <div class="student-copy">
          <strong>${student.name}</strong>
          <small>${student.id} • ${student.className} • ${student.group}</small>
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
  const rows = [
    ['Student ID', student.id],
    ['নাম (বাংলা)', student.name],
    ['নাম (English)', student.nameEn],
    ['পিতার নাম', student.fatherName],
    ['শ্রেণি', student.className],
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
    'শিক্ষার্থী রেকর্ড',
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
          <strong>${notice.title}</strong>
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
  state.notices.unshift({
    id: `n-${Date.now()}`,
    title,
    body,
    audience,
    date: '২১ সেপ্টেম্বর ২০২৬'
  });
  event.target.reset();
  renderNotices();
  renderDashboard();
  toast('নোটিশ প্রকাশিত — শিক্ষার্থী অ্যাপে দেখা যাবে (ডেমো)');
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
          <strong>${cls.subject}</strong>
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
  state.routine[state.activeDay].classes.push({
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
  toast(`${subject} ক্লাসটি ${dayNames[state.activeDay]} রুটিনে যোগ হয়েছে`);
}

/* ---------- Classes ---------- */

function renderClasses() {
  $('#classesCount').textContent = `${bn(state.enabled.size)} / ${bn(enabledClasses.length)} চালু`;
  $('#classList').innerHTML = enabledClasses.map(className => {
    const entry = classEnrollment.find(item => item.className === className);
    const enabled = state.enabled.has(className);
    return `
      <div class="class-row">
        <div class="class-copy">
          <strong>${className}</strong>
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
  toast(`${className} ${input.checked ? 'চালু' : 'বন্ধ'} করা হয়েছে (ডেমো)`);
}

/* ---------- Render everything ---------- */

function renderAll() {
  renderDashboard();
  renderStudents();
  renderNotices();
  renderRoutine();
  renderClasses();
  updatePendingBadge();
}

/* ---------- Wiring ---------- */

$('#adminEnterButton').addEventListener('click', enterPanel);
$('#adminExitButton').addEventListener('click', exitPanel);

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

$('#adminModalClose').addEventListener('click', closeModal);
$('#adminModalBackdrop').addEventListener('click', event => {
  if (event.target === event.currentTarget) closeModal();
});
document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && !$('#adminModalBackdrop').hidden) closeModal();
});
