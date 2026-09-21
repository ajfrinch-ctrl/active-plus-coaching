/* Profile feature: local student profile editing. */
import { $, openModal, closeModal, showFeedback } from './ui.js';
import { enabledClasses } from './config.js';
import { saveStudent } from './storage.js';

export function populateProfileClassOptions() {
  const select = $('#classInput');
  if (!select) return;
  select.innerHTML = enabledClasses.map(className => `<option value="${className}">${className}</option>`).join('');
}

export function openProfileEditor(student) {
  $('#nameInput').value = student.name;
  $('#classInput').value = student.className;
  $('#groupInput').value = student.group;
  openModal('editModal');
}

export function initProfile({ state, onStudentChange }) {
  populateProfileClassOptions();
  $('#profileForm')?.addEventListener('submit', event => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    state.student = {
      ...state.student,
      name: String(form.get('name') || '').trim(),
      className: String(form.get('className') || ''),
      group: String(form.get('group') || '').trim()
    };
    saveStudent(state.student);
    onStudentChange?.(state.student);
    closeModal('editModal');
    showFeedback('ব্যক্তিগত তথ্য সংরক্ষণ হয়েছে');
  });
}
