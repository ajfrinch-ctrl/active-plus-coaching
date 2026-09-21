/* Registration feature: step-by-step student self-registration with auto Student ID. */
import { $, $$, normalizeMobile, normalizeAnswer, setAuthMessage } from './ui.js';
import { enabledClasses } from './config.js';
import { saveAccount, saveStudent, generateStudentId } from './storage.js';
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

export function initRegister({ state }) {
  populateRegistrationClasses();
  initFixedContactMobile();
  const registerSteps = initRegistrationSteps();
  $('#regClass')?.addEventListener('change', toggleMajorField);
  $('#registrationForm')?.addEventListener('submit', event => handleRegistration(event, state));

  // Starting registration always returns to the first step.
  $$('[data-auth-tab]').forEach(trigger => trigger.addEventListener('click', () => {
    if (trigger.dataset.authTab === 'register') registerSteps.reset();
  }));
}
