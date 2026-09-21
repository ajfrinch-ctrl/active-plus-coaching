/**
 * UI layer for the SSC prep assessment module.
 * Views are pure render functions over `state`; all logic is in exam-logic.js,
 * all persistence in storage.js — so each piece can be tested or replaced alone.
 */
import {
  blankCq, blankMcq, blankSet, buildResult, CQ_SKILLS, chapterBreakdown, countEdits, diffBank, examDeadline, formatSeconds,
  linePath, mergeBank, minimalDiff, pickQuestions, remainingSeconds, scoreCQ, shuffledOptions, shouldAutoSubmit, summarize,
  toBn, toLocalInput, validateBank, validateCq, validateMcq, validateSet, verdictFor, windowState
} from './exam-logic.js';
import { closeModal, esc, onAction, onChange, onInput, onKey, openModal, toast, $ } from './ui-kit.js';
import {
  clearAllData, clearBankOverlay, clearDraft, clearResults, dropBankPatch, loadBankOverlay, loadCqSubmissions,
  loadDraft, loadResults, loadTheme, replaceBankOverlay, saveBankPatch, saveCqSubmission, saveDraft, saveResult,
  saveTheme
} from './storage.js';

const DATA_URL = window.SSC_DATA_URL || 'data/questions.json';
const VIEWS = ['dashboard', 'practice', 'tests', 'cq'];

const state = {
  data: null,
  base: null,
  admin: { tab: 'mcq', form: null, error: null, overlay: null },
  view: 'dashboard',
  practice: { chapterId: '', difficulty: '', size: 5, order: [], index: 0, answers: {}, feedback: {} },
  session: null,
  result: null,
  reviewOpen: new Set(),
  cq: { chapterId: '', activeId: null, revealed: new Set(), answers: {}, ratings: {} }
};

/* ---------- boot ---------- */

export async function initApp() {
  const root = $('#app');
  try {
    state.base = await loadData();
    state.admin.overlay = loadBankOverlay();
    state.data = mergeBank(state.base, state.admin.overlay);
  } catch (error) {
    root.innerHTML = fatalNotice(error);
    return;
  }

  document.documentElement.classList.toggle('dark', loadTheme() === 'dark');
  bindGlobalHandlers(root);
  restoreLastResult();
  render();
}

async function loadData() {
  if (window.SSC_DATA) return window.SSC_DATA;
  const response = await fetch(DATA_URL, { cache: 'no-store' });
  if (!response.ok) throw new Error(`ডেটা লোড হয়নি (HTTP ${response.status})`);
  return response.json();
}

function fatalNotice(error) {
  return `
    <div class="mx-auto max-w-lg rounded-2xl border border-rose-200 bg-rose-50 p-6 text-rose-900 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-100">
      <h2 class="text-lg font-bold">প্রশ্নব্যাংক খোলা যায়নি</h2>
      <p class="mt-2 text-sm">${esc(error.message)}</p>
      <p class="mt-3 text-sm">JSON ফাইল পড়তে হলে ফোল্ডারটি একটি স্ট্যাটিক সার্ভার দিয়ে পরিবেশন করুন:</p>
      <pre class="mt-2 overflow-x-auto rounded-lg bg-rose-900/90 p-3 text-xs text-white"><code>cd ssc-prep &amp;&amp; python3 -m http.server 4173</code></pre>
    </div>`;
}

function restoreLastResult() {
  const results = loadResults();
  if (results.length) state.result = results[0];
}

function bindGlobalHandlers(root) {
  // Delegation starts at <body>: the confirm modals sit outside #app on purpose,
  // so a view re-render cannot close them mid-interaction.
  onAction(document.body, actions);
  onChange(root, '#practiceChapter', (event, el) => {
    state.practice.chapterId = el.value;
    state.practice.order = [];
    render();
  });
  onChange(root, '#cqChapter', (event, el) => {
    state.cq.chapterId = el.value;
    state.cq.activeId = null;
    render();
  });
  onInput(root, '[data-cq-answer]', (event, el) => {
    state.cq.answers[el.dataset.cqAnswer] = el.value;
  });
  // modal close buttons live inside the static markup, so they need their own listener
  document.body.addEventListener('click', event => {
    const closer = event.target.closest('[data-close-modal]');
    if (closer) {
      closeModal(closer.dataset.closeModal);
      return;
    }
    if (event.target.matches('[data-modal-backdrop]')) closeModal(event.target.dataset.modalBackdrop);
  });
  onKey(root, handleShortcuts);
  document.addEventListener('visibilitychange', handleVisibility);
}

function handleShortcuts(event, root) {
  const session = state.session;
  if (!session) return;

  if (/^[1-4]$/.test(event.key)) {
    const option = session.questions[session.index].options[Number(event.key) - 1];
    if (option) {
      root.querySelector(`[data-action="answer"][data-value="${option.id}"]`)?.click();
      event.preventDefault();
    }
    return;
  }
  if (event.key === 'ArrowRight') return actions.next({ target: 'next' }, root);
  if (event.key === 'ArrowLeft') return actions.prev({}, root);
  if (event.key.toLowerCase() === 'f') return actions.flag({}, root);
  if (event.key === 'Escape') closeModal('submitModal');
}

/* ---------- render pipeline ---------- */

function render() {
  const root = $('#app');
  root.innerHTML = {
    dashboard: viewDashboard,
    practice: viewPractice,
    tests: viewTests,
    runner: viewRunner,
    result: viewResult,
    cq: viewCQ,
    admin: viewAdmin
  }[state.view]();

  $$nav().forEach(button => {
    const active = button.dataset.nav === state.view || (state.view === 'result' && button.dataset.nav === 'tests');
    button.classList.toggle('is-active', active);
    button.setAttribute('aria-current', active ? 'page' : 'false');
  });

  if (state.view === 'runner') {
    startTicker();
    focusQuestion();
  } else {
    stopTicker();
  }
}

const $$nav = () => document.querySelectorAll('[data-nav]');

function focusQuestion() {
  window.requestAnimationFrame(() => $('#questionCard')?.focus());
}

function shell(content, { hideNav = false } = {}) {
  return `
    <div class="min-h-screen bg-slate-50 text-slate-800 dark:bg-slate-950 dark:text-slate-100">
      ${topbar()}
      ${hideNav ? '' : tabbar()}
      <main class="mx-auto w-full max-w-5xl px-4 pb-28 pt-5 sm:px-6 sm:pb-16 ${hideNav ? 'md:pt-6' : ''}">
        ${content}
      </main>
      ${footer()}
    </div>`;
}

function topbar() {
  const streak = summarize(historyPayload()).streak;
  return `
    <header class="no-print sticky top-0 z-30 border-b border-slate-200/80 bg-white/85 backdrop-blur dark:border-slate-800 dark:bg-slate-900/85">
      <div class="mx-auto flex w-full max-w-5xl items-center gap-3 px-4 py-3 sm:px-6">
        <span class="grid h-9 w-9 place-items-center rounded-xl bg-emerald-600 text-sm font-black text-white">S</span>
        <div class="min-w-0 flex-1">
          <p class="truncate text-sm font-bold leading-tight">SSC Prep · Assessment</p>
          <p class="truncate text-xs text-slate-500 dark:text-slate-400">${esc(state.data?.meta?.board || 'ঢাকা')} বোর্ড · ${toBn(state.data?.meta?.year || '')} · MCQ + CQ + মডেল টেস্ট</p>
        </div>
        ${streak ? `<span class="hidden items-center gap-1 rounded-full bg-amber-100 px-2.5 py-1 text-xs font-bold text-amber-800 dark:bg-amber-400/15 dark:text-amber-200 sm:inline-flex">🔥 ${toBn(streak)} দিন</span>` : ''}
        <button type="button" data-action="admin-open" aria-label="এক ক্লিকে ডেমো এডমিন প্যানেল"
          class="relative rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-bold text-slate-600 transition hover:border-slate-300 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800">
          এডমিন<span class="sr-only"> প্যানেল</span>
          ${countEdits(state.admin.overlay) ? '<span class="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-amber-400" title="এই ডিভাইসে প্রশ্নব্যাংকে পরিবর্তন আছে"></span>' : ''}
        </button>
        <button class="rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-semibold hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800" type="button" data-action="theme" aria-label="থিম বদলান">
          <span class="hidden dark:inline">☀️</span><span class="dark:hidden">🌙</span>
        </button>
      </div>
    </header>`;
}

function tabbar() {
  const tabs = [
    { id: 'dashboard', label: 'ড্যাশবোর্ড', icon: '📊' },
    { id: 'practice', label: 'অধ্যায়ভিত্তিক MCQ', icon: '🎯' },
    { id: 'tests', label: 'মডেল টেস্ট ও লাইভ', icon: '⏱️' },
    { id: 'cq', label: 'সৃজনশীল প্রশ্ন', icon: '✍️' }
  ];

  return `
    <nav aria-label="প্রধান মেনু" class="no-print fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur dark:border-slate-800 dark:bg-slate-900/95 md:static md:border-0 md:bg-transparent md:backdrop-blur-none">
      <div class="mx-auto flex w-full max-w-5xl gap-1 px-2 md:px-6">
        ${tabs.map(tab => `
          <button type="button" data-nav="${tab.id}" data-action="nav" data-view="${tab.id}"
            class="nav-tab flex flex-1 shrink-0 items-center justify-center gap-1.5 rounded-t-xl px-3 py-3 text-xs font-bold text-slate-500 transition-colors hover:text-emerald-700 dark:text-slate-400 md:rounded-xl md:px-4 md:py-2.5 md:text-sm">
            <span aria-hidden="true">${tab.icon}</span><span class="truncate">${tab.label}</span>
          </button>`).join('')}
      </div>
    </nav>`;
}

const footer = () => `
  <p class="no-print pb-24 text-center text-xs text-slate-400 md:pb-8">
    সব উত্তর ও স্কোর শুধু এই ব্রাউজারেই (localStorage) সংরক্ষিত · API যুক্ত করতে <code class="rounded bg-slate-100 px-1 font-mono text-[11px] dark:bg-slate-800">js/storage.js</code> দেখুন
  </p>`;

/* ---------- shared bits ---------- */

function historyPayload() {
  return {
    attempts: loadResults(),
    submissions: loadCqSubmissions(),
    chapters: state.data?.chapters || [],
    grading: state.data?.grading || {}
  };
}

const chapterById = id => (state.data?.chapters || []).find(chapter => chapter.id === id);
const subjectById = id => (state.data?.subjects || []).find(subject => subject.id === id);
const allMcq = () => state.data?.questions?.mcq || [];
const allCq = () => state.data?.questions?.cq || [];

function verdictChip(verdict) {
  const tones = {
    emerald: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-200',
    lime: 'bg-lime-100 text-lime-800 dark:bg-lime-500/15 dark:text-lime-200',
    amber: 'bg-amber-100 text-amber-900 dark:bg-amber-500/15 dark:text-amber-200',
    rose: 'bg-rose-100 text-rose-800 dark:bg-rose-500/15 dark:text-rose-200',
    slate: 'bg-slate-100 text-slate-600 dark:bg-slate-700/40 dark:text-slate-300'
  };
  return `<span class="rounded-full px-2 py-0.5 text-[11px] font-bold ${tones[verdict.tone] || tones.slate}">${esc(verdict.label)}</span>`;
}

function statCard({ label, value, hint, tone = 'slate' }) {
  const tones = {
    slate: 'text-slate-900 dark:text-white',
    emerald: 'text-emerald-700 dark:text-emerald-300',
    amber: 'text-amber-600 dark:text-amber-300',
    rose: 'text-rose-600 dark:text-rose-300'
  };
  return `
    <div class="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <p class="text-xs font-semibold text-slate-500 dark:text-slate-400">${esc(label)}</p>
      <p class="mt-1 text-2xl font-black tabular-nums ${tones[tone]}">${value}</p>
      ${hint ? `<p class="mt-0.5 text-[11px] text-slate-400">${esc(hint)}</p>` : ''}
    </div>`;
}

const sectionTitle = (eyebrow, title, extra = '') => `
  <div class="mb-3 flex items-end justify-between gap-3">
    <div>
      <p class="text-[11px] font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">${esc(eyebrow)}</p>
      <h2 class="text-lg font-black text-slate-900 dark:text-white sm:text-xl">${esc(title)}</h2>
    </div>
    ${extra}
  </div>`;

function optionPill(option, { state: optionState, disabled }) {
  const styles = {
    idle: 'border-slate-200 bg-white hover:border-emerald-400 dark:border-slate-700 dark:bg-slate-900 dark:hover:border-emerald-500',
    correct: 'border-emerald-500 bg-emerald-50 dark:bg-emerald-500/10',
    wrong: 'border-rose-400 bg-rose-50 dark:bg-rose-500/10',
    muted: 'border-slate-200 bg-slate-50 opacity-70 dark:border-slate-800 dark:bg-slate-900/60'
  };
  return `
    <button type="button" data-action="answer" data-value="${esc(option.id)}" ${disabled ? 'disabled' : ''}
      class="group flex w-full items-start gap-3 rounded-xl border p-3 text-left transition ${styles[optionState] || styles.idle}">
      <span class="grid h-6 w-6 shrink-0 place-items-center rounded-md bg-slate-100 text-xs font-black text-slate-600 dark:bg-slate-800 dark:text-slate-200">${esc(option.id)}</span>
      <span class="flex-1 text-sm leading-relaxed">${esc(option.text)}</span>
      ${optionState === 'correct' ? '<span aria-hidden="true" class="text-emerald-600">✓</span>' : ''}
      ${optionState === 'wrong' ? '<span aria-hidden="true" class="text-rose-600">✕</span>' : ''}
    </button>`;
}

/* ---------- view: dashboard ---------- */

function viewDashboard() {
  const stats = summarize(historyPayload());

  if (!stats.attemptCount && !stats.cq.papers) {
    return shell(`
      <div class="rounded-3xl border border-dashed border-slate-300 bg-white p-8 text-center dark:border-slate-700 dark:bg-slate-900">
        <p class="text-4xl" aria-hidden="true">📈</p>
        <h2 class="mt-3 text-xl font-black text-slate-900 dark:text-white">এখনো কোনো টেস্ট দাওনি</h2>
        <p class="mx-auto mt-2 max-w-md text-sm text-slate-500 dark:text-slate-400">একটি অধ্যায় বেছে ৫টি MCQ অনুশীলন করো — সঙ্গে সঙ্গে ড্যাশবোর্ডে শক্তিশালী ও দুর্বল অধ্যায়ের চিত্র তৈরি হতে শুরু করবে।</p>
        <div class="mt-5 flex flex-wrap justify-center gap-2">
          <button type="button" data-action="nav" data-view="practice" class="rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-emerald-700">MCQ অনুশীলন শুরু</button>
          <button type="button" data-action="nav" data-view="tests" class="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-bold hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800">মডেল টেস্ট দেখো</button>
        </div>
      </div>`);
  }

  const trend = stats.trend
    ? `<span class="text-xs font-bold ${stats.trend >= 0 ? 'text-emerald-600' : 'text-rose-600'}">${stats.trend >= 0 ? '▲' : '▼'} ${toBn(Math.abs(stats.trend))}%</span>`
    : '';

  return shell(`
    <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      ${statCard({ label: 'মোট টেস্ট', value: toBn(stats.attemptCount), hint: `${toBn(stats.questionsAnswered)}টি প্রশ্নের উত্তর` })}
      ${statCard({ label: 'গড় স্কোর', value: `${toBn(stats.avgPercent)}<span class="text-base">%</span>`, hint: `সর্বোচ্চ ${toBn(stats.best)}% · গড় GPA ${toBn(stats.grade.gpa.toFixed(2))}`, tone: stats.avgPercent >= 60 ? 'emerald' : 'amber' })}
      ${statCard({ label: 'সঠিক উত্তর', value: `${toBn(stats.accuracy)}<span class="text-base">%</span>`, hint: `${toBn(stats.attemptCount ? stats.accuracy : 0)}/100 ধরনের লক্ষ্যমাত্রা`, tone: stats.accuracy >= 70 ? 'emerald' : 'rose' })}
      ${statCard({ label: 'ধারাবাহিকতা', value: `${toBn(stats.streak)}<span class="text-base"> দিন</span>`, hint: `গড়ে প্রতি প্রশ্নে ${toBn(stats.avgSecondsPerQuestion)}s` })}
    </div>

    <div class="mt-4 grid gap-4 lg:grid-cols-3">
      <section class="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900 lg:col-span-2">
        ${sectionTitle('অধ্যায়ভিত্তিক পারফরম্যান্স', 'কোথায় শক্ত, কোথায় দুর্বল', trend)}
        <ul class="space-y-3">
          ${stats.byChapter.length ? stats.byChapter.map(row => `
            <li>
              <div class="flex items-center justify-between gap-2 text-sm">
                <span class="min-w-0 truncate font-semibold">${esc(row.label)} <span class="text-xs font-normal text-slate-400">· ${toBn(row.correct)}/${toBn(row.total)}</span></span>
                ${verdictChip(row.verdict)}
              </div>
              <div class="mt-1.5 h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                <div class="h-full rounded-full transition-[width] duration-500 ${row.accuracy >= 70 ? 'bg-emerald-500' : row.accuracy >= 45 ? 'bg-amber-500' : 'bg-rose-500'}" style="width: ${row.accuracy}%"></div>
              </div>
              ${row.verdict.key === 'weak' || row.verdict.key === 'watch' ? `<button type="button" data-action="practise-chapter" data-id="${esc(row.chapterId)}" class="mt-1 text-xs font-bold text-emerald-700 underline-offset-2 hover:underline dark:text-emerald-400">এই অধ্যায়ের ৫টি প্রশ্ন অনুশীলন করো →</button>` : ''}
            </li>`).join('') : '<li class="text-sm text-slate-500">MCQ টেস্ট দিলে এখানে অধ্যায়ভিত্তিক চিত্র আসবে।</li>'}
        </ul>
      </section>

      <aside class="flex flex-col gap-4">
        <section class="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          ${sectionTitle('সাম্প্রতিক ১২টি ট্রাই', 'স্কোরের ধারা')}
          <svg viewBox="0 0 260 60" class="h-16 w-full" role="img" aria-label="স্কোরের প্রবণতা">
            <path d="${linePath(stats.series)}" fill="none" stroke="currentColor" stroke-width="2.5" class="text-emerald-600 dark:text-emerald-400" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
          <div class="mt-2 flex items-center justify-between text-xs text-slate-500">
            <span>সর্বশেষ <b class="text-slate-900 dark:text-white">${toBn(stats.series.at(-1) ?? 0)}%</b></span>
            <span>গড় GPA <b class="text-slate-900 dark:text-white">${toBn(stats.grade.gpa.toFixed(2))}</b> (${esc(stats.grade.grade)})</span>
          </div>
        </section>

        <section class="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          ${sectionTitle('সৃজনশীল', 'নম্বর দেওয়া অংশ')}
          <p class="text-2xl font-black text-slate-900 dark:text-white">${toBn(stats.cq.accuracy)}<span class="text-base">%</span></p>
          <p class="mt-1 text-xs text-slate-500 dark:text-slate-400">${toBn(stats.cq.papers)}টি উদ্দীপক · ${toBn(stats.cq.parts)}টি অংশের স্ব-মূল্যায়ন</p>
          <ul class="mt-3 space-y-1.5 text-xs">
            ${stats.skills.length ? stats.skills.map(skill => `
              <li class="flex items-center justify-between gap-2">
                <span class="truncate">${esc(skill.skill)}</span>
                <span class="tabular-nums font-bold ${skill.accuracy >= 70 ? 'text-emerald-600' : 'text-amber-600'}">${toBn(skill.accuracy)}%</span>
              </li>`).join('') : '<li class="text-slate-500">CQ সেকশন থেকে টিক দাও, এখানে দক্ষতার ভাগ দেখা যাবে।</li>'}
          </ul>
        </section>
      </aside>
    </div>

    ${stats.focus.length ? `
      <section class="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-400/25 dark:bg-amber-400/10">
        ${sectionTitle('মনোযোগ দাও', 'দুর্বল অধ্যায়গুলো আগে')}
        <ul class="grid gap-2 sm:grid-cols-2">
          ${stats.focus.map(row => `
            <li class="flex items-center justify-between gap-2 rounded-xl bg-white/80 p-3 text-sm dark:bg-slate-900/60">
              <span class="min-w-0"><b class="block truncate">${esc(row.label)}</b><span class="text-xs text-slate-500 dark:text-slate-400">${toBn(row.accuracy)}% · ${esc(row.topics.slice(0, 2).join(', ') || 'সাধারণ')} ${toBn(row.skipped) ? `· ${toBn(row.skipped)}টি অনুত্তর` : ''}</span></span>
              <button type="button" data-action="practise-chapter" data-id="${esc(row.chapterId)}" class="shrink-0 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-emerald-700">অনুশীলন</button>
            </li>`).join('')}
        </ul>
      </section>` : ''}

    <section class="mt-4">
      ${sectionTitle('টেস্ট হিস্ট্রি', 'সর্বশেষ ৮টি', `<button type="button" data-action="confirm-clear" class="text-xs font-bold text-rose-600 hover:underline">হিস্ট্রি মুছুন</button>`)}
      <div class="overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <table class="w-full text-left text-sm">
          <thead class="bg-slate-50 text-xs uppercase text-slate-500 dark:bg-slate-800/60 dark:text-slate-400">
            <tr><th class="px-4 py-2.5 font-bold">টেস্ট</th><th class="px-2 py-2.5 font-bold">ধরন</th><th class="px-2 py-2.5 text-right font-bold">স্কোর</th><th class="px-2 py-2.5 text-right font-bold">সময়</th><th class="px-4 py-2.5 text-right font-bold">রিভিউ</th></tr>
          </thead>
          <tbody>
            ${stats.attempts.map(attempt => `
              <tr class="border-t border-slate-100 dark:border-slate-800">
                <td class="px-4 py-2.5"><b class="block max-w-[16rem] truncate">${esc(attempt.title)}</b><span class="text-xs text-slate-400">${new Date(attempt.submittedAt).toLocaleString('bn-BD', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}</span></td>
                <td class="px-2 py-2.5 text-xs font-bold uppercase text-slate-500">${esc(attempt.kind)}</td>
                <td class="px-2 py-2.5 text-right tabular-nums font-black ${attempt.score.percent >= 60 ? 'text-emerald-600' : attempt.score.percent >= 40 ? 'text-amber-600' : 'text-rose-600'}">${toBn(attempt.score.percent)}%</td>
                <td class="px-2 py-2.5 text-right tabular-nums text-xs text-slate-500">${formatSeconds(attempt.durationUsedSec)}${attempt.autoSubmitted ? ' ⏰' : ''}</td>
                <td class="px-4 py-2.5 text-right"><button type="button" data-action="open-result" data-id="${esc(attempt.id)}" class="rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-bold hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800">দেখো</button></td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>
    </section>`);
}

/* ---------- view: chapter-wise MCQ practice ---------- */

function viewPractice() {
  const { chapterId, difficulty, size, order, index, answers, feedback } = state.practice;
  const running = order.length > 0;
  const chapters = state.data.chapters;

  if (!running) {
    return shell(`
      <div class="rounded-3xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
        ${sectionTitle('Immediate feedback', 'অধ্যায়ভিত্তিক MCQ অনুশীলন')}
        <p class="-mt-1 mb-4 text-sm text-slate-500 dark:text-slate-400">উত্তর দেওয়ার সঙ্গে সঙ্গে সঠিক/ভুল দেখাবে, সংক্ষিপ্ত ব্যাখ্যাসহ। এখানে সময়ের চাপ বা নেগেটিভ মার্কিং নেই।</p>
        <div class="grid gap-4 sm:grid-cols-3">
          <label class="block text-sm">
            <span class="mb-1 block font-bold text-xs uppercase tracking-wide text-slate-500">অধ্যায়</span>
            <select id="practiceChapter" class="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold outline-none focus:border-emerald-500 dark:border-slate-700 dark:bg-slate-950">
              <option value="">সব অধ্যায়</option>
              ${chapters.map(chapter => `<option value="${chapter.id}" ${chapter.id === chapterId ? 'selected' : ''}>${esc(chapter.name)} (${toBn(allMcq().filter(q => q.chapterId === chapter.id).length)}টি)`).join('')}
            </select>
          </label>
          <div>
            <span class="mb-1 block font-bold text-xs uppercase tracking-wide text-slate-500">কঠিনতা</span>
            <div class="flex gap-1.5">
              ${[['', 'সব'], ['easy', 'সহজ'], ['medium', 'মধ্যম'], ['hard', 'কঠিন']].map(([value, label]) => `
                <button type="button" data-action="practice-difficulty" data-value="${value}"
                  class="flex-1 rounded-xl px-2 py-2.5 text-xs font-bold transition ${difficulty === value ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300'}">${label}</button>`).join('')}
            </div>
          </div>
          <div>
            <span class="mb-1 block font-bold text-xs uppercase tracking-wide text-slate-500">প্রশ্ন সংখ্যা</span>
            <div class="flex gap-1.5">
              ${[5, 10, 15].map(count => `
                <button type="button" data-action="practice-size" data-value="${count}"
                  class="flex-1 rounded-xl px-2 py-2.5 text-xs font-bold transition ${Number(size) === count ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300'}">${toBn(count)}</button>`).join('')}
            </div>
          </div>
        </div>
        <div class="mt-5 flex flex-wrap items-center gap-3">
          <button type="button" data-action="practice-start" class="rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-emerald-700">অনুশীলন শুরু করো</button>
          <p class="text-xs text-slate-500">${toBn(availableCount(chapterId, difficulty))}টি প্রশ্ন এই ফিল্টারে পাওয়া যাবে</p>
        </div>
      </div>
      <div class="mt-4 grid gap-3 sm:grid-cols-2">
        ${chapters.slice(0, 4).map(chapter => {
    const pool = allMcq().filter(question => question.chapterId === chapter.id);
    const attempt = bestChapterAccuracy(chapter.id);
    return `
          <button type="button" data-action="practise-chapter" data-id="${chapter.id}" class="rounded-2xl border border-slate-200 bg-white p-4 text-left transition hover:border-emerald-400 hover:shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <div class="flex items-center justify-between gap-2">
              <p class="text-sm font-black text-slate-900 dark:text-white">${esc(chapter.name)}</p>
              ${verdictChip(verdictFor(attempt.accuracy, attempt.total))}
            </div>
            <p class="mt-1 text-xs text-slate-500 dark:text-slate-400">${esc(chapter.unit)} · ${esc(chapter.book)} · ${toBn(pool.length)}টি প্রশ্ন ব্যাংকে</p>
            ${attempt.total ? `<p class="mt-2 text-xs font-bold text-emerald-700 dark:text-emerald-400">তোমার সেরা ${toBn(attempt.accuracy)}% (${toBn(attempt.correct)}/${toBn(attempt.total)})</p>` : '<p class="mt-2 text-xs text-slate-400">এখনো এই অধ্যায়ে অনুশীলন করোনি</p>'}
          </button>`;
  }).join('')}
      </div>`);
  }

  const question = order[index];
  const chosen = answers[question.id];
  const shown = feedback[question.id];
  const answeredCount = order.filter(item => answers[item.id] !== undefined).length;
  const correctCount = order.filter(item => answers[item.id] !== undefined && answers[item.id] === item.answer).length;

  return shell(`
    <div class="rounded-3xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
      <div class="flex flex-wrap items-center justify-between gap-2">
        <div class="min-w-0">
          <p class="text-[11px] font-bold uppercase tracking-wider text-emerald-600">${esc(chapterById(question.chapterId)?.name || 'MCQ')} · ${esc(question.topic?.trim() || '')}</p>
          <h2 class="mt-0.5 text-lg font-black text-slate-900 dark:text-white">প্রশ্ন ${toBn(index + 1)} / ${toBn(order.length)}</h2>
        </div>
        <div class="flex items-center gap-2 text-xs font-bold">
          <span class="rounded-full bg-emerald-100 px-2.5 py-1 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-200">সঠিক ${toBn(correctCount)}</span>
          <button type="button" data-action="practice-stop" class="rounded-full border border-slate-200 px-2.5 py-1 hover:bg-slate-100 dark:border-slate-700">থামাও</button>
        </div>
      </div>

      <div class="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
        <div id="practiceBar" class="h-full rounded-full bg-emerald-500 transition-[width] duration-300" style="width: ${(answeredCount / order.length) * 100}%"></div>
      </div>

      <div class="mt-5 rounded-2xl bg-slate-50 p-4 dark:bg-slate-950/40">
        <p class="text-[11px] font-bold uppercase tracking-wide text-slate-400">${esc(question.source || '')} · ${toBn(question.marks)} নম্বর</p>
        <p class="mt-1.5 text-base font-semibold leading-relaxed text-slate-900 dark:text-white">${esc(question.stem)}</p>
      </div>

      <div class="mt-3 grid gap-2" role="group" aria-label="উত্তরের অপশন">
        ${question.options.map(option => {
    let optionState = 'idle';
    if (shown) {
      if (option.id === question.answer) optionState = 'correct';
      else if (option.id === chosen) optionState = 'wrong';
      else optionState = 'muted';
    }
    return optionPill(option, { state: optionState, disabled: Boolean(shown) });
  }).join('')}
      </div>

      ${shown ? `
        <div role="status" class="mt-3 rounded-2xl border p-4 ${shown.correct ? 'border-emerald-200 bg-emerald-50 dark:border-emerald-500/25 dark:bg-emerald-500/10' : 'border-rose-200 bg-rose-50 dark:border-rose-500/25 dark:bg-rose-500/10'}">
          <div class="flex items-center gap-2">
            <span class="text-xl" aria-hidden="true">${shown.correct ? '✅' : '⚠️'}</span>
            <p class="text-sm font-black ${shown.correct ? 'text-emerald-800 dark:text-emerald-200' : 'text-rose-800 dark:text-rose-200'}">
              ${shown.correct ? 'সঠিক উত্তর!' : `ভুল — সঠিক উত্তর: ${esc(question.answer)}`}
            </p>
          </div>
          <p class="mt-2 text-sm leading-relaxed text-slate-700 dark:text-slate-200"><b class="font-black">ব্যাখ্যা:</b> ${esc(question.explanation)}</p>
        </div>` : '<p class="mt-3 text-xs text-slate-400">অপশনে ক্লিক করো (কীবোর্ড: ১–৪ চাপো)।</p>'}

      <div class="mt-4 flex flex-wrap gap-2">
        <button type="button" data-action="practice-prev" ${index === 0 ? 'disabled' : ''} class="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-bold disabled:opacity-40 dark:border-slate-700">আগের প্রশ্ন</button>
        ${shown ? `<button type="button" data-action="practice-jump" data-id="${esc(question.id)}" class="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-bold dark:border-slate-700">${esc(question.answer === chosen ? 'পরে যাও' : 'আবার চেষ্টা করো')}</button>` : ''}
        <button type="button" data-action="practice-next" class="rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-emerald-700">${index === order.length - 1 ? 'ফলাফল দেখো' : 'পরের প্রশ্ন'}</button>
      </div>
    </div>
    ${index === order.length - 1 && shown ? practiceSummary(order, answers) : ''}`);
}

function practiceSummary(order, answers) {
  const score = order.reduce((acc, question) => {
    if (answers[question.id] === undefined) acc.skipped += 1;
    else if (answers[question.id] === question.answer) acc.correct += 1;
    else acc.wrong += 1;
    return acc;
  }, { correct: 0, wrong: 0, skipped: 0 });
  const percent = order.length ? Math.round((score.correct / order.length) * 100) : 0;
  const wrongIds = order.filter(question => answers[question.id] !== undefined && answers[question.id] !== question.answer).map(question => question.id);

  return `
    <section class="mt-4 rounded-3xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
      ${sectionTitle('এক নজরে', 'অনুশীলনের ফল')}
      <div class="grid grid-cols-2 gap-3 sm:grid-cols-4">
        ${statCard({ label: 'স্কোর', value: `${toBn(percent)}<span class="text-base">%</span>`, tone: percent >= 70 ? 'emerald' : 'amber' })}
        ${statCard({ label: 'সঠিক', value: toBn(score.correct) })}
        ${statCard({ label: 'ভুল', value: toBn(score.wrong), tone: score.wrong ? 'rose' : 'slate' })}
        ${statCard({ label: 'অনুত্তর', value: toBn(score.skipped) })}
      </div>
      <div class="mt-4 flex flex-wrap gap-2">
        ${wrongIds.length ? `<button type="button" data-action="practice-retry" data-ids="${wrongIds.join(',')}" class="rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-bold text-white dark:bg-white dark:text-slate-900">ভুল ${toBn(wrongIds.length)}টি আবার করো</button>` : ''}
        <button type="button" data-action="practice-restart" class="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-bold dark:border-slate-700">নতুন সেট</button>
        <button type="button" data-action="save-practice" class="rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-emerald-700">হিস্ট্রিতে সংরক্ষণ করো</button>
      </div>
    </section>`;
}

/* ---------- view: model test & live exam ---------- */

function viewTests() {
  const sets = state.data.sets || [];
  const drafts = sets.map(set => loadDraft(set.id));

  return shell(`
    <div class="grid gap-4 lg:grid-cols-2">
      ${sets.map((set, position) => {
    const questions = pickQuestions(allMcq(), { set });
    const windowInfo = set.kind === 'live' ? windowState(set, Date.now()) : null;
    const draft = drafts[position];
    const attempted = loadResults().filter(result => result.setId === set.id);
    const best = attempted.length ? Math.max(...attempted.map(result => result.score.percent)) : null;

    return `
        <article class="flex flex-col rounded-3xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900 ${windowInfo && !windowInfo.canStart ? 'opacity-95' : ''}">
          <div class="flex items-start justify-between gap-3">
            <div class="min-w-0">
              <p class="text-[11px] font-bold uppercase tracking-wider ${set.kind === 'live' ? 'text-rose-600' : set.kind === 'model' ? 'text-indigo-600' : 'text-emerald-600'}">${set.kind === 'live' ? 'লাইভ এক্সাম' : set.kind === 'model' ? 'টাইড মডেল টেস্ট' : 'প্র্যাকটিস সেট'}</p>
              <h3 class="mt-0.5 text-lg font-black leading-snug text-slate-900 dark:text-white">${esc(set.title)}</h3>
            </div>
            ${best !== null ? `<span class="shrink-0 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-black text-slate-700 dark:bg-slate-800 dark:text-slate-200">সেরা ${toBn(best)}%</span>` : ''}
          </div>


          <dl class="mt-4 grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
            ${[
      ['প্রশ্ন', `${toBn(questions.length)}`],
      ['সময়', set.durationMin ? `${toBn(set.durationMin)} মিনিট` : 'নেই'],
      ['নেগেটিভ', set.negativePerWrong ? `−${toBn(set.negativePerWrong)}` : 'নেই'],
      ['পাস', `${toBn(set.passPercent)}%`]
    ].map(([label, value]) => `<div class="rounded-xl bg-slate-50 p-2.5 dark:bg-slate-950/40"><dt class="text-[10px] font-bold uppercase text-slate-400">${label}</dt><dd class="font-black text-slate-800 dark:text-slate-100">${value}</dd></div>`).join('')}
          </dl>

          ${set.instructions?.length ? `
            <ul class="mt-3 space-y-1 text-xs text-slate-500 dark:text-slate-400">
              ${set.instructions.map(line => `<li class="flex gap-1.5"><span aria-hidden="true" class="text-emerald-500">•</span><span>${esc(line)}</span></li>`).join('')}
            </ul>` : ''}

          ${windowInfo ? `
            <div class="mt-3 rounded-xl border px-3 py-2.5 text-xs font-bold ${windowInfo.canStart ? 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-500/25 dark:bg-emerald-500/10 dark:text-emerald-200' : 'border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-700 dark:bg-slate-950/40 dark:text-slate-300'}">
              <span class="inline-flex items-center gap-1.5">
                <span class="relative flex h-2 w-2">${windowInfo.canStart ? '<span class="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75"></span>' : ''}<span class="relative inline-flex h-2 w-2 rounded-full ${windowInfo.canStart ? 'bg-emerald-500' : 'bg-slate-400'}"></span></span>
                ${esc(windowInfo.label)}${windowInfo.key === 'scheduled' ? ` · ${formatCountdown(windowInfo.opensInMs)}` : ''}${windowInfo.key === 'open' && windowInfo.closesInMs ? ` · শেষ হতে ${formatCountdown(windowInfo.closesInMs)}` : ''}
              </span>
            </div>` : ''}

          <div class="mt-4 flex flex-1 items-end gap-2">
            ${draft ? `<button type="button" data-action="resume" data-id="${set.id}" class="flex-1 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-bold text-white dark:bg-white dark:text-slate-900">চালিয়ে যাও (${toBn(Object.keys(draft.answers || {}).length)}/${toBn(questions.length)})</button>` : ''}
            <button type="button" data-action="start-set" data-id="${set.id}" ${windowInfo && !windowInfo.canStart ? 'disabled' : ''} class="${draft ? '' : 'flex-1 '}rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-500 dark:disabled:bg-slate-800 dark:disabled:text-slate-600">${draft ? 'নতুনভাবে শুরু' : windowInfo && windowInfo.key === 'closed' ? 'সময় শেষ' : 'টেস্ট শুরু করো'}</button>
          </div>
        </article>`;
  }).join('')}
    </div>

    ${loadResults().length ? `
      <section class="mt-5">
        ${sectionTitle('আবার দেখো', 'সংরক্ষিত ফলাফল')}
        <div class="flex flex-wrap gap-2">
          ${loadResults().slice(0, 8).map(result => `
            <button type="button" data-action="open-result" data-id="${esc(result.id)}" class="rounded-xl border border-slate-200 bg-white px-3 py-2 text-left text-xs font-bold hover:border-emerald-400 dark:border-slate-700 dark:bg-slate-900">
              <span class="block max-w-[13rem] truncate text-slate-800 dark:text-slate-100">${esc(result.title)}</span>
              <span class="text-slate-400">${toBn(result.score.percent)}% · ${new Date(result.submittedAt).toLocaleDateString('bn-BD', { day: 'numeric', month: 'short' })}</span>
            </button>`).join('')}
        </div>
      </section>` : ''}`);
}

const timerLabel = remaining => (remaining === null ? '∞' : formatSeconds(remaining));
const timerIsLow = remaining => remaining !== null && remaining <= 60;

const runnerEyebrow = kind => (kind === 'live'
  ? '🔴 লাইভ এক্সাম · ট্যাব বদলানো যাবে না'
  : kind === 'practice' ? 'প্র্যাকটিস সেট · নিজের গতিতে' : 'টাইড মডেল টেস্ট');

const formatCountdown = ms => {
  const total = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  const pad = value => String(value).padStart(2, '0');
  return toBn(hours ? `${pad(hours)}:${pad(minutes)}:${pad(seconds)}` : `${pad(minutes)}:${pad(seconds)}`);
};

/* ---------- runner (timed / live) ---------- */

function viewRunner() {
  const session = state.session;
  const question = session.questions[session.index];
  const answeredCount = session.questions.filter(item => session.answers[item.id]).length;
  const options = shuffledOptions(question, session.set);

  return shell(`
    <div class="rounded-3xl border ${session.set.kind === 'live' ? 'border-rose-200 dark:border-rose-500/30' : 'border-slate-200 dark:border-slate-800'} bg-white p-5 shadow-sm dark:bg-slate-900">
      <header class="flex flex-wrap items-center justify-between gap-3">
        <div class="min-w-0">
          <p class="truncate text-[11px] font-bold uppercase tracking-wider ${session.set.kind === 'live' ? 'text-rose-600' : 'text-indigo-600'}">${runnerEyebrow(session.set.kind)}</p>
          <h2 class="mt-0.5 truncate text-lg font-black text-slate-900 dark:text-white">${esc(session.set.title)}</h2>
        </div>
        <div class="flex items-center gap-2">
          <div id="timerBox" class="rounded-2xl border px-4 py-2 text-right tabular-nums ${timerIsLow(session.remaining) ? 'border-rose-300 bg-rose-50 dark:border-rose-500/40 dark:bg-rose-500/10' : 'border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-950/40'}" role="timer" aria-live="off">
            <p class="text-[10px] font-bold uppercase text-slate-400">${session.remaining === null ? 'সময়সীমা নেই' : 'বাকি সময়'}</p>
            <p id="timerValue" class="text-2xl font-black leading-none ${timerIsLow(session.remaining) ? 'text-rose-600' : 'text-slate-900 dark:text-white'}">${timerLabel(session.remaining)}</p>
          </div>
          <button type="button" data-action="exit-runner" class="rounded-xl border border-slate-200 px-3 py-2.5 text-xs font-bold text-slate-500 hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800">সেভ করে বের হও</button>
          <button type="button" data-action="flag" class="rounded-xl border px-3 py-2.5 text-xs font-bold ${session.flags[question.id] ? 'border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-400/30 dark:bg-amber-400/10 dark:text-amber-200' : 'border-slate-200 text-slate-500 hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800'}" aria-pressed="${Boolean(session.flags[question.id])}">${session.flags[question.id] ? '✓ ফ্ল্যাগ করা' : '⚑ ফ্ল্যাগ'}</button>
        </div>
      </header>

      <div id="runnerProgress" class="mt-4 h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
        <div id="runnerBar" class="h-full rounded-full bg-emerald-500 transition-[width] duration-300" style="width: ${(answeredCount / session.questions.length) * 100}%"></div>
      </div>

      <div class="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_11rem]">
        <div id="questionCard" tabindex="-1" class="outline-none">
          <div class="rounded-2xl bg-slate-50 p-4 dark:bg-slate-950/40">
            <p class="text-[11px] font-bold uppercase tracking-wide text-slate-400">
              প্রশ্ন ${toBn(session.index + 1)} · ${esc(chapterById(question.chapterId)?.name || '')} · ${toBn(question.marks)} নম্বর
            </p>
            <p class="mt-1.5 text-base font-semibold leading-relaxed text-slate-900 dark:text-white">${esc(question.stem)}</p>
          </div>
          <div class="mt-3 grid gap-2 sm:grid-cols-2" role="group" aria-label="উত্তরের অপশন">
            ${options.map(option => optionPill(option, { disabled: false })).join('')}
          </div>
          <div class="mt-3 flex flex-wrap gap-2 text-xs font-bold">
            <button type="button" data-action="clear-answer" class="rounded-lg border border-slate-200 px-3 py-2 hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800">উত্তর মুছুন</button>
            <button type="button" data-action="prev" class="rounded-lg border border-slate-200 px-3 py-2 hover:bg-slate-100 disabled:opacity-40 dark:border-slate-700 dark:hover:bg-slate-800" ${session.index === 0 ? 'disabled' : ''}>← আগের</button>
            <button type="button" data-action="next" class="rounded-lg border border-slate-200 px-3 py-2 hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800" ${session.index === session.questions.length - 1 ? 'disabled' : ''}>পরের →</button>
            <span class="ml-auto self-center text-slate-400">কীবোর্ড: ১–৪ · ← → · F</span>
          </div>
        </div>

        <aside class="rounded-2xl border border-slate-200 p-3 dark:border-slate-800">
          <p class="text-[10px] font-bold uppercase tracking-wide text-slate-400">কুইজ প্যালেট</p>
          <ol class="mt-2 grid grid-cols-6 gap-1.5 lg:grid-cols-4">
            ${session.questions.map((item, position) => {
    const answered = Boolean(session.answers[item.id]);
    const flagged = Boolean(session.flags[item.id]);
    const isCurrent = position === session.index;
    return `<li><button type="button" data-action="goto" data-index="${position}"
      aria-label="প্রশ্ন ${toBn(position + 1)}${answered ? ', উত্তর আছে' : ', খালি'}"
      class="relative grid h-8 w-full place-items-center rounded-lg text-xs font-black tabular-nums transition ${isCurrent ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900' : answered ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-200' : 'bg-slate-100 text-slate-500 hover:bg-slate-200 dark:bg-slate-800'}">
      ${toBn(position + 1)}${flagged ? '<span class="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-amber-500"></span>' : ''}
    </button></li>`;
  }).join('')}
          </ol>
          <dl class="mt-3 space-y-1 text-[11px] text-slate-500 dark:text-slate-400">
            <div class="flex items-center gap-1.5"><dt class="h-2.5 w-2.5 rounded bg-emerald-400"></dt><dd>উত্তর দেওয়া (${toBn(answeredCount)})</dd></div>
            <div class="flex items-center gap-1.5"><dt class="h-2.5 w-2.5 rounded bg-slate-300 dark:bg-slate-600"></dt><dd>বাকি (${toBn(session.questions.length - answeredCount)})</dd></div>
            <div class="flex items-center gap-1.5"><dt class="h-2.5 w-2.5 rounded bg-amber-500"></dt><dd>ফ্ল্যাগ (${toBn(Object.values(session.flags).filter(Boolean).length)})</dd></div>
          </dl>
          <button type="button" data-action="ask-submit" class="mt-3 w-full rounded-xl bg-emerald-600 px-3 py-2.5 text-sm font-bold text-white hover:bg-emerald-700">জমা দিন</button>
        </aside>
      </div>
    </div>`, { hideNav: true });
}

/* ---------- view: instant result ---------- */

function viewResult() {
  const result = state.result;
  if (!result) return viewTests();

  const questions = result.score.perQuestion;
  const breakdown = chapterBreakdown(result.score, state.data.chapters);
  const weakTopics = breakdown.filter(row => row.verdict.key === 'weak' || row.verdict.key === 'watch');
  const set = (state.data.sets || []).find(item => item.id === result.setId);

  return shell(`
    ${state.reviewMode ? '' : `<div class="mb-4 flex flex-wrap items-center gap-2 print:hidden">
      <button type="button" data-action="nav" data-view="dashboard" class="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900">← ড্যাশবোর্ড</button>
      <button type="button" data-action="print" class="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900">🖨 প্রিন্ট / PDF</button>
    </div>`}

    <section class="grid gap-4 ${result.grade.passed ? 'lg:grid-cols-[1.1fr_1fr]' : 'lg:grid-cols-[1.1fr_1fr]'}">
      <div class="rounded-3xl border ${result.grade.passed ? 'border-emerald-200 bg-emerald-600' : 'border-rose-200 bg-rose-600'} p-5 text-white sm:p-6 print:bg-white print:text-slate-900">
        <p class="text-[11px] font-bold uppercase tracking-wider opacity-80">${result.kind === 'live' ? 'লাইভ মক · ফলাফল' : result.kind === 'model' ? 'মডেল টেস্ট · ফলাফল' : 'অনুশীলন · ফলাফল'}</p>
        <h2 class="mt-1 text-xl font-black">${esc(result.title)}</h2>
        <div class="mt-4 flex flex-wrap items-end gap-x-6 gap-y-3">
          <p class="text-5xl font-black leading-none tabular-nums">${toBn(result.score.percent)}<span class="text-2xl">%</span></p>
          <div class="text-sm font-bold">
            <p>GPA ${toBn(result.grade.gpa.toFixed(2))} · ${esc(result.grade.grade)}</p>
            <p class="opacity-90">${toBn(result.score.marks)} / ${toBn(result.score.maxMarks)} নম্বর</p>
          </div>
          <span class="rounded-full bg-white/20 px-3 py-1 text-xs font-black">${result.grade.passed ? 'উত্তীর্ণ ✓' : `পাস হতে ${toBn(result.grade.passPercent)}% দরকার`}</span>
        </div>
        <div class="mt-4 grid grid-cols-3 gap-2 text-center">
          ${[
      ['সঠিক', result.score.correct, 'bg-white/15'],
      ['ভুল', result.score.wrong, 'bg-white/15'],
      ['অনুত্তর', result.score.skipped, 'bg-white/15']
    ].map(([label, value, tone]) => `<div class="rounded-xl ${tone} px-2 py-2.5"><p class="text-[10px] font-bold uppercase opacity-80">${label}</p><p class="text-xl font-black tabular-nums">${toBn(value)}</p></div>`).join('')}
        </div>
        <p class="mt-3 text-xs opacity-90">
          সময় ${formatSeconds(result.durationUsedSec)}${result.limitSec ? ` / ${toBn(result.limitSec / 60)} মিনিট` : ''} · প্রতি প্রশ্নে গড় ${toBn(result.score.total ? Math.round(result.durationUsedSec / result.score.total) : 0)}s
          ${result.negativePerWrong ? ` · নেগেটিভ −${toBn(result.negativePerWrong)}` : ''}
          ${result.autoSubmitted ? ' · ⏰ সময় শেষে স্বয়ংক্রিয় জমা' : ''}
          ${result.submission?.tabSwitches ? ` · ট্যাব সুইচ ${toBn(result.submission.tabSwitches)} বার` : ''}
        </p>
      </div>

      <div class="rounded-3xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
        ${sectionTitle('পারফরম্যান্স সামারি', 'অধ্যায় অনুযায়ী')}
        <ul class="space-y-2.5">
          ${breakdown.map(row => `
            <li>
              <div class="flex items-center justify-between gap-2 text-sm">
                <span class="min-w-0 truncate font-semibold text-slate-800 dark:text-slate-100">${esc(row.label)}</span>
                ${verdictChip(row.verdict)}
              </div>
              <div class="mt-1 h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                <div class="h-full rounded-full ${row.accuracy >= 70 ? 'bg-emerald-500' : row.accuracy >= 45 ? 'bg-amber-500' : 'bg-rose-500'}" style="width:${row.accuracy}%"></div>
              </div>
              <p class="mt-1 text-[11px] text-slate-400">${toBn(row.correct)}/${toBn(row.total)} সঠিক${row.topics.length ? ` · ${esc(row.topics.join(', '))}` : ''}</p>
            </li>`).join('')}
        </ul>
        ${weakTopics.length ? `
          <div class="mt-4 rounded-2xl bg-amber-50 p-3 text-xs dark:bg-amber-400/10">
            <p class="font-black text-amber-900 dark:text-amber-200">পরামর্শ</p>
            <p class="mt-1 leading-relaxed text-amber-800 dark:text-amber-100">${esc(weakTopics.map(row => row.label).join(', '))} অধ্যায়ে ফিরে যাও — প্রতিটি প্রশ্ন গড়ে ${toBn(Math.max(30, 45 - Math.round(result.durationUsedSec / Math.max(1, result.score.total))))} সেকেন্ডের মধ্যে উত্তর দেওয়ার চেষ্টা করো।</p>
            <button type="button" data-action="practise-chapter" data-id="${esc(weakTopics[0].chapterId)}" class="mt-2 rounded-lg bg-amber-600 px-3 py-1.5 font-bold text-white hover:bg-amber-700">এই অধ্যায়ের MCQ করো</button>
          </div>` : '<p class="mt-4 rounded-2xl bg-emerald-50 p-3 text-xs font-bold text-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-200">দুর্বল অধ্যায় নেই — এখন সময় কমানোর ওপর কাজ করো।</p>'}
        ${set ? `<div class="mt-4 flex flex-wrap gap-2"><button type="button" data-action="start-set" data-id="${set.id}" class="rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-bold text-white dark:bg-white dark:text-slate-900">আবার এই টেস্ট</button><button type="button" data-action="nav" data-view="tests" class="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-bold dark:border-slate-700">অন্য টেস্ট</button></div>` : ''}
      </div>
    </section>

    <section class="mt-5">
      ${sectionTitle('বিস্তারিত', `সঠিক উত্তরসহ রিভিউ (${toBn(questions.length)})`, `<button type="button" data-action="toggle-review" class="text-xs font-bold text-emerald-700 underline-offset-2 hover:underline dark:text-emerald-400">${state.reviewOpen.size ? 'সব ভাঁজ করো' : 'সব খোলো'}</button>`)}
      <ol class="space-y-2">
        ${questions.map((item, position) => {
    const open = state.reviewOpen.has(item.id);
    const option = (item.options || []).find(choice => choice.id === (item.chosen || item.answer));
    const right = (item.options || []).find(choice => choice.id === item.answer);
    return `
          <li class="overflow-hidden rounded-2xl border bg-white dark:border-slate-800 dark:bg-slate-900 ${item.state === 'correct' ? 'border-emerald-200' : item.state === 'incorrect' ? 'border-rose-200' : 'border-slate-200'}">
            <button type="button" data-action="review-toggle" data-id="${esc(item.id)}" class="flex w-full items-start gap-3 p-3.5 text-left">
              <span class="grid h-7 w-7 shrink-0 place-items-center rounded-lg text-xs font-black ${item.state === 'correct' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-200' : item.state === 'incorrect' ? 'bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-200' : 'bg-slate-100 text-slate-500 dark:bg-slate-800'}">${toBn(position + 1)}</span>
              <span class="min-w-0 flex-1">
                <span class="block text-sm font-semibold leading-snug">${esc(item.stem)}</span>
                <span class="mt-1 block text-xs text-slate-500 dark:text-slate-400">
                  ${item.state === 'correct' ? `<b class="text-emerald-700 dark:text-emerald-300">তোমার উত্তর ${esc(item.chosen)} ✓</b>` : item.state === 'incorrect' ? `<b class="text-rose-700 dark:text-rose-300">তোমার উত্তর ${esc(item.chosen)} ✕ · সঠিক ${esc(item.answer)}</b>` : `<b class="text-slate-500">উত্তর দেওনি · সঠিক ${esc(item.answer)}</b>`}
                  ${item.chapterId ? ` · ${esc(chapterById(item.chapterId)?.name || '')}` : ''}
                </span>
              </span>
              <span aria-hidden="true" class="shrink-0 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}">▾</span>
            </button>
            <div class="px-3.5 pb-3.5 text-sm ${open ? '' : 'hidden'}">
              <div class="grid gap-1.5 sm:grid-cols-2">
                ${(item.options || []).map(choice => `
                  <p class="rounded-lg px-2.5 py-1.5 text-xs ${choice.id === item.answer ? 'bg-emerald-50 font-bold text-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-200' : choice.id === item.chosen ? 'bg-rose-50 text-rose-800 line-through dark:bg-rose-500/10 dark:text-rose-200' : 'bg-slate-50 text-slate-600 dark:bg-slate-950/40 dark:text-slate-300'}">${esc(choice.id)}. ${esc(choice.text)}</p>`).join('')}
              </div>
              <p class="mt-2 rounded-xl bg-slate-50 p-3 leading-relaxed text-slate-600 dark:bg-slate-950/40 dark:text-slate-300"><b class="font-black">ব্যাখ্যা:</b> ${esc(item.explanation || '—')}</p>
            </div>
          </li>`;
  }).join('')}
      </ol>
    </section>`);
}

/* ---------- view: creative questions ---------- */

function viewCQ() {
  const { chapterId, activeId, revealed, answers, ratings } = state.cq;
  const pool = allCq().filter(question => !chapterId || question.chapterId === chapterId);
  const active = pool.find(question => question.id === activeId) || pool[0];
  const saved = loadCqSubmissions();

  if (!active) {
    return shell(`<div class="rounded-3xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-900">এই অধ্যায়ে এখনো কোনো সৃজনশীল প্রশ্ন যোগ করা হয়নি।</div>`);
  }

  const scored = scoreCQ(active.parts, ratings);
  const stored = saved.find(record => record.id === active.id);

  return shell(`
    <div class="mb-4 flex flex-wrap items-center gap-2">
      <select id="cqChapter" class="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold dark:border-slate-700 dark:bg-slate-900" aria-label="অধ্যায় বাছাই">
        <option value="">সব অধ্যায়</option>
        ${state.data.chapters.map(chapter => `<option value="${chapter.id}" ${chapter.id === chapterId ? 'selected' : ''}>${esc(chapter.name)}</option>`).join('')}
      </select>
      <div class="flex gap-1.5 overflow-x-auto">
        ${pool.map((question, position) => {
    const best = saved.find(record => record.id === question.id);
    return `<button type="button" data-action="cq-pick" data-id="${question.id}" class="shrink-0 rounded-lg px-3 py-2 text-xs font-bold transition ${question.id === active.id ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900' : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800'}">প্রশ্ন ${toBn(position + 1)}${best ? ` · ${toBn(best.percent)}%` : ''}</button>`;
  }).join('')}
      </div>
    </div>

    <article class="rounded-3xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
      <div class="flex flex-wrap items-center justify-between gap-2">
        <p class="text-[11px] font-bold uppercase tracking-wider text-emerald-600">${esc(chapterById(active.chapterId)?.name || '')} · ${esc(subjectById(active.subjectId)?.name || '')} · কঠিনতা ${esc(active.difficulty)}</p>
        <div class="flex items-center gap-2">
          <button type="button" data-action="cq-toggle-all" class="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-bold hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800">${revealed.size === active.parts.length ? 'সব মডেল উত্তর লুকানো' : 'সব মডেল উত্তর দেখাও'}</button>
        </div>
      </div>

      <div class="mt-3 rounded-2xl border-l-4 border-indigo-400 bg-indigo-50/70 p-4 dark:border-indigo-500 dark:bg-indigo-500/10">
        <p class="text-[11px] font-black uppercase tracking-wide text-indigo-700 dark:text-indigo-300">উদ্দীপক</p>
        <p class="exam-stem mt-1.5 text-sm font-semibold leading-relaxed text-slate-800 dark:text-slate-100">${esc(active.stimulus)}</p>
      </div>

      <ol class="mt-4 space-y-3">
        ${active.parts.map(part => {
    const key = `${active.id}::${part.label}`;
    const open = revealed.has(key);
    const rating = ratings[part.label] || 'none';
    return `
          <li class="rounded-2xl border border-slate-200 p-4 dark:border-slate-800">
            <div class="flex flex-wrap items-center gap-2">
              <span class="grid h-7 w-7 place-items-center rounded-lg bg-slate-900 text-sm font-black text-white dark:bg-white dark:text-slate-900">${esc(part.label)}</span>
              <span class="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-slate-600 dark:bg-slate-800 dark:text-slate-300">${esc(part.skill)}</span>
              <span class="text-xs font-bold text-slate-400">${toBn(part.marks)} নম্বর</span>
              <button type="button" data-action="cq-reveal" data-id="${esc(key)}" class="ml-auto rounded-lg border px-3 py-1.5 text-xs font-bold ${open ? 'border-indigo-300 bg-indigo-50 text-indigo-700 dark:border-indigo-400/40 dark:bg-indigo-500/10 dark:text-indigo-200' : 'border-slate-200 hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800'}" aria-expanded="${open}">
                ${open ? 'মডেল উত্তর গোপন করো' : 'মডেল উত্তর দেখাও'}
              </button>
            </div>

            <p class="mt-2.5 text-sm font-semibold leading-relaxed text-slate-800 dark:text-slate-100">${esc(part.question)}</p>

            <label class="mt-3 block text-xs font-bold uppercase tracking-wide text-slate-400" for="cq-${esc(active.id)}-${esc(part.label)}">তোমার উত্তর (খাতায় লেখার মতো)</label>
            <textarea id="cq-${esc(active.id)}-${esc(part.label)}" data-cq-answer="${esc(key)}" rows="3" class="mt-1 w-full resize-y rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm leading-relaxed outline-none focus:border-emerald-500 dark:border-slate-700 dark:bg-slate-950/40" placeholder="ধাপে ধাপে লেখো…">${esc(answers[key] || '')}</textarea>

            ${open ? `
              <div class="mt-3 rounded-xl bg-indigo-50 p-3 text-sm leading-relaxed text-slate-800 dark:bg-indigo-500/10 dark:text-slate-100">
                <p class="text-[11px] font-black uppercase tracking-wide text-indigo-700 dark:text-indigo-300">মডেল উত্তর</p>
                <p class="mt-1">${esc(part.modelAnswer)}</p>
                ${part.hint ? `<p class="mt-2 text-xs text-slate-500 dark:text-slate-400"><b>হিন্ট:</b> ${esc(part.hint)}</p>` : ''}
              </div>` : ''}

            <div class="mt-3 flex flex-wrap items-center gap-1.5">
              <span class="text-[11px] font-bold uppercase tracking-wide text-slate-400">স্ব-মূল্যায়ন</span>
              ${Object.values({ none: 'লিখিনি', partial: 'আংশিক', full: 'পূর্ণ' }).length ? ['none', 'partial', 'full'].map(value => `
                <button type="button" data-action="cq-rate" data-id="${esc(part.label)}" data-value="${value}"
                  class="rounded-lg px-2.5 py-1.5 text-xs font-bold transition ${rating === value ? (value === 'full' ? 'bg-emerald-600 text-white' : value === 'partial' ? 'bg-amber-500 text-white' : 'bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-200') : 'bg-slate-100 text-slate-500 hover:bg-slate-200 dark:bg-slate-800'}">${{ none: 'লিখিনি', partial: 'আংশিক', full: 'পূর্ণ' }[value]}</button>`).join('') : ''}
              <span class="ml-auto text-xs font-black text-slate-500">${toBn(part.marks * (rating === 'full' ? 1 : rating === 'partial' ? 0.5 : 0))}/${toBn(part.marks)}</span>
            </div>
          </li>`;
  }).join('')}
      </ol>

      <footer class="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-slate-50 p-4 dark:bg-slate-950/40">
        <div>
          <p class="text-[11px] font-bold uppercase tracking-wide text-slate-400">স্ব-মূল্যায়িত নম্বর</p>
          <p class="text-2xl font-black tabular-nums text-slate-900 dark:text-white">${toBn(scored.earned)} / ${toBn(scored.max)} <span class="text-sm font-bold text-slate-400">(${toBn(scored.percent)}%)</span></p>
        </div>
        <div class="flex gap-2">
          <button type="button" data-action="cq-reset" class="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-bold hover:bg-white dark:border-slate-700">রিসেট</button>
          <button type="button" data-action="cq-save" data-id="${active.id}" class="rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-emerald-700">সংরক্ষণ ও ড্যাশবোর্ডে যোগ করো</button>
        </div>
      </footer>
      ${stored ? `<p class="mt-2 text-right text-xs text-slate-400">সর্বশেষ সংরক্ষিত: ${new Date(stored.submittedAt).toLocaleString('bn-BD', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })} · ${toBn(stored.percent)}%</p>` : ''}
    </article>`);
}

/* ---------- ticker, drafts, proctoring ---------- */

let ticker = null;

function startTicker() {
  stopTicker();
  // An untimed set has no deadline to count down to; answers still autosave.
  if (state.session && state.session.deadline === null) return;
  ticker = window.setInterval(() => {
    const session = state.session;
    if (!session) return stopTicker();

    session.remaining = remainingSeconds(session.deadline);
    paintTicker(session);
    if (shouldAutoSubmit(session.remaining)) return autoSubmit('সময় শেষ — উত্তর স্বয়ংক্রিয়ভাবে জমা হয়েছে');

    if (session.remaining % 20 === 0) persistDraft(session);
  }, 1000);
}

function stopTicker() {
  if (ticker) window.clearInterval(ticker);
  ticker = null;
}

function paintTicker(session) {
  const value = $('#timerValue');
  const box = $('#timerBox');
  if (value) value.textContent = timerLabel(session.remaining);
  if (box) box.classList.toggle('border-rose-300', timerIsLow(session.remaining));
}

function persistDraft(session) {
  saveDraft(session.set.id, {
    answers: session.answers,
    flags: session.flags,
    index: session.index,
    deadline: session.deadline,
    startedAt: session.startedAt,
    tabSwitches: session.tabSwitches
  });
}

function handleVisibility() {
  const session = state.session;
  if (!session || session.set.kind !== 'live' || document.hidden) return;

  session.tabSwitches += 1;
  const limit = session.set.proctoring?.maxTabSwitches ?? 3;
  if (session.tabSwitches > limit) {
    return autoSubmit(`অনুমতি ছাড়া ${toBn(session.tabSwitches)} বার ট্যাব বদলেছে — উত্তর জমা দেওয়া হলো`);
  }
  toast(`⚠️ সতর্কতা: ট্যাবে ফেরা হয়েছে (${toBn(session.tabSwitches)}/${toBn(limit)})`, 'warn');
  persistDraft(session);
}

function autoSubmit(message) {
  const session = state.session;
  if (!session || session.locked) return;
  session.locked = true;
  stopTicker();
  finish({ autoSubmitted: true });
  toast(message, 'warn');
}

/* ---------- actions ---------- */

const actions = {
  nav: dataset => {
    state.view = dataset.view;
    if (state.session && dataset.view !== 'runner') {
      persistDraft(state.session);
      stopTicker();
    }
    render();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  },
  theme: () => {
    const dark = !document.documentElement.classList.contains('dark');
    document.documentElement.classList.toggle('dark', dark);
    saveTheme(dark ? 'dark' : 'light');
  },
  'practice-difficulty': dataset => {
    state.practice.difficulty = dataset.value;
    render();
  },
  'practice-size': dataset => {
    state.practice.size = Number(dataset.value);
    render();
  },
  'practice-start': () => startPractice(),
  'practice-next': () => {
    const { order, index } = state.practice;
    if (index >= order.length - 1) return finishPractice();
    state.practice.index += 1;
    render();
  },
  'practice-prev': () => {
    state.practice.index = Math.max(0, state.practice.index - 1);
    render();
  },
  'practice-jump': () => actions['practice-next'](),
  'practice-stop': () => {
    state.practice.order = [];
    render();
  },
  'practice-restart': () => {
    state.practice.answers = {};
    state.practice.feedback = {};
    startPractice();
  },
  'practice-retry': dataset => {
    const ids = dataset.ids.split(',');
    state.practice.order = allMcq().filter(question => ids.includes(question.id));
    state.practice.answers = {};
    state.practice.feedback = {};
    state.practice.index = 0;
    render();
  },
  'save-practice': () => {
    const { order, answers } = state.practice;
    if (!order.length) return;
    const now = Date.now();
    const set = { title: `অনুশীলন · ${toBn(order.length)} প্রশ্ন`, kind: 'practice', negativePerWrong: 0, durationMin: 0 };
    const result = buildResult({ set, questions: order, answers, startedAt: now, submittedAt: now, grading: state.data.grading });
    saveResult(result);
    state.result = result;
    state.view = 'result';
    render();
    toast('অনুশীলনের ফল হিস্ট্রিতে সংরক্ষিত হয়েছে', 'good');
  },
  'practise-chapter': dataset => {
    state.practice = { chapterId: dataset.id, difficulty: '', size: 5, order: [], index: 0, answers: {}, feedback: {} };
    startPractice();
    state.view = 'practice';
    render();
  },
  'answer': dataset => {
    const value = dataset.value;
    if (state.view === 'runner') return answerQuestion(value);
    if (state.view === 'practice') return answerPractice(value);
  },
  'clear-answer': () => {
    const session = state.session;
    if (!session) return;
    delete session.answers[session.questions[session.index].id];
    persistDraft(session);
    render();
  },
  next: () => {
    const session = state.session;
    if (!session) return;
    session.index = Math.min(session.questions.length - 1, session.index + 1);
    persistDraft(session);
    render();
  },
  prev: () => {
    const session = state.session;
    if (!session) return;
    session.index = Math.max(0, session.index - 1);
    persistDraft(session);
    render();
  },
  goto: dataset => {
    const session = state.session;
    if (!session) return;
    session.index = Number(dataset.index);
    persistDraft(session);
    render();
  },
  flag: () => {
    const session = state.session;
    if (!session) return;
    const id = session.questions[session.index].id;
    session.flags[id] = !session.flags[id];
    persistDraft(session);
    render();
  },
  'exit-runner': () => {
    const session = state.session;
    if (!session) return;
    persistDraft(session);
    stopTicker();
    state.view = 'tests';
    render();
    toast('উত্তর সংরক্ষিত — যেখানে থামিয়েছিলে সেখান থেকে চালিয়ে যেতে পারবে', 'good');
  },
  'start-set': dataset => startSet(dataset.id),
  resume: dataset => resumeSet(dataset.id),
  'ask-submit': () => {
    const session = state.session;
    if (!session) return;
    const unanswered = session.questions.filter(question => !session.answers[question.id]).length;
    $('#submitSummary').innerHTML = unanswered
      ? `<p class="text-sm font-bold text-amber-800 dark:text-amber-200">${toBn(unanswered)}টি প্রশ্নের উত্তর দিওনি।</p><p class="mt-1 text-sm text-slate-500">জমা দিলে আর পরিবর্তন করা যাবে না।</p>`
      : `<p class="text-sm font-bold text-emerald-800 dark:text-emerald-200">সব ${toBn(session.questions.length)}টি প্রশ্নের উত্তর আছে। প্রস্তুত?</p>`;
    openModal('submitModal');
  },
  'confirm-submit': () => {
    closeModal('submitModal');
    finish();
  },
  'cancel-submit': () => closeModal('submitModal'),
  'open-result': dataset => {
    const found = loadResults().find(result => result.id === dataset.id);
    if (!found) return toast('এই ফলাফলটি আর পাওয়া যায়নি', 'bad');
    state.result = found;
    state.reviewMode = true;
    state.session = null;
    state.view = 'result';
    render();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  },
  'review-toggle': dataset => {
    state.reviewOpen.has(dataset.id) ? state.reviewOpen.delete(dataset.id) : state.reviewOpen.add(dataset.id);
    render();
  },
  'toggle-review': () => {
    const questions = state.result?.score.perQuestion || [];
    state.reviewOpen = state.reviewOpen.size ? new Set() : new Set(questions.map(question => question.id));
    render();
  },
  print: () => {
    // A printed paper should be a complete revision sheet: open every review row first.
    const result = state.result;
    if (result) state.reviewOpen = new Set(result.score.perQuestion.map(item => item.id));
    render();
    window.print();
  },
  'confirm-clear': () => openModal('clearModal'),
  'cancel-clear': () => closeModal('clearModal'),
  'clear-history': () => {
    clearResults();
    clearAllData();
    state.result = null;
    state.reviewOpen = new Set();
    closeModal('clearModal');
    render();
    toast('টেস্ট হিস্ট্রি মুছে ফেলা হয়েছে', 'good');
  },
  'cq-pick': dataset => {
    state.cq.activeId = dataset.id;
    state.cq.revealed = new Set();
    state.cq.ratings = {};
    state.cq.answers = {};
    render();
  },
  'cq-reveal': dataset => {
    state.cq.revealed.has(dataset.id) ? state.cq.revealed.delete(dataset.id) : state.cq.revealed.add(dataset.id);
    render();
  },
  'cq-toggle-all': () => {
    const active = currentCQ();
    if (!active) return;
    const allKeys = active.parts.map(part => `${active.id}::${part.label}`);
    state.cq.revealed = state.cq.revealed.size === allKeys.length ? new Set() : new Set(allKeys);
    render();
  },
  'cq-rate': dataset => {
    state.cq.ratings[dataset.id] = dataset.value;
    render();
  },
  'cq-reset': () => {
    state.cq.ratings = {};
    state.cq.answers = {};
    render();
  },
  'cq-save': dataset => {
    const active = currentCQ();
    if (!active) return;
    const scored = scoreCQ(active.parts, state.cq.ratings);
    saveCqSubmission({
      id: active.id,
      cqId: active.id,
      chapterId: active.chapterId,
      submittedAt: Date.now(),
      earned: scored.earned,
      max: scored.max,
      percent: scored.percent,
      ratings: Object.fromEntries(active.parts.map(part => [part.label, {
        key: state.cq.ratings[part.label] || 'none',
        skill: part.skill,
        earned: ({ full: 1, partial: 0.5, none: 0 }[state.cq.ratings[part.label] || 'none']) * (part.marks || 1),
        max: part.marks || 1
      }])),
      answers: state.cq.answers
    });
    state.view = 'dashboard';
    render();
    toast(`সংরক্ষিত — ${toBn(scored.earned)}/${toBn(scored.max)} নম্বর`, 'good');
  }
};

/* ---------- flows ---------- */

/* ---------- view: demo admin (question bank + sets) ---------- */

const ADMIN_TABS = [
  { key: 'mcq', label: 'MCQ ব্যাংক' },
  { key: 'cq', label: 'সৃজনশীল' },
  { key: 'sets', label: 'টেস্ট সেট' },
  { key: 'review', label: 'ফলাফল পর্যবেক্ষণ' },
  { key: 'tools', label: 'JSON · ইমপোর্ট' }
];

const adminList = kind => (kind === 'mcq' ? allMcq() : kind === 'cq' ? allCq() : state.data?.sets || []);

const blankFor = (kind, chapterId) => (kind === 'mcq' ? blankMcq(chapterId) : kind === 'cq' ? blankCq(chapterId) : blankSet(chapterId));

function hiddenIds(kind) {
  const patches = state.admin.overlay?.[kind] || {};
  return Object.keys(patches).filter(id => patches[id]?.removed);
}

function adminHiddenStrip(kind) {
  const ids = hiddenIds(kind);
  if (!ids.length) return '';
  return `
    <div class="mt-3 rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-900/60">
      <p class="text-xs font-bold text-slate-500">লুকানো এন্ট্রি (${toBn(ids.length)}) — JSON-এ মুছে যায়নি, শুধু এই ডিভাইসে বন্ধ</p>
      <div class="mt-2 flex flex-wrap gap-2">
        ${ids.map(id => `
          <span class="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] font-mono dark:border-slate-700 dark:bg-slate-900">${esc(id)}
            <button type="button" data-action="admin-hide" data-kind="${kind}" data-id="${esc(id)}" data-hidden="no" class="font-sans font-bold text-emerald-700 hover:underline dark:text-emerald-400">চালু করো</button>
            <button type="button" data-action="admin-delete" data-kind="${kind}" data-id="${esc(id)}" class="font-sans font-bold text-rose-600 hover:underline">সরিয়ে দাও</button>
          </span>`).join('')}
      </div>
    </div>`;
}

function adminEntry(kind, id) {
  return adminList(kind).find(entry => entry.id === id) || null;
}

/** True when this id does not exist in the shipped JSON at all. */
function isAdminCreated(kind, id) {
  const base = state.base || {};
  const list = kind === 'mcq' ? base.questions?.mcq : kind === 'cq' ? base.questions?.cq : base.sets;
  return !(list || []).some(entry => entry.id === id);
}

function adminTabButton(tab) {
  const active = state.admin.tab === tab.key;
  return `<button type="button" data-action="admin-tab" data-tab="${tab.key}"
    class="shrink-0 rounded-xl px-3 py-2 text-xs font-bold transition ${active ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900' : 'border border-slate-200 bg-white text-slate-600 hover:border-slate-300 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300'}">${esc(tab.label)}</button>`;
}

function adminRowActions(kind, id) {
  const hidden = Boolean(state.admin.overlay?.[kind]?.[id]?.removed);
  const created = isAdminCreated(kind, id);
  return `
    <div class="flex shrink-0 flex-wrap items-center gap-1.5">
      <button type="button" data-action="admin-edit" data-kind="${kind}" data-id="${esc(id)}" class="rounded-lg border border-slate-200 px-2.5 py-1 text-[11px] font-bold hover:border-emerald-400 dark:border-slate-700">সম্পাদনা</button>
      ${created ? `<button type="button" data-action="admin-delete" data-kind="${kind}" data-id="${esc(id)}" class="rounded-lg border border-rose-200 px-2.5 py-1 text-[11px] font-bold text-rose-600 hover:bg-rose-50 dark:border-rose-500/30">মুছে ফেলো</button>`
      : `<button type="button" data-action="admin-hide" data-kind="${kind}" data-id="${esc(id)}" data-hidden="${hidden ? 'no' : 'yes'}" class="rounded-lg border border-slate-200 px-2.5 py-1 text-[11px] font-bold text-slate-500 hover:bg-slate-100 dark:border-slate-700">${hidden ? 'আবার দেখাও' : 'লুকিয়ে রাখো'}</button>`}
      ${hidden || created ? '' : `<button type="button" data-action="admin-revert" data-kind="${kind}" data-id="${esc(id)}" class="rounded-lg border border-slate-200 px-2.5 py-1 text-[11px] font-bold text-slate-500 hover:bg-slate-100 dark:border-slate-700" title="শিপ করা JSON-এর মান ফিরিয়ে আনো">ফেরত</button>`}
    </div>`;
}

function adminMcqTable() {
  const rows = adminList('mcq');
  if (!rows.length) return `<p class="rounded-xl border border-dashed p-5 text-center text-sm text-slate-500">এখনো কোনো MCQ নেই — নতুন প্রশ্ন যোগ করো।</p>`;
  return `
    <div class="overflow-x-auto rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
      <table class="w-full min-w-[640px] text-left text-sm">
        <thead class="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500 dark:bg-slate-800/60">
          <tr><th class="px-4 py-2.5">প্রশ্ন</th><th class="px-3 py-2.5">অধ্যায়</th><th class="px-3 py-2.5">টপিক</th><th class="px-3 py-2.5">উত্তর</th><th class="px-3 py-2.5">নম্বর</th><th class="px-3 py-2.5"></th></tr>
        </thead>
        <tbody class="divide-y divide-slate-100 dark:divide-slate-800">
          ${rows.map(question => `
            <tr>
              <td class="px-4 py-2.5">
                <p class="line-clamp-2 max-w-[22rem] font-semibold">${esc(question.stem)}</p>
                <p class="mt-0.5 font-mono text-[10px] text-slate-400">${esc(question.id)} · ${esc(question.difficulty)}</p>
              </td>
              <td class="px-3 py-2.5 text-xs">${esc(chapterById(question.chapterId)?.name || '—')}</td>
              <td class="px-3 py-2.5 text-xs">${esc(question.topic || '—')}</td>
              <td class="px-3 py-2.5 text-xs font-bold text-emerald-700 dark:text-emerald-300">${esc(question.answer)}</td>
              <td class="px-3 py-2.5 text-xs tabular-nums">${toBn(question.marks)}</td>
              <td class="px-3 py-2.5">${adminRowActions('mcq', question.id)}</td>
            </tr>`).join('')}
        </tbody>
      </table>
    </div>`;
}

function adminCqTable() {
  const rows = adminList('cq');
  if (!rows.length) return `<p class="rounded-xl border border-dashed p-5 text-center text-sm text-slate-500">সৃজনশীল প্রশ্ন নেই।</p>`;
  return `
    <div class="space-y-2">
      ${rows.map(question => {
    const total = (question.parts || []).reduce((sum, part) => sum + (Number(part.marks) || 0), 0);
    return `
        <div class="rounded-2xl border border-slate-200 bg-white p-3.5 dark:border-slate-800 dark:bg-slate-900">
          <div class="flex flex-wrap items-start justify-between gap-3">
            <div class="min-w-0">
              <p class="text-sm font-bold">${esc(question.id)}</p>
              <p class="mt-0.5 line-clamp-2 text-xs text-slate-500">${esc(question.stimulus)}</p>
              <p class="mt-1 text-[11px] text-slate-400">${esc(chapterById(question.chapterId)?.name || '—')} · ${(question.parts || []).length} অংশ · ${toBn(total)} নম্বর</p>
            </div>
            ${adminRowActions('cq', question.id)}
          </div>
        </div>`;
  }).join('')}
    </div>`;
}

function adminSetTable() {
  const rows = adminList('sets');
  if (!rows.length) return `<p class="rounded-xl border border-dashed p-5 text-center text-sm text-slate-500">কোনো সেট নেই।</p>`;
  const kindLabel = { practice: 'প্র্যাকটিস', model: 'মডেল টেস্ট', live: 'লাইভ' };
  return `
    <div class="space-y-2">
      ${rows.map(set => `
        <div class="rounded-2xl border border-slate-200 bg-white p-3.5 dark:border-slate-800 dark:bg-slate-900">
          <div class="flex flex-wrap items-start justify-between gap-3">
            <div class="min-w-0">
              <p class="text-sm font-bold">${esc(set.title)}
                <span class="ml-1 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600 dark:bg-slate-800 dark:text-slate-300">${kindLabel[set.kind] || set.kind}</span>
              </p>
              <p class="mt-1 text-[11px] text-slate-500">
                ${toBn((set.questionIds || []).length)}টি প্রশ্ন · ${toBn(set.durationMin)} মিনিট · নেগেটিভ −${toBn(set.negativePerWrong)} · পাস ${toBn(set.passPercent)}%
                ${set.kind === 'live' && set.window ? ` · উইন্ডো ${esc(set.window.opensAt?.slice(0, 16) || '')} → ${esc(set.window.closesAt?.slice(0, 16) || '')}` : ''}
              </p>
              <p class="mt-0.5 font-mono text-[10px] text-slate-400">${esc(set.id)}</p>
            </div>
            ${adminRowActions('sets', set.id)}
          </div>
        </div>`).join('')}
    </div>`;
}

function adminMcqForm(entry, isNew) {
  const chapterOptions = (state.data?.chapters || []).map(chapter => `<option value="${esc(chapter.id)}" ${chapter.id === entry.chapterId ? 'selected' : ''}>${esc(chapter.name)}</option>`).join('');
  const optionRow = option => `
    <div class="flex items-center gap-2">
      <span class="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-slate-100 text-xs font-black dark:bg-slate-800">${esc(option.id)}</span>
      <input id="adm-opt-${option.id}" value="${esc(option.text)}" placeholder="অপশন ${esc(option.id)}" class="w-full rounded-lg border border-slate-200 px-2.5 py-2 text-sm outline-none focus:border-emerald-500 dark:border-slate-700 dark:bg-slate-900">
    </div>`;
  return `
    <div class="grid gap-3 sm:grid-cols-3">
      <label class="text-xs font-bold text-slate-500">আইডি
        <input id="adm-mcq-id" value="${esc(entry.id)}" ${isNew ? '' : 'readonly'} placeholder="mcq-new-001" class="mt-1 w-full rounded-lg border border-slate-200 px-2.5 py-2 font-mono text-sm outline-none focus:border-emerald-500 dark:border-slate-700 dark:bg-slate-900">
      </label>
      <label class="text-xs font-bold text-slate-500">অধ্যায়
        <select id="adm-mcq-chapter" class="mt-1 w-full rounded-lg border border-slate-200 px-2.5 py-2 text-sm outline-none focus:border-emerald-500 dark:border-slate-700 dark:bg-slate-900">${chapterOptions}</select>
      </label>
      <label class="text-xs font-bold text-slate-500">কঠিনতা
        <select id="adm-mcq-difficulty" class="mt-1 w-full rounded-lg border border-slate-200 px-2.5 py-2 text-sm outline-none focus:border-emerald-500 dark:border-slate-700 dark:bg-slate-900">
          ${['easy', 'medium', 'hard'].map(level => `<option ${entry.difficulty === level ? 'selected' : ''}>${level}</option>`).join('')}
        </select>
      </label>
    </div>
    <div class="mt-3 grid gap-3 sm:grid-cols-3">
      <label class="text-xs font-bold text-slate-500">টপিক
        <input id="adm-mcq-topic" value="${esc(entry.topic)}" placeholder="যেমন: ত্রিকোণমিতি" class="mt-1 w-full rounded-lg border border-slate-200 px-2.5 py-2 text-sm outline-none focus:border-emerald-500 dark:border-slate-700 dark:bg-slate-900">
      </label>
      <label class="text-xs font-bold text-slate-500">নম্বর
        <input id="adm-mcq-marks" type="number" min="1" step="0.5" value="${toBn(entry.marks).replace(/[^0-9.]/g, '') || entry.marks}" class="mt-1 w-full rounded-lg border border-slate-200 px-2.5 py-2 text-sm outline-none focus:border-emerald-500 dark:border-slate-700 dark:bg-slate-900">
      </label>
      <label class="text-xs font-bold text-slate-500">সঠিক অপশন
        <select id="adm-mcq-answer" class="mt-1 w-full rounded-lg border border-slate-200 px-2.5 py-2 text-sm outline-none focus:border-emerald-500 dark:border-slate-700 dark:bg-slate-900">
          ${['A', 'B', 'C', 'D'].map(letter => `<option ${entry.answer === letter ? 'selected' : ''}>${letter}</option>`).join('')}
        </select>
      </label>
    </div>
    <label class="mt-3 block text-xs font-bold text-slate-500">প্রশ্ন
      <textarea id="adm-mcq-stem" rows="2" class="mt-1 w-full rounded-lg border border-slate-200 px-2.5 py-2 text-sm outline-none focus:border-emerald-500 dark:border-slate-700 dark:bg-slate-900">${esc(entry.stem)}</textarea>
    </label>
    <div class="mt-3 grid gap-2 sm:grid-cols-2">${entry.options.map(optionRow).join('')}</div>
    <label class="mt-3 block text-xs font-bold text-slate-500">ব্যাখ্যা
      <textarea id="adm-mcq-explain" rows="2" class="mt-1 w-full rounded-lg border border-slate-200 px-2.5 py-2 text-sm outline-none focus:border-emerald-500 dark:border-slate-700 dark:bg-slate-900">${esc(entry.explanation)}</textarea>
    </label>`;
}

function adminCqForm(entry, isNew) {
  const chapterOptions = (state.data?.chapters || []).map(chapter => `<option value="${esc(chapter.id)}" ${chapter.id === entry.chapterId ? 'selected' : ''}>${esc(chapter.name)}</option>`).join('');
  const skills = CQ_SKILLS;
  const partRow = (part, index) => `
    <div class="rounded-xl border border-slate-200 p-3 dark:border-slate-700">
      <div class="flex flex-wrap items-center gap-2">
        <span class="grid h-7 w-7 place-items-center rounded-lg bg-indigo-100 text-xs font-black text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-200">${esc(part.label)}</span>
        <label class="text-[11px] font-bold text-slate-500">নম্বর
          <input id="adm-cq-marks-${index}" type="number" min="1" step="0.5" value="${part.marks}" class="ml-1 w-16 rounded-lg border border-slate-200 px-2 py-1 text-sm outline-none focus:border-emerald-500 dark:border-slate-700 dark:bg-slate-900">
        </label>
        <label class="text-[11px] font-bold text-slate-500">স্কিল
          <select id="adm-cq-skill-${index}" class="ml-1 rounded-lg border border-slate-200 px-2 py-1 text-sm outline-none focus:border-emerald-500 dark:border-slate-700 dark:bg-slate-900">
            ${skills.map(skill => `<option ${part.skill === skill ? 'selected' : ''}>${skill}</option>`).join('')}
          </select>
        </label>
      </div>
      <textarea id="adm-cq-question-${index}" rows="2" placeholder="${esc(part.label)} অংশের প্রশ্ন" class="mt-2 w-full rounded-lg border border-slate-200 px-2.5 py-2 text-sm outline-none focus:border-emerald-500 dark:border-slate-700 dark:bg-slate-900">${esc(part.question)}</textarea>
      <textarea id="adm-cq-model-${index}" rows="2" placeholder="মডেল উত্তর" class="mt-2 w-full rounded-lg border border-indigo-200 bg-indigo-50/40 px-2.5 py-2 text-sm outline-none focus:border-indigo-400 dark:border-indigo-500/30 dark:bg-indigo-500/5">${esc(part.modelAnswer)}</textarea>
      <input id="adm-cq-hint-${index}" value="${esc(part.hint)}" placeholder="ইশারা (ঐচ্ছিক)" class="mt-2 w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs outline-none focus:border-emerald-500 dark:border-slate-700 dark:bg-slate-900">
    </div>`;
  return `
    <div class="grid gap-3 sm:grid-cols-3">
      <label class="text-xs font-bold text-slate-500">আইডি
        <input id="adm-cq-id" value="${esc(entry.id)}" ${isNew ? '' : 'readonly'} placeholder="cq-new-001" class="mt-1 w-full rounded-lg border border-slate-200 px-2.5 py-2 font-mono text-sm outline-none focus:border-emerald-500 dark:border-slate-700 dark:bg-slate-900">
      </label>
      <label class="text-xs font-bold text-slate-500">অধ্যায়
        <select id="adm-cq-chapter" class="mt-1 w-full rounded-lg border border-slate-200 px-2.5 py-2 text-sm outline-none focus:border-emerald-500 dark:border-slate-700 dark:bg-slate-900">${chapterOptions}</select>
      </label>
      <label class="text-xs font-bold text-slate-500">কঠিনতা
        <select id="adm-cq-difficulty" class="mt-1 w-full rounded-lg border border-slate-200 px-2.5 py-2 text-sm outline-none focus:border-emerald-500 dark:border-slate-700 dark:bg-slate-900">
          ${['easy', 'medium', 'hard'].map(level => `<option ${entry.difficulty === level ? 'selected' : ''}>${level}</option>`).join('')}
        </select>
      </label>
    </div>
    <label class="mt-3 block text-xs font-bold text-slate-500">উদ্দীপক
      <textarea id="adm-cq-stimulus" rows="3" class="mt-1 w-full rounded-lg border border-slate-200 px-2.5 py-2 text-sm outline-none focus:border-emerald-500 dark:border-slate-700 dark:bg-slate-900">${esc(entry.stimulus)}</textarea>
    </label>
    <div class="mt-3 grid gap-2">${(entry.parts || []).map(partRow).join('')}</div>`;
}

function adminSetForm(entry, isNew) {
  const chapterOptions = ['<option value="">সব অধ্যায়</option>']
    .concat((state.data?.chapters || []).map(chapter => `<option value="${esc(chapter.id)}" ${chapter.id === entry.chapterId ? 'selected' : ''}>${esc(chapter.name)}</option>`)).join('');
  const bank = allMcq();
  const chosen = new Set(entry.questionIds || []);
  return `
    <div class="grid gap-3 sm:grid-cols-3">
      <label class="text-xs font-bold text-slate-500">সেট আইডি
        <input id="adm-set-id" value="${esc(entry.id)}" ${isNew ? '' : 'readonly'} placeholder="set-new-01" class="mt-1 w-full rounded-lg border border-slate-200 px-2.5 py-2 font-mono text-sm outline-none focus:border-emerald-500 dark:border-slate-700 dark:bg-slate-900">
      </label>
      <label class="text-xs font-bold text-slate-500">ধরন
        <select id="adm-set-kind" class="mt-1 w-full rounded-lg border border-slate-200 px-2.5 py-2 text-sm outline-none focus:border-emerald-500 dark:border-slate-700 dark:bg-slate-900">
          ${['practice', 'model', 'live'].map(kind => `<option ${entry.kind === kind ? 'selected' : ''}>${kind}</option>`).join('')}
        </select>
      </label>
      <label class="text-xs font-bold text-slate-500">অধ্যায় (খালি = সব)
        <select id="adm-set-chapter" class="mt-1 w-full rounded-lg border border-slate-200 px-2.5 py-2 text-sm outline-none focus:border-emerald-500 dark:border-slate-700 dark:bg-slate-900">${chapterOptions}</select>
      </label>
    </div>
    <label class="mt-3 block text-xs font-bold text-slate-500">শিরোনাম
      <input id="adm-set-title" value="${esc(entry.title)}" class="mt-1 w-full rounded-lg border border-slate-200 px-2.5 py-2 text-sm outline-none focus:border-emerald-500 dark:border-slate-700 dark:bg-slate-900">
    </label>
    <div class="mt-3 grid gap-3 sm:grid-cols-4">
      <label class="text-xs font-bold text-slate-500">সময় (মিনিট)
        <input id="adm-set-duration" type="number" min="1" value="${entry.durationMin}" class="mt-1 w-full rounded-lg border border-slate-200 px-2.5 py-2 text-sm outline-none focus:border-emerald-500 dark:border-slate-700 dark:bg-slate-900">
      </label>
      <label class="text-xs font-bold text-slate-500">নেগেটিভ / ভুল
        <input id="adm-set-negative" type="number" min="0" step="0.25" value="${entry.negativePerWrong}" class="mt-1 w-full rounded-lg border border-slate-200 px-2.5 py-2 text-sm outline-none focus:border-emerald-500 dark:border-slate-700 dark:bg-slate-900">
      </label>
      <label class="text-xs font-bold text-slate-500">পাস (%)
        <input id="adm-set-pass" type="number" min="0" max="100" value="${entry.passPercent}" class="mt-1 w-full rounded-lg border border-slate-200 px-2.5 py-2 text-sm outline-none focus:border-emerald-500 dark:border-slate-700 dark:bg-slate-900">
      </label>
      <div class="flex flex-col justify-end gap-1 text-[11px] font-bold text-slate-500">
        <label class="flex items-center gap-1.5"><input id="adm-set-shuffle-q" type="checkbox" ${entry.shuffle?.questions ? 'checked' : ''} class="rounded border-slate-300">প্রশ্ন এলোমেলো</label>
        <label class="flex items-center gap-1.5"><input id="adm-set-shuffle-o" type="checkbox" ${entry.shuffle?.options ? 'checked' : ''} class="rounded border-slate-300">অপশন এলোমেলো</label>
      </div>
    </div>
    <div id="adm-set-live" class="mt-3 grid gap-3 sm:grid-cols-2 ${entry.kind === 'live' ? '' : 'hidden'}">
      <label class="text-xs font-bold text-slate-500">লাইভ শুরু
        <input id="adm-set-opens" type="datetime-local" value="${esc(toLocalInput(entry.window?.opensAt))}" class="mt-1 w-full rounded-lg border border-slate-200 px-2.5 py-2 text-sm outline-none focus:border-emerald-500 dark:border-slate-700 dark:bg-slate-900">
      </label>
      <label class="text-xs font-bold text-slate-500">লাইভ শেষ
        <input id="adm-set-closes" type="datetime-local" value="${esc(toLocalInput(entry.window?.closesAt))}" class="mt-1 w-full rounded-lg border border-slate-200 px-2.5 py-2 text-sm outline-none focus:border-emerald-500 dark:border-slate-700 dark:bg-slate-900">
      </label>
    </div>
    <label class="mt-3 block text-xs font-bold text-slate-500">নির্দেশনা / বিবরণ
      <textarea id="adm-set-desc" rows="2" class="mt-1 w-full rounded-lg border border-slate-200 px-2.5 py-2 text-sm outline-none focus:border-emerald-500 dark:border-slate-700 dark:bg-slate-900">${esc(entry.description)}</textarea>
    </label>
    <div class="mt-3">
      <p class="text-xs font-bold text-slate-500">প্রশ্ন বাছাই (${toBn(chosen.size)}টি নির্বাচিত)</p>
      <div class="mt-1 grid max-h-56 gap-1 overflow-y-auto rounded-xl border border-slate-200 p-2 dark:border-slate-700">
        ${bank.map(question => `
          <label class="flex items-start gap-2 rounded-lg px-1.5 py-1 text-xs hover:bg-slate-50 dark:hover:bg-slate-800/60">
            <input type="checkbox" class="adm-qbox mt-0.5 rounded border-slate-300" value="${esc(question.id)}" ${chosen.has(question.id) ? 'checked' : ''}>
            <span class="min-w-0 flex-1"><b class="font-mono text-[10px] text-slate-400">${esc(question.id)}</b> ${esc(question.stem)}</span>
          </label>`).join('') || '<p class="p-2 text-xs text-slate-500">ব্যাংক খালি — আগে MCQ যোগ করো।</p>'}
      </div>
    </div>`;
}

function adminForm() {
  const form = state.admin.form;
  if (!form) return '';
  const entry = form.isNew ? blankFor(form.kind, form.chapterId || '') : adminEntry(form.kind, form.id);
  if (!entry) return '';
  const title = form.isNew ? 'নতুন এন্ট্রি' : `সম্পাদনা · ${entry.id}`;
  const body = form.kind === 'mcq' ? adminMcqForm(entry, form.isNew)
    : form.kind === 'cq' ? adminCqForm(entry, form.isNew) : adminSetForm(entry, form.isNew);

  return `
    <div class="mb-4 rounded-2xl border-2 border-emerald-300 bg-emerald-50/40 p-4 dark:border-emerald-500/40 dark:bg-emerald-500/5">
      <div class="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3 class="text-sm font-black text-slate-900 dark:text-white">${esc(title)}</h3>
        ${state.admin.error ? `<p class="text-[11px] font-bold text-rose-600">${esc(state.admin.error)}</p>` : ''}
      </div>
      ${body}
      <div class="mt-4 flex flex-wrap gap-2">
        <button type="button" data-action="admin-save" data-kind="${form.kind}" class="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-700">সংরক্ষণ করো</button>
        <button type="button" data-action="admin-form-cancel" class="rounded-xl border border-slate-200 px-4 py-2 text-sm font-bold text-slate-600 hover:bg-white dark:border-slate-700 dark:text-slate-300">বাতিল</button>
      </div>
    </div>`;
}

function adminReviewTab() {
  const attempts = loadResults();
  const submissions = loadCqSubmissions();
  const problems = validateBank(state.data);
  return `
    ${problems.length ? `
      <div class="mb-3 rounded-2xl border border-amber-300 bg-amber-50 p-3.5 text-sm text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-100">
        <p class="font-bold">ব্যাংকে ${toBn(problems.length)}টি সমস্যা</p>
        <ul class="mt-1 space-y-0.5 text-xs">${problems.slice(0, 12).map(problem => `<li><b>${esc(problem.id)}</b> · ${esc(problem.message)}</li>`).join('')}</ul>
      </div>` : ''}
    <div class="grid gap-3 sm:grid-cols-2">
      ${statCard({ label: 'এই ডিভাইসের টেস্ট', value: toBn(attempts.length), hint: 'সব attempt লোকালস্টোরেজে' })}
      ${statCard({ label: 'সৃজনশীল স্ব-মূল্যায়ন', value: toBn(submissions.length), hint: 'সংরক্ষিত CQ খাতা' })}
    </div>
    <div class="mt-3 overflow-x-auto rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
      ${attempts.length ? `
        <table class="w-full min-w-[560px] text-left text-sm">
          <thead class="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500 dark:bg-slate-800/60">
            <tr><th class="px-4 py-2.5">টেস্ট</th><th><span class="sr-only">ধরন</span></th><th class="px-3 py-2.5">স্কোর</th><th class="px-3 py-2.5">জমা</th><th class="px-4 py-2.5"></th></tr>
          </thead>
          <tbody class="divide-y divide-slate-100 dark:divide-slate-800">
            ${attempts.map(attempt => `
              <tr>
                <td class="px-4 py-2.5 font-semibold">${esc(attempt.title)}<p class="font-mono text-[10px] font-normal text-slate-400">${esc(attempt.setId || '')}</p></td>
                <td class="px-3 py-2.5 text-xs">${esc(attempt.kind || '')}</td>
                <td class="px-3 py-2.5 text-xs font-bold">${toBn(attempt.score.percent)}% · GPA ${toBn(attempt.score.gpa?.toFixed(2))}</td>
                <td class="px-3 py-2.5 text-xs text-slate-500">${esc(attempt.submittedAt ? new Date(attempt.submittedAt).toLocaleString('bn-BD', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—')}</td>
                <td class="px-4 py-2.5 text-right"><button type="button" data-action="open-result" data-id="${esc(attempt.id)}" class="rounded-lg border border-slate-200 px-2.5 py-1 text-[11px] font-bold hover:bg-slate-100 dark:border-slate-700">দেখো</button></td>
              </tr>`).join('')}
          </tbody>
        </table>` : '<p class="p-5 text-center text-sm text-slate-500">এই ডিভাইসে এখনো কোনো টেস্ট দেওয়া হয়নি।</p>'}
    </div>`;
}

function adminToolsTab() {
  const json = JSON.stringify(state.data, null, 2);
  return `
    <div class="grid gap-3 lg:grid-cols-2">
      <div class="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
        <h3 class="text-sm font-black">রপ্তানি</h3>
        <p class="mt-1 text-xs text-slate-500">বর্তমান ব্যাংক (শিপ করা JSON + এই ডিভাইসের পরিবর্তন) এক ফাইলে। <code class="rounded bg-slate-100 px-1 dark:bg-slate-800">data/questions.json</code>-এ বসিয়ে দিলে সবার জন্য একই হয়ে যাবে।</p>
        <textarea id="admExport" readonly rows="12" class="mt-3 w-full rounded-xl border border-slate-200 bg-slate-50 p-3 font-mono text-[11px] outline-none dark:border-slate-700 dark:bg-slate-950">${esc(json)}</textarea>
        <div class="mt-2 flex flex-wrap gap-2">
          <button type="button" data-action="admin-download" class="rounded-xl bg-slate-900 px-3.5 py-2 text-xs font-bold text-white dark:bg-white dark:text-slate-900">questions.json ডাউনলোড</button>
          <button type="button" data-action="admin-copy" class="rounded-xl border border-slate-200 px-3.5 py-2 text-xs font-bold dark:border-slate-700">কপি করো</button>
        </div>
      </div>
      <div class="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
        <h3 class="text-sm font-black">ইমপোর্ট</h3>
        <p class="mt-1 text-xs text-slate-500">পুরো payload বা শুধু <code class="rounded bg-slate-100 px-1 dark:bg-slate-800">{ questions, sets }</code> — যাচাই করে মিলিয়ে নেওয়া হবে। যে key পাঠাবে, সেই তালিকাটাই চূড়ান্ত ধরা হবে (না থাকলে লুকানো হবে, JSON-এ মুছে যাবে না)।</p>
        <textarea id="admImport" rows="12" placeholder='{"questions":{"mcq":[…]}}' class="mt-3 w-full rounded-xl border border-slate-200 p-3 font-mono text-[11px] outline-none focus:border-emerald-500 dark:border-slate-700 dark:bg-slate-950"></textarea>
        <div class="mt-2 flex flex-wrap gap-2">
          <button type="button" data-action="admin-import" class="rounded-xl bg-emerald-600 px-3.5 py-2 text-xs font-bold text-white hover:bg-emerald-700">যাচাই করে ইমপোর্ট</button>
          <button type="button" data-action="admin-reset-bank" class="rounded-xl border border-rose-200 px-3.5 py-2 text-xs font-bold text-rose-600 hover:bg-rose-50 dark:border-rose-500/30">শিপ করা JSON-এ ফেরত যাও</button>
        </div>
      </div>
    </div>`;
}

function viewAdmin() {
  const overlay = state.admin.overlay;
  const edits = countEdits(overlay);
  const tab = state.admin.tab;
  const counts = { mcq: allMcq().length, cq: allCq().length, sets: (state.data?.sets || []).length };

  const content = tab === 'tools' ? adminToolsTab()
    : tab === 'review' ? adminReviewTab()
      : adminForm() + (tab === 'mcq' ? adminMcqTable() + adminHiddenStrip('mcq')
        : tab === 'cq' ? adminCqTable() + adminHiddenStrip('cq') : adminSetTable() + adminHiddenStrip('sets'));

  return shell(`
    ${sectionTitle('ডেমো এডমিন', 'প্রশ্নব্যাংক ও টেস্ট সেট ব্যবস্থাপনা', `
      <button type="button" data-action="admin-exit" class="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900">শিক্ষার্থী ভিউতে ফিরে যাও</button>`)}
    <div class="mb-3 rounded-2xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <p class="text-xs text-slate-500">
          ব্যাংকে <b class="text-slate-900 dark:text-white">${toBn(counts.mcq)}</b> MCQ ·
          <b class="text-slate-900 dark:text-white">${toBn(counts.cq)}</b> সৃজনশীল ·
          <b class="text-slate-900 dark:text-white">${toBn(counts.sets)}</b> সেট
          ${edits ? ` · এই ডিভাইসে ${toBn(edits)}টি পরিবর্তন সংরক্ষিত` : ''}
        </p>
        <div class="flex flex-wrap gap-2">
          <button type="button" data-action="admin-new" data-kind="mcq" class="rounded-xl bg-emerald-600 px-3 py-2 text-xs font-bold text-white hover:bg-emerald-700">+ MCQ</button>
          <button type="button" data-action="admin-new" data-kind="cq" class="rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold hover:bg-slate-100 dark:border-slate-700">+ সৃজনশীল</button>
          <button type="button" data-action="admin-new" data-kind="sets" class="rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold hover:bg-slate-100 dark:border-slate-700">+ সেট</button>
        </div>
      </div>
      <div class="mt-3 flex gap-1.5 overflow-x-auto pb-1">${ADMIN_TABS.map(adminTabButton).join('')}</div>
    </div>
    ${edits ? `<p class="mb-3 rounded-xl bg-amber-50 px-3 py-2 text-[11px] font-semibold text-amber-800 dark:bg-amber-500/10 dark:text-amber-200">পরিবর্তন শুধু এই ব্রাউজারের localStorage-এ — রিপো-র <code>data/questions.json</code> অটুট আছে। “JSON · ইমপোর্ট” ট্যাব থেকে ফাইল নামিয়ে নিয়ে রিপোতে কমিট করো।</p>` : ''}
    ${content}
  `);
}

/* ---------- admin actions ---------- */

function adminValue(id) {
  const el = $(`#${id}`);
  return el ? String(el.value).trim() : '';
}

function adminNumber(id, fallback = 0) {
  const raw = adminValue(id).replace(/[০-৯]/g, digit => '০১২৩৪৫৬৭৮৯'.indexOf(digit));
  const value = Number(raw);
  return Number.isFinite(value) ? value : fallback;
}

function collectMcqForm() {
  const chapterId = adminValue('adm-mcq-chapter');
  const question = {
    id: adminValue('adm-mcq-id'),
    chapterId,
    subjectId: chapterById(chapterId)?.subjectId || '',
    difficulty: adminValue('adm-mcq-difficulty'),
    topic: adminValue('adm-mcq-topic'),
    marks: adminNumber('adm-mcq-marks', 1),
    stem: adminValue('adm-mcq-stem'),
    options: ['A', 'B', 'C', 'D'].map(letter => ({ id: letter, text: adminValue(`adm-opt-${letter}`) })),
    answer: adminValue('adm-mcq-answer'),
    explanation: adminValue('adm-mcq-explain')
  };
  return question;
}

function collectCqForm() {
  const chapterId = adminValue('adm-cq-chapter');
  return {
    id: adminValue('adm-cq-id'),
    chapterId,
    subjectId: chapterById(chapterId)?.subjectId || '',
    difficulty: adminValue('adm-cq-difficulty'),
    stimulus: adminValue('adm-cq-stimulus'),
    parts: ['ক', 'খ', 'গ', 'ঘ']
      .map((label, index) => ({
        label,
        skill: adminValue(`adm-cq-skill-${index}`),
        marks: adminNumber(`adm-cq-marks-${index}`, 1),
        question: adminValue(`adm-cq-question-${index}`),
        modelAnswer: adminValue(`adm-cq-model-${index}`),
        hint: adminValue(`adm-cq-hint-${index}`)
      }))
      .filter(part => part.question || part.modelAnswer || part.hint)
  };
}

function collectSetForm() {
  const kind = adminValue('adm-set-kind');
  const opens = adminValue('adm-set-opens');
  const closes = adminValue('adm-set-closes');
  const set = {
    id: adminValue('adm-set-id'),
    kind,
    title: adminValue('adm-set-title'),
    chapterId: adminValue('adm-set-chapter'),
    durationMin: adminNumber('adm-set-duration', 10),
    negativePerWrong: adminNumber('adm-set-negative', 0),
    passPercent: adminNumber('adm-set-pass', 40),
    shuffle: { questions: Boolean($('#adm-set-shuffle-q')?.checked), options: Boolean($('#adm-set-shuffle-o')?.checked) },
    questionIds: [...document.querySelectorAll('.adm-qbox:checked')].map(box => box.value),
    description: adminValue('adm-set-desc')
  };
  if (kind === 'live') {
    set.window = { opensAt: opens ? new Date(opens).toISOString() : null, closesAt: closes ? new Date(closes).toISOString() : null };
    set.proctoring = 'একজন প্রস্টক্টর কক্ষ থেকে পর্যবেক্ষণ করবেন (ডেমো)';
  } else {
    delete set.window;
    delete set.proctoring;
  }
  if (!set.description) delete set.description;
  return set;
}

function saveAdminEntry(kind) {
  const form = state.admin.form;
  if (!form) return;
  const entry = kind === 'mcq' ? collectMcqForm() : kind === 'cq' ? collectCqForm() : collectSetForm();
  const chapterIds = new Set((state.data?.chapters || []).map(chapter => chapter.id));
  const mcqIds = new Set(allMcq().map(question => question.id));
  const errors = kind === 'mcq' ? validateMcq(entry, chapterIds)
    : kind === 'cq' ? validateCq(entry) : validateSet(entry, mcqIds);

  if (errors.length) {
    state.admin.error = errors.join(' · ');
    render();
    toast('প্রশ্নে কিছু ত্রুটি আছে — লাল লাইনটি দেখো', 'bad');
    return;
  }

  const isNew = form.isNew;
  const baseList = kind === 'mcq' ? state.base?.questions?.mcq : kind === 'cq' ? state.base?.questions?.cq : state.base?.sets;
  const baseEntry = (baseList || []).find(item => item.id === entry.id) || null;
  const patch = baseEntry ? minimalDiff(baseEntry, entry) : entry;
  if (baseEntry && !Object.keys(patch).length) {
    state.admin.form = null;
    state.admin.error = null;
    render();
    toast(`${entry.id}-ে কিছু বদলায়নি`, 'neutral');
    return;
  }
  saveBankPatch(kind, entry.id, patch);
  reloadBank();
  state.admin.form = null;
  state.admin.error = null;
  state.admin.tab = kind;
  state.admin.overlay = loadBankOverlay();
  render();
  toast(isNew ? `${entry.id} যোগ হয়েছে — ${kind === 'sets' ? `সেট তালিকায় এখন ${toBn(adminList('sets').length)}টি` : `ব্যাংকে এখন ${toBn(kind === 'mcq' ? allMcq().length : allCq().length)}টি`}` : `${entry.id} আপডেট হয়েছে`, 'good');
}

function reloadBank() {
  state.data = mergeBank(state.base, loadBankOverlay());
}

const adminActions = {
  'admin-open': () => {
    state.admin.overlay = loadBankOverlay();
    state.admin.form = null;
    state.admin.error = null;
    state.view = 'admin';
    render();
    toast('ডেমো এডমিন প্যানেল — কোনো লগইন লাগবে না, পরিবর্তন এই ব্রাউজারেই থাকে', 'neutral');
  },
  'admin-exit': () => {
    reloadBank();
    state.view = 'dashboard';
    state.admin.form = null;
    render();
  },
  'admin-tab': dataset => {
    state.admin.tab = dataset.tab;
    state.admin.form = null;
    state.admin.error = null;
    render();
  },
  'admin-new': dataset => {
    state.admin.tab = dataset.kind;
    state.admin.error = null;
    state.admin.form = { kind: dataset.kind, id: null, isNew: true, chapterId: (state.data?.chapters || [])[0]?.id || '' };
    render();
  },
  'admin-edit': dataset => {
    state.admin.tab = dataset.kind;
    state.admin.error = null;
    state.admin.form = { kind: dataset.kind, id: dataset.id, isNew: false };
    render();
    $('#adm-mcq-id, #adm-cq-id, #adm-set-id')?.focus();
  },
  'admin-form-cancel': () => {
    state.admin.form = null;
    state.admin.error = null;
    render();
  },
  'admin-save': dataset => saveAdminEntry(dataset.kind),
  'admin-hide': dataset => {
    const hiding = dataset.hidden === 'yes';
    if (hiding) saveBankPatch(dataset.kind, dataset.id, { removed: true });
    else dropBankPatch(dataset.kind, dataset.id);
    reloadBank();
    state.admin.overlay = loadBankOverlay();
    render();
    toast(hiding ? `${dataset.id} লুকানো হয়েছে (JSON অটুট)` : `${dataset.id} আবার চালু`, 'neutral');
  },
  'admin-delete': dataset => {
    dropBankPatch(dataset.kind, dataset.id);
    reloadBank();
    state.admin.overlay = loadBankOverlay();
    render();
    toast(`${dataset.id} মুছে ফেলা হয়েছে`, 'good');
  },
  'admin-revert': dataset => {
    dropBankPatch(dataset.kind, dataset.id);
    reloadBank();
    state.admin.overlay = loadBankOverlay();
    render();
    toast(`${dataset.id} — শিপ করা JSON-এর মান ফিরে এসেছে`, 'neutral');
  },
  'admin-copy': async () => {
    const text = adminValue('admExport');
    try {
      await navigator.clipboard.writeText(text);
      toast('ব্যাংক JSON কপি হয়েছে', 'good');
    } catch {
      toast('কপি করা যায়নি — টেক্সটএরিয়া থেকে ম্যানুয়ালি নাও', 'warn');
    }
  },
  'admin-download': () => {
    const blob = new Blob([JSON.stringify(state.data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'questions.json';
    document.body.append(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 2000);
  },
  'admin-import': () => {
    const raw = adminValue('admImport');
    if (!raw) {
      toast('ইমপোর্ট করার জন্য JSON পেস্ট করো', 'warn');
      return;
    }
    let incoming;
    try {
      incoming = JSON.parse(raw);
    } catch (error) {
      toast(`JSON পার্স হয়নি: ${error.message}`, 'bad');
      return;
    }
    const candidate = { ...state.base, ...incoming, questions: { ...state.base.questions, ...(incoming.questions || {}) } };
    const problems = validateBank(candidate);
    if (problems.length) {
      toast(`${toBn(problems.length)}টি সমস্যা — প্রথমটি: ${problems[0].id} · ${problems[0].message}`, 'bad');
      return;
    }
    replaceBankOverlay(diffBank(state.base, candidate));
    reloadBank();
    state.admin.overlay = loadBankOverlay();
    state.admin.form = null;
    render();
    toast('ইমপোর্ট সম্পন্ন — এই ডিভাইসের ওভারলে আপডেট হয়েছে', 'good');
  },
  'admin-reset-bank': () => {
    clearBankOverlay();
    state.data = state.base;
    state.admin.overlay = null;
    state.admin.form = null;
    render();
    toast('শিপ করা প্রশ্নব্যাংকে ফিরে গেছি', 'good');
  }
};

Object.assign(actions, adminActions);

function availableCount(chapterId, difficulty) {
  return allMcq().filter(question => (!chapterId || question.chapterId === chapterId) && (!difficulty || question.difficulty === difficulty)).length;
}

function bestChapterAccuracy(chapterId) {
  let best = { accuracy: 0, total: 0, correct: 0 };
  loadResults().forEach(result => {
    const rows = (result.score.perQuestion || []).filter(item => item.chapterId === chapterId);
    if (!rows.length) return;
    const correct = rows.filter(item => item.state === 'correct').length;
    const accuracy = Math.round((correct / rows.length) * 100);
    if (accuracy > best.accuracy) best = { accuracy, total: rows.length, correct };
  });
  return best;
}

function currentCQ() {
  const pool = allCq().filter(question => !state.cq.chapterId || question.chapterId === state.cq.chapterId);
  return pool.find(question => question.id === state.cq.activeId) || pool[0];
}

function startPractice() {
  const { chapterId, difficulty, size } = state.practice;
  const questions = pickQuestions(allMcq(), { chapterId, difficulty, count: size });
  if (!questions.length) {
    toast('এই ফিল্টারে প্রশ্ন নেই — অন্য অধ্যায় বা কঠিনতা বাছো', 'bad');
    return;
  }
  state.practice = { ...state.practice, order: questions, index: 0, answers: {}, feedback: {} };
  render();
}

function answerPractice(value) {
  const question = state.practice.order[state.practice.index];
  if (!question || state.practice.feedback[question.id]?.locked) return;
  const correct = value === question.answer;
  state.practice.answers[question.id] = value;
  state.practice.feedback[question.id] = { correct, locked: true };
  render();
}

function finishPractice() {
  const { order, answers } = state.practice;
  if (!order.length) return;
  const now = Date.now();
  const result = buildResult({
    set: { title: `অনুশীলন · ${chapterById(state.practice.chapterId)?.name || 'সব অধ্যায়'}`, kind: 'practice', negativePerWrong: 0, durationMin: 0 },
    questions: order,
    answers,
    startedAt: now,
    submittedAt: now,
    grading: state.data.grading
  });
  saveResult(result);
  state.result = result;
  state.reviewMode = false;
  state.view = 'result';
  state.practice.order = [];
  render();
}

function startSet(setId) {
  const set = (state.data.sets || []).find(item => item.id === setId);
  if (!set) return;
  const windowInfo = set.kind === 'live' ? windowState(set, Date.now()) : { canStart: true };
  if (!windowInfo.canStart) return toast('এই লাইভ পরীক্ষা এখন চলছে না', 'bad');

  const questions = pickQuestions(allMcq(), { set });
  if (!questions.length) return toast('এই সেটে প্রশ্ন নেই', 'bad');

  clearDraft(set.id);
  const now = Date.now();
  state.session = {
    set,
    questions,
    answers: {},
    flags: {},
    index: 0,
    startedAt: now,
    deadline: examDeadline({ startedAt: now, durationMin: set.durationMin, closesAt: set.window?.closesAt }),
    remaining: remainingSeconds(examDeadline({ startedAt: now, durationMin: set.durationMin, closesAt: set.window?.closesAt })),
    tabSwitches: 0,
    locked: false
  };
  state.view = 'runner';
  render();
  if (set.kind === 'live' && set.proctoring?.blockCopy) document.addEventListener('copy', blockClipboard);
  if (set.durationMin) toast(`${toBn(set.durationMin)} মিনিটের ঘড়ি চালু হয়েছে`, 'good');
}

function resumeSet(setId) {
  const draft = loadDraft(setId);
  const set = (state.data.sets || []).find(item => item.id === setId);
  if (!draft || !set) return startSet(setId);

  const questions = pickQuestions(allMcq(), { set });
  const deadline = draft.deadline || examDeadline({ startedAt: draft.startedAt || Date.now(), durationMin: set.durationMin, closesAt: set.window?.closesAt });
  state.session = {
    set,
    questions,
    answers: draft.answers || {},
    flags: draft.flags || {},
    index: Math.min(draft.index || 0, questions.length - 1),
    startedAt: draft.startedAt || Date.now(),
    deadline,
    remaining: remainingSeconds(deadline),
    tabSwitches: draft.tabSwitches || 0,
    locked: false
  };
  state.view = 'runner';
  render();
  if (shouldAutoSubmit(state.session.remaining)) return autoSubmit('সংরক্ষিত উত্তরের সময় শেষ — জমা দেওয়া হয়েছে');
  toast('যেখানে থামিয়েছিলে সেখান থেকে চালিয়ে যাচ্ছ', 'neutral');
}

function blockClipboard(event) {
  event.preventDefault();
  toast('লাইভ পরীক্ষায় কপি বন্ধ', 'warn');
}

function answerQuestion(value) {
  const session = state.session;
  if (!session || session.locked) return;
  const question = session.questions[session.index];
  session.answers[question.id] = value;
  if (session.index < session.questions.length - 1) {
    session.index += 1;
  }
  persistDraft(session);
  render();
}

function finish({ autoSubmitted = false } = {}) {
  const session = state.session;
  if (!session) return;
  const now = Date.now();
  const result = buildResult({
    set: session.set,
    questions: session.questions,
    answers: session.answers,
    flags: session.flags,
    startedAt: session.startedAt,
    submittedAt: now,
    autoSubmitted,
    grading: state.data.grading,
    submission: { tabSwitches: session.tabSwitches, unanswered: session.questions.filter(question => !session.answers[question.id]).map(question => question.id) }
  });

  saveResult(result);
  clearDraft(session.set.id);
  document.removeEventListener('copy', blockClipboard);
  state.session = null;
  state.result = result;
  state.reviewMode = false;
  state.reviewOpen = new Set(result.score.perQuestion.filter(item => item.state !== 'correct').map(item => item.id));
  state.view = 'result';
  render();
}

