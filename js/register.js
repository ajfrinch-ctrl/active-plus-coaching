/* Registration feature: step-by-step student self-registration with auto Student ID.
   Updated: auto-login after registration so PIN check isn't needed immediately.
   The student also picks a permanent username here — a login ID that never
   changes, so the phone number does not have to be shared to log in. */
import { $, $$, normalizeMobile, normalizeAnswer, setAuthMessage, showFeedback } from './ui.js';
import { enabledClasses } from './config.js';
import { contactNumber, isContactNumber, normalizeUsername, usernameError, suggestUsername } from './account-policy.js';
import { saveAccount, saveStudent, generateStudentId, persistSession, setTrustedDevice, usernameTaken, reserveUsername, releaseUsername } from './storage.js';
import { upsertLocalAccount } from './office-data.js';
import { switchAuthTab } from './login.js';

function populateRegistrationClasses() {
  const select = $('#regClass');
  if (!select) return;
  select.insertAdjacentHTML('beforeend', enabledClasses.map(className => `<option value="${className}">${className}</option>`).join(''));
}

export function toggleMajorField() {
  const isHonours = ($('#regClass')?.value || '').includes('অনার্স');
  const field = $('#majorField');
  if (field) field.hidden = !isHonours;
  if ($('#major')) $('#major').required = isHonours;
}

function initFixedContactMobile() {
  const loginMobile = $('#regMobile');
  const contactMobile = $('#studentMobile');
  if (!loginMobile || !contactMobile) return;
  const sync = () => { contactMobile.value = loginMobile.value; };
  loginMobile.addEventListener('input', sync);
  sync();
}

/* Live username feedback: the name is permanent, so the rule shows while typing. */
function initUsernameField() {
  const field = $('#regUsername');
  if (!field) return;
  const status = $('#regUsernameStatus');
  const setStatus = (message, ok) => {
    if (!status) return;
    status.textContent = message;
    status.classList.toggle('is-ok', Boolean(ok));
    status.classList.toggle('is-bad', !ok);
  };
  const check = () => {
    const typed = normalizeUsername(field.value);
    field.setCustomValidity('');
    if (!typed) { setStatus('', false); return true; }
    const problem = usernameError(typed);
    if (problem) { setStatus(problem, false); return false; }
    if (usernameTaken(typed)) {
      const message = 'এই ইউজারনেমটি আগেই নেওয়া হয়েছে — অন্য একটি বেছে নিন।';
      setStatus(message, false);
      return false;
    }
    setStatus('✓ এই ইউজারনেমটি নেওয়া যাবে', true);
    return true;
  };
  field.addEventListener('input', check);
  field.addEventListener('blur', () => {
    // Normalise once the field loses focus; the stored form is lowercase.
    const typed = normalizeUsername(field.value);
    if (typed && !usernameError(typed)) field.value = typed;
    check();
  });
  $('#regUsernameSuggest')?.addEventListener('click', () => {
    const from = suggestUsername($('#nameEn')?.value, $('#nameBn')?.value);
    if (!from || usernameError(from)) return setStatus('আগে ইংরেজি নাম লিখুন, তারপর সাজেশন নিন।', false);
    let candidate = from;
    let suffix = 2;
    while (usernameTaken(candidate) && suffix < 100) candidate = `${from.slice(0, 17)}${suffix++}`;
    field.value = candidate;
    field.dispatchEvent(new Event('input', { bubbles: true }));
    field.focus();
  });
  return check;
}

function handleRegistration(event, state, onRegistered) {
  event.preventDefault();
  const formElement = event.currentTarget;
  if (!formElement.checkValidity()) {
    formElement.reportValidity();
    return;
  }
  const form = new FormData(formElement);
  const mobile = contactNumber(form.get('mobile'));
  const pin = String(form.get('pin') || '');
  const pinConfirm = String(form.get('pinConfirm') || '');
  const username = normalizeUsername(form.get('username'));
  if (!isContactNumber(mobile)) return setAuthMessage('সঠিক মোবাইল নম্বর দিন।');
  const usernameProblem = usernameError(username);
  if (usernameProblem) return setAuthMessage(usernameProblem);
  if (usernameTaken(username)) return setAuthMessage('এই ইউজারনেমটি আগেই নেওয়া হয়েছে। অন্য একটি বেছে নিন — এটি পরে বদলানো যাবে না।');
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
    username,
    fatherName: String(form.get('fatherName') || '').trim(),
    motherName: String(form.get('motherName') || '').trim(),
    guardianName: String(form.get('guardianName') || '').trim(),
    birthDate: String(form.get('birthDate') || ''),
    gender: String(form.get('gender') || ''),
    studentMobile: mobile,
    guardianMobile: normalizeMobile(form.get('guardianMobile')),
    address: String(form.get('address') || '').trim(),
    major: String(form.get('major') || '').trim(),
    institution: String(form.get('institution') || '').trim(),
    roll: String(form.get('roll') || '').trim(),
    registrationNo: String(form.get('registrationNo') || '').trim()
  };

  const account = {
    mobile,
    registrationMobile: mobile,
    additionalMobiles: [],
    username,
    pin,
    securityQuestion: String(form.get('securityQuestion') || ''),
    securityAnswer: normalizeAnswer(form.get('securityAnswer')),
    student: studentData,
    studentId,
    status: 'pending',
    createdAt: new Date().toISOString()
  };
  // Claim the name first, so a failed save never leaves a dangling claim.
  if (!reserveUsername(username, studentId)) return setAuthMessage('এই ইউজারনেমটি এরই মধ্যে অন্য কেউ নিয়েছে। অন্য একটি বেছে নিন।');
  if (!saveAccount(account)) {
    releaseUsername(username, studentId);
    return setAuthMessage('সংরক্ষণ হয়নি। স্টোরেজ পরীক্ষা করে আবার চেষ্টা করুন।');
  }
  state.account = account;
  state.student = { ...state.student, ...studentData };
  saveStudent(state.student);
  upsertLocalAccount();
  persistSession(true);
  setTrustedDevice(true);
  formElement.reset();
  toggleMajorField();
  $('#pendingStudentId').textContent = studentId;
  if (onRegistered) {
    onRegistered();
    showFeedback(`রেজিস্ট্রেশন সফল — ID: ${studentId} • ইউজারনেম: ${username}`);
  } else {
    switchAuthTab('login');
    $('#loginMobile').value = username;
    setAuthMessage(`রেজিস্ট্রেশন সফল। ইউনিক Student ID: ${studentId} • লগইনে ইউজারনেম “${username}” ব্যবহার করো — এটি আর বদলানো যাবে না।`, true);
  }
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

export function initRegister({ state, onRegistered }) {
  populateRegistrationClasses();
  initFixedContactMobile();
  initUsernameField();
  const registerSteps = initRegistrationSteps();
  $('#regClass')?.addEventListener('change', toggleMajorField);
  $('#registrationForm')?.addEventListener('submit', event => handleRegistration(event, state, onRegistered));

  // Starting registration always returns to the first step.
  $$('[data-auth-tab]').forEach(trigger => trigger.addEventListener('click', () => {
    if (trigger.dataset.authTab === 'register') registerSteps.reset();
  }));
}
