/* Browser-local Teacher class/batch assignments. These records are a scope source
   for the offline app, not server authorization; backend authorization is still required. */
import { enabledClasses } from './config.js';
import { readStaffAccount, hasStaffSession } from './staff-auth.js';
import { newId } from './database.js';

export const TEACHER_ASSIGNMENTS_KEY = 'activePlus.manager.teacherAssignments.v1';

function fail(message) { throw new Error(message); }
function readAssignments() {
  let raw;
  try { raw = window.localStorage.getItem(TEACHER_ASSIGNMENTS_KEY); }
  catch { fail('শিক্ষক অ্যাসাইনমেন্ট পড়া যাচ্ছে না।'); }
  if (raw === null) return [];
  let records;
  try { records = JSON.parse(raw); } catch { fail('শিক্ষক অ্যাসাইনমেন্টের সংরক্ষিত তথ্য সঠিক নয়।'); }
  if (!Array.isArray(records) || records.some(record => !record || typeof record.id !== 'string' || typeof record.teacherUsername !== 'string' || !enabledClasses.includes(record.className) || typeof record.group !== 'string' || typeof record.subject !== 'string')) fail('শিক্ষক অ্যাসাইনমেন্টের সংরক্ষিত তথ্য সঠিক নয়।');
  const ids = new Set();
  for (const record of records) {
    if (!record.id || ids.has(record.id) || !record.teacherUsername || !record.subject.trim() || record.subject.length > 80 || record.group.length > 80) fail('শিক্ষক অ্যাসাইনমেন্টের সংরক্ষিত তথ্য সঠিক নয়.');
    ids.add(record.id);
  }
  return records;
}
function writeAssignments(records) {
  try { window.localStorage.setItem(TEACHER_ASSIGNMENTS_KEY, JSON.stringify(records)); }
  catch { fail('অ্যাসাইনমেন্ট সংরক্ষণ হয়নি। ব্রাউজারের স্টোরেজ পরীক্ষা করুন।'); }
  window.dispatchEvent(new Event('teacher-assignments-updated'));
  return records;
}
function groupKey(value) { return String(value || '').normalize('NFC').trim().replace(/\s*বিভাগ$/, '').trim(); }
async function requireManagerSession() {
  if (!(await hasStaffSession('manager'))) fail('শুধু Manager অ্যাসাইনমেন্ট পরিবর্তন করতে পারবেন।');
  const manager = await readStaffAccount('manager');
  if (!manager || ['disabled', 'inactive', 'rejected'].includes(manager.status) || manager.accountStatus === 'disabled') fail('সক্রিয় Manager profile ছাড়া assignment পরিবর্তন করা যাবে না।');
}

export function listTeacherAssignments(username) {
  const normalized = String(username || '').trim().toLowerCase();
  if (!normalized) return [];
  return readAssignments().filter(item => item.teacherUsername.toLowerCase() === normalized).map(item => ({ ...item }));
}
export function isTeacherAssigned(username, className, group = '') {
  const groupValue = groupKey(group);
  return listTeacherAssignments(username).some(item => item.className === className && (!groupValue ? !item.group : !item.group || groupKey(item.group) === groupValue));
}

export async function saveTeacherAssignment({ id = '', className, group = '', subject } = {}) {
  await requireManagerSession();
  const teacher = await readStaffAccount('teacher');
  if (!teacher || ['disabled', 'inactive', 'rejected'].includes(teacher.status) || teacher.accountStatus === 'disabled') fail('সক্রিয় Teacher account পাওয়া যায়নি।');
  const clean = { className: String(className || '').trim(), group: String(group || '').trim(), subject: String(subject || '').trim() };
  if (!enabledClasses.includes(clean.className) || clean.group.length > 80 || !clean.subject || clean.subject.length > 80) fail('শ্রেণি, batch/group ও বিষয় যাচাই করুন।');
  const records = readAssignments();
  const normalizedUsername = String(teacher.username || '').trim().toLowerCase();
  const duplicate = records.some(item => item.id !== id && item.teacherUsername.toLowerCase() === normalizedUsername && item.className === clean.className && groupKey(item.group) === groupKey(clean.group) && item.subject.toLowerCase() === clean.subject.toLowerCase());
  if (duplicate) fail('এই Teacher, class/batch ও subject assignment আগে থেকেই আছে।');
  const index = id ? records.findIndex(item => item.id === id && item.teacherUsername.toLowerCase() === normalizedUsername) : -1;
  if (id && index < 0) fail('অ্যাসাইনমেন্টটি পাওয়া যায়নি।');
  const next = { ...clean, id: id || newId('TAS'), teacherUsername: normalizedUsername, teacherName: String(teacher.fullName || teacher.username).trim() };
  if (index >= 0) records[index] = next; else records.unshift(next);
  return writeAssignments(records);
}
export async function deleteTeacherAssignment(id) {
  await requireManagerSession();
  const records = readAssignments();
  const next = records.filter(item => item.id !== String(id || ''));
  if (next.length === records.length) fail('অ্যাসাইনমেন্টটি পাওয়া যায়নি।');
  return writeAssignments(next);
}
export function assignedScopeForStudent(username, student) {
  return isTeacherAssigned(username, student?.className, student?.group);
}
