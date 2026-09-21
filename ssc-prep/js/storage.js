/**
 * localStorage adapter — the single seam where a REST/API backend can be
 * plugged in later without touching any view code.
 */

const KEYS = Object.freeze({
  results: 'ssc-prep-results-v1',
  cq: 'ssc-prep-cq-v1',
  draft: 'ssc-prep-draft-v1',
  theme: 'ssc-prep-theme-v1',
  bank: 'ssc-prep-bank-v1'
});

const MAX_HISTORY = 40;

function read(key, fallback) {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    return parsed ?? fallback;
  } catch {
    return fallback;
  }
}

function write(key, value) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

function isObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value);
}

/* ---------- objective results ---------- */

export function loadResults() {
  const stored = read(KEYS.results, []);
  if (!Array.isArray(stored)) return [];
  // Defensive: a corrupt entry must never blank out the whole dashboard.
  return stored.filter(item => isObject(item) && isObject(item.score) && typeof item.score.percent === 'number');
}

export function saveResult(result) {
  const next = [result, ...loadResults()].slice(0, MAX_HISTORY);
  write(KEYS.results, next);
  return next;
}

export function clearResults() {
  write(KEYS.results, []);
}

/** Everything a student can delete about themselves; prefs and theme stay. */
export function clearAllData() {
  write(KEYS.results, []);
  write(KEYS.cq, []);
  write(KEYS.draft, {});
}

/* ---------- CQ self-assessment submissions ---------- */

export function loadCqSubmissions() {
  const stored = read(KEYS.cq, []);
  return Array.isArray(stored) ? stored.filter(isObject) : [];
}

export function saveCqSubmission(record) {
  const next = [record, ...loadCqSubmissions()]
    .filter((item, index, all) => all.findIndex(other => other.id === item.id) === index)
    .slice(0, MAX_HISTORY);
  write(KEYS.cq, next);
  return next;
}

/* ---------- in-progress paper (survives refresh) ---------- */

function readDrafts() {
  const stored = read(KEYS.draft, {});
  return isObject(stored) ? stored : {};
}

export function saveDraft(setId, draft) {
  const drafts = readDrafts();
  drafts[setId] = { ...draft, savedAt: Date.now() };
  write(KEYS.draft, drafts);
}

export function loadDraft(setId) {
  return readDrafts()[setId] || null;
}

export function clearDraft(setId) {
  const drafts = readDrafts();
  delete drafts[setId];
  write(KEYS.draft, drafts);
}

/* ---------- admin overlay (device-local question-bank edits) ---------- */

const BANK_KINDS = ['mcq', 'cq', 'sets'];

function readOverlay() {
  const stored = read(KEYS.bank, null);
  const overlay = isObject(stored) ? stored : {};
  const clean = { version: 1, updatedAt: overlay.updatedAt || null };
  BANK_KINDS.forEach(kind => {
    clean[kind] = isObject(overlay[kind]) ? overlay[kind] : {};
  });
  return clean;
}

export function loadBankOverlay() {
  const overlay = readOverlay();
  return BANK_KINDS.some(kind => Object.keys(overlay[kind]).length) ? overlay : null;
}

/** `patch` is a partial entry, or `{ removed: true }` to hide an entry. */
export function saveBankPatch(kind, id, patch) {
  if (!BANK_KINDS.includes(kind) || !id) return false;
  const overlay = readOverlay();
  overlay[kind][id] = patch;
  overlay.updatedAt = Date.now();
  return write(KEYS.bank, overlay);
}

/** Undo a single admin edit: the shipped JSON entry shows through again. */
export function dropBankPatch(kind, id) {
  if (!BANK_KINDS.includes(kind) || !id) return false;
  const overlay = readOverlay();
  delete overlay[kind][id];
  overlay.updatedAt = Date.now();
  const empty = BANK_KINDS.every(item => !Object.keys(overlay[item]).length);
  if (empty) {
    try { window.localStorage.removeItem(KEYS.bank); } catch { /* no-op */ }
    return true;
  }
  return write(KEYS.bank, overlay);
}

export function replaceBankOverlay(overlay) {
  if (!isObject(overlay)) return false;
  return write(KEYS.bank, overlay);
}

export function clearBankOverlay() {
  try { window.localStorage.removeItem(KEYS.bank); return true; } catch { return false; }
}

/* ---------- prefs ---------- */

export function loadTheme() {
  // Accepts both the JSON-encoded value this module writes and a raw string.
  const stored = read(KEYS.theme, 'light');
  return typeof stored === 'string' ? stored : 'light';
}

export function saveTheme(theme) {
  write(KEYS.theme, theme);
}
