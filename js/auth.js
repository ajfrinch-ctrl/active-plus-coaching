/* Authentication feature: login, registration, PIN recovery and pending access. */
import { $, $$, normalizeMobile, normalizeAnswer, setAuthMessage, showFeedback, openModal, closeModal } from './ui.js';
import { enabledClasses, defaultStudent } from './config.js';
import { saveAccount, saveStudent, generateStudentId, persistSession } from './storage.js';

export function switchAuthTab(tab) {
  $$('[data-auth-tab]').forEach(trigger => {
    if (!trigger.classList.contains('auth-tab')) return;
    const active = trigger.dataset.authTab === tab;
    trigger.classList.toggle('active', active);
    trigger.setAttribute('aria-selected', String(active));
  });
  $$('[data-auth-panel]').forEach(panel => {
    const active = panel.dataset.authPanel === tab;
    panel.classList.toggle('active', active);
    panel.hidden = !active;
  });
  setAuthMessage('');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function populateRegistrationClasses() {
  const select = $('#regClass');
  if (!select) return;
  select.insertAdjacentHTML('beforeend', enabledClasses.map(className => `<option value="${className}">${className}</option>`).join(''));
}

function toggleMajorField() {
  const isHonours = ($('#regClass')?.value || '').includes('অনার্স');
  const field = $('#majorField');
  if (field) field.hidden = !isHonours;
  if ($('#major')) $('#major').required = isHonours;
}

function initPinVisibility() {
  $$('[data-toggle-pin]').forEach(button => {
    button.addEventListener('click', () => {
      const input = $(`#${button.dataset.togglePin}`);
      if (!input) return;
      input.type = input.type === 'password' ? 'text' : 'password';
    });
  });
}

function initFixedContactMobile() {
  const loginMobile = $('#regMobile');
  const contactMobile = $('#studentMobile');
  if (!loginMobile || !contactMobile) return;
  const sync = () => { contactMobile.value = loginMobile.value; };
  loginMobile.addEventListener('input', sync);
  sync();
}

function handleLogin(event, state, onAuthenticated) {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  const mobile = normalizeMobile(form.get('mobile'));
  const pin = String(form.get('pin') || '');
  if (!mobile || pin.length < 4) {
    setAuthMessage('মোবাইল নম্বর ও ৪–৬ সংখ্যার PIN সঠিকভাবে দিন।');
    return;
  }
  if (!state.account) {
    setAuthMessage('এই ডিভাইসে কোনো অ্যাকাউন্ট নেই। আগে রেজিস্ট্রেশন করুন।');
    return;
  }
  if (mobile !== state.account.mobile || pin !== state.account.pin) {
    setAuthMessage('মোবাইল নম্বর অথবা PIN সঠিক নয়। আবার চেষ্টা করুন।');
    return;
  }
  state.student = { ...state.student, ...(state.account.student || {}) };
  saveStudent(state.student);
  persistSession($('#rememberMe')?.checked !== false);
  onAuthenticated?.();
}

function handleRegistration(event, state) {
  event.preventDefault();
  const formElement = event.currentTarget;
  if (!formElement.checkValidity()) {
    formElement.reportValidity();
    return;
  }
  const form = new FormData(formElement);
  const mobile = normalizeMobile(form.get('mobile'));
  const pin = String(form.get('pin') || '');
  const pinConfirm = String(form.get('pinConfirm') || '');
  if (mobile.length < 10) return setAuthMessage('সঠিক মোবাইল নম্বর দিন।');
  if (!/^\d{4,6}$/.test(pin)) return setAuthMessage('PIN অবশ্যই ৪ থেকে ৬ সংখ্যার হতে হবে।');
  if (pin !== pinConfirm) return setAuthMessage('দুটি PIN এক নয়। আবার মিলিয়ে দিন।');
  if (state.account) return setAuthMessage('এই ডিভাইসে ইতিমধ্যে একটি অ্যাকাউন্ট আছে। লগইন করুন অথবা এডমিনের সাহায্য নিন।');

  const className = String(form.get('className') || '');
  const studentId = generateStudentId(className);
  const studentData = {
    name: String(form.get('nameBn') || '').trim(),
    nameBn: String(form.get('nameBn') || '').trim(),
    nameEn: String(form.get('nameEn') || '').trim(),
    className,
    group: String(form.get('group') || ''),
    id: studentId,
    fatherName: String(form.get('fatherName') || '').trim(),
    motherName: String(form.get('motherName') || '').trim(),
    guardianName: String(form.get('guardianName') || '').trim(),
    birthDate: String(form.get('birthDate') || ''),
    gender: String(form.get('gender') || ''),
    studentMobile: normalizeMobile(form.get('studentMobile')),
    guardianMobile: normalizeMobile(form.get('guardianMobile')),
    address: String(form.get('address') || '').trim(),
    major: String(form.get('major') || '').trim(),
    institution: String(form.get('institution') || '').trim(),
    roll: String(form.get('roll') || '').trim(),
    registrationNo: String(form.get('registrationNo') || '').trim()
  };

  state.account = {
    mobile,
    pin,
    securityQuestion: String(form.get('securityQuestion') || ''),
    securityAnswer: normalizeAnswer(form.get('securityAnswer')),
    student: studentData,
    studentId,
    status: 'pending',
    createdAt: new Date().toISOString()
  };
  state.student = { ...state.student, ...studentData };
  saveAccount(state.account);
  saveStudent(state.student);
  formElement.reset();
  toggleMajorField();
  switchAuthTab('login');
  $('#loginMobile').value = mobile;
  $('#pendingStudentId').textContent = studentId;
  setAuthMessage(`রেজিস্ট্রেশন সফল। তোমার ইউনিক Student ID: ${studentId}`, true);
}

function initRegistrationSteps() {
  const steps = $$('[data-registration-step]');
  if (!steps.length) return { reset: () => {} };
  let current = 0;
  const progressBar = $('#registrationProgressBar');
  const count = $('#registrationStepCount');
  const title = $('#registrationStepTitle');

  const showStep = index => {
    current = Math.max(0, Math.min(index, steps.length - 1));
    steps.forEach((step, stepIndex) => {
      const active = stepIndex === current;
      step.hidden = !active;
      step.classList.toggle('active', active);
      step.setAttribute('aria-hidden', String(!active));
    });
    if (progressBar) progressBar.style.width = `${((current + 1) / steps.length) * 100}%`;
    if (count) count.textContent = `ধাপ ${current + 1} / ${steps.length}`;
    if (title) title.textContent = steps[current].dataset.stepTitle;
  };

  const validateCurrentStep = () => {
    const fields = $$('input, select, textarea', steps[current]);
    const invalid = fields.find(field => !field.checkValidity());
    if (invalid) {
      invalid.reportValidity();
      return false;
    }
    return true;
  };

  steps.forEach((step, index) => {
    $('[data-next-step]', step)?.addEventListener('click', () => {
      if (validateCurrentStep()) showStep(index + 1);
    });
    $('[data-previous-step]', step)?.addEventListener('click', () => showStep(index - 1));
  });
  showStep(0);
  return { reset: () => showStep(0) };
}

function handleRecovery(event, state) {
  event.preventDefault();
  const formElement = event.currentTarget;
  if (!formElement.checkValidity()) {
    formElement.reportValidity();
    return;
  }
  if (!state.account) {
    closeModal('recoveryModal');
    setAuthMessage('এই ডিভাইসে কোনো রেজিস্টার্ড অ্যাকাউন্ট পাওয়া যায়নি।');
    return;
  }
  const form = new FormData(formElement);
  const matches = normalizeMobile(form.get('mobile')) === state.account.mobile
    && form.get('question') === state.account.securityQuestion
    && normalizeAnswer(form.get('answer')) === state.account.securityAnswer;
  const pin = String(form.get('pin') || '');
  if (!matches) return showFeedback('মোবাইল নম্বর, প্রশ্ন বা উত্তর সঠিক নয়');
  if (!/^\d{4,6}$/.test(pin)) return showFeedback('নতুন PIN ৪ থেকে ৬ সংখ্যার হতে হবে');
  state.account.pin = pin;
  saveAccount(state.account);
  closeModal('recoveryModal');
  $('#loginMobile').value = state.account.mobile;
  setAuthMessage('নতুন PIN সংরক্ষণ হয়েছে। এখন লগইন করুন।', true);
}

export function initAuth({ state, onAuthenticated, onLogout, onDemo }) {
  populateRegistrationClasses();
  initPinVisibility();
  initFixedContactMobile();
  const registrationSteps = initRegistrationSteps();

  $$('[data-auth-tab]').forEach(trigger => trigger.addEventListener('click', () => {
    if (trigger.dataset.authTab === 'register') registrationSteps.reset();
    switchAuthTab(trigger.dataset.authTab);
  }));
  $('#regClass')?.addEventListener('change', toggleMajorField);
  $('#loginForm')?.addEventListener('submit', event => handleLogin(event, state, onAuthenticated));
  $('#registrationForm')?.addEventListener('submit', event => handleRegistration(event, state));
  $('#recoveryForm')?.addEventListener('submit', event => handleRecovery(event, state));
  $('#forgotPinButton')?.addEventListener('click', () => openModal('recoveryModal'));
  $('#demoLoginButton')?.addEventListener('click', () => {
    state.account = { mobile: '01700000000', pin: '123456', status: 'active', student: { ...defaultStudent } };
    state.student = { ...defaultStudent };
    onDemo?.();
  });
  $('#pendingLogout')?.addEventListener('click', () => onLogout?.());
}
