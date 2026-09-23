/* Fill examples once when a form opens, never on every keystroke. No auto submit. */
import { DEFAULT_PIN, defaultStudent } from './config.js';
import { demoEnabled, DEMO_MODE_KEY, addFreshDemoExams } from './demo-data.js';

export function initDemoForms(warnings = []) {
  if (!demoEnabled()) {
    for (const host of document.querySelectorAll('#authScreen, #adminEntry, #teacherEntry')) {
      const button = document.createElement('button'); button.type = 'button'; button.className = 'demo-button'; button.textContent = 'নমুনা ডেটা ও অটোফিল চালু করুন'; button.dataset.demoOn = '';
      button.addEventListener('click', () => { try { window.localStorage.setItem(DEMO_MODE_KEY, 'on'); location.reload(); } catch { button.textContent = 'স্টোরেজ পাওয়া যায়নি। আবার চেষ্টা করুন।'; } });
      host.querySelector('.auth-card')?.after(button);
    }
    return;
  }
  const seen = new WeakSet(); let scheduled = false;
  const account = () => { try { return JSON.parse(window.localStorage.getItem('active-plus-account-v1')) || {}; } catch { return {}; } };
  function sample(field) {
    const id = field.id, name = field.name, key = (id || name || '').toLowerCase();
    const identity = account();
    const values = {
      loginMobile: identity.mobile || defaultStudent.studentMobile, loginPin: DEFAULT_PIN,
      regUsername: 'raisa.demo',
      regMobile: defaultStudent.studentMobile, nameBn: defaultStudent.nameBn, nameEn: defaultStudent.nameEn,
      fatherName: defaultStudent.fatherName, motherName: defaultStudent.motherName, guardianName: defaultStudent.guardianName,
      birthDate: defaultStudent.birthDate, guardianMobile: defaultStudent.guardianMobile, address: defaultStudent.address,
      institution: defaultStudent.institution, major: defaultStudent.major, roll: defaultStudent.roll, registrationNo: defaultStudent.registrationNo,
      securityAnswer: 'রাইসা', recoveryAnswer: 'রাইসা', recoveryMobile: identity.mobile || defaultStudent.studentMobile,
      noticeTitle: 'ডেমো: আগামীকালের ক্লাস ও পরীক্ষার নোটিশ', noticeBody: 'আগামীকাল বিকেল ৫টায় গণিত ক্লাস হবে। খাতা ও কলম সঙ্গে আনবে। এটি অ্যাপ যাচাইয়ের নমুনা নোটিশ।',
      routineSubject: 'উচ্চতর গণিত', routineTeacher: 'মো. সাইফুল ইসলাম', routineRoom: 'রুম ২০৩',
      feeTrxId: 'DEMO-REF-001', feeNote: 'ডেমো পেমেন্ট — অ্যাপ পরীক্ষার জন্য; প্রকৃত লেনদেন নয়',
      studentSearch: 'রাইসা', feeStudentSearch: 'রাইসা', teacherStudentSearch: 'রাইসা', teacherRecordSearch: 'ডেমো',
      editNameBn: defaultStudent.nameBn, editNameEn: defaultStudent.nameEn, editFatherName: defaultStudent.fatherName,
      editMotherName: defaultStudent.motherName, editGuardianName: defaultStudent.guardianName,
      editBirthDate: defaultStudent.birthDate, editGuardianMobile: defaultStudent.guardianMobile,
      editAddress: defaultStudent.address, editGroup: 'বিজ্ঞান বিভাগ', editMajor: defaultStudent.major,
      editInstitution: defaultStudent.institution, editRoll: defaultStudent.roll, editRegistrationNo: defaultStudent.registrationNo
    };
    if (id === 'editAdditionalMobile') {
      const used = [identity.mobile, ...(identity.additionalMobiles || [])];
      return Array.from({ length: 100 }, (_, i) => `0191111${String(i).padStart(4, '0')}`).find(n => !used.includes(n)) || '01822223333';
    }
    if (Object.hasOwn(values, id)) return values[id];
    if (name === 'template') return field.form?.querySelector('[data-copy-template]')?.value || '';
    if (field.type === 'password') return DEFAULT_PIN;
    if (field.type === 'search') return 'ডেমো';
    if (field.type === 'url' || /resourceurl/.test(key)) return 'https://example.com/class-notes';
    if (field.type === 'email') return 'demo@example.com';
    if (field.type === 'tel' || /mobile|phone/.test(key)) return '01911112222';
    if (field.type === 'date') return /birth/.test(key) ? defaultStudent.birthDate : new Date().toLocaleDateString('en-CA');
    if (field.type === 'datetime-local') { const d = new Date(Date.now() + 3600000); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16); }
    if (field.type === 'month') return new Date().toISOString().slice(0, 7);
    if (field.type === 'time') return '17:00';
    if (field.type === 'number') {
      const min = field.min === '' ? 0 : Number(field.min), max = field.max === '' ? 1000 : Number(field.max);
      return String(Math.min(max, Math.max(min, /amount/i.test(key) ? 1500 : /marks|progress/.test(key) || field.dataset.progressId ? 80 : 2)));
    }
    if (/subject/.test(key)) return 'গণিত';
    if (/title/.test(key)) return 'ডেমো: নতুন গণিত অনুশীলন';
    if (/group/.test(key)) return 'বিজ্ঞান বিভাগ';
    if (/room/.test(key)) return 'রুম ২০৩';
    if (/teacher/.test(key)) return 'মো. সাইফুল ইসলাম';
    if (/instructions|details|body/.test(key)) return 'প্রথম অধ্যায় পড়বে এবং অনুশীলনী ১ সমাধান করবে। এটি অ্যাপ চেক করার নমুনা নির্দেশনা।';
    if (/note/.test(key)) return 'ডেমো মন্তব্য: প্রশ্নের ভাষা সহজ করে আবার পাঠান।';
    return 'ডেমো নমুনা তথ্য';
  }
  function fill(force = false) {
    for (const field of document.querySelectorAll('input, select, textarea')) {
      if (!field.getClientRects().length) { seen.delete(field); continue; }
      if (field.disabled || field.readOnly || ['hidden', 'checkbox', 'radio', 'submit', 'button', 'file'].includes(field.type)) continue;
      if (seen.has(field) && !force) continue;
      if (field instanceof HTMLSelectElement && field.options.length < 2 && !field.value) continue;
      seen.add(field);
      if (field.value !== '') continue;
      if (field instanceof HTMLSelectElement) {
        const preferred = /class/i.test(field.id + field.name) ? 'দশম শ্রেণি' : /gender/i.test(field.id) ? 'নারী' : /group/i.test(field.id) ? 'বিজ্ঞান' : field.name === 'studentId' ? 'AP-1024' : '';
        field.value = [...field.options].find(o => o.value === preferred && preferred)?.value || [...field.options].find(o => o.value && !o.disabled)?.value || '';
      } else field.value = sample(field);
      if (field.value) {
        field.dataset.demoExample = 'true';
        field.dispatchEvent(new Event('input', { bubbles: true }));
        field.dispatchEvent(new Event('change', { bubbles: true }));
      }
    }
  }
  function schedule() { if (!scheduled) { scheduled = true; requestAnimationFrame(() => { scheduled = false; fill(); }); } }
  const observer = new MutationObserver(records => {
    if (records.some(r => r.type === 'childList' ? [...r.addedNodes].some(n => n.nodeType === 1) : r.target.matches('form, .view, .admin-view, .teacher-view, .auth-screen, .auth-panel, .registration-step, .modal-backdrop, .admin-modal-backdrop, #teacherShell, #adminShell, #appShell'))) schedule();
  });
  observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['hidden', 'class'] });
  document.addEventListener('reset', event => { requestAnimationFrame(() => { event.target.querySelectorAll('input, select, textarea').forEach(el => seen.delete(el)); fill(); }); }, true);
  for (const host of document.querySelectorAll('#appMain, #adminMain, #teacherMain, #authScreen, #adminEntry, #teacherEntry')) {
    const note = document.createElement('details'); note.className = 'demo-preview-note';
    note.innerHTML = '<summary>ডেমো ডেটা চালু • PIN ১২৩১২৩</summary><p>সব উদাহরণ পরীক্ষার জন্য। কিছুই নিজে থেকে জমা, প্রকাশ বা পেমেন্ট হবে না। পুরোনো তথ্য অপরিবর্তিত আছে।</p><div><button type="button" data-demo-fill>খালি ঘরে নমুনা বসান</button><button type="button" data-demo-fresh>নতুন সময়ের পরীক্ষার নমুনা</button><button type="button" data-demo-off>নমুনা অটোফিল বন্ধ করুন</button></div><p data-demo-status role="status"></p>';
    note.querySelector('[data-demo-status]').textContent = warnings[0] || '';
    note.querySelector('[data-demo-fill]').addEventListener('click', () => fill(true));
    note.querySelector('[data-demo-fresh]').addEventListener('click', async event => {
      const button = event.currentTarget; button.disabled = true;
      try { await addFreshDemoExams(); note.querySelector('[data-demo-status]').textContent = 'নতুন চলমান/আসন্ন পরীক্ষার নমুনা যোগ হয়েছে। পুরোনো পরীক্ষা অপরিবর্তিত আছে।'; }
      catch { note.querySelector('[data-demo-status]').textContent = 'নমুনা যোগ হয়নি। স্টোরেজ পরীক্ষা করে আবার চেষ্টা করুন।'; }
      finally { button.disabled = false; }
    });
    note.querySelector('[data-demo-off]').addEventListener('click', () => {
      try { window.localStorage.setItem(DEMO_MODE_KEY, 'off'); location.reload(); }
      catch { note.querySelector('[data-demo-status]').textContent = 'সেটিংস সংরক্ষণ হয়নি।'; }
    });
    if (host.classList.contains('auth-screen')) host.querySelector('.auth-card')?.before(note); else host.prepend(note);
  }
  fill(); schedule();
}
