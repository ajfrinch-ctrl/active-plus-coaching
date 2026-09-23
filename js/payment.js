/* Standalone Payment Receive panel: unique-ID login → search → short profile
   → payment → receipt. Nothing else lives here. Uses the same financeRepository
   storage contract, receipt renderer and demo dataset as the admin panel, so
   both stay in sync. Credentials live in localStorage and the PIN is changeable. */
import { prepareDemoData } from './demo-data.js';
import { adminStudents, feeCategories, paymentMethods } from './admin-data.js';
import { financeRepository, monthLabel, dateLabel, searchStudents, studentFeeSummary, latinDigits } from './finance-data.js';
import { receiptMarkup, downloadReceipt, createReceiptPNG } from './finance-receipt.js';
import { toBanglaNumber } from './ui.js';
import { registerServiceWorker } from './service-worker.js';

registerServiceWorker();

const bn = toBanglaNumber;
const $ = selector => document.querySelector(selector);
const $$ = selector => Array.from(document.querySelectorAll(selector));

/* ---------- Payment portal account (unique user ID + changeable PIN) ---------- */

const PAYMENT_ACCOUNT_KEY = 'activePlus.paymentAccount.v1';
const PAYMENT_SESSION_KEY = 'activePlus.paymentSession.v1';
export const PAYMENT_USER_ID = 'APC-PAY-001';
const DEFAULT_PIN = '123123';
const REMEMBER_DAYS = 90;

function readJSON(key) {
  try {
    const value = window.localStorage.getItem(key);
    return value ? JSON.parse(value) : null;
  } catch { return null; }
}

function writeJSON(key, value) {
  try { window.localStorage.setItem(key, JSON.stringify(value)); return true; }
  catch { return false; }
}

function loadAccount() {
  const stored = readJSON(PAYMENT_ACCOUNT_KEY);
  if (stored && stored.userId && typeof stored.pin === 'string') return stored;
  const account = { userId: stored?.userId || PAYMENT_USER_ID, pin: DEFAULT_PIN };
  writeJSON(PAYMENT_ACCOUNT_KEY, account);
  return account;
}

const digits = value => latinDigits(value).replace(/[^0-9]/g, '');

function pinMatches(input, pin) {
  return digits(input).length > 0 && digits(input) === pin;
}

function saveSession(remember) {
  try {
    window.sessionStorage.removeItem(PAYMENT_SESSION_KEY);
    if (remember) {
      writeJSON(PAYMENT_SESSION_KEY, { expiry: Date.now() + REMEMBER_DAYS * 86400000 });
    } else {
      window.localStorage.removeItem(PAYMENT_SESSION_KEY);
      window.sessionStorage.setItem(PAYMENT_SESSION_KEY, '1');
    }
  } catch { /* private browsing: session simply does not survive reload */ }
}

function hasSession() {
  try {
    if (window.sessionStorage.getItem(PAYMENT_SESSION_KEY) === '1') return true;
    const stored = readJSON(PAYMENT_SESSION_KEY);
    if (stored?.expiry && Date.now() < stored.expiry) return true;
    window.localStorage.removeItem(PAYMENT_SESSION_KEY);
    return false;
  } catch { return false; }
}

function clearSession() {
  try {
    window.localStorage.removeItem(PAYMENT_SESSION_KEY);
    window.sessionStorage.removeItem(PAYMENT_SESSION_KEY);
  } catch { /* no-op */ }
}

const state = {
  students: adminStudents.map(student => ({ ...student })),
  transactions: [],
  ready: false,
  saving: false,
  selectedId: null,
  receiptTx: null
};

const statusMeta = {
  approved: { label: 'অনুমোদিত', className: 'badge-approved' },
  pending: { label: 'অপেক্ষমাণ', className: 'badge-pending' },
  rejected: { label: 'বাতিল', className: 'badge-rejected' }
};

const money = value => `৳${bn(Number(value || 0).toLocaleString('en-US'))}`;

function toast(message) {
  const el = $('#payToast');
  el.textContent = message;
  el.hidden = false;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => { el.hidden = true; }, 3200);
}

/* ---------- Login, logout and PIN change ---------- */

$('#payLoginUser').value = loadAccount().userId;
$('#payLoginPin').value = DEFAULT_PIN;
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
  const errors = await prepareDemoData();
  $('#payEntry').hidden = true;
  $('#payShell').hidden = false;
  saveSession(remember);
  populateMonths();
  await loadTransactions();
  if (errors.length) toast('কিছু নমুনা ডেটা লোড হয়নি; সংরক্ষিত ডেটা অক্ষত আছে।');
  $('#payStudentSearch').focus();
}

$('#payLoginForm').addEventListener('submit', event => {
  event.preventDefault();
  const account = loadAccount();
  const userId = $('#payLoginUser').value.trim();
  const pin = $('#payLoginPin').value;
  if (userId !== account.userId || !pinMatches(pin, account.pin)) {
    $('#payLoginError').textContent = 'ইউসার আইডি বা PIN সঠিক নয়। আবার চেষ্টা করুন।';
    $('#payLoginError').hidden = false;
    $('#payLoginPin').value = '';
    $('#payLoginPin').focus();
    return;
  }
  $('#payLoginError').hidden = true;
  enterPanel($('#rememberPay').checked);
});

$('#payExitButton').addEventListener('click', () => {
  clearSession();
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
  const error = message => {
    $('#payPinError').textContent = message;
    $('#payPinError').hidden = false;
  };
  const account = loadAccount();
  if (!pinMatches($('#payPinCurrent').value, account.pin)) {
    error('বর্তমান PIN সঠিক নয়।');
    return;
  }
  const newPin = digits($('#payPinNew').value);
  if (newPin.length < 4 || newPin.length > 6) {
    error('নতুন PIN ৪–৬ সংখ্যার হতে হবে।');
    return;
  }
  if (newPin !== digits($('#payPinConfirm').value)) {
    error('দুইবার লেখা নতুন PIN মিলছে না।');
    return;
  }
  if (!writeJSON(PAYMENT_ACCOUNT_KEY, { userId: account.userId, pin: newPin })) {
    error('PIN সংরক্ষণ করা যায়নি — ব্রাউজারের স্টোরেজ পরীক্ষা করুন।');
    return;
  }
  closePinModal();
  toast('PIN পরিবর্তন হয়েছে — পরের বার নতুন PIN দিয়ে প্রবেশ করুন।');
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
  renderProfile();
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

function renderSearchResults() {
  const query = searchInput.value.trim();
  const matches = query ? searchStudents(state.students, query) : [];
  $('#paySearchStatus').textContent = !query ? '' : matches.length
    ? `${bn(matches.length)} জন শিক্ষার্থী পাওয়া গেছে`
    : 'কোনো শিক্ষার্থী পাওয়া যায়নি';
  $('#paySearchResults').innerHTML = matches.map(student => `
    <button class="fee-search-result" type="button" data-pay-student="${student.id}" aria-pressed="${student.id === state.selectedId}">
      <span class="student-avatar" aria-hidden="true">${student.name.charAt(0)}</span>
      <span><strong>${student.name}</strong><small>Student ID: ${student.id} • ${student.className} • অভিভাবক: ${bn(student.guardianMobile || '—')}</small></span>
    </button>`).join('');
}

$('#paySearchResults').addEventListener('click', event => {
  const button = event.target.closest('[data-pay-student]');
  if (!button || state.saving) return;
  state.selectedId = button.dataset.payStudent;
  $('#payCollectionForm').reset();
  $('#payCollectionForm').hidden = true;
  $('#paySaveError').hidden = true;
  populateMonths();
  renderSearchResults();
  renderProfile();
  $('#payProfileCard').scrollIntoView({ block: 'nearest', behavior: 'smooth' });
});

/* ---------- Short profile + payment entry ---------- */

function renderProfile() {
  const student = state.students.find(s => s.id === state.selectedId);
  if (!student) {
    $('#payQuickProfile').innerHTML = '<p class="admin-empty">উপরে সার্চ করে শিক্ষার্থী নির্বাচন করুন।</p>';
    return;
  }
  const summary = studentFeeSummary(student, state.transactions);
  const status = statusMeta[student.status] || { label: student.status || 'অজানা', className: '' };
  $('#payQuickProfile').innerHTML = `
    <div class="fee-profile-heading">
      <span class="student-avatar" aria-hidden="true">${student.name.charAt(0)}</span>
      <div><h3>${student.name}</h3><small>Student ID: ${student.id}</small></div>
      <span class="badge ${status.className}">${status.label}</span>
    </div>
    <dl class="fee-profile-details">
      <div><dt>শ্রেণি ও বিভাগ</dt><dd>${student.className} • ${student.group || '—'}</dd></div>
      <div><dt>শিক্ষার্থীর মোবাইল</dt><dd>${bn(student.mobile || '—')}</dd></div>
      <div><dt>অভিভাবকের মোবাইল</dt><dd>${bn(student.guardianMobile || '—')}</dd></div>
      <div><dt>সর্বশেষ পেমেন্ট</dt><dd>${summary.lastPayment ? `${summary.lastPayment.date} • ${summary.lastPayment.method}` : 'এখনও পেমেন্ট নেই'}</dd></div>
    </dl>
    <dl class="fee-balance-grid">
      <div><dt>নির্ধারিত মাসিক ফি</dt><dd>${money(summary.monthlyFee)}</dd></div>
      <div><dt>চলতি মাসে পরিশোধ</dt><dd>${money(summary.paid)}</dd></div>
      <div class="${summary.due ? 'has-due' : ''}"><dt>বর্তমান মাসের বকেয়া</dt><dd>${money(summary.due)}</dd></div>
    </dl>
    <p class="finance-hint">${summary.month} • রসিদ পাঠানোর জন্য হোয়াটসঅ্যাপ নম্বর হবে ${bn(whatsappTarget(student) || '—')}</p>
    <button id="payProfileCollect" class="admin-btn primary fee-profile-collect" type="button" ${!state.ready || state.saving ? 'disabled' : ''}>পেমেন্ট নিন</button>`;
}

$('#payQuickProfile').addEventListener('click', event => {
  if (!event.target.closest('#payProfileCollect')) return;
  const student = state.students.find(s => s.id === state.selectedId);
  if (!student || !state.ready || state.saving) return;
  const summary = studentFeeSummary(student, state.transactions);
  $('#payCollectionForm').reset();
  $('#payStudent').value = student.id;
  populateMonths();
  $('#payFeeAmount').value = summary.due || summary.monthlyFee || '';
  $('#payPaymentFor').textContent = `${student.name} • Student ID: ${student.id}`;
  $('#paySaveError').hidden = true;
  $('#payCollectionForm').hidden = false;
  $('#payFeeType').focus();
});

$('#payCollectionForm').addEventListener('click', event => {
  const chip = event.target.closest('[data-fee-quick]');
  if (!chip || state.saving || $('#payCollectionForm').hidden) return;
  const student = state.students.find(s => s.id === $('#payStudent').value);
  if (!student) return;
  const summary = studentFeeSummary(student, state.transactions);
  if (chip.dataset.feeQuick === 'due') $('#payFeeAmount').value = summary.due || summary.monthlyFee;
  if (chip.dataset.feeQuick === 'monthly') $('#payFeeAmount').value = summary.monthlyFee;
  if (chip.dataset.feeQuick === 'half') $('#payFeeAmount').value = Math.max(1, Math.round((summary.due || summary.monthlyFee) / 2));
});

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
    month: $('#payFeeMonth').value,
    amount,
    method,
    trxRef: $('#payFeeTrxId').value.trim(),
    date: dateLabel(now),
    collectedBy: 'পেমেন্ট কাউন্টার',
    note: $('#payFeeNote').value.trim()
  };
  state.saving = true;
  form.setAttribute('aria-busy', 'true');
  $('#paySaveError').hidden = true;
  const controls = [...form.querySelectorAll('input, select, button')];
  controls.forEach(control => { control.disabled = true; });
  $('#paySaveButton').textContent = 'সংরক্ষণ হচ্ছে…';
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
    $('#paySaveButton').textContent = 'ফি গ্রহণ ও রসিদ তৈরি করুন';
    searchInput.disabled = false;
  }
  form.reset();
  form.hidden = true;
  renderProfile();
  toast(`${student.name}-এর ${money(amount)} ফি সফলভাবে জমা নেওয়া হয়েছে`);
  openReceiptModal(tx, student);
});

/* ---------- Receipt modal: PDF + one-click WhatsApp image ---------- */

function openReceiptModal(tx, student) {
  state.receiptTx = tx;
  state.receiptStudent = student;
  $('#payReceiptSub').textContent = `রসিদ নং: ${tx.receiptNo || tx.id}`;
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

$('#payReceiptDownload').addEventListener('click', async event => {
  const button = event.currentTarget;
  if (!state.receiptTx || button.disabled) return;
  const label = button.textContent;
  button.disabled = true;
  button.textContent = 'ডাউনলোড তৈরি হচ্ছে…';
  try { await downloadReceipt(state.receiptTx); }
  catch { toast('রসিদ ডাউনলোড হয়নি। আবার চেষ্টা করুন।'); }
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
  const tx = state.receiptTx;
  const student = state.receiptStudent;
  if (!tx || button.disabled) return;
  const label = button.textContent;
  button.disabled = true;
  button.textContent = 'রসিদ প্রস্তুত হচ্ছে…';
  const filename = `${String(tx.receiptNo || tx.id).replace(/[^\w-]/g, '_')}.png`;
  try {
    const png = await createReceiptPNG(tx);
    const file = new File([png], filename, { type: 'image/png' });
    const message = receiptMessage(tx);
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      // One tap: the OS share sheet opens with the receipt image attached.
      await navigator.share({ files: [file], text: message, title: 'মানি রসিদ — Active Plus Coaching' });
    } else {
      // Fallback: save the image and open the student's WhatsApp chat with the details.
      await saveReceiptPNG(png, filename);
      window.open(whatsappLink(whatsappTarget(student), message), '_blank', 'noopener');
      toast('রসিদের ছবি ডাউনলোড ও হোয়াটসঅ্যাপ চ্যাট খোলা হয়েছে — ছবিটি চ্যাটে পাঠিয়ে দিন।');
    }
  } catch (error) {
    if (error && error.name !== 'AbortError') toast('রসিদ পাঠানো যায়নি। আবার চেষ্টা করুন।');
  } finally {
    button.disabled = false;
    button.textContent = label;
  }
});

/* ---------- Returning session: remembered device opens the desk directly ---------- */

if (hasSession()) enterPanel(true);
