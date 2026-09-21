/* SSC-prep scope of "শিক্ষার্থী এপ ম্যানেজমেন্ট".
 *
 * The ssc-prep app (../ssc-prep/) ships its question bank as a static JSON file and
 * never writes to it; every local edit lives in the `ssc-prep-bank-v1` overlay that
 * the app merges at boot. This module edits that same overlay through ssc-prep's own
 * pure functions, so the two apps share one logic layer instead of duplicating it —
 * edit here, and the SSC app shows the change on its next load.
 */
import { $, escapeText, showFeedback, toBanglaNumber } from './ui.js';
import { readJSON, writeJSON } from './storage.js';
import {
  blankCq, blankMcq, blankSet, countEdits, diffBank, mergeBank, minimalDiff, toLocalInput,
  validateBank, validateCq, validateMcq, validateSet
} from '../ssc-prep/js/exam-logic.js';

export const SSC_KEYS = Object.freeze({
  bank: 'ssc-prep-bank-v1',
  results: 'ssc-prep-results-v1',
  cq: 'ssc-prep-cq-v1',
  draft: 'ssc-prep-draft-v1'
});

const BANK_URL = 'ssc-prep/data/questions.json';
const LIST_KINDS = [
  { key: 'mcq', label: 'MCQ' },
  { key: 'cq', label: 'সৃজনশীল' },
  { key: 'sets', label: 'টেস্ট সেট' },
  { key: 'results', label: 'ফলাফল' }
];

let base = null;
let loading = false;
let loadError = '';
let listTab = 'mcq';
let draft = null;
let flash = null;

/* ---------- the shipped payload + the local overlay ---------- */

/**
 * The shipped bank is fetched fresh (an admin should never edit a stale copy), but an
 * offline phone still gets the precached one — the file itself only changes with a deploy.
 */
async function loadBank() {
  try {
    const response = await fetch(BANK_URL, { cache: 'no-store' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json();
  } catch (error) {
    if (window.caches) {
      const cached = await caches.match(BANK_URL);
      if (cached) return cached.json();
    }
    throw error;
  }
}

export async function initSscAdmin() {
  if (base || loading) return;
  // Same seam as ssc-prep's window.SSC_DATA: tests and embedding pages can inject the payload.
  if (window.SSC_PREP_BANK) {
    base = window.SSC_PREP_BANK;
    return;
  }
  loading = true;
  try {
    base = await loadBank();
  } catch (error) {
    loadError = `ssc-prep-এর প্রশ্নব্যাংক পড়া যায়নি (${error.message}) — এই অ্যাপটি repo root থেকে পরিবেশন হওয়া চাই, যেমন http://localhost:4174/ssc-prep/`;
  } finally {
    loading = false;
  }
}

export function sscReady() {
  return Boolean(base);
}

function overlay() {
  const stored = readJSON(SSC_KEYS.bank, null);
  return stored && typeof stored === 'object' ? stored : null;
}

function bank() {
  return mergeBank(base || { questions: { mcq: [], cq: [] }, sets: [] }, overlay());
}

function listFor(kind) {
  const data = bank();
  return kind === 'sets' ? (data.sets || []) : data.questions[kind] || [];
}

function writePatch(kind, id, patch) {
  const next = overlay() || { version: 1, updatedAt: Date.now(), mcq: {}, cq: {}, sets: {} };
  [ 'mcq', 'cq', 'sets' ].forEach(key => {
    if (!next[key] || typeof next[key] !== 'object') next[key] = {};
  });
  if (patch === null) delete next[kind][id];
  else next[kind][id] = patch;
  next.updatedAt = Date.now();
  const empty = ['mcq', 'cq', 'sets'].every(key => !Object.keys(next[key]).length);
  if (empty) {
    try { window.localStorage.removeItem(SSC_KEYS.bank); } catch { /* nothing to clear */ }
    return true;
  }
  return writeJSON(SSC_KEYS.bank, next);
}

function baseEntry(kind, id) {
  const data = base || { questions: { mcq: [], cq: [] }, sets: [] };
  const list = kind === 'sets' ? (data.sets || []) : data.questions[kind] || [];
  return list.find(entry => entry.id === id) || null;
}

export function sscStats() {
  const data = bank();
  const attempts = list(SSC_KEYS.results);
  return {
    mcq: (data.questions?.mcq || []).length,
    cq: (data.questions?.cq || []).length,
    sets: (data.sets || []).length,
    edits: countEdits(overlay()),
    attempts: attempts.length,
    submissions: list(SSC_KEYS.cq).length
  };
}

function list(key) {
  const stored = readJSON(key, []);
  return Array.isArray(stored) ? stored.filter(item => item && typeof item === 'object') : [];
}

/* ---------- render: bank ---------- */

const num = value => toBanglaNumber(String(value ?? ''));
const chip = (label, tone = '') => `<span class="admin-chip ${tone}">${escapeText(label)}</span>`;
const button = (label, act, extra = '', tone = '') => `<button type="button" class="admin-btn ${tone}" data-ssc-act="${act}" ${extra}>${label}</button>`;

function notice() {
  if (!flash) return '';
  const note = `<p class="admin-flash ${flash.tone}">${escapeText(flash.message)}</p>`;
  flash = null;
  return note;
}

/* Actions do not re-render themselves: admin.js owns the render loop and repaints
 * after every handled action, which keeps this module free of view wiring. */
function announce(message, tone = 'good') {
  flash = { message, tone };
}

function listTabs() {
  return LIST_KINDS.map(item => `<button type="button" class="admin-tab ${listTab === item.key ? 'active' : ''}" data-ssc-act="tab" data-ssc-tab="${item.key}">${escapeText(item.label)}</button>`).join('');
}

function rowActions(kind, id, hidden, created) {
  const actions = [button('সম্পাদনা', 'edit', `data-ssc-kind="${kind}" data-ssc-id="${escapeText(id)}"`)];
  if (created) actions.push(button('মুছে ফেলো', 'delete', `data-ssc-kind="${kind}" data-ssc-id="${escapeText(id)}"`, 'danger'));
  else if (!hidden) actions.push(button('লুকিয়ে রাখো', 'hide', `data-ssc-kind="${kind}" data-ssc-id="${escapeText(id)}"`));
  if (!hidden && !created) actions.push(button('ফেরত', 'revert', `data-ssc-kind="${kind}" data-ssc-id="${escapeText(id)}"`));
  return `<div class="admin-row-actions">${actions.join('')}</div>`;
}

function mcqRows() {
  const rows = listFor('mcq');
  if (!rows.length) return '<p class="admin-empty">ব্যাংকে কোনো MCQ নেই।</p>';
  return rows.map((question, index) => `
    <article class="admin-row">
      <span class="admin-badge">${num(index + 1)}</span>
      <div class="admin-row-main">
        <strong>${escapeText(question.stem)}</strong>
        <small>${escapeText(chapterName(question.chapterId))} · ${escapeText(question.topic || 'টপিক নেই')}</small>
        <p>${escapeText(question.id)} · ${num(question.marks)} নম্বর · ${escapeText(question.difficulty)} · সঠিক উত্তর <b>${escapeText(question.answer)}</b>${question.explanation ? ' · ব্যাখ্যা আছে' : ' · ব্যাখা নেই'}</p>
      </div>
      ${rowActions('mcq', question.id, false, !baseEntry('mcq', question.id))}
    </article>`).join('');
}

function cqRows() {
  const rows = listFor('cq');
  if (!rows.length) return '<p class="admin-empty">সৃজনশীল প্রশ্ন নেই।</p>';
  return rows.map(question => {
    const total = (question.parts || []).reduce((sum, part) => sum + (Number(part.marks) || 0), 0);
    return `
      <article class="admin-row">
        <span class="admin-badge">CQ</span>
        <div class="admin-row-main">
          <strong>${escapeText(question.id)}</strong>
          <small>${escapeText(chapterName(question.chapterId))} · ${escapeText(String(question.stimulus || '').slice(0, 90))}${String(question.stimulus || '').length > 90 ? '…' : ''}</small>
          <p>${num((question.parts || []).length)}টি অংশ (${(question.parts || []).map(part => part.label).join('/')}) · ${num(total)} নম্বর · ${escapeText(question.difficulty)}</p>
        </div>
        ${rowActions('cq', question.id, false, !baseEntry('cq', question.id))}
      </article>`;
  }).join('');
}

function setRows() {
  const rows = listFor('sets');
  const kinds = { practice: 'প্র্যাকটিস', model: 'মডেল টেস্ট', live: 'লাইভ' };
  if (!rows.length) return '<p class="admin-empty">কোনো সেট নেই।</p>';
  return rows.map(set => `
    <article class="admin-row">
      <span class="admin-badge">${num((set.questionIds || []).length)}</span>
      <div class="admin-row-main">
        <strong>${escapeText(set.title)}</strong>
        <small>${escapeText(set.id)} · ${kinds[set.kind] || set.kind}${set.chapterId ? ` · ${escapeText(chapterName(set.chapterId))}` : ' · সব অধ্যায়'}</small>
        <p>${set.durationMin ? `${num(set.durationMin)} মিনিট` : 'সময়সীমা নেই'} · নেগেটিভ −${num(set.negativePerWrong)} · পাস ${num(set.passPercent)}%${set.window ? ` · উইন্ডো ${escapeText(String(set.window.opensAt || '').slice(0, 16))} → ${escapeText(String(set.window.closesAt || '').slice(0, 16))}` : ''}</p>
      </div>
      ${rowActions('sets', set.id, false, !baseEntry('sets', set.id))}
    </article>`).join('');
}

function hiddenRows() {
  const patches = overlay() || {};
  const entries = [];
  ['mcq', 'cq', 'sets'].forEach(kind => {
    Object.keys(patches[kind] || {}).forEach(id => {
      if (patches[kind][id]?.removed) entries.push({ kind, id });
    });
  });
  if (!entries.length) return '';
  return `
    <div class="admin-hidden">
      <p>লুকানো এন্ট্রি (${num(entries.length)}) — ssc-prep অ্যাপে দেখা যায় না, <code>data/questions.json</code>-এ কিছুই মুছে যায়নি</p>
      <div class="admin-hidden-inner">
        ${entries.map(entry => `
          <span class="admin-hidden-chip">
            <b>${escapeText(entry.id)}</b><small>${escapeText(entry.kind)}</small>
            ${button('চালু করো', 'show', `data-ssc-kind="${entry.kind}" data-ssc-id="${escapeText(entry.id)}"`, 'primary')}
            ${button('সরিয়ে দাও', 'delete', `data-ssc-kind="${entry.kind}" data-ssc-id="${escapeText(entry.id)}"`, 'danger')}
          </span>`).join('')}
      </div>
    </div>`;
}

function chapterName(id) {
  return (bank().chapters || []).find(chapter => chapter.id === id)?.name || id || '—';
}

/* ---------- render: editor ---------- */

const metaField = (label, name, value, extra = '') => `
  <label>${escapeText(label)}<input data-ssc-meta="${name}" value="${escapeText(value ?? '')}" ${extra}></label>`;

function editorForm() {
  const entry = draft.entry;
  const kind = draft.kind;
  const chapters = (bank().chapters || []);
  const chapterSelect = `<label>অধ্যায়<select data-ssc-meta="chapterId">${chapters.map(chapter => `<option value="${escapeText(chapter.id)}" ${chapter.id === entry.chapterId ? 'selected' : ''}>${escapeText(chapter.name)}</option>`).join('')}</select></label>`;
  const difficultySelect = `<label>কঠিনতা<select data-ssc-meta="difficulty">${['easy', 'medium', 'hard'].map(level => `<option ${entry.difficulty === level ? 'selected' : ''}>${level}</option>`).join('')}</select></label>`;
  const idField = `<label>আইডি<input data-ssc-meta="id" value="${escapeText(entry.id)}" ${draft.isNew ? 'placeholder="mcq-new-001"' : 'readonly'}></label>`;

  if (kind === 'mcq') {
    return `
      <div class="admin-fields">
        ${idField}
        ${chapterSelect}
        ${difficultySelect}
        ${metaField('টপিক', 'topic', entry.topic)}
        ${metaField('নম্বর', 'marks', entry.marks, 'type="number" min="0.5" step="0.5"')}
        <label>সঠিক অপশন<select data-ssc-meta="answer">${['A', 'B', 'C', 'D'].map(letter => `<option ${entry.answer === letter ? 'selected' : ''}>${letter}</option>`).join('')}</select></label>
      </div>
      <label class="admin-wide">প্রশ্ন<textarea data-ssc-meta="stem" rows="2">${escapeText(entry.stem)}</textarea></label>
      <div class="admin-options">
        ${entry.options.map((option, slot) => `
          <label class="admin-option">
            <span>${escapeText(option.id)}</span>
            <input data-ssc-slot="${slot}" data-ssc-option value="${escapeText(option.text)}" placeholder="অপশন ${escapeText(option.id)}">
          </label>`).join('')}
      </div>
      <label class="admin-wide">ব্যাখ্যা (শিক্ষার্থী সঙ্গে সঙ্গে দেখে)<textarea data-ssc-meta="explanation" rows="2">${escapeText(entry.explanation)}</textarea></label>`;
  }

  if (kind === 'cq') {
    return `
      <div class="admin-fields">
        ${idField}
        ${chapterSelect}
        ${difficultySelect}
      </div>
      <label class="admin-wide">উদ্দীপক<textarea data-ssc-meta="stimulus" rows="3">${escapeText(entry.stimulus)}</textarea></label>
      ${entry.parts.map((part, index) => `
        <article class="admin-question">
          <header>
            <span class="admin-q-num">${escapeText(part.label)}</span>
            <strong>নম্বর ${num(part.marks)}</strong>
            <label>নম্বর<input data-ssc-part="${index}" data-ssc-field="marks" type="number" min="0.5" step="0.5" value="${escapeText(part.marks)}"></label>
            <label>skill<select data-ssc-part="${index}" data-ssc-field="skill">${['জ্ঞান', 'বোধগ', 'প্রয়োগ', 'উচ্চতর দক্ষতা'].map(skill => `<option ${part.skill === skill ? 'selected' : ''}>${escapeText(skill)}</option>`).join('')}</select></label>
          </header>
          <label>প্রশ্ন<textarea data-ssc-part="${index}" data-ssc-field="question" rows="2">${escapeText(part.question)}</textarea></label>
          <label>মডেল উত্তর<textarea data-ssc-part="${index}" data-ssc-field="modelAnswer" rows="2">${escapeText(part.modelAnswer)}</textarea></label>
          <label>ইশারা<input data-ssc-part="${index}" data-ssc-field="hint" value="${escapeText(part.hint)}"></label>
        </article>`).join('')}`;
  }

  const chosen = new Set(entry.questionIds || []);
  return `
    <div class="admin-fields">
      ${idField}
      <label>ধরন<select data-ssc-meta="kind">${['practice', 'model', 'live'].map(kindValue => `<option ${entry.kind === kindValue ? 'selected' : ''}>${kindValue}</option>`).join('')}</select></label>
      ${chapterSelect}
      ${metaField('শিরোনাম', 'title', entry.title)}
      ${metaField('সময় (মিনিট, ০ = নেই)', 'durationMin', entry.durationMin, 'type="number" min="0"')}
      ${metaField('নেগেটিভ / ভুল', 'negativePerWrong', entry.negativePerWrong, 'type="number" min="0" step="0.25"')}
      ${metaField('পাস (%)', 'passPercent', entry.passPercent, 'type="number" min="0" max="100"')}
      ${metaField('লাইভ শুরু', 'window.opensAt', toLocalInput(entry.window?.opensAt), 'type="datetime-local"')}
      ${metaField('লাইভ শেষ', 'window.closesAt', toLocalInput(entry.window?.closesAt), 'type="datetime-local"')}
    </div>
    <label class="admin-wide">নির্দেশনা<textarea data-ssc-meta="description" rows="2">${escapeText(entry.description)}</textarea></label>
    <div class="admin-checks">
      <label><input type="checkbox" data-ssc-flag="shuffle.questions" ${entry.shuffle?.questions ? 'checked' : ''}> প্রশ্ন এলোমেলো</label>
      <label><input type="checkbox" data-ssc-flag="shuffle.options" ${entry.shuffle?.options ? 'checked' : ''}> অপশন এলোমেলো</label>
    </div>
    <p class="admin-count">প্রশ্ন বাছাই — ${num(chosen.size)}টি নির্বাচিত</p>
    <div class="admin-pick">
      ${listFor('mcq').map(question => `
        <label class="admin-pick-row">
          <input type="checkbox" data-ssc-pick="${escapeText(question.id)}" ${chosen.has(question.id) ? 'checked' : ''}>
          <span><b>${escapeText(question.id)}</b> ${escapeText(question.stem)}</span>
        </label>`).join('') || '<p class="admin-empty">ব্যাংক খালি — আগে MCQ যোগ করো।</p>'}
    </div>`;
}

/* ---------- render: results + tools ---------- */

function resultsPanel() {
  const attempts = list(SSC_KEYS.results);
  const submissions = list(SSC_KEYS.cq);
  const drafts = readJSON(SSC_KEYS.draft, {}) || {};
  const draftCount = Object.keys(drafts).length;
  const problems = validateBank(bank());

  return `
    <div class="admin-stats">
      <div class="admin-stat"><small>জমা দেওয়া টেস্ট</small><strong>${num(attempts.length)}</strong><p>শিক্ষার্থীর নিজস্ব লোকাল ডেটা</p></div>
      <div class="admin-stat"><small>সৃজনশীল খাতা</small><strong>${num(submissions.length)}</strong><p>স্ব-মূল্যায়ন সহ</p></div>
      <div class="admin-stat"><small>অসম্পন্ন খসড়া</small><strong>${num(draftCount)}</strong><p>যেখানে থামিয়েছে</p></div>
      <div class="admin-stat"><small>ব্যাংক ত্রুটি</small><strong>${num(problems.length)}</strong><p>${problems.length ? 'সাবধানে — দেখানো হলো' : 'সব ঠিক আছে'}</p></div>
    </div>
    ${problems.length ? `
      <div class="admin-card admin-danger">
        <h3>ব্যাংকে ${num(problems.length)}টি সমস্যা</h3>
        <ul class="admin-steps">${problems.slice(0, 10).map(problem => `<li><b>${escapeText(problem.id)}</b> · ${escapeText(problem.message)}</li>`).join('')}</ul>
      </div>` : ''}
    <div class="admin-list">
      ${attempts.length ? attempts.map(attempt => `
        <article class="admin-row">
          <span class="admin-badge">${num(attempt.score?.percent || 0)}%</span>
          <div class="admin-row-main">
            <strong>${escapeText(attempt.title || attempt.setId || 'টেস্ট')}</strong>
            <small>${escapeText(attempt.kind || '')} · ${escapeText(attempt.submittedAt ? new Date(attempt.submittedAt).toLocaleString('bn-BD', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—')}</small>
            <p>${num(attempt.score?.earned || 0)}/${num(attempt.score?.max || 0)} নম্বর · সঠিক ${num(attempt.score?.correct || 0)} · ভুল ${num(attempt.score?.wrong || 0)} · অনুত্তর ${num(attempt.score?.skipped || 0)} · GPA ${escapeText(attempt.score?.gpa ?? '—')}</p>
          </div>
          ${chip(attempt.autoSubmitted ? 'স্বয়ংক্রিয় জমা' : 'জমা', attempt.score?.passed ? 'good' : 'warn')}
        </article>`).join('') : '<p class="admin-empty">এই ডিভাইসে এখনো কোনো টেস্ট দেওয়া হয়নি।</p>'}
    </div>
    <p class="admin-note">শিক্ষার্থীর ফলাফল এডমিন প্যানেল থেকে মোছা যায় না — স্ক্রিন ডেটা বলেই থাকে, ছাত্র নিজেই ড্যাশবোর্ড থেকে মুছতে পারবে।</p>`;
}

function toolsPanel() {
  const current = bank();
  return `
    <div class="admin-card">
      <h3>রপ্তানি ও ইমপোর্ট</h3>
      <p>এই ডিভাইসের ব্যাংক (শিপ করা JSON + ওভারলে)। ফাইলটি <code>ssc-prep/data/questions.json</code>-এ বসিয়ে কমিট করলে সবার জন্য একই হয়ে যাবে।</p>
      <textarea id="sscExport" class="admin-textarea" readonly rows="8">${escapeText(JSON.stringify(current, null, 2))}</textarea>
      <div class="admin-row-actions">
        ${button('কপি করো', 'copy-export')}
        ${button('questions.json ডাউনলোড', 'download')}
        <a class="admin-btn" href="ssc-prep/" target="_blank" rel="noopener">ssc-prep অ্যাপ খুলুন</a>
      </div>
      <p class="admin-sub">ইমপোর্ট — পুরো payload বা শুধু <code>{ questions, sets }</code>। যে key পাঠাবেন সেই তালিকাই চূড়ান্ত; না-থাকা শিপড এন্ট্রি লুকানো হবে।</p>
      <textarea id="sscImport" class="admin-textarea" rows="6" placeholder='{"questions":{"mcq":[…]}}'></textarea>
      <div class="admin-row-actions">
        ${button('যাচাই করে ইমপোর্ট', 'import', '', 'primary')}
        ${countEdits(overlay()) ? button('ওভারলে রিসেট (শিপড JSON-এ ফেরত)', 'reset-bank', '', 'danger') : ''}
      </div>
    </div>`;
}

/* ---------- render ---------- */

export function renderSscBank() {
  if (loading) return '<p class="admin-empty">ssc-prep ব্যাংক পড়া হচ্ছে…</p>';
  if (loadError) return `
    <div class="admin-lede"><h2>এই স্কোপটি খোলা যায়নি</h2><p>${escapeText(loadError)}</p></div>
    <div class="admin-card">${button('আবার চেষ্টা করো', 'retry', '', 'primary')}</div>`;

  const counts = sscStats();
  const editor = draft ? `
    <div class="admin-editor">
      <div class="admin-editor-head">
        <h3>${draft.isNew ? 'নতুন এন্ট্রি' : `সম্পাদনা · ${escapeText(draft.entry.id)}`}</h3>
        <small>${draft.kind === 'mcq' ? 'MCQ' : draft.kind === 'cq' ? 'সৃজনশীল' : 'সেট'} · সেভ করলে ওভারলেতে প্যাচ হিসেবে বসবে</small>
      </div>
      ${editorForm()}
      <div class="admin-row-actions">
        ${button('সংরক্ষণ করো', 'save', '', 'primary')}
        ${button('বাতিল', 'cancel')}
      </div>
    </div>` : '';

  const list = listTab === 'results' ? resultsPanel()
    : listTab === 'tools' ? toolsPanel()
      : `${editor}${listTab === 'mcq' ? mcqRows() : listTab === 'cq' ? cqRows() : setRows()}${hiddenRows()}`;

  return `
    <div class="admin-lede">
      <h2>শিক্ষার্থী এপ ম্যানেজমেন্ট · SSC প্রস্তুতি</h2>
      <p><b>${num(counts.mcq)}</b>টি MCQ · <b>${num(counts.cq)}</b>টি সৃজনশীল · <b>${num(counts.sets)}</b>টি সেট · এই ডিভাইসে <b>${num(counts.edits)}</b>টি ওভারলে এডিট${countEdits(overlay()) ? '' : ' (কোনো লোকাল পরিবর্তন নেই)'}</p>
    </div>
    ${notice()}
    <div class="admin-tabs admin-tabs-inner">
      ${listTabs()}
      <button type="button" class="admin-tab ${listTab === 'tools' ? 'active' : ''}" data-ssc-act="tab" data-ssc-tab="tools">JSON</button>
      <span class="admin-toolbar-right">
        ${button('+ MCQ', 'new', 'data-ssc-kind="mcq"', 'primary')}
        ${button('+ সৃজনশীল', 'new', 'data-ssc-kind="cq"')}
        ${button('+ সেট', 'new', 'data-ssc-kind="sets"')}
      </span>
    </div>
    <div class="admin-list">${list}</div>`;
}

/* ---------- input + actions ---------- */

function assign(target, path, value) {
  const keys = path.split('.');
  let node = target;
  while (keys.length > 1) {
    const key = keys.shift();
    if (!node[key] || typeof node[key] !== 'object') node[key] = {};
    node = node[key];
  }
  node[keys[0]] = value;
}

export function handleSscInput(event) {
  const target = event.target;
  if (!draft || !target.closest('#adminBody')) return;
  const meta = target.dataset.sscMeta;
  const slot = target.dataset.sscSlot;
  const part = target.dataset.sscPart;
  const pick = target.dataset.sscPick;
  const flag = target.dataset.sscFlag;

  if (meta) {
    const numeric = target.type === 'number';
    assign(draft.entry, meta, numeric ? (Number(target.value) || 0) : target.value);
    if (meta === 'id') draft.entry.id = String(target.value).trim();
    return;
  }
  if (slot !== undefined) {
    draft.entry.options[Number(slot)].text = target.value;
    return;
  }
  if (part !== undefined) {
    const field = target.dataset.sscField;
    draft.entry.parts[Number(part)][field] = field === 'marks' ? (Number(target.value) || 0) : target.value;
    return;
  }
  if (pick !== undefined) {
    const set = new Set(draft.entry.questionIds || []);
    if (target.checked) set.add(pick);
    else set.delete(pick);
    draft.entry.questionIds = [...set];
    return;
  }
  if (flag) {
    assign(draft.entry, flag, Boolean(target.checked));
  }
}

const ACTS = {
  tab: trigger => {
    listTab = trigger.dataset.sscTab;
    draft = null;
  },
  retry: () => {
    loadError = '';
    loading = false;
    return initSscAdmin();
  },
  new: trigger => {
    const kind = trigger.dataset.sscKind;
    const chapterId = (bank().chapters || [])[0]?.id || '';
    draft = {
      kind,
      isNew: true,
      entry: kind === 'mcq' ? blankMcq(chapterId) : kind === 'cq' ? blankCq(chapterId) : { ...blankSet(chapterId), questionIds: [] }
    };
    listTab = kind;
    window.setTimeout(() => $('#adminBody [data-ssc-meta="id"]')?.focus(), 30);
  },
  edit: trigger => {
    const kind = trigger.dataset.sscKind;
    const id = trigger.dataset.sscId;
    const entry = listFor(kind).find(item => item.id === id);
    if (!entry) return;
    const copy = JSON.parse(JSON.stringify(entry));
    if (kind === 'mcq' && copy.options.length < 4) {
      'ABCD'.slice(copy.options.length).split('').forEach(letter => copy.options.push({ id: letter, text: '' }));
    }
    if (kind === 'cq' && copy.parts.length < 4) {
      ['ক', 'খ', 'গ', 'ঘ'].slice(copy.parts.length).forEach(label => copy.parts.push({ label, skill: 'প্রয়োগ', marks: 1, question: '', modelAnswer: '', hint: '' }));
    }
    draft = { kind, isNew: false, entry: copy };
  },
  cancel: () => {
    draft = null;
  },
  save: () => {
    if (!draft) return;
    const entry = JSON.parse(JSON.stringify(draft.entry));
    const kind = draft.kind;
    if (kind === 'cq') entry.parts = entry.parts.filter(part => part.question || part.modelAnswer || part.hint);
    if (kind === 'sets') {
      if (entry.kind !== 'live') {
        delete entry.window;
        delete entry.proctoring;
      } else if (entry.window) {
        entry.window = {
          opensAt: entry.window.opensAt ? new Date(entry.window.opensAt).toISOString() : null,
          closesAt: entry.window.closesAt ? new Date(entry.window.closesAt).toISOString() : null
        };
      }
      if (!entry.description) delete entry.description;
    }
    entry.id = String(entry.id || '').trim();

    const chapters = new Set((bank().chapters || []).map(chapter => chapter.id));
    const mcqIds = new Set(listFor('mcq').map(question => question.id));
    const errors = kind === 'mcq' ? validateMcq(entry, chapters)
      : kind === 'cq' ? validateCq(entry) : validateSet(entry, mcqIds);
    if (errors.length) return announce(errors.join(' · '), 'bad');
    if (mcqIds.has(entry.id) && !listFor('mcq').some(question => question.id === entry.id) && kind === 'mcq') return announce('এই আইডিটি লুকানো একটি প্রশ্নে ব্যবহৃত হচ্ছে — অন্য নাম দাও', 'bad');

    const original = baseEntry(kind, entry.id);
    const patch = original ? minimalDiff(original, entry) : entry;
    if (original && !Object.keys(patch).length) {
      draft = null;
      return announce(`${entry.id}-ে কিছু বদলায়নি`, 'neutral');
    }
    writePatch(kind, entry.id, patch);
    draft = null;
    listTab = kind === 'sets' ? 'sets' : kind;
    announce(`${entry.id} ${original ? 'আপডেট' : 'যোগ'} হয়েছে — ssc-prep অ্যাপ রিলোড করলেই দেখা যাবে`, 'good');
  },
  hide: trigger => {
    writePatch(trigger.dataset.sscKind, trigger.dataset.sscId, { removed: true });
    announce(`${trigger.dataset.sscId} লুকানো হয়েছে (ফাইল অটুট)`, 'neutral');
  },
  show: trigger => {
    writePatch(trigger.dataset.sscKind, trigger.dataset.sscId, null);
    announce(`${trigger.dataset.sscId} আবার চালু হয়েছে`, 'good');
  },
  revert: trigger => {
    writePatch(trigger.dataset.sscKind, trigger.dataset.sscId, null);
    announce(`${trigger.dataset.sscId} — শিপ করা JSON-এর মান ফিরে এসেছে`, 'neutral');
  },
  delete: trigger => {
    writePatch(trigger.dataset.sscKind, trigger.dataset.sscId, null);
    announce(`${trigger.dataset.sscId} মুছে ফেলা হয়েছে`, 'good');
  },
  'copy-export': async () => {
    const text = $('#adminBody #sscExport')?.value || '';
    try {
      await navigator.clipboard.writeText(text);
      showFeedback('ব্যাংক JSON কপি হয়েছে');
    } catch {
      announce('ব্রাউজার কপি করতে দেয়নি — টেক্সটএরিয়া থেকে ম্যানুয়ালি নাও', 'warn');
    }
  },
  download: () => {
    const blob = new Blob([JSON.stringify(bank(), null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'questions.json';
    document.body.append(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 2000);
  },
  import: () => {
    const raw = String($('#adminBody #sscImport')?.value || '').trim();
    if (!raw) return announce('ইমপোর্ট করতে JSON পেস্ট করো', 'bad');
    let incoming;
    try {
      incoming = JSON.parse(raw);
    } catch (error) {
      return announce(`JSON পার্স হয়নি: ${error.message}`, 'bad');
    }
    const candidate = { ...base, ...incoming, questions: { ...base.questions, ...(incoming.questions || {}) } };
    const problems = validateBank(candidate);
    if (problems.length) return announce(`${num(problems.length)}টি সমস্যা — প্রথমটি: ${problems[0].id} · ${problems[0].message}`, 'bad');
    const next = diffBank(base, candidate);
    if (Object.keys(next.mcq).length || Object.keys(next.cq).length || Object.keys(next.sets).length) {
      writeJSON(SSC_KEYS.bank, next);
    } else {
      try { window.localStorage.removeItem(SSC_KEYS.bank); } catch { /* nothing to clear */ }
    }
    draft = null;
    announce('ইমপোর্ট হয়েছে — ওভারলে নতুন করে লেখা হয়েছে', 'good');
  },
  'reset-bank': () => {
    resetSscEdits();
    announce('শিপ করা প্রশ্নব্যাংকে ফিরে গেছি', 'good');
  }
};

/** Drop every device-local patch. Exported so the panel-wide reset clears both scopes at once. */
export function resetSscEdits() {
  try { window.localStorage.removeItem(SSC_KEYS.bank); } catch { /* private mode: nothing to clear */ }
  draft = null;
}

/** @returns {Promise|boolean} falsy when the click did not belong to the SSC scope */
export function handleSscAction(trigger) {
  const act = trigger.dataset.sscAct;
  if (!act) return false;
  return ACTS[act]?.(trigger) || true;
}

export function sscOverviewLine() {
  const counts = sscStats();
  if (!base) return { ready: false, text: loading ? 'ssc-prep ব্যাংক লোড হচ্ছে…' : 'ssc-prep ব্যাংক পড়া যায়নি' };
  return {
    ready: true,
    text: `SSC প্রস্তুতি: ${num(counts.mcq)}টি MCQ · ${num(counts.cq)}টি সৃজনশীল · ${num(counts.sets)}টি সেট · ${num(counts.edits)}টি লোকাল এডিট · ${num(counts.attempts)}টি জমা`,
    problems: validateBank(bank()).length
  };
}
