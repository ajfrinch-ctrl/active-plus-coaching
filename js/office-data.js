/* Live office records: roster, notices and weekly routine.
   An empty browser starts empty. Sample arrays in admin-data.js stay available
   as fixtures for tests; they are not loaded here. */
import { loadAccount, saveAccount, readJSON, writeJSON } from './storage.js';
import { KEYS, listDocuments } from './database.js';

export const ROSTER_KEY = KEYS.students;
export const NOTICES_KEY = KEYS.notices;
export const ROUTINE_KEY = KEYS.routine;
export const WEEK_DAYS = Object.freeze(['sat', 'sun', 'mon', 'tue', 'wed', 'thu']);

export function blankRoutine() {
  return Object.fromEntries(WEEK_DAYS.map(day => [day, { date: '', classes: [] }]));
}

function rosterStatus(accountStatus) {
  if (accountStatus === 'active' || accountStatus === 'approved') return 'approved';
  if (accountStatus === 'rejected') return 'rejected';
  return 'pending';
}

export function accountToRosterStudent(account) {
  const student = account?.student || {};
  const id = student.id || account?.studentId;
  if (!id) return null;
  return {
    id,
    name: student.name || student.nameBn || '',
    nameEn: student.nameEn || '',
    fatherName: student.fatherName || '',
    className: student.className || '',
    group: student.group || '',
    mobile: account.registrationMobile || account.mobile || student.studentMobile || '',
    guardianMobile: student.guardianMobile || '',
    address: student.address || '',
    status: rosterStatus(account.status),
    attendance: Number(student.attendance) || 0,
    average: Number(student.average) || 0,
    monthlyFee: student.monthlyFee ?? null,
    enrolledAt: account.createdAt ? new Date(account.createdAt).toLocaleDateString('bn-BD') : '',
    lastActive: 'এই ডিভাইস'
  };
}

function mergeAccount(list) {
  const incoming = accountToRosterStudent(loadAccount());
  if (!incoming) return list;
  const index = list.findIndex(student => student.id === incoming.id);
  if (index < 0) return [...list, incoming];
  const current = list[index];
  return list.map((student, i) => (i === index ? {
    ...incoming,
    ...current,
    name: current.name || incoming.name,
    nameEn: current.nameEn || incoming.nameEn,
    mobile: current.mobile || incoming.mobile,
    className: current.className || incoming.className,
    status: current.status || incoming.status
  } : student));
}

export function loadRoster() {
  return mergeAccount(listDocuments('students'));
}

export function saveRoster(students) {
  return writeJSON(ROSTER_KEY, students);
}

/** Make sure the device's student account is visible to the admin roster. */
export function upsertLocalAccount() {
  return saveRoster(loadRoster());
}

export async function syncAccountStatus(studentId, status) {
  const account = loadAccount();
  if (!account) return false;
  const id = account.student?.id || account.studentId;
  if (id !== studentId) return false;
  const mapped = status === 'approved' ? 'active' : status === 'rejected' ? 'rejected' : 'pending';
  return saveAccount({ ...account, status: mapped });
}

export function loadNotices() {
  return listDocuments('notices');
}

export function saveNotices(notices) {
  return writeJSON(NOTICES_KEY, notices);
}

export function loadRoutine() {
  const stored = readJSON(ROUTINE_KEY, null);
  const routine = blankRoutine();
  if (!stored || typeof stored !== 'object') return routine;
  for (const day of WEEK_DAYS) {
    const info = stored[day];
    routine[day] = {
      date: typeof info?.date === 'string' ? info.date : '',
      classes: Array.isArray(info?.classes) ? info.classes.map(cls => ({ ...cls })) : []
    };
  }
  return routine;
}

export function saveRoutine(routine) {
  return writeJSON(ROUTINE_KEY, routine);
}
