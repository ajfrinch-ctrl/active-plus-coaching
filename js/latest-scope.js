/* One rule for what a list shows by default — same rule on every panel.

   A dashboard or a panel opens on the *latest* work, never on the whole
   history: the default view is the last few days, and anything older stays one
   tap behind a From → To range. Recency is the record's own date when it has
   one (the day a homework is due, the day a class happens) and the day it last
   changed when it does not (an academic notice carries no date of its own).

   The rule lives here as pure functions so a dashboard, a homework panel and a
   report can all read the same definition of "recent"; the bar below is the one
   filter UI those lists mount, so a filter never looks different from panel to
   panel. No storage, no data model: nothing here can lose a record — a scope
   only decides what is on screen, and "সব" always shows everything again. */

export const LATEST_DAYS_PANEL = 7;       // a panel's default window
export const LATEST_DAYS_DASHBOARD = 3;   // a dashboard's default window
export const DASHBOARD_LIMIT = 3;         // ...and how many rows it may show

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const dayOf = value => String(value || '').slice(0, 10);

/** Local calendar day as YYYY-MM-DD (the app's own record dates are local). */
export function isoToday(now = new Date()) {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

/** `iso` moved by `days` (negative = earlier). Invalid input returns ''. */
export function shiftDay(iso, days) {
  if (!DAY.test(dayOf(iso))) return '';
  const date = new Date(`${dayOf(iso)}T12:00:00`);
  date.setDate(date.getDate() + Number(days || 0));
  return isoToday(date);
}

/** The day a record belongs to: its own date, else the day it last changed. */
export function recencyDay(record) {
  const own = dayOf(record?.date);
  if (DAY.test(own)) return own;
  const changed = dayOf(record?.updatedAt || record?.createdAt || '');
  return DAY.test(changed) ? changed : '';
}

export function latestScope(days = LATEST_DAYS_PANEL) {
  return { mode: 'latest', days: Number(days) || LATEST_DAYS_PANEL, from: '', to: '' };
}

/* A range keeps its mode even with no bounds yet: the person has asked to pick
   dates, so the From → To pair stays open, and an empty pair restricts nothing
   (it never silently falls back to hiding the history). */
export function rangeScope(from, to) {
  const start = DAY.test(dayOf(from)) ? dayOf(from) : '';
  const end = DAY.test(dayOf(to)) ? dayOf(to) : '';
  return { mode: 'range', days: 0, from: start, to: end };
}

export const ALL_SCOPE = Object.freeze({ mode: 'all', days: 0, from: '', to: '' });

/** Coerce anything (a stored value, a form read) into one of the three modes. */
export function normalizeScope(input, { latestDays = LATEST_DAYS_PANEL } = {}) {
  const mode = input?.mode === 'all' || input?.mode === 'range' ? input.mode : 'latest';
  if (mode === 'all') return { ...ALL_SCOPE };
  if (mode === 'range') return rangeScope(input?.from, input?.to);
  return latestScope(Number(input?.days) > 0 ? Number(input.days) : latestDays);
}

/**
 * Does this record belong on screen under `scope`?
 * A record with no usable day is treated as just-written: it shows in the
 * latest view, and a date range cannot place it, so a range leaves it out.
 */
export function inScope(record, scope = latestScope(), today = isoToday()) {
  const current = normalizeScope(scope);
  if (current.mode === 'all') return true;
  const day = recencyDay(record);
  if (current.mode === 'range') {
    if (!current.from && !current.to) return true;   // dates not picked yet
    if (current.from && (!day || day < current.from)) return false;
    if (current.to && (!day || day > current.to)) return false;
    return true;
  }
  if (!day) return true;
  return day >= shiftDay(today, -(current.days - 1));
}

export function applyScope(records, scope, today = isoToday()) {
  return (Array.isArray(records) ? records : []).filter(record => inScope(record, scope, today));
}

/** Newest first by the same day the scope uses, so the list matches the rule. */
export function byRecency(a, b) {
  return recencyDay(b).localeCompare(recencyDay(a)) || String(b.updatedAt || '').localeCompare(String(a.updatedAt || ''));
}

const bn = value => String(value ?? 0).replace(/\d/g, digit => '০১২৩৪৫৬৭৮৯'[digit]);

/** The count line under a list: what is shown, and what is held back. */
export function scopeNote(scope, { shown = 0, total = 0 } = {}) {
  const current = normalizeScope(scope);
  const head = `${bn(shown)}টি দেখানো হচ্ছে`;
  if (current.mode === 'range') {
    const when = [current.from, current.to].filter(Boolean).join(' → ');
    return `${head} • ${when ? `${when} এর মধ্যে` : 'তারিখ ধরে'} • মোট ${bn(total)}টি`;
  }
  if (current.mode === 'all') return `${head} • মোট ${bn(total)}টি`;
  const hidden = Math.max(0, total - shown);
  return `${head} • সর্বশেষ ${bn(current.days)} দিন${hidden ? ` • আরও ${bn(hidden)}টি পুরোনো` : ''} • মোট ${bn(total)}টি`;
}

/* ---- the one filter bar ------------------------------------------------------ */

const MODES = Object.freeze([
  { mode: 'latest', label: 'সাম্প্রতিক' },
  { mode: 'all', label: 'সব' },
  { mode: 'range', label: 'তারিখ ধরে' }
]);

/**
 * Markup for the shared bar: three chips and a From → To pair that only opens
 * when "তারিখ ধরে" is chosen. `idPrefix` keeps the two date inputs unique when a
 * page carries more than one list.
 */
export function scopeBarMarkup({ scope = latestScope(), idPrefix = 'list', labels = {} } = {}) {
  const current = normalizeScope(scope);
  const chips = MODES.map(({ mode, label }) => {
    const active = current.mode === mode;
    return `<button type="button" class="chip${active ? ' active' : ''}" data-scope-mode="${mode}" aria-pressed="${active}">${labels[mode] || label}</button>`;
  }).join('');
  return `<div class="scope-bar" data-scope-bar>
      <div class="chip-row" role="group" aria-label="কত পুরোনো তথ্য দেখাবেন">${chips}</div>
      <div class="scope-range" data-scope-range${current.mode === 'range' ? '' : ' hidden'}>
        <label for="${idPrefix}ScopeFrom">শুরু</label>
        <input id="${idPrefix}ScopeFrom" type="date" data-scope-from value="${current.from}">
        <label for="${idPrefix}ScopeTo">শেষ</label>
        <input id="${idPrefix}ScopeTo" type="date" data-scope-to value="${current.to}">
        <button type="button" class="mini-btn primary" data-scope-apply>দেখুন</button>
      </div>
    </div>`;
}

/** Read the bar's current choice. */
export function readScopeBar(root, { latestDays = LATEST_DAYS_PANEL } = {}) {
  if (!root) return latestScope(latestDays);
  const active = root.querySelector('[data-scope-mode].active');
  const mode = active?.dataset.scopeMode || 'latest';
  if (mode === 'range') {
    const from = root.querySelector('[data-scope-from]')?.value || '';
    const to = root.querySelector('[data-scope-to]')?.value || '';
    return normalizeScope({ mode: 'range', from, to }, { latestDays });
  }
  return normalizeScope({ mode }, { latestDays });
}

/**
 * Mount the bar and call `onChange(scope)` whenever the person changes it.
 * Returns `{ scope, set }` so a page can drive the bar (a deep link that asks
 * for "all homework", a dashboard button that opens a filtered panel).
 */
export function initScopeBar({ mount, onChange, scope, latestDays = LATEST_DAYS_PANEL, labels = {}, idPrefix = 'list' } = {}) {
  const root = typeof mount === 'string' ? document.querySelector(mount) : mount;
  if (!root) return null;
  let current = normalizeScope(scope, { latestDays });

  function paint() {
    root.innerHTML = scopeBarMarkup({ scope: current, idPrefix, labels });
  }

  function emit() {
    if (typeof onChange === 'function') onChange({ ...current });
  }

  paint();
  root.addEventListener('click', event => {
    const chip = event.target.closest('[data-scope-mode]');
    if (chip) {
      const mode = chip.dataset.scopeMode;
      current = mode === 'range'
        ? normalizeScope({ mode: 'range', from: current.from, to: current.to }, { latestDays })
        : normalizeScope({ mode }, { latestDays });
      paint();
      emit();
      return;
    }
    if (event.target.closest('[data-scope-apply]')) {
      current = normalizeScope({
        mode: 'range',
        from: root.querySelector('[data-scope-from]')?.value,
        to: root.querySelector('[data-scope-to]')?.value
      }, { latestDays });
      paint();
      emit();
    }
  });

  return {
    scope: () => ({ ...current }),
    set(next) { current = normalizeScope(next, { latestDays }); paint(); }
  };
}
