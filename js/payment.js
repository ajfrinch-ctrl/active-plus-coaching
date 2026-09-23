/* Standalone Payment Receive desk: username login → search → short profile
   → payment → receipt. The only login is this page. Students come from the
   office roster, which starts empty. */
import { feeCategories, paymentMethods } from './admin-data.js';
import { loadRoster } from './office-data.js';
import { financeRepository, monthLabel, dateLabel, searchStudents, studentFeeSummary, latinDigits, stampTransaction } from './finance-data.js';
import { receiptMarkup, downloadReceipt, createReceiptPNG } from './finance-receipt.js';
import { toBanglaNumber } from './ui.js';
import { registerServiceWorker } from './service-worker.js';
import {
  PAYMENT_USER_ID,
  verifyPaymentCredentials,
  savePaymentSession,
  hasPaymentSession,
  clearPaymentSession,
  changePaymentPin
} from './payment-auth.js';

export { PAYMENT_USER_ID };

registerServiceWorker();

const bn = toBanglaNumber;
const $ = selector => document.querySelector(selector);
const $$ = selector => Array.from(document.querySelectorAll(selector));
const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));

const state = {
  students: [],
  transactions: [],
  ready: false,
  saving: false,
  selectedId: null,
  receiptTx: null,
  receiptStudent: null
};

const statusMeta = {
  approved: { label: 'অনুমোদিত', className: 'badge-approved' },
  pending: { label: 'অপেক্ষমাণ', className: 'badge-pending' },
  rejected: { label: 'বাতিল', className: 'badge-rejected' }
};

const money = value => `৳${bn(Number(value || 0).toLocaleString('en-US'))}`;
const todayText = () => dateLabel(new Date());

function toast(message, tone = 'info') {
  const el = $('#payToast');
  el.textContent = message;
  el.dataset.tone = tone;
  el.hidden = false;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => { el.hidden = true; }, 3400);
}

/* ---------- Login, logout and PIN change ---------- */

$$('[data-toggle-pin]').forEach(button => {
  button.addEventListener('click', () => {
    const input = $(`#${button.dataset.togglePin}`);
    if (!input) return;
    input.type = input.type === 'password' ? 'text' : 'password';
  });
});
$$('.input-wrap input').forEach(input => {
  input.addEventListener('input', () => { $('#payLoginError').hidden = true; });
});

async function enterPanel(remember) {
  state.students = loadRoster();
  $('#payEntry').hidden = true;
  $('#payShell').hidden = false;
  savePaymentSession(remember);
  renderMethodPills();
  populateMonths();
  // Focus as soon as the desk is visible. Waiting for the ledger load lets the
  // caret land late (or never, if the counter starts typing immediately).
  $('#payStudentSearch').focus();
  await loadTransactions();
}

$('#payLoginForm').addEventListener('submit', event => {
  event.preventDefault();
  const userId = $('#payLoginUser').value.trim();
  const pin = $('#payLoginPin').value;
  if (!verifyPaymentCredentials(userId, pin)) {
    $('#payLoginError').textContent = 'ইউজারনেম বা পাসওয়ার্ড সঠিক নয়। আবার চেষ্টা করুন।';
    $('#payLoginError').hidden = false;
    $('#payLoginPin').value = '';
    $('#payLoginPin').focus();
    return;
  }
  $('#payLoginError').hidden = true;
  enterPanel($('#rememberPay').checked);
});

$('#payExitButton').addEventListener('click', () => {
  clearPaymentSession();
  state.selectedId = null;
  closeCollectionForm();
  $('#payStickyBar').hidden = true;
  $('#payShell').hidden = true;
  $('#payEntry').hidden = false;
  $('#payLoginPin').value = '';
  $('#payLoginUser').focus();
  window.scrollTo(0, 0);
});

/* PIN change: current PIN verified, new PIN confirmed, stored locally. */
$('#payPinButton').addEventListener('click', () => {
  $('#payPinForm').reset();
  $('#payPinError').hidden = true;
  $('#payPinBackdrop').hidden = false;
  document.body.classList.add('admin-modal-open');
  $('#payPinCurrent').focus();
});

function closePinModal() {
  $('#payPinBackdrop').hidden = true;
  document.body.classList.remove('admin-modal-open');
}

$('#payPinClose').addEventListener('click', closePinModal);
$('#payPinBackdrop').addEventListener('click', event => {
  if (event.target === event.currentTarget) closePinModal();
});

$('#payPinForm').addEventListener('submit', event => {
  event.preventDefault();
  const result = changePaymentPin($('#payPinCurrent').value, $('#payPinNew').value, $('#payPinConfirm').value);
  if (!result.ok) {
    $('#payPinError').textContent = result.error;
    $('#payPinError').hidden = false;
    return;
  }
  closePinModal();
  toast('পাসওয়ার্ড পরিবর্তন হয়েছে — পরের বার নতুন পাসওয়ার্ড দিয়ে প্রবেশ করুন।', 'success');
});

async function loadTransactions() {
  try {
    state.transactions = await financeRepository.listTransactions();
    state.ready = true;
    $('#payLoadError').hidden = true;
  } catch {
    state.ready = false;
    $('#payLoadError').textContent = 'লেনদেনের ডেটা পড়া যায়নি। ব্রাউজারের স্টোরেজ চালু করে পেজ রিফ্রেশ করুন। ডেটা নিরাপদ রাখতে পেমেন্ট বন্ধ আছে।';
    $('#payLoadError').hidden = false;
  }
  renderAll();
}

/* ---------- Months (same rule as the admin panel) ---------- */

function populateMonths() {
  const now = new Date();
  const months = new Set();
  for (let offset = 1; offset >= -12; offset--) {
    months.add(monthLabel(new Date(now.getFullYear(), now.getMonth() + offset, 1)));
  }
  state.transactions.forEach(tx => months.add(tx.month));
  $('#payFeeMonth').innerHTML = [...months]
    .map(month => `<option value="${month}">${month}</option>`).join('');
  $('#payFeeMonth').value = monthLabel();
}

/* ---------- Counter pulse, quick picks and today's activity ---------- */

function summaryOf(student) {
  return studentFeeSummary(student, state.transactions);
}

function renderPulse() {
  const today = todayText();
  const month = monthLabel();
  const todays = state.transactions.filter(tx => tx.date === today);
  const monthly = state.transactions.filter(tx => tx.month === month);
  const total = list => list.reduce((sum, tx) => sum + Number(tx.amount || 0), 0);
  const dueStudents = state.students.filter(student => summaryOf(student).due > 0).length;
  $('#payTodayAmount').textContent = money(total(todays));
  $('#payTodayCount').textContent = todays.length ? `${bn(todays.length)}টি লেনদেন সম্পন্ন` : 'এখনও কোনো লেনদেন নেই';
  $('#payMonthAmount').textContent = money(total(monthly));
  $('#payMonthCount').textContent = `${bn(monthly.length)}টি লেনদেন`;
  $('#payDueStudents').textContent = `${bn(dueStudents)} জন`;
}

function renderQuickPicks() {
  const due = state.students
    .map(student => ({ student, summary: summaryOf(student) }))
    .filter(item => item.summary.due > 0)
    .sort((a, b) => b.summary.due - a.summary.due)
    .slice(0, 4);
  const recent = state.transactions.slice(0, 4)
    .map(tx => state.students.find(student => student.id === tx.studentId))
    .filter((student, index, list) => student && list.indexOf(student) === index)
    .slice(0, 3);
  const group = (title, items, label) => items.length
    ? `<div class="pay-pick-group"><p class="pay-pick-title">${title}</p><div class="pay-pick-row">${items.map(label).join('')}</div></div>`
    : '';
  const html = group('যাদের বকেয়া আছে', due, ({ student, summary }) => `
      <button class="pay-pick" type="button" data-pay-student="${student.id}" aria-pressed="${student.id === state.selectedId}">
        <strong>${escapeHtml(student.name)}</strong><small>বকেয়া ${money(summary.due)}</small>
      </button>`)
    + group('সাম্প্রতিক পেমেন্ট', recent, student => `
      <button class="pay-pick is-recent" type="button" data-pay-student="${student.id}" aria-pressed="${student.id === state.selectedId}">
        <strong>${escapeHtml(student.name)}</strong><small>${escapeHtml(student.className)}</small>
      </button>`);
  $('#payQuickPicks').innerHTML = html;
  $('#payQuickPicks').hidden = !html;
}

function renderActivity() {
  const today = todayText();
  const todays = state.transactions.filter(tx => tx.date === today);
  $('#payTodayList').innerHTML = todays.length
    ? todays.map(tx => `
      <button class="pay-activity-row" type="button" data-pay-tx="${escapeHtml(tx.id)}">
        <span class="student-avatar" aria-hidden="true">${escapeHtml(String(tx.studentName || '?').charAt(0))}</span>
        <span class="pay-activity-copy">
          <strong>${escapeHtml(tx.studentName)}</strong>
          <small>${escapeHtml(tx.feeType)} • ${escapeHtml(tx.month)} • ${escapeHtml(tx.method)}</small>
        </span>
        <span class="pay-activity-amount">${money(tx.amount)}</span>
      </button>`).join('')
    : '<p class="admin-empty">আজ এখনও কোনো ফি নেওয়া হয়নি।</p>';
}

function renderStickyBar() {
  const student = state.students.find(s => s.id === state.selectedId);
  const bar = $('#payStickyBar');
  if (!student || $('#payShell').hidden) { bar.hidden = true; return; }
  const summary = summaryOf(student);
  const formOpen = !$('#payCollectionForm').hidden;
  $('#payStickyName').textContent = student.name;
  $('#payStickyMeta').textContent = `${student.id} • ${summary.month} • বকেয়া ${money(summary.due)}`;
  $('#payStickyAction').textContent = formOpen ? 'এখনই জমা নিন' : 'টাকা নিন';
  $('#payStickyCollect').disabled = !state.ready || state.saving;
  bar.hidden = false;
}

function renderAll() {
  renderPulse();
  renderQuickPicks();
  renderActivity();
  renderSearchResults();
  renderProfile();
}

/* ---------- Search: name / mobile / ID / guardian mobile ---------- */

const searchInput = $('#payStudentSearch');
searchInput.addEventListener('input', () => {
  $('#paySearchClear').hidden = !searchInput.value;
  renderSearchResults();
});
$('#paySearchClear').addEventListener('click', () => {
  searchInput.value = '';
  $('#paySearchClear').hidden = true;
  renderSearchResults();
  searchInput.focus();
});
$('#payActivityRefresh').addEventListener('click', async () => {
  await loadTransactions();
  toast('আজকের তালিকা হালনাগাদ হয়েছে।', 'success');
});

function renderSearchResults() {
  const query = searchInput.value.trim();
  const matches = query ? searchStudents(state.students, query) : [];
  $('#paySearchStatus').textContent = !query ? '' : matches.length
    ? `${bn(matches.length)} জন শিক্ষার্থী পাওয়া গেছে`
    : 'কোনো শিক্ষার্থী পাওয়া যায়নি';
  $('#paySearchResults').innerHTML = matches.map(student => {
    const summary = summaryOf(student);
    const due = summary.due > 0 ? ` • বকেয়া ${money(summary.due)}` : ' • বকেয়া নেই';
    return `
    <button class="fee-search-result" type="button" data-pay-student="${student.id}" aria-pressed="${student.id === state.selectedId}">
      <span class="student-avatar" aria-hidden="true">${escapeHtml(student.name.charAt(0))}</span>
      <span><strong>${escapeHtml(student.name)}</strong><small>Student ID: ${student.id} • ${escapeHtml(student.className)} • অভিভাবক: ${bn(student.guardianMobile || '—')}${due}</small></span>
    </button>`;
  }).join('');
}

function selectStudent(studentId) {
  const student = state.students.find(s => s.id === studentId);
  if (!student || state.saving) return;
  state.selectedId = studentId;
  closeCollectionForm();
  $('#paySaveError').hidden = true;
  populateMonths();
  renderSearchResults();
  renderQuickPicks();
  renderProfile();
  $('#payProfileCard').scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}

document.addEventListener('click', event => {
  const button = event.target.closest('[data-pay-student]');
  if (button) selectStudent(button.dataset.payStudent);
});

/* ---------- Short profile + payment entry ---------- */

function renderProfile() {
  const student = state.students.find(s => s.id === state.selectedId);
  if (!student) {
    $('#payQuickProfile').innerHTML = '<p class="admin-empty">উপরে সার্চ করে শিক্ষার্থী নির্বাচন করুন।</p>';
    renderStickyBar();
    return;
  }
  const summary = summaryOf(student);
  const status = statusMeta[student.status] || { label: student.status || 'অজানা', className: '' };
  $('#payQuickProfile').innerHTML = `
    <div class="fee-profile-heading">
      <span class="student-avatar" aria-hidden="true">${escapeHtml(student.name.charAt(0))}</span>
      <div><h3>${escapeHtml(student.name)}</h3><small>Student ID: ${student.id}</small></div>
      <span class="badge ${status.className}">${status.label}</span>
    </div>
    <div class="pay-due-hero ${summary.due ? 'has-due' : 'is-clear'}">
      <div>
        <p class="pay-due-label">বর্তমান মাসের বকেয়া</p>
        <p class="pay-due-value">${money(summary.due)}</p>
      </div>
      <p class="pay-due-note">${summary.due
        ? `${money(summary.due)} নিলেই এই মাসের বেতন পরিষ্কার`
        : 'এই মাসের মাসিক বেতন পরিশোধ হয়েছে'}</p>
    </div>
    <dl class="fee-profile-details">
      <div><dt>শ্রেণি ও বিভাগ</dt><dd>${escapeHtml(student.className)} • ${escapeHtml(student.group || '—')}</dd></div>
      <div><dt>শিক্ষার্থীর মোবাইল</dt><dd>${bn(student.mobile || '—')}</dd></div>
      <div><dt>অভিভাবকের মোবাইল</dt><dd>${bn(student.guardianMobile || '—')}</dd></div>
      <div><dt>সর্বশেষ পেমেন্ট</dt><dd>${summary.lastPayment ? `${summary.lastPayment.date} • ${escapeHtml(summary.lastPayment.method)}` : 'এখনও পেমেন্ট নেই'}</dd></div>
    </dl>
    <dl class="fee-balance-grid">
      <div><dt>নির্ধারিত মাসিক ফি</dt><dd>${money(summary.monthlyFee)}</dd></div>
      <div><dt>চলতি মাসে পরিশোধ</dt><dd>${money(summary.paid)}</dd></div>
      <div class="${summary.due ? 'has-due' : ''}"><dt>বর্তমান মাসের বকেয়া</dt><dd>${money(summary.due)}</dd></div>
    </dl>
    <p class="finance-hint">${summary.month} • রসিদ পাঠানোর জন্য হোয়াটসঅ্যাপ নম্বর হবে ${bn(whatsappTarget(student) || '—')}</p>
    <button id="payProfileCollect" class="admin-btn primary fee-profile-collect" type="button" ${!state.ready || state.saving ? 'disabled' : ''}>
      <svg aria-hidden="true" viewBox="0 0 24 24"><use href="#icon-bolt"></use></svg>
      পেমেন্ট নিন
    </button>`;
  renderStickyBar();
}

function openCollectionForm() {
  const student = state.students.find(s => s.id === state.selectedId);
  if (!student || !state.ready || state.saving) return;
  const summary = summaryOf(student);
  const form = $('#payCollectionForm');
  form.reset();
  syncMethodPills();
  $('#payStudent').value = student.id;
  populateMonths();
  $('#payFeeAmount').value = summary.due || summary.monthlyFee || '';
  $('#payPaymentFor').textContent = `${student.name} • Student ID: ${student.id}`;
  $('#paySaveError').hidden = true;
  form.hidden = false;
  updateSaveLabel();
  renderStickyBar();
  $('#payFeeAmount').focus();
}

function closeCollectionForm() {
  $('#payCollectionForm').hidden = true;
}

$('#payQuickProfile').addEventListener('click', event => {
  if (event.target.closest('#payProfileCollect')) openCollectionForm();
});

$('#payStickyCollect').addEventListener('click', () => {
  const form = $('#payCollectionForm');
  if (form.hidden) { openCollectionForm(); return; }
  if (typeof form.requestSubmit === 'function') form.requestSubmit();
  else form.dispatchEvent(new Event('submit', { cancelable: true }));
});

$('#payCancelButton').addEventListener('click', () => {
  closeCollectionForm();
  renderStickyBar();
  searchInput.focus();
});

/* Method pills are rendered from the shared list so they can never drift. */
function renderMethodPills() {
  $('#payFeeMethodGroup').innerHTML = paymentMethods.map((method, index) => `
    <button class="pay-method" type="button" role="radio" data-pay-method="${escapeHtml(method)}" aria-checked="${index === 0}">
      <span class="pay-method-dot" aria-hidden="true"></span>${escapeHtml(method)}
    </button>`).join('');
  syncMethodPills();
}

function syncMethodPills() {
  const selected = $('#payFeeMethod').value || paymentMethods[0];
  $$('#payFeeMethodGroup [data-pay-method]').forEach(pill => {
    pill.setAttribute('aria-checked', String(pill.dataset.payMethod === selected));
  });
}

$('#payFeeMethodGroup').addEventListener('click', event => {
  const pill = event.target.closest('[data-pay-method]');
  if (!pill || state.saving) return;
  $('#payFeeMethod').value = pill.dataset.payMethod;
  syncMethodPills();
});

/* Quick amounts + keypad both only write into the amount field. */
$('#payCollectionForm').addEventListener('click', event => {
  const chip = event.target.closest('[data-fee-quick]');
  if (!chip || state.saving || $('#payCollectionForm').hidden) return;
  const student = state.students.find(s => s.id === $('#payStudent').value);
  if (!student) return;
  const summary = summaryOf(student);
  if (chip.dataset.feeQuick === 'due') $('#payFeeAmount').value = summary.due || summary.monthlyFee;
  if (chip.dataset.feeQuick === 'monthly') $('#payFeeAmount').value = summary.monthlyFee;
  if (chip.dataset.feeQuick === 'half') $('#payFeeAmount').value = Math.max(1, Math.round((summary.due || summary.monthlyFee) / 2));
  updateSaveLabel();
});

$('#payKeypad').addEventListener('click', event => {
  const key = event.target.closest('[data-pay-key]');
  if (!key || state.saving) return;
  const field = $('#payFeeAmount');
  const current = latinDigits(field.value).replace(/[^0-9]/g, '');
  const pressed = key.dataset.payKey;
  let next = current;
  if (pressed === 'back') next = current.slice(0, -1);
  else if (pressed === 'clear') next = '';
  else next = `${current}${pressed}`.replace(/^0+(?=\d)/, '');
  field.value = next.slice(0, 8);
  updateSaveLabel();
});

$('#payFeeAmount').addEventListener('input', updateSaveLabel);

function updateSaveLabel() {
  const amount = Number($('#payFeeAmount').value);
  $('#paySaveLabel').textContent = Number.isFinite(amount) && amount > 0
    ? `${money(amount)} জমা নিন ও রসিদ দিন`
    : 'ফি গ্রহণ ও রসিদ তৈরি করুন';
}

/* ---------- Save payment (same contract as the admin panel) ---------- */

$('#payCollectionForm').addEventListener('submit', async event => {
  event.preventDefault();
  const form = event.currentTarget;
  if (state.saving || !state.ready || form.hidden) return;
  if (!form.reportValidity()) return;
  const student = state.students.find(s => s.id === $('#payStudent').value && s.id === state.selectedId);
  const amount = Number($('#payFeeAmount').value);
  const feeType = $('#payFeeType').value;
  const method = $('#payFeeMethod').value;
  if (!student || !Number.isSafeInteger(amount) || amount <= 0 || amount > 10000000 || !feeCategories.includes(feeType) || !paymentMethods.includes(method) || !$('#payFeeMonth').value) {
    toast('শিক্ষার্থী ও পেমেন্টের তথ্য সঠিকভাবে পূরণ করুন', 'error');
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
    month: $('#payFeeMonth').value,
    amount,
    method,
    trxRef: $('#payFeeTrxId').value.trim(),
    date: dateLabel(now),
    collectedBy: 'পেমেন্ট কাউন্টার',
    note: $('#payFeeNote').value.trim()
  }, now);
  state.saving = true;
  form.setAttribute('aria-busy', 'true');
  $('#paySaveError').hidden = true;
  const controls = [...form.querySelectorAll('input, select, button')];
  controls.forEach(control => { control.disabled = true; });
  $('#paySaveLabel').textContent = 'সংরক্ষণ হচ্ছে…';
  searchInput.disabled = true;
  try {
    // Receipt only after durable storage succeeds — same rule as the admin panel.
    state.transactions = await financeRepository.saveTransaction(tx);
  } catch {
    $('#paySaveError').textContent = 'পেমেন্ট সংরক্ষণ হয়নি। ব্রাউজারের স্টোরেজ/খালি জায়গা পরীক্ষা করে আবার চেষ্টা করুন।';
    $('#paySaveError').hidden = false;
    return;
  } finally {
    state.saving = false;
    form.removeAttribute('aria-busy');
    controls.forEach(control => { control.disabled = false; });
    searchInput.disabled = false;
    updateSaveLabel();
  }
  form.reset();
  syncMethodPills();
  form.hidden = true;
  updateSaveLabel();
  renderPulse();
  renderQuickPicks();
  renderActivity();
  renderProfile();
  toast(`${student.name}-এর ${money(amount)} ফি সফলভাবে জমা নেওয়া হয়েছে`, 'success');
  openReceiptModal(tx, student);
});

/* ---------- Receipt modal: PDF + one-click WhatsApp image ---------- */

function openReceiptModal(tx, student) {
  state.receiptTx = tx;
  state.receiptStudent = student;
  $('#payReceiptSub').textContent = `রসিদ নং: ${tx.receiptNo || tx.id} • ${tx.date}`;
  const phone = whatsappTarget(student);
  $('#payReceiptWhatsAppLabel').textContent = phone ? `হোয়াটসঅ্যাপে পাঠান • ${bn(phone)}` : 'হোয়াটসঅ্যাপে পাঠান';
  $('#payReceiptBody').innerHTML = receiptMarkup(tx);
  $('#payReceiptBackdrop').hidden = false;
  document.body.classList.add('admin-modal-open');
}

function closeReceiptModal() {
  state.receiptTx = null;
  state.receiptStudent = null;
  $('#payReceiptBackdrop').hidden = true;
  document.body.classList.remove('admin-modal-open');
  renderProfile();
}

$('#payReceiptClose').addEventListener('click', closeReceiptModal);
$('#payReceiptBackdrop').addEventListener('click', event => {
  if (event.target === event.currentTarget) closeReceiptModal();
});

$('#payReceiptNew').addEventListener('click', () => {
  closeReceiptModal();
  searchInput.value = '';
  $('#paySearchClear').hidden = true;
  renderSearchResults();
  searchInput.focus();
  toast('নতুন পেমেন্টের জন্য শিক্ষার্থী খুঁজুন।');
});

$('#payTodayList').addEventListener('click', event => {
  const row = event.target.closest('[data-pay-tx]');
  if (!row) return;
  const tx = state.transactions.find(item => item.id === row.dataset.payTx);
  if (!tx) return;
  const student = state.students.find(s => s.id === tx.studentId) || { mobile: '', guardianMobile: '' };
  openReceiptModal(tx, student);
});

$('#payReceiptDownload').addEventListener('click', async event => {
  const button = event.currentTarget;
  if (!state.receiptTx || button.disabled) return;
  const label = button.textContent;
  button.disabled = true;
  button.textContent = 'ডাউনলোড তৈরি হচ্ছে…';
  try { await downloadReceipt(state.receiptTx); }
  catch { toast('রসিদ ডাউনলোড হয়নি। আবার চেষ্টা করুন।', 'error'); }
  finally {
    button.disabled = false;
    button.textContent = label;
  }
});

/* WhatsApp number for the student: own number first, guardian as backup. */
function whatsappTarget(student) {
  return student.mobile || student.guardianMobile || '';
}

function whatsappLink(phone, message) {
  const digits = latinDigits(phone).replace(/[^0-9]/g, '');
  const intl = digits.startsWith('880') ? digits : `880${digits.replace(/^0+/, '')}`;
  return `https://wa.me/${intl}?text=${encodeURIComponent(message)}`;
}

function receiptMessage(tx) {
  return `${tx.studentName} (${tx.studentId}) • ${tx.className}\n`
    + `${tx.feeType} (${tx.month}) — ${money(tx.amount)} পরিশোধ হয়েছে।\n`
    + `রসিদ নং: ${tx.receiptNo || tx.id} • ${tx.date}\n`
    + `— Active Plus Coaching`;
}

async function saveReceiptPNG(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

$('#payReceiptWhatsApp').addEventListener('click', async event => {
  const button = event.currentTarget;
  const label = $('#payReceiptWhatsAppLabel');
  const tx = state.receiptTx;
  const student = state.receiptStudent;
  if (!tx || button.disabled) return;
  const phone = whatsappTarget(student);
  if (!phone) {
    toast('এই শিক্ষার্থীর কোনো মোবাইল নম্বর নেই — আগে নম্বর যোগ করুন, নয়তো “টেক্সট কপি” দিয়ে পাঠান।', 'error');
    return;
  }
  const text = label.textContent;
  button.disabled = true;
  label.textContent = 'রসিদ প্রস্তুত হচ্ছে…';
  const filename = `${String(tx.receiptNo || tx.id).replace(/[^\w-]/g, '_')}.png`;
  const message = receiptMessage(tx);
  try {
    // Open the chat inside the tap itself so no popup blocker can swallow it,
    // then render the receipt image to attach (a wa.me link cannot carry one).
    window.open(whatsappLink(phone, message), '_blank', 'noopener');
    try { await saveReceiptPNG(await createReceiptPNG(tx), filename); }
    catch { toast('রসিদের ছবি তৈরি হয়নি — শুধু লেখা পাঠানো হচ্ছে।', 'error'); }
    toast(`হোয়াটসঅ্যাপ চ্যাট খুলছে — ${bn(phone)}। রসিদের ছবিটি ডাউনলোড হয়েছে, চ্যাটে যুক্ত করে দিন।`, 'success');
  } catch (error) {
    toast('রসিদ পাঠানো যায়নি। আবার চেষ্টা করুন।', 'error');
  } finally {
    button.disabled = false;
    label.textContent = text;
  }
});

async function copyReceiptText() {
  const tx = state.receiptTx;
  if (!tx) return;
  const text = receiptMessage(tx);
  try {
    if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(text);
    else throw new Error('clipboard unavailable');
    toast('রসিদের টেক্সট কপি হয়েছে — হোয়াটসঅ্যাপে পেস্ট করুন।', 'success');
  } catch {
    // Offline/insecure contexts still get the text, selected in a temp field.
    const field = document.createElement('textarea');
    field.value = text;
    field.setAttribute('readonly', '');
    field.style.position = 'fixed';
    field.style.opacity = '0';
    document.body.append(field);
    field.select();
    let copied = false;
    try { copied = document.execCommand('copy'); } catch { copied = false; }
    field.remove();
    toast(copied ? 'রসিদের টেক্সট কপি হয়েছে।' : 'কপি করা যায়নি — রসিদ থেকে টেক্সট বেছে নিন।', copied ? 'success' : 'error');
  }
}

$('#payReceiptCopy').addEventListener('click', copyReceiptText);

/* ---------- Counter shortcuts ---------- */

document.addEventListener('keydown', event => {
  if (event.key === 'Escape') {
    if (!$('#payReceiptBackdrop').hidden) closeReceiptModal();
    else if (!$('#payPinBackdrop').hidden) closePinModal();
    return;
  }
  const typing = /^(INPUT|SELECT|TEXTAREA)$/.test(document.activeElement?.tagName || '');
  if (event.key === '/' && !typing && $('#payShell') && !$('#payShell').hidden) {
    event.preventDefault();
    searchInput.focus();
    searchInput.select();
  }
});

/* ---------- Returning session: a remembered device (or a sign-in from the
   student login page) opens the desk directly, without the entry form. ---------- */

if (hasPaymentSession()) {
  // Hide synchronously so the entry screen never flashes on arrival.
  $('#payEntry').hidden = true;
  $('#payShell').hidden = false;
  enterPanel(true);
}
