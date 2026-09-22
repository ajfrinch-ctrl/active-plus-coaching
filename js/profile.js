/* Profile feature: editable student information with an immutable Student ID.
   Updated: toggle to disable security check every time. */
import { $, openModal, closeModal, showFeedback, normalizeMobile } from './ui.js';
import { enabledClasses } from './config.js';
import { saveStudent, saveAccount, isSecurityCheckDisabled, setSecurityCheckDisabled, isTrustedDevice, setTrustedDevice, persistSession } from './storage.js';

export function populateProfileClassOptions() {
  const select = $('#classInput');
  if (!select) return;
  select.innerHTML = enabledClasses.map(className => `<option value="${className}">${className}</option>`).join('');
}

function setValue(id, value = '') {
  const field = $(`#${id}`);
  if (field) field.value = value || '';
}

export function openProfileEditor(student) {
  setValue('editStudentId', student.id);
  setValue('editNameBn', student.nameBn || student.name);
  setValue('editNameEn', student.nameEn);
  setValue('editFatherName', student.fatherName);
  setValue('editMotherName', student.motherName);
  setValue('editGuardianName', student.guardianName);
  setValue('editBirthDate', student.birthDate);
  setValue('editGender', student.gender);
  setValue('editStudentMobile', student.studentMobile);
  setValue('editGuardianMobile', student.guardianMobile);
  setValue('editAddress', student.address);
  setValue('classInput', student.className);
  setValue('editGroup', student.group);
  setValue('editMajor', student.major);
  setValue('editInstitution', student.institution);
  setValue('editRoll', student.roll);
  setValue('editRegistrationNo', student.registrationNo);
  openModal('editModal');
}

function readEditableStudent(form, current) {
  return {
    ...current,
    // ID is intentionally copied from current state and never read from a form field.
    id: current.id,
    name: String(form.get('nameBn') || '').trim(),
    nameBn: String(form.get('nameBn') || '').trim(),
    nameEn: String(form.get('nameEn') || '').trim(),
    fatherName: String(form.get('fatherName') || '').trim(),
    motherName: String(form.get('motherName') || '').trim(),
    guardianName: String(form.get('guardianName') || '').trim(),
    birthDate: String(form.get('birthDate') || ''),
    gender: String(form.get('gender') || ''),
    studentMobile: normalizeMobile(form.get('studentMobile')),
    guardianMobile: normalizeMobile(form.get('guardianMobile')),
    address: String(form.get('address') || '').trim(),
    className: String(form.get('className') || ''),
    group: String(form.get('group') || '').trim(),
    major: String(form.get('major') || '').trim(),
    institution: String(form.get('institution') || '').trim(),
    roll: String(form.get('roll') || '').trim(),
    registrationNo: String(form.get('registrationNo') || '').trim()
  };
}

export function shareStudentOnWhatsApp(student) {
  const rawMobile = normalizeMobile(student.studentMobile);
  if (rawMobile.length < 10) {
    showFeedback('প্রোফাইলে শিক্ষার্থীর মোবাইল নম্বর যোগ করুন');
    return;
  }
  const whatsappNumber = rawMobile.startsWith('0') ? `880${rawMobile.slice(1)}` : rawMobile;
  const message = [
    'Active Plus Coaching শিক্ষার্থী তথ্য',
    `নাম: ${student.name || '—'}`,
    `Student ID: ${student.id || '—'}`,
    `শ্রেণি: ${student.className || '—'}`,
    `বিভাগ: ${student.group || '—'}`
  ].join('\n');
  window.open(`https://wa.me/${whatsappNumber}?text=${encodeURIComponent(message)}`, '_blank', 'noopener,noreferrer');
}

function initSecurityToggle() {
  const skipToggle = $('#skipSecurityToggle');
  const trustedToggle = $('#trustedDeviceToggle');
  if (skipToggle) {
    skipToggle.checked = isSecurityCheckDisabled();
    skipToggle.addEventListener('change', () => {
      setSecurityCheckDisabled(skipToggle.checked);
      if (skipToggle.checked) {
        persistSession(true);
        setTrustedDevice(true);
        showFeedback('এখন থেকে প্রতিবার PIN চাওয়া হবে না');
      } else {
        showFeedback('নিরাপত্তা চেক আবার চালু করা হয়েছে');
      }
    });
  }
  if (trustedToggle) {
    trustedToggle.checked = isTrustedDevice();
    trustedToggle.addEventListener('change', () => {
      setTrustedDevice(trustedToggle.checked);
      if (trustedToggle.checked) {
        persistSession(true);
        showFeedback('এই ডিভাইসটি বিশ্বস্ত হিসেবে সংরক্ষিত');
      } else {
        showFeedback('বিশ্বস্ত ডিভাইস বন্ধ করা হয়েছে');
      }
    });
  }
}

export function initProfile({ state, onStudentChange }) {
  populateProfileClassOptions();
  initSecurityToggle();
  $('#profileForm')?.addEventListener('submit', event => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const previousMobile = normalizeMobile(state.student.studentMobile);
    state.student = readEditableStudent(form, state.student);

    // Keep login and profile mobile numbers aligned when they were the same account number.
    if (state.account && (!state.account.mobile || state.account.mobile === previousMobile)) {
      state.account = { ...state.account, mobile: state.student.studentMobile, student: state.student };
      saveAccount(state.account);
    } else if (state.account) {
      state.account = { ...state.account, student: state.student };
      saveAccount(state.account);
    }

    saveStudent(state.student);
    onStudentChange?.(state.student);
    closeModal('editModal');
    showFeedback('প্রোফাইলের তথ্য সংরক্ষণ হয়েছে');
  });
}
