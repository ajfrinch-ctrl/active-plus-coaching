/* Reports UI — the same five steps on every panel.

     Reports → report type → the filters that report needs → Generate
     → full preview → DOWNLOAD PDF

   The panel only provides a container; everything inside it is built here, so
   Admin, Manager, Teacher, Cash Counter and Student all get the same flow with
   the same engine. Two rules shape the module:

   • Only the filters a report declares are rendered. No report ever shows a
     control it does not use.
   • Whatever is previewed is what gets downloaded. The preview and the PDF are
     produced from one laid-out document, so they cannot disagree.

   Access is decided twice: the catalog hides what a role may not see, and
   report-access.js#enforceAccess decides again before any record is read.
*/
import { escapeHtml } from './sanitize.js';
import { iconMarkup } from './admin-icons.js';
import {
  CATEGORIES, PERIODS, FILTER_META, OPTION_VALUES, EMPTY_MESSAGE,
  catalogFor, findReport, filterOptions, validateFilters, buildReportDocument, blocksHaveData
} from './report-catalog.js';
import { resolveActor, actorScope, canAccess, enforceAccess, ROLE_LABEL } from './report-access.js';
import { loadSnapshot } from './report-sources.js';
import { toBanglaNumber as bn } from './ui.js';
import { buildReport, buildReportPDF, loadReportAssets, PAGE } from './report-layout.js';
import { downloadBlob } from './exam-pdf.js';

/* A filter is named after its control; the builders read the record field it
   filters on. Both are written, so a report always receives what it asks for. */
const FILTER_FIELD = Object.freeze({
  class: 'className',
  student: 'studentId',
  exam: 'examId'
});

const MONTH_NAME = ['জানুয়ারি', 'ফেব্রুয়ারি', 'মার্চ', 'এপ্রিল', 'মে', 'জুন', 'জুলাই', 'আগস্ট', 'সেপ্টেম্বর', 'অক্টোবর', 'নভেম্বর', 'ডিসেম্বর'];

const el = (tag, className = '', text = '') => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
};

const isoDay = (time = Date.now()) => {
  const date = new Date(time);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};

/** ActivePlus_Student_Master_List_2026-09-27.pdf */
function fileNameFor(definition) {
  const slug = String(definition.title || 'Report')
    .replace(/[^\p{L}\p{N}]+/gu, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 60) || 'Report';
  return `ActivePlus_${slug}_${isoDay()}.pdf`;
}

function periodText(definition, filters) {
  const period = filters.period || 'all';
  const meta = PERIODS.find(item => item.id === period);
  if (period === 'daily' && filters.date) return filters.date;
  if (period === 'weekly' && filters.week) return `সপ্তাহ: ${filters.week}`;
  if (period === 'monthly' && filters.month) {
    const [year, index] = String(filters.month).split('-').map(Number);
    return `${MONTH_NAME[Math.max(0, Math.min(11, (index || 1) - 1))]} ${year}`;
  }
  if (period === 'custom' && (filters.from || filters.to)) return `${filters.from || 'শুরু'} → ${filters.to || 'আজ'}`;
  return meta ? meta.label : 'সব সময়';
}

/* -------------------------------------------------------------------------
   One mounted instance
   ---------------------------------------------------------------------- */

class ReportCenter {
  constructor(root, options = {}) {
    this.root = root;
    this.panel = options.panel || '';
    this.actor = null;
    this.scope = null;
    this.catalog = [];
    this.options = null;
    this.definition = null;
    this.category = null;
    this.filters = {};
    this.doc = null;
    this.busy = false;
    this.built = { doc: null, total: 0 };
  }

  /**
   * Read who is signed in and render. A soft refresh (a data change behind the
   * panel) only reloads the filter options, so a half-filled flow is kept.
   */
  async start({ soft = false } = {}) {
    const actor = await resolveActor();
    const sameActor = this.actor && actor
      && this.actor.role === actor.role
      && this.actor.username === actor.username
      && this.actor.studentId === actor.studentId;
    if (soft && sameActor) {
      this.actor = actor;
      this.scope = actorScope(actor);
      this.refreshOptions();
      return this;
    }
    this.actor = actor;
    if (!this.actor) {
      this.root.replaceChildren(el('p', 'rp-note', 'রিপোর্ট দেখতে হলে লগইন করতে হবে।'));
      return this;
    }
    this.scope = actorScope(this.actor);
    this.catalog = catalogFor(this.actor.role);
    this.root.classList.add('rp-root');
    this.root.dataset.role = this.actor.role;
    if (this.panel) this.root.dataset.panel = this.panel;
    this.render();
    this.refreshOptions();
    this.watchResize();
    return this;
  }

  /** Keep the A4 pages fitted when the phone rotates or the panel resizes. */
  watchResize() {
    if (this.resizeBound) return;
    this.resizeBound = true;
    let frame = 0;
    const fit = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => this.fitPages());
    };
    window.addEventListener('resize', fit);
    window.addEventListener('orientationchange', fit);
    // A panel can also change width by becoming visible — no resize fires then.
    if (typeof ResizeObserver === 'function') new ResizeObserver(fit).observe(this.root);
  }

  /* ---------- shell ---------- */

  render() {
    const roleLabel = ROLE_LABEL[this.actor.role] || this.actor.role;
    const head = el('header', 'rp-head');
    head.append(el('p', 'eyebrow', 'Reports'));
    const title = el('h2', 'rp-title', 'রিপোর্ট');
    head.append(title);
    head.append(el('p', 'rp-hint', 'রিপোর্টের ধরন বেছে নিন → প্রয়োজনীয় filter দিন → Generate → Preview → Download PDF'));
    const who = el('p', 'rp-who');
    who.append(el('span', 'rp-who-role', roleLabel));
    who.append(el('span', 'rp-who-name', this.actor.name || this.actor.username || ''));
    head.append(who);

    this.crumbs = el('nav', 'rp-crumbs');
    this.crumbs.setAttribute('aria-label', 'রিপোর্টের ধাপ');

    this.screens = el('div', 'rp-screens');
    this.categoryScreen = el('section', 'rp-screen');
    this.reportScreen = el('section', 'rp-screen');
    this.filterScreen = el('section', 'rp-screen');
    this.previewScreen = el('section', 'rp-screen');
    this.screens.append(this.categoryScreen, this.reportScreen, this.filterScreen, this.previewScreen);

    this.status = el('p', 'rp-status');
    this.status.setAttribute('role', 'status');
    this.status.setAttribute('aria-live', 'polite');

    this.root.replaceChildren(head, this.crumbs, this.status, this.screens);
    this.showCategories();
  }

  setCrumbs(trail) {
    this.crumbs.replaceChildren();
    trail.forEach((item, index) => {
      if (index) this.crumbs.append(el('span', 'rp-crumb-sep', '›'));
      const node = el('button', 'rp-crumb', item.label);
      node.type = 'button';
      if (item.onOpen) node.addEventListener('click', item.onOpen);
      else node.disabled = true;
      this.crumbs.append(node);
    });
  }

  showScreen(node) {
    for (const screen of [this.categoryScreen, this.reportScreen, this.filterScreen, this.previewScreen]) {
      screen.hidden = screen !== node;
    }
  }

  setStatus(message = '', tone = '') {
    this.status.textContent = message || '';
    this.status.dataset.tone = tone;
    this.status.hidden = !message;
  }

  /* ---------- step 1: categories ---------- */

  showCategories() {
    this.setCrumbs([{ label: 'রিপোর্ট' }]);
    this.showScreen(this.categoryScreen);
    this.categoryScreen.replaceChildren();
    const grid = el('div', 'rp-grid');
    for (const category of this.catalog) {
      const card = el('button', 'rp-card');
      card.type = 'button';
      card.dataset.category = category.id;
      const icon = el('span', 'rp-card-icon');
      icon.innerHTML = iconMarkup(category.icon, 'rp-icon-svg');
      card.append(icon);
      const copy = el('span', 'rp-card-copy');
      copy.append(el('strong', '', category.labelBn));
      copy.append(el('small', '', `${category.reports.length} টি রিপোর্ট`));
      card.append(copy);
      card.append(el('span', 'rp-card-go', '›'));
      card.addEventListener('click', () => this.showReports(category));
      grid.append(card);
    }
    this.categoryScreen.append(grid);
    this.setStatus('');
  }

  /* ---------- step 2: reports in the category ---------- */

  showReports(category) {
    this.category = category;
    this.setCrumbs([
      { label: 'রিপোর্ট', onOpen: () => this.showCategories() },
      { label: category.labelBn }
    ]);
    this.showScreen(this.reportScreen);
    this.reportScreen.replaceChildren();

    const list = el('div', 'rp-list');
    for (const definition of category.reports) {
      const card = el('button', 'rp-report');
      card.type = 'button';
      card.dataset.report = definition.id;
      const icon = el('span', 'rp-report-icon');
      icon.innerHTML = iconMarkup(category.icon, 'rp-icon-svg');
      card.append(icon);
      const copy = el('span', 'rp-report-copy');
      copy.append(el('strong', '', definition.title));
      copy.append(el('small', '', definition.subtitle || ''));
      const filters = (definition.filters || []).map(key => FILTER_META[key]?.label).filter(Boolean);
      if (filters.length) copy.append(el('span', 'rp-report-filters', filters.join(' • ')));
      card.append(copy);
      card.append(el('span', 'rp-card-go', '›'));
      card.addEventListener('click', () => this.showFilters(definition));
      list.append(card);
    }
    this.reportScreen.append(list);
    this.setStatus('');
  }

  /* ---------- step 3: only the filters this report needs ---------- */

  refreshOptions() {
    try {
      this.options = filterOptions(loadSnapshot(), this.actor, this.scope);
    } catch {
      this.options = filterOptions({ students: [], transactions: [], notices: [], teaching: { activities: [] }, exams: { exams: [], attempts: [] } }, this.actor, this.scope);
    }
    return this.options;
  }

  showFilters(definition) {
    if (!canAccess(definition, this.actor)) {
      this.setStatus('আপনার এই রিপোর্ট দেখার অনুমতি নেই।', 'error');
      return;
    }
    this.definition = definition;
    this.filters = {
      period: definition.defaultPeriod && (definition.filters || []).includes('period') ? definition.defaultPeriod : 'all',
      date: isoDay(),
      week: isoDay(),
      month: isoDay().slice(0, 7),
      from: '',
      to: ''
    };
    this.setCrumbs([
      { label: 'রিপোর্ট', onOpen: () => this.showCategories() },
      { label: this.category ? this.category.labelBn : 'রিপোর্ট', onOpen: () => this.category && this.showReports(this.category) },
      { label: definition.title }
    ]);
    this.showScreen(this.filterScreen);
    this.filterScreen.replaceChildren();

    const intro = el('div', 'rp-choose');
    intro.append(el('h3', '', definition.title));
    if (definition.subtitle) intro.append(el('p', 'rp-choose-sub', definition.subtitle));
    this.filterScreen.append(intro);

    this.form = el('form', 'rp-filters');
    this.form.noValidate = true;
    const keys = definition.filters || [];
    if (!keys.length) {
      this.form.append(el('p', 'rp-note', 'এই রিপোর্টে কোনো filter নেই — সরাসরি তৈরি করুন।'));
    }
    for (const key of keys) this.form.append(this.filterField(key));
    this.filterScreen.append(this.form);

    const actions = el('div', 'rp-filter-actions');
    this.generateButton = el('button', 'rp-generate', 'রিপোর্ট তৈরি করুন');
    this.generateButton.type = 'submit';
    this.generateButton.innerHTML = `${iconMarkup('summary', 'rp-icon-svg')}<span>রিপোর্ট তৈরি করুন</span>`;
    actions.append(this.generateButton);
    const cancel = el('button', 'rp-back', 'ফিরে যান');
    cancel.type = 'button';
    cancel.addEventListener('click', () => (this.category ? this.showReports(this.category) : this.showCategories()));
    actions.append(cancel);
    this.filterScreen.append(actions);
    // Both paths lead to the same build: the button click (what a thumb does)
    // and the form's submit (what the keyboard does).
    this.generateButton.addEventListener('click', event => {
      event.preventDefault();
      this.generate();
    });
    this.form.addEventListener('submit', event => {
      event.preventDefault();
      this.generate();
    });
    this.setStatus('');
  }

  filterField(key) {
    const meta = FILTER_META[key] || { label: key, type: 'select' };
    const field = el('div', 'rp-field');
    field.dataset.filter = key;
    const id = `rp-filter-${key}-${Math.random().toString(36).slice(2, 7)}`;

    if (meta.type === 'period') {
      field.append(this.selectField(id, 'সময়কাল', PERIODS.map(item => ({ value: item.id, label: item.label })), 'period'));
      field.append(this.periodExtras());
      return field;
    }

    const source = this.options?.[meta.options] || OPTION_VALUES[meta.options] || [];
    const options = [{ value: 'all', label: 'সব' }, ...source.filter(item => item.value !== 'all')];
    field.append(this.selectField(id, meta.label, options, key));
    return field;
  }

  /** Write a filter value under both its control name and its record field. */
  setFilter(key, value) {
    this.filters[key] = value;
    const field = FILTER_FIELD[key];
    if (field) this.filters[field] = value;
  }

  selectField(id, label, options, key) {
    const wrap = el('label', 'rp-select');
    wrap.htmlFor = id;
    wrap.append(el('span', 'rp-select-label', label));
    const select = el('select');
    select.id = id;
    select.name = key;
    for (const option of options) {
      const node = el('option', '', option.label);
      node.value = option.value;
      select.append(node);
    }
    if (this.filters[key] !== undefined) select.value = String(this.filters[key]);
    select.addEventListener('change', () => {
      this.setFilter(key, select.value);
      if (key === 'period') this.syncPeriodExtras();
    });
    wrap.append(select);
    return wrap;
  }

  /** Daily / weekly / monthly / custom each ask for the one date they need. */
  periodExtras() {
    const wrap = el('div', 'rp-period-extras');
    const make = (name, type, label) => {
      const field = el('label', 'rp-date');
      field.append(el('span', 'rp-select-label', label));
      const input = el('input');
      input.type = type;
      input.name = name;
      input.value = this.filters[name] || '';
      input.addEventListener('change', () => { this.filters[name] = input.value; });
      field.append(input);
      field.dataset.period = name;
      return field;
    };
    wrap.append(make('date', 'date', 'তারিখ'));
    wrap.append(make('week', 'week', 'সপ্তাহ'));
    wrap.append(make('month', 'month', 'মাস'));
    const range = el('div', 'rp-range');
    range.dataset.period = 'custom';
    range.append(make('from', 'date', 'From Date'));
    range.append(make('to', 'date', 'To Date'));
    wrap.append(range);
    this.periodExtrasNode = wrap;
    return wrap;
  }

  syncPeriodExtras() {
    if (!this.periodExtrasNode) return;
    const period = this.filters.period || 'all';
    for (const node of this.periodExtrasNode.children) {
      node.hidden = node.dataset.period !== period;
    }
  }

  /* ---------- step 4 + 5: generate, preview, download ---------- */

  async generate() {
    if (this.busy || !this.definition) return;
    const definition = this.definition;
    const invalid = validateFilters(definition, this.filters);
    if (invalid) {
      this.setStatus(invalid, 'error');
      return;
    }
    let gate;
    try {
      gate = enforceAccess(definition, this.actor, this.filters);
    } catch (error) {
      this.setStatus(error?.message || 'আপনার এই রিপোর্ট দেখার অনুমতি নেই।', 'error');
      return;
    }

    this.busy = true;
    this.setStatus('রিপোর্ট তৈরি হচ্ছে…');
    if (this.generateButton) this.generateButton.disabled = true;
    try {
      this.refreshOptions();
      await loadReportAssets();
      const snapshot = loadSnapshot();
      const { doc, empty } = await buildReportDocument(definition, {
        filters: gate.filters, actor: this.actor, scope: gate.scope, snapshot
      });
      if (empty) {
        this.showEmpty(definition, gate.filters);
        return;
      }
      this.doc = doc;
      this.built = await buildReport(doc);
      this.showPreview(definition, gate.filters);
    } catch (error) {
      this.setStatus(error?.message || 'রিপোর্ট তৈরি করা যায়নি।', 'error');
    } finally {
      this.busy = false;
      if (this.generateButton) this.generateButton.disabled = false;
    }
  }

  showEmpty(definition, filters) {
    this.showScreen(this.previewScreen);
    this.previewScreen.replaceChildren();
    const card = el('div', 'rp-empty');
    card.append(el('h3', '', definition.title));
    card.append(el('p', 'rp-empty-text', EMPTY_MESSAGE));
    card.append(el('p', 'rp-empty-meta', `Filter: ${periodText(definition, filters)}`));
    const back = el('button', 'rp-back', 'Filter-এ ফিরুন');
    back.type = 'button';
    back.addEventListener('click', () => this.showFilters(definition));
    card.append(back);
    this.previewScreen.append(card);
    this.setStatus(EMPTY_MESSAGE);
  }

  showPreview(definition, filters) {
    this.setCrumbs([
      { label: 'রিপোর্ট', onOpen: () => this.showCategories() },
      { label: this.category ? this.category.labelBn : 'রিপোর্ট', onOpen: () => this.category && this.showReports(this.category) },
      { label: definition.title, onOpen: () => this.showFilters(definition) },
      { label: 'Preview' }
    ]);
    this.showScreen(this.previewScreen);
    this.previewScreen.replaceChildren();

    const bar = el('div', 'rp-preview-bar');
    const meta = el('div', 'rp-preview-meta');
    meta.append(el('strong', '', definition.title));
    meta.append(el('span', '', `${periodText(definition, filters)} • ${bn(this.built.total)} পৃষ্ঠা`));
    bar.append(meta);
    const edit = el('button', 'rp-mini-btn', 'Filter বদলান');
    edit.type = 'button';
    edit.addEventListener('click', () => this.showFilters(definition));
    bar.append(edit);
    this.previewScreen.append(bar);

    const scroll = el('div', 'rp-preview-scroll');
    this.pagesNode = el('div', 'rp-pages');
    this.pagesNode.innerHTML = this.built.html;
    scroll.append(this.pagesNode);
    this.previewScreen.append(scroll);

    const actions = el('div', 'rp-download-bar');
    this.downloadButton = el('button', 'rp-download');
    this.downloadButton.type = 'button';
    this.downloadButton.innerHTML = `${iconMarkup('download', 'rp-icon-svg')}<span>DOWNLOAD PDF</span>`;
    this.downloadButton.addEventListener('click', () => this.download(definition));
    actions.append(this.downloadButton);
    this.previewScreen.append(actions);

    this.fitPages();
    this.setStatus(`${definition.title} • ${bn(this.built.total)} পৃষ্ঠা প্রস্তুত।`, 'ok');
  }

  /** Scale the A4 pages to the panel width — no horizontal scrolling, no clipping. */
  fitPages() {
    if (!this.pagesNode) return;
    const available = this.pagesNode.parentElement?.clientWidth || this.root.clientWidth || PAGE.width;
    const scale = Math.min(1, available / PAGE.width);
    this.pagesNode.style.setProperty('--rp-scale', String(scale));
    this.pagesNode.style.height = `${Math.round(this.built.total * PAGE.height * scale)}px`;
  }

  async download(definition) {
    if (!this.doc || !this.downloadButton) return;
    this.downloadButton.disabled = true;
    this.setStatus('PDF তৈরি হচ্ছে…');
    try {
      const blob = await buildReportPDF(this.doc);
      downloadBlob(blob, fileNameFor(definition));
      this.setStatus('PDF ডাউনলোড শুরু হয়েছে — Preview ও PDF একই রিপোর্ট।', 'ok');
    } catch (error) {
      this.setStatus(error?.message || 'PDF তৈরি করা যায়নি।', 'error');
    } finally {
      this.downloadButton.disabled = false;
    }
  }
}

/* -------------------------------------------------------------------------
   Public API
   ---------------------------------------------------------------------- */

const centers = new WeakMap();

/** Mount the report centre into a container; call again to refresh the actor. */
export async function mountReports(root, options = {}) {
  if (!root) return null;
  const center = new ReportCenter(root, options);
  centers.set(root, center);
  await center.start();
  return center;
}

/**
 * Re-read the data and the signed-in actor — after a login or a data change.
 * The panel keeps whatever report the user had open.
 */
export async function refreshReports(root) {
  const center = centers.get(root);
  if (!center) return null;
  await center.start({ soft: true });
  return center;
}

export { ReportCenter };
