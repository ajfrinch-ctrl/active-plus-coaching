/* Active Plus Coaching — offline student experience */
(() => {
  'use strict';

  const STORAGE_KEY = 'active-plus-student-v1';
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
  let deferredInstallPrompt = null;

  function loadStudent() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
      return saved ? { ...defaultStudent, ...saved } : { ...defaultStudent };
    } catch (error) {
      return { ...defaultStudent };
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
    const select = byId('classInput');
    if (!select) return;
    select.innerHTML = enabledClasses.map(className => `<option value="${className}">${className}</option>`).join('');
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
  setupInstallPrompt();
  registerServiceWorker();

  // PWA shortcuts can open the app with a section hash.
  const hashView = window.location.hash.replace('#', '');
  if (['home', 'routine', 'courses', 'results', 'profile'].includes(hashView)) {
    setView(hashView);
  }
})();
