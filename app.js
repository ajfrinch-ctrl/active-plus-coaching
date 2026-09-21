/* Active Plus Coaching — offline student experience */
(() => {
  'use strict';

  const STORAGE_KEY = 'active-plus-student-v1';
  const ACCOUNT_STORAGE_KEY = 'active-plus-account-v1';
  const SESSION_STORAGE_KEY = 'active-plus-session-v1';
  const INSTALL_DISMISSED_KEY = 'active-plus-install-dismissed';

  // This local list is intentionally kept separate so the future admin panel can
  // replace it with the classes enabled for admission. No server is required today.
  const enabledClasses = [
    'অষ্টম শ্রেণি',
    'নবম শ্রেণি',
    'দশম শ্রেণি',
    'একাদশ শ্রেণি',
    'দ্বাদশ শ্রেণি',
    'ডিগ্রি ১ম বর্ষ',
    'ডিগ্রি ২য় বর্ষ',
    'ডিগ্রি ৩য় বর্ষ',
    'অনার্স ১ম বর্ষ',
    'অনার্স ২য় বর্ষ',
    'অনার্স ৩য় বর্ষ',
    'অনার্স ৪র্থ বর্ষ'
  ];

  const defaultStudent = {
    name: 'রাইসা ইসলাম',
    className: 'দশম শ্রেণি',
    group: 'বিজ্ঞান বিভাগ',
    id: 'AP-1024'
  };

  const schedule = {
    sat: {
      date: 'শনিবার, ২১ সেপ্টেম্বর ২০২৬',
      classes: [
        { time: '০৪:৩০', period: 'বিকেল', subject: 'উচ্চতর গণিত', teacher: 'মো. সাইফুল ইসলাম', room: 'রুম ২০৩', tag: 'পরবর্তী', tone: 'green', current: true },
        { time: '০৬:০০', period: 'সন্ধ্যা', subject: 'পদার্থবিজ্ঞান', teacher: 'তানভীর আহমেদ', room: 'রুম ১০২', tag: 'ক্লাস', tone: 'blue' },
        { time: '০৭:৩০', period: 'সন্ধ্যা', subject: 'বাংলা', teacher: 'মাহমুদা আক্তার', room: 'রুম ২০৪', tag: 'ক্লাস', tone: 'purple' }
      ]
    },
    sun: {
      date: 'রবিবার, ২২ সেপ্টেম্বর ২০২৬',
      classes: [
        { time: '০৪:৩০', period: 'বিকেল', subject: 'রসায়ন', teacher: 'ফারহানা ইয়াসমিন', room: 'রুম ১০১', tag: 'ক্লাস', tone: 'orange' },
        { time: '০৬:০০', period: 'সন্ধ্যা', subject: 'ইংরেজি', teacher: 'নুসরাত জাহান', room: 'রুম ২০৩', tag: 'ক্লাস', tone: 'purple' }
      ]
    },
    mon: {
      date: 'সোমবার, ২৩ সেপ্টেম্বর ২০২৬',
      classes: [
        { time: '০৪:৩০', period: 'বিকেল', subject: 'উচ্চতর গণিত', teacher: 'মো. সাইফুল ইসলাম', room: 'রুম ২০৩', tag: 'ক্লাস', tone: 'green' },
        { time: '০৬:০০', period: 'সন্ধ্যা', subject: 'বাংলা', teacher: 'মাহমুদা আক্তার', room: 'রুম ২০৪', tag: 'ক্লাস', tone: 'purple' },
        { time: '০৭:৩০', period: 'সন্ধ্যা', subject: 'মডেল টেস্ট', teacher: 'একটিভ প্লাস একাডেমিক', room: 'পরীক্ষা হল', tag: 'টেস্ট', tone: 'orange' }
      ]
    },
    tue: {
      date: 'মঙ্গলবার, ২৪ সেপ্টেম্বর ২০২৬',
      classes: [
        { time: '০৬:০০', period: 'সন্ধ্যা', subject: 'পদার্থবিজ্ঞান', teacher: 'তানভীর আহমেদ', room: 'রুম ১০২', tag: 'ক্লাস', tone: 'blue' }
      ]
    },
    wed: {
      date: 'বুধবার, ২৫ সেপ্টেম্বর ২০২৬',
      classes: [
        { time: '০৪:৩০', period: 'বিকেল', subject: 'রসায়ন', teacher: 'ফারহানা ইয়াসমিন', room: 'রুম ১০১', tag: 'ক্লাস', tone: 'orange' },
        { time: '০৭:৩০', period: 'সন্ধ্যা', subject: 'ইংরেজি', teacher: 'নুসরাত জাহান', room: 'রুম ২০৩', tag: 'ক্লাস', tone: 'purple' }
      ]
    },
    thu: { date: 'বৃহস্পতিবার, ২৬ সেপ্টেম্বর ২০২৬', classes: [] }
  };

  const subjectInitials = {
    'উচ্চতর গণিত': 'গ',
    'পদার্থবিজ্ঞান': 'প',
    'বাংলা': 'ব',
    'রসায়ন': 'র',
    'ইংরেজি': 'ই',
    'মডেল টেস্ট': 'ম'
  };

  let student = loadStudent();
  let account = loadAccount();
  let registrationMode = 'self';
  let deferredInstallPrompt = null;

  function loadStudent() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
      return saved ? { ...defaultStudent, ...saved } : { ...defaultStudent };
    } catch (error) {
      return { ...defaultStudent };
    }
  }

  function loadAccount() {
    try {
      return JSON.parse(localStorage.getItem(ACCOUNT_STORAGE_KEY));
    } catch (error) {
      return null;
    }
  }

  function saveAccount() {
    try {
      localStorage.setItem(ACCOUNT_STORAGE_KEY, JSON.stringify(account));
    } catch (error) {
      // The app remains usable if local storage is unavailable.
    }
  }

  function saveStudent() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(student));
    } catch (error) {
      // The app remains usable if local storage is unavailable.
    }
  }

  function byId(id) { return document.getElementById(id); }
  function all(selector) { return Array.from(document.querySelectorAll(selector)); }

  function normalizeMobile(value) {
    return (value || '').toString().replace(/[০-৯]/g, digit => '০১২৩৪৫৬৭৮৯'.indexOf(digit)).replace(/[^0-9]/g, '');
  }

  function normalizeAnswer(value) {
    return (value || '').toString().trim().replace(/\s+/g, ' ').toLowerCase();
  }

  function setAuthMessage(message, success = false) {
    const element = byId('authMessage');
    if (!element) return;
    element.textContent = message;
    element.classList.toggle('success', success);
    element.hidden = !message;
  }

  function switchAuthTab(tab) {
    all('[data-auth-tab]').forEach(trigger => {
      if (trigger.classList.contains('auth-tab')) {
        const active = trigger.dataset.authTab === tab;
        trigger.classList.toggle('active', active);
        trigger.setAttribute('aria-selected', active ? 'true' : 'false');
      }
    });
    all('[data-auth-panel]').forEach(panel => {
      const active = panel.dataset.authPanel === tab;
      panel.classList.toggle('active', active);
      panel.hidden = !active;
    });
    setAuthMessage('');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function setRegistrationMode(mode) {
    registrationMode = mode;
    all('[data-registration-mode]').forEach(button => button.classList.toggle('active', button.dataset.registrationMode === mode));
    const hint = byId('modeHint');
    if (hint) hint.textContent = mode === 'staff'
      ? 'শিক্ষক বা এডমিন তথ্য তৈরি করে দিলে এখানে সেই মোবাইল ও PIN ব্যবহার হবে।'
      : 'তোমার নিজের মোবাইল নম্বর ও PIN দিয়ে অ্যাকাউন্ট তৈরি হবে।';
  }

  function toggleMajorField() {
    const className = byId('regClass')?.value || '';
    const isHonours = className.includes('অনার্স');
    const field = byId('majorField');
    if (field) field.hidden = !isHonours;
    const major = byId('major');
    if (major) major.required = isHonours;
  }

  function generateStudentId(className) {
    const now = new Date();
    const year = now.getFullYear().toString().slice(-2);
    const month = (now.getMonth() + 1).toString().padStart(2, '0');
    const classCodes = {
      'অষ্টম শ্রেণি': '8', 'নবম শ্রেণি': '9', 'দশম শ্রেণি': '0',
      'একাদশ শ্রেণি': '1', 'দ্বাদশ শ্রেণি': '2', 'ডিগ্রি ১ম বর্ষ': '3',
      'ডিগ্রি ২য় বর্ষ': '4', 'ডিগ্রি ৩য় বর্ষ': '5', 'অনার্স ১ম বর্ষ': '6',
      'অনার্স ২য় বর্ষ': '7', 'অনার্স ৩য় বর্ষ': '8', 'অনার্স ৪র্থ বর্ষ': '9'
    };
    let sequence = 1;
    try {
      sequence = Number(localStorage.getItem('active-plus-id-sequence') || '0') + 1;
      localStorage.setItem('active-plus-id-sequence', String(sequence));
    } catch (error) { /* use first sequence when storage is unavailable */ }
    return `${year}${month}${classCodes[className] || '0'}${sequence.toString().padStart(3, '0')}`;
  }

  function openStudentApp() {
    const auth = byId('authScreen');
    const app = byId('appShell');
    if (auth) auth.hidden = true;
    if (app) {
      app.hidden = false;
      app.classList.toggle('is-pending', account?.status === 'pending');
    }
    if (account?.status === 'pending' && byId('pendingStudentId')) {
      byId('pendingStudentId').textContent = toBanglaNumber(account.studentId || student.id);
    }
    renderStudent();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function showAuthScreen() {
    const auth = byId('authScreen');
    const app = byId('appShell');
    if (auth) auth.hidden = false;
    if (app) {
      app.hidden = true;
      app.classList.remove('is-pending');
    }
    switchAuthTab('login');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function persistSession(remember = true) {
    try {
      if (remember) localStorage.setItem(SESSION_STORAGE_KEY, '1');
      else sessionStorage.setItem(SESSION_STORAGE_KEY, '1');
    } catch (error) { /* no-op */ }
  }

  function hasSession() {
    try {
      return localStorage.getItem(SESSION_STORAGE_KEY) === '1' || sessionStorage.getItem(SESSION_STORAGE_KEY) === '1';
    } catch (error) {
      return false;
    }
  }

  function logout() {
    try {
      localStorage.removeItem(SESSION_STORAGE_KEY);
      sessionStorage.removeItem(SESSION_STORAGE_KEY);
    } catch (error) { /* no-op */ }
    showAuthScreen();
    setAuthMessage('লগআউট হয়েছে। আবার প্রবেশ করতে মোবাইল নম্বর ও PIN দিন।');
  }

  function renderStudent() {
    const firstName = student.name.trim().split(/\s+/)[0] || 'শিক্ষার্থী';
    const initial = firstName.charAt(0) || 'শি';
    const meta = `${student.className} · ${student.group}`;
    const nameFields = ['profileName'];

    if (byId('studentName')) byId('studentName').textContent = firstName;
    if (byId('avatarInitial')) byId('avatarInitial').textContent = initial;
    if (byId('profileAvatar')) byId('profileAvatar').textContent = initial;
    nameFields.forEach(id => { if (byId(id)) byId(id).textContent = student.name; });
    if (byId('profileMeta')) byId('profileMeta').textContent = meta;
    if (byId('routineClass')) byId('routineClass').textContent = meta;
    if (byId('studentId')) byId('studentId').textContent = student.id;
  }

  function setView(viewName) {
    const panel = byId(`${viewName}View`);
    if (!panel) return;

    all('[data-view-panel]').forEach(item => item.classList.toggle('active', item === panel));
    all('.bottom-link').forEach(item => item.classList.toggle('active', item.dataset.view === viewName));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function openModal(id) {
    const modal = byId(id);
    if (!modal) return;
    modal.hidden = false;
    document.body.classList.add('modal-open');
    const focusTarget = modal.querySelector('button, input, select');
    if (focusTarget) window.setTimeout(() => focusTarget.focus(), 50);
  }

  function closeModal(id) {
    const modal = byId(id);
    if (!modal) return;
    modal.hidden = true;
    document.body.classList.remove('modal-open');
  }

  function showFeedback(message) {
    const previous = document.querySelector('.feedback-toast');
    if (previous) previous.remove();
    const toast = document.createElement('div');
    toast.className = 'feedback-toast';
    toast.textContent = message;
    document.body.appendChild(toast);
    window.setTimeout(() => toast.remove(), 2600);
  }

  function toBanglaNumber(value) {
    return value.toString().replace(/[0-9]/g, digit => '০১২৩৪৫৬৭৮৯'[digit]);
  }

  function renderRoutine(day = 'sat') {
    const dayData = schedule[day] || schedule.sat;
    const list = byId('routineList');
    if (!list) return;
    byId('routineDate').textContent = dayData.date;
    byId('classCount').textContent = `${toBanglaNumber(dayData.classes.length)}টি ক্লাস`;
    list.innerHTML = dayData.classes.map((item, index) => `
      <article class="routine-item${item.current && day === 'sat' ? ' current' : ''}">
        <div class="routine-time"><strong>${item.time}</strong><small>${item.period}</small></div>
        <div class="routine-body">
          <span class="subject-block ${item.tone}">${subjectInitials[item.subject] || 'ক'}</span>
          <span><strong>${item.subject}</strong><small>${item.teacher} · ${item.room}</small></span>
          <span class="routine-tag${item.tag === 'টেস্ট' ? ' test' : ''}">${item.tag}</span>
        </div>
      </article>
    `).join('');
    byId('emptyRoutine').hidden = dayData.classes.length !== 0;
    list.hidden = dayData.classes.length === 0;
  }

  function populateClassOptions() {
    const options = enabledClasses.map(className => `<option value="${className}">${className}</option>`).join('');
    ['classInput', 'regClass'].forEach(id => {
      const select = byId(id);
      if (!select) return;
      if (id === 'classInput') {
        select.innerHTML = options;
      } else {
        select.insertAdjacentHTML('beforeend', options);
      }
    });
  }

  function openProfileEditor() {
    byId('nameInput').value = student.name;
    byId('classInput').value = student.className;
    byId('groupInput').value = student.group;
    openModal('editModal');
  }

  function updateConnectionStatus() {
    const pill = byId('connectionPill');
    const text = byId('connectionText');
    if (!pill || !text) return;
    if (navigator.onLine) {
      text.textContent = 'অফলাইন-রেডি · ডেটা ফোনে সংরক্ষিত';
      pill.classList.remove('is-offline');
    } else {
      text.textContent = 'অফলাইন মোড · সব ডেটা ফোনে আছে';
      pill.classList.add('is-offline');
    }
  }

  function setupInstallPrompt() {
    window.addEventListener('beforeinstallprompt', event => {
      event.preventDefault();
      deferredInstallPrompt = event;
      if (!localStorage.getItem(INSTALL_DISMISSED_KEY)) {
        window.setTimeout(() => {
          const toast = byId('installToast');
          if (toast) toast.hidden = false;
        }, 1200);
      }
    });

    window.addEventListener('appinstalled', () => {
      deferredInstallPrompt = null;
      const toast = byId('installToast');
      if (toast) toast.hidden = true;
      showFeedback('অ্যাপটি সফলভাবে ইনস্টল হয়েছে');
    });

    byId('installButton')?.addEventListener('click', installApp);
    byId('dismissInstall')?.addEventListener('click', () => {
      byId('installToast').hidden = true;
      try { localStorage.setItem(INSTALL_DISMISSED_KEY, '1'); } catch (error) { /* no-op */ }
    });
  }

  async function installApp() {
    if (!deferredInstallPrompt) {
      showFeedback('Chrome মেনু থেকে “অ্যাপ ইনস্টল করুন” বেছে নিন');
      return;
    }
    deferredInstallPrompt.prompt();
    await deferredInstallPrompt.userChoice;
    deferredInstallPrompt = null;
    byId('installToast').hidden = true;
  }

  function setupAuth() {
    all('[data-auth-tab]').forEach(trigger => {
      trigger.addEventListener('click', () => switchAuthTab(trigger.dataset.authTab));
    });
    all('[data-registration-mode]').forEach(button => {
      button.addEventListener('click', () => setRegistrationMode(button.dataset.registrationMode));
    });

    byId('regClass')?.addEventListener('change', toggleMajorField);
    all('[data-toggle-pin]').forEach(button => {
      button.addEventListener('click', () => {
        const input = byId(button.dataset.togglePin);
        if (!input) return;
        input.type = input.type === 'password' ? 'text' : 'password';
      });
    });

    byId('loginForm')?.addEventListener('submit', event => {
      event.preventDefault();
      const form = new FormData(event.currentTarget);
      const mobile = normalizeMobile(form.get('mobile'));
      const pin = (form.get('pin') || '').toString();
      if (!mobile || pin.length < 4) {
        setAuthMessage('মোবাইল নম্বর ও ৪–৬ সংখ্যার PIN সঠিকভাবে দিন।');
        return;
      }
      if (!account) {
        setAuthMessage('এই ডিভাইসে কোনো অ্যাকাউন্ট নেই। আগে রেজিস্ট্রেশন করুন।');
        return;
      }
      if (mobile !== account.mobile || pin !== account.pin) {
        setAuthMessage('মোবাইল নম্বর অথবা PIN সঠিক নয়। আবার চেষ্টা করুন।');
        return;
      }
      student = { ...student, ...account.student };
      saveStudent();
      persistSession(byId('rememberMe')?.checked !== false);
      openStudentApp();
    });

    byId('registrationForm')?.addEventListener('submit', event => {
      event.preventDefault();
      const formElement = event.currentTarget;
      if (!formElement.checkValidity()) {
        formElement.reportValidity();
        return;
      }
      const form = new FormData(formElement);
      const mobile = normalizeMobile(form.get('mobile'));
      const pin = (form.get('pin') || '').toString();
      const pinConfirm = (form.get('pinConfirm') || '').toString();
      if (mobile.length < 10) {
        setAuthMessage('সঠিক মোবাইল নম্বর দিন।');
        return;
      }
      if (!/^\d{4,6}$/.test(pin)) {
        setAuthMessage('PIN অবশ্যই ৪ থেকে ৬ সংখ্যার হতে হবে।');
        return;
      }
      if (pin !== pinConfirm) {
        setAuthMessage('দুটি PIN এক নয়। আবার মিলিয়ে দিন।');
        return;
      }
      if (account) {
        setAuthMessage('এই ডিভাইসে ইতিমধ্যে একটি অ্যাকাউন্ট আছে। লগইন করুন অথবা এডমিনের সাহায্য নিন।');
        return;
      }

      const className = (form.get('className') || '').toString();
      const studentId = generateStudentId(className);
      const studentData = {
        name: (form.get('nameBn') || '').toString().trim(),
        nameBn: (form.get('nameBn') || '').toString().trim(),
        nameEn: (form.get('nameEn') || '').toString().trim(),
        className,
        group: (form.get('group') || '').toString(),
        id: studentId,
        fatherName: (form.get('fatherName') || '').toString().trim(),
        motherName: (form.get('motherName') || '').toString().trim(),
        guardianName: (form.get('guardianName') || '').toString().trim(),
        birthDate: (form.get('birthDate') || '').toString(),
        gender: (form.get('gender') || '').toString(),
        studentMobile: normalizeMobile(form.get('studentMobile')),
        guardianMobile: normalizeMobile(form.get('guardianMobile')),
        address: (form.get('address') || '').toString().trim(),
        major: (form.get('major') || '').toString().trim(),
        institution: (form.get('institution') || '').toString().trim(),
        roll: (form.get('roll') || '').toString().trim(),
        registrationNo: (form.get('registrationNo') || '').toString().trim()
      };
      account = {
        mobile,
        pin,
        securityQuestion: (form.get('securityQuestion') || '').toString(),
        securityAnswer: normalizeAnswer(form.get('securityAnswer')),
        student: studentData,
        studentId,
        createdBy: registrationMode,
        status: 'pending',
        createdAt: new Date().toISOString()
      };
      student = { ...student, ...studentData };
      saveAccount();
      saveStudent();
      formElement.reset();
      toggleMajorField();
      switchAuthTab('login');
      byId('loginMobile').value = mobile;
      byId('pendingStudentId').textContent = toBanglaNumber(studentId);
      setAuthMessage(`রেজিস্ট্রেশন সফল। তোমার ইউনিক Student ID: ${studentId}`, true);
    });

    byId('forgotPinButton')?.addEventListener('click', () => openModal('recoveryModal'));
    byId('demoLoginButton')?.addEventListener('click', () => {
      account = { mobile: '01700000000', pin: '123456', status: 'active', student: { ...defaultStudent } };
      student = { ...defaultStudent };
      openStudentApp();
      showFeedback('প্রিভিউ ড্যাশবোর্ড খোলা হয়েছে');
    });

    byId('recoveryForm')?.addEventListener('submit', event => {
      event.preventDefault();
      const formElement = event.currentTarget;
      if (!formElement.checkValidity()) {
        formElement.reportValidity();
        return;
      }
      if (!account) {
        closeModal('recoveryModal');
        setAuthMessage('এই ডিভাইসে কোনো রেজিস্টার্ড অ্যাকাউন্ট পাওয়া যায়নি।');
        return;
      }
      const form = new FormData(formElement);
      const mobile = normalizeMobile(form.get('mobile'));
      const answer = normalizeAnswer(form.get('answer'));
      const pin = (form.get('pin') || '').toString();
      if (mobile !== account.mobile || form.get('question') !== account.securityQuestion || answer !== account.securityAnswer) {
        showFeedback('মোবাইল নম্বর, প্রশ্ন বা উত্তর সঠিক নয়');
        return;
      }
      if (!/^\d{4,6}$/.test(pin)) {
        showFeedback('নতুন PIN ৪ থেকে ৬ সংখ্যার হতে হবে');
        return;
      }
      account.pin = pin;
      saveAccount();
      closeModal('recoveryModal');
      byId('loginMobile').value = mobile;
      setAuthMessage('নতুন PIN সংরক্ষণ হয়েছে। এখন লগইন করুন।', true);
    });

    byId('pendingLogout')?.addEventListener('click', logout);
  }

  function handleAction(action) {
    switch (action) {
      case 'continue':
      case 'see-routine':
        setView('routine');
        break;
      case 'edit-profile':
        openProfileEditor();
        break;
      case 'install':
        installApp();
        break;
      case 'show-offline':
        showFeedback('তোমার তথ্য এই ডিভাইসেই নিরাপদে সংরক্ষিত আছে');
        break;
      case 'class-details':
        setView('routine');
        showFeedback('আজকের ক্লাস রুটিন দেখানো হচ্ছে');
        break;
      case 'all-results':
        showFeedback('সব ফলাফল খুব শিগগির যুক্ত হবে');
        break;
      case 'help':
        showFeedback('অফিসে যোগাযোগের জন্য অ্যাপের নোটিশ দেখুন');
        break;
      default:
        break;
    }
  }

  function bindEvents() {
    document.addEventListener('click', event => {
      const viewTrigger = event.target.closest('[data-view]');
      if (viewTrigger) {
        event.preventDefault();
        setView(viewTrigger.dataset.view);
        return;
      }

      const actionTrigger = event.target.closest('[data-action]');
      if (actionTrigger) {
        event.preventDefault();
        handleAction(actionTrigger.dataset.action);
      }

      const closeTrigger = event.target.closest('[data-close-modal]');
      if (closeTrigger) closeModal(closeTrigger.dataset.closeModal);
    });

    all('.day-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        all('.day-tab').forEach(item => item.classList.remove('active'));
        tab.classList.add('active');
        renderRoutine(tab.dataset.day);
      });
    });

    byId('notificationButton')?.addEventListener('click', () => openModal('noticeModal'));
    byId('noticeShortcut')?.addEventListener('click', () => openModal('noticeModal'));
    byId('noticeStrip')?.addEventListener('click', () => openModal('noticeModal'));

    all('.modal-backdrop').forEach(backdrop => {
      backdrop.addEventListener('click', event => {
        if (event.target === backdrop) closeModal(backdrop.id);
      });
    });

    byId('profileForm')?.addEventListener('submit', event => {
      event.preventDefault();
      const form = new FormData(event.currentTarget);
      student = {
        ...student,
        name: (form.get('name') || defaultStudent.name).toString().trim(),
        className: (form.get('className') || defaultStudent.className).toString(),
        group: (form.get('group') || defaultStudent.group).toString().trim()
      };
      saveStudent();
      renderStudent();
      closeModal('editModal');
      showFeedback('ব্যক্তিগত তথ্য সংরক্ষণ হয়েছে');
    });

    document.addEventListener('keydown', event => {
      if (event.key === 'Escape') all('.modal-backdrop:not([hidden])').forEach(modal => closeModal(modal.id));
    });
    window.addEventListener('online', updateConnectionStatus);
    window.addEventListener('offline', updateConnectionStatus);
  }

  function registerServiceWorker() {
    if (!('serviceWorker' in navigator)) return;
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js').catch(() => {
        // The UI is still fully usable when opened without a service worker.
      });
    });
  }

  renderStudent();
  populateClassOptions();
  renderRoutine();
  updateConnectionStatus();
  bindEvents();
  setupAuth();
  setupInstallPrompt();
  registerServiceWorker();

  if (account && hasSession()) {
    student = { ...student, ...(account.student || {}) };
    openStudentApp();
  } else {
    showAuthScreen();
  }

  // PWA shortcuts can open the app with a section hash.
  const hashView = window.location.hash.replace('#', '');
  if (['home', 'routine', 'courses', 'results', 'profile'].includes(hashView)) {
    setView(hashView);
  }
})();
