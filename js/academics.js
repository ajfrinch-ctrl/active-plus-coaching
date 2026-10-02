/* Academic structure — the single source of truth for classes and subjects.
 *
 * Admin defines which classes exist and which subjects each class runs
 * (js/admin.js → Academic Setup). Every other module reads the structure from
 * here instead of keeping its own copy: teacher assignments, examinations,
 * routine, notices/notifications, courses and the student side.
 *
 * Safety rules the rest of the app relies on:
 *   • additive, idempotent migration — the first read after an update records
 *     what already exists (classes from js/config.js plus every class/subject
 *     pair seen in teacher assignments, exams and teaching records) and never
 *     rewrites or deletes a stored record;
 *   • deactivating a class/subject only stops it appearing in new pickers —
 *     historical exams, results, routine, assignments and courses stay;
 *   • no `localStorage.clear()`, no database reset, missing fields get
 *     defaults on read.
 *
 * The module is pure storage + logic (no DOM), so it can be tested directly.
 */
import { KEYS, readRaw, writeRaw } from './database.js';

export const ACADEMICS_KEY = KEYS.academics;
export const ACADEMICS_VERSION = 1;

/* The class list the app shipped with; the seed keeps the exact names, so old
   records that carry a class name keep matching after the update. */
const DEFAULT_CLASSES = Object.freeze([
  'অষ্টম শ্রেণি', 'নবম শ্রেণি', 'দশম শ্রেণি', 'একাদশ শ্রেণি', 'দ্বাদশ শ্রেণি',
  'ডিগ্রি ১ম বর্ষ', 'ডিগ্রি ২য় বর্ষ', 'ডিগ্রি ৩য় বর্ষ',
  'অনার্স ১ম বর্ষ', 'অনার্স ২য় বর্ষ', 'অনার্স ৩য় বর্ষ', 'অনার্স ৪র্থ বর্ষ'
]);

/* Subjects a class runs by default. These are only defaults: Admin turns any
   row off, and the mapping rows are editable in the Admin panel. */
const SUBJECT_LIBRARY = Object.freeze([
  'বাংলা', 'ইংরেজি', 'গণিত', 'বিজ্ঞান', 'আইসিটি',
  'পদার্থবিজ্ঞান', 'রসায়ন', 'জীববিজ্ঞান', 'উচ্চতর গণিত',
  'হিসাববিজ্ঞান', 'ব্যবস্থাপনা', 'ফিন্যান্স, ব্যাংকিং ও বীমা', 'অর্থনীতি',
  'পৌরনীতি ও সুশাসন', 'ইসলাম শিক্ষা', 'ভূগোল', 'মনোবিজ্ঞান', 'সমাজবিজ্ঞান'
]);
const SCIENCE_GRADES = ['নবম শ্রেণি', 'দশম শ্রেণি', 'একাদশ শ্রেণি', 'দ্বাদশ শ্রেণি'];
const HIGHER_GRADES = ['একাদশ শ্রেণি', 'দ্বাদশ শ্রেণি'];
const DEFAULT_SUBJECTS = Object.freeze({
  junior: ['বাংলা', 'ইংরেজি', 'গণিত', 'বিজ্ঞান', 'আইসিটি'],
  science: ['বাংলা', 'ইংরেজি', 'গণিত', 'পদার্থবিজ্ঞান', 'রসায়ন', 'জীববিজ্ঞান', 'উচ্চতর গণিত', 'আইসিটি'],
  higher: ['বাংলা', 'ইংরেজি', 'হিসাববিজ্ঞান', 'ব্যবস্থাপনা', 'ফিন্যান্স, ব্যাংকিং ও বীমা', 'অর্থনীতি', 'আইসিটি'],
  general: ['বাংলা', 'ইংরেজি', 'গণিত', 'আইসিটি']
});
/* Other modules that already hold class/subject pairs; the seed adopts them so
   an existing assignment or exam can never point at a row that does not exist. */
const OBSERVED_SOURCES = Object.freeze([
  { key: 'activePlus.manager.teacherAssignments.v1', kind: 'assignment' },
  { key: KEYS.exams, kind: 'exam' },
  { key: KEYS.teaching, kind: 'activity' }
]);

const fail = message => { throw new Error(message); };
const text = (value, cap = 120) => String(value ?? '').normalize('NFC').trim().slice(0, cap);
const keyOf = value => text(value).toLowerCase();
/* Bengali vowel signs and other combining marks are \p{M}, so they must stay
   in the slug or 'দশম শ্রেণি' would lose its matras and two different names
   could collide on one id. */
const slug = value => text(value)
  .replace(/[^\p{L}\p{N}\p{M}]+/gu, '-')
  .replace(/^-+|-+$/g, '')
  .slice(0, 48);

export function classIdFor(name, existing = []) {
  const base = `CLASS-${slug(name) || 'CLASS'}`;
  let id = base, index = 2;
  while (existing.some(record => record.id === id)) id = `${base}-${index++}`;
  return id;
}
export function subjectIdFor(name, existing = []) {
  const base = `SUB-${slug(name) || 'SUBJECT'}`;
  let id = base, index = 2;
  while (existing.some(record => record.id === id)) id = `${base}-${index++}`;
  return id;
}
export function mappingIdFor(classId, subjectId, existing = []) {
  const base = `MAP-${classId.replace(/^CLASS-/, '')}-${subjectId.replace(/^SUB-/, '')}`;
  let id = base, index = 2;
  while (existing.some(record => record.id === id)) id = `${base}-${index++}`;
  return id;
}

const defaultSubjectsFor = className =>
  SCIENCE_GRADES.includes(className) ? DEFAULT_SUBJECTS.science
    : HIGHER_GRADES.includes(className) ? DEFAULT_SUBJECTS.higher
      : /ডিগ্রি|অনার্স/.test(className) ? [...DEFAULT_SUBJECTS.general, 'হিসাববিজ্ঞান', 'ব্যবস্থাপনা']
        : DEFAULT_SUBJECTS.junior;

function record(now, actor = 'ADMIN') {
  return { createdBy: actor, createdAt: now, updatedAt: now };
}

/** Everything an older copy of the app already has on this device. */
function observedPairs() {
  const pairs = [];
  for (const source of OBSERVED_SOURCES) {
    let rows = null;
    try { rows = JSON.parse(readRaw(source.key) ?? 'null'); } catch { rows = null; }
    if (source.kind === 'exam') rows = Array.isArray(rows?.exams) ? rows.exams : [];
    if (source.kind === 'activity') rows = Array.isArray(rows?.activities) ? rows.activities : [];
    if (!Array.isArray(rows)) continue;
    for (const row of rows) {
      const className = text(row?.className);
      const subjects = source.kind === 'assignment'
        ? [row?.subject, ...(Array.isArray(row?.subjects) ? row.subjects : [])]
        : [row?.subject];
      for (const subject of subjects) {
        if (className && text(subject)) pairs.push({ className, subject: text(subject) });
      }
    }
  }
  return pairs;
}

function emptyDatabase(now, actor = 'ADMIN') {
  return { version: ACADEMICS_VERSION, classes: [], subjects: [], mappings: [], updatedAt: now, createdBy: actor };
}

/** Seed/repair pass: add anything missing, never touch what is stored. */
function migrate(database, now, actor = 'ADMIN') {
  const db = {
    version: ACADEMICS_VERSION,
    classes: Array.isArray(database?.classes) ? database.classes.filter(Boolean) : [],
    subjects: Array.isArray(database?.subjects) ? database.subjects.filter(Boolean) : [],
    mappings: Array.isArray(database?.mappings) ? database.mappings.filter(Boolean) : [],
    updatedAt: Number(database?.updatedAt) || now,
    createdBy: text(database?.createdBy) || actor
  };
  let changed = false;
  const classNames = ['অষ্টম শ্রেণি', ...DEFAULT_CLASSES].filter((name, index, all) => all.indexOf(name) === index);
  for (const name of classNames) {
    if (db.classes.some(item => keyOf(item.name) === keyOf(name))) continue;
    db.classes.push({ id: classIdFor(name, db.classes), name, active: true, order: db.classes.length, ...record(now, actor) });
    changed = true;
  }
  /* Subjects adopted from existing records may be free text ("Test", a
     misspelling): they are added as real subjects so no stored record dangles. */
  const observed = observedPairs();
  for (const { className, subject } of [...observed, ...classNames.flatMap(name => defaultSubjectsFor(text(name)).map(subject => ({ className: text(name), subject })))]) {
    if (SUBJECT_LIBRARY.includes(subject)) {
      if (!db.subjects.some(item => keyOf(item.name) === keyOf(subject))) {
        db.subjects.push({ id: subjectIdFor(subject, db.subjects), name: subject, active: true, ...record(now, actor) });
        changed = true;
      }
    } else if (!db.subjects.some(item => keyOf(item.name) === keyOf(subject))) {
      db.subjects.push({ id: subjectIdFor(subject, db.subjects), name: subject, active: true, ...record(now, actor) });
      changed = true;
    }
    const classRecord = db.classes.find(item => keyOf(item.name) === keyOf(className));
    const subjectRecord = db.subjects.find(item => keyOf(item.name) === keyOf(subject));
    if (!classRecord || !subjectRecord) continue;
    if (db.mappings.some(item => item.classId === classRecord.id && item.subjectId === subjectRecord.id)) continue;
    db.mappings.push({ id: mappingIdFor(classRecord.id, subjectRecord.id, db.mappings), classId: classRecord.id, subjectId: subjectRecord.id, active: true, ...record(now, actor) });
    changed = true;
  }
  return { db, changed };
}

function readDatabase() {
  let raw = null;
  try { raw = readRaw(ACADEMICS_KEY); } catch { fail('Academic setup পড়া যাচ্ছে না।'); }
  if (raw === null || raw === '') return null;
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') fail('Academic setup-এর সংরক্ষিত তথ্য সঠিক নয়।');
    return parsed;
  } catch (error) {
    if (error instanceof Error && error.message.includes('Academic setup')) throw error;
    fail('Academic setup-এর সংরক্ষিত তথ্য সঠিক নয়।');
  }
}
function write(database) {
  writeRaw(ACADEMICS_KEY, JSON.stringify(database));
  window.dispatchEvent(new CustomEvent('apc-academics-updated', { detail: { at: database.updatedAt } }));
  return database;
}
/** The stored structure, migrated in place (idempotent) when it is out of date. */
export function loadAcademics() {
  const stored = readDatabase();
  if (!stored) {
    const now = Date.now();
    return write(migrate(emptyDatabase(now, 'SYSTEM'), now, 'SYSTEM').db);
  }
  const { db, changed } = migrate(stored, Date.now(), text(stored.createdBy) || 'SYSTEM');
  return changed ? write(db) : db;
}
export function watchAcademics(callback) {
  const handler = () => callback(loadAcademics());
  window.addEventListener('apc-academics-updated', handler);
  window.addEventListener('storage', event => { if (event.key === ACADEMICS_KEY || event.key === null) handler(); });
}

/* ---- reads ------------------------------------------------------------------ */

export function listClasses({ includeInactive = false } = {}) {
  return loadAcademics().classes
    .filter(item => includeInactive || item.active !== false)
    .slice()
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || a.name.localeCompare(b.name, 'bn'));
}
export function listSubjects({ includeInactive = false } = {}) {
  return loadAcademics().subjects
    .filter(item => includeInactive || item.active !== false)
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name, 'bn'));
}
export const classById = id => loadAcademics().classes.find(item => item.id === id) || null;
export const classByName = name => loadAcademics().classes.find(item => keyOf(item.name) === keyOf(name)) || null;
export const subjectById = id => loadAcademics().subjects.find(item => item.id === id) || null;
export const subjectByName = name => loadAcademics().subjects.find(item => keyOf(item.name) === keyOf(name)) || null;

/** Active mappings, newest configuration wins for a repeated pair. */
export function listMappings({ includeInactive = false } = {}) {
  const seen = new Set();
  return loadAcademics().mappings
    .filter(item => {
      if (!includeInactive && item.active === false) return false;
      if (seen.has(`${item.classId}|${item.subjectId}`)) return false;
      seen.add(`${item.classId}|${item.subjectId}`);
      return true;
    });
}
export function subjectsForClass(className, { includeInactive = false } = {}) {
  const classRecord = classByName(className);
  if (!classRecord) return [];
  const byId = new Map(listSubjects({ includeInactive }).map(item => [item.id, item]));
  return listMappings({ includeInactive })
    .filter(item => item.classId === classRecord.id)
    .map(item => byId.get(item.subjectId))
    .filter(Boolean)
    .sort((a, b) => a.name.localeCompare(b.name, 'bn'));
}
export function subjectNamesForClass(className, options) {
  return subjectsForClass(className, options).map(item => item.name);
}
export function isSubjectEnabled(className, subject) {
  if (!className || !subject) return false;
  return subjectsForClass(className).some(item => keyOf(item.name) === keyOf(subject));
}
export function classesForSubject(subject) {
  const subjectRecord = subjectByName(subject);
  if (!subjectRecord) return [];
  const byId = new Map(listClasses().map(item => [item.id, item]));
  return listMappings().filter(item => item.subjectId === subjectRecord.id).map(item => byId.get(item.classId)).filter(Boolean);
}
/** Class names as the rest of the app still stores them (plain names). */
export const classNames = ({ includeInactive = false } = {}) => listClasses({ includeInactive }).map(item => item.name);

/* ---- writes (Admin) --------------------------------------------------------- */

async function requireAdmin() {
  try {
    const { hasStaffSession, readStaffAccount } = await import('./staff-auth.js');
    if (!(await hasStaffSession('admin'))) fail('শুধু Admin academic structure বদলাতে পারবেন।');
    const account = await readStaffAccount('admin');
    if (!account || ['disabled', 'inactive', 'rejected'].includes(account.status)) fail('সক্রিয় Admin account ছাড়া এই কাজ করা যাবে না।');
  } catch (error) {
    if (error instanceof Error && /Admin/.test(error.message)) throw error;
    fail('শুধু Admin academic structure বদলাতে পারবেন।');
  }
}

function mutate(mutator, actor = 'ADMIN') {
  const db = loadAcademics();
  const now = Date.now();
  mutator(db, now);
  db.updatedAt = now;
  db.createdBy = actor;
  return write(db);
}

export async function saveClass({ id = '', name, active = true, order } = {}) {
  await requireAdmin();
  const clean = text(name, 80);
  if (!clean) fail('Class-এর নাম লিখুন।');
  return mutate((db, now) => {
    const existing = id ? db.classes.find(item => item.id === id) : null;
    if (id && !existing) fail('Class-টি পাওয়া যায়নি।');
    if (db.classes.some(item => item.id !== id && keyOf(item.name) === keyOf(clean))) fail('এই নামে একটি Class আগেই আছে।');
    if (existing) {
      existing.name = clean;
      existing.active = active !== false;
      if (Number.isFinite(Number(order))) existing.order = Number(order);
      existing.updatedAt = now;
    } else {
      db.classes.push({ id: classIdFor(clean, db.classes), name: clean, active: active !== false, order: Number.isFinite(Number(order)) ? Number(order) : db.classes.length, ...record(now) });
    }
  });
}
export async function setClassActive(id, active) {
  await requireAdmin();
  return mutate((db, now) => {
    const item = db.classes.find(record => record.id === id);
    if (!item) fail('Class-টি পাওয়া যায়নি।');
    item.active = active !== false;
    item.updatedAt = now;
    /* Deactivating a class hides it from new pickers; its subjects, mappings,
       exams, results and assignments are untouched. */
  });
}
export async function saveSubject({ id = '', name, active = true } = {}) {
  await requireAdmin();
  const clean = text(name, 80);
  if (!clean) fail('বিষয়ের নাম লিখুন।');
  return mutate((db, now) => {
    const existing = id ? db.subjects.find(item => item.id === id) : null;
    if (id && !existing) fail('বিষয়টি পাওয়া যায়নি।');
    if (db.subjects.some(item => item.id !== id && keyOf(item.name) === keyOf(clean))) fail('এই নামে একটি বিষয় আগেই আছে।');
    if (existing) {
      existing.name = clean;
      existing.active = active !== false;
      existing.updatedAt = now;
    } else {
      db.subjects.push({ id: subjectIdFor(clean, db.subjects), name: clean, active: active !== false, ...record(now) });
    }
  });
}
export async function setSubjectActive(id, active) {
  await requireAdmin();
  return mutate((db, now) => {
    const item = db.subjects.find(record => record.id === id);
    if (!item) fail('বিষয়টি পাওয়া যায়নি।');
    item.active = active !== false;
    item.updatedAt = now;
  });
}
/** Turn one class+subject pair on/off. One pair, one row — no duplicates. */
export async function setClassSubject({ classId, subjectId, active = true } = {}) {
  await requireAdmin();
  if (!classId || !subjectId) fail('Class ও Subject নির্বাচন করুন।');
  return mutate((db, now) => {
    if (!db.classes.some(item => item.id === classId)) fail('Class-টি পাওয়া যায়নি।');
    if (!db.subjects.some(item => item.id === subjectId)) fail('বিষয়টি পাওয়া যায়নি।');
    const existing = db.mappings.find(item => item.classId === classId && item.subjectId === subjectId);
    if (existing) {
      existing.active = active !== false;
      existing.updatedAt = now;
      return;
    }
    db.mappings.push({ id: mappingIdFor(classId, subjectId, db.mappings), classId, subjectId, active: active !== false, ...record(now) });
  });
}
/** Attach/remove by name — the shape every other module already speaks. */
export async function setClassSubjectByName(className, subjectName, active = true) {
  const classRecord = classByName(className) || (await saveClass({ name: className }), classByName(className));
  const subjectRecord = subjectByName(subjectName) || (await saveSubject({ name: subjectName }), subjectByName(subjectName));
  return setClassSubject({ classId: classRecord.id, subjectId: subjectRecord.id, active });
}
