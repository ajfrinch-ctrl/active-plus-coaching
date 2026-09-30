/* Live office records: roster, notices and weekly routine.
   An empty browser starts empty. Sample arrays in admin-data.js stay available
   as fixtures for tests; they are not loaded here. */
import { loadAccount, saveAccount, readJSON, writeJSON } from './storage.js';
import { KEYS, listDocuments } from './database.js';
import { LOCAL_WRITE_KEY, markLocalSource } from './notification-rules.js';

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
    // Machine-readable application time (the notification list sorts by it).
    registeredAt: typeof account.createdAt === 'string' ? account.createdAt : '',
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

/**
 * Write this device's student into the shared roster row by row.
 *
 * `loadRoster()` prefers the *stored* row over the account, so it can never
 * carry a profile edit outward. This function is the opposite: the fields the
 * student owns (name, guardian, address, class/group, mobile numbers) are taken
 * from the account, while everything the branch owns — approval status,
 * attendance, average, monthly fee, enrolment date — stays exactly as it was.
 * The roster is one of the synced collections, so other devices receive the
 * change through the ordinary bridge.
 */
export function upsertStudentRosterRow() {
  const account = loadAccount();
  const fresh = accountToRosterStudent(account);
  if (!fresh) return false;
  const list = listDocuments('students');
  const index = list.findIndex(student => student.id === fresh.id);
  if (index < 0) return saveRoster([...list, fresh]);
  const stored = list[index];
  const row = {
    ...stored,
    name: fresh.name || stored.name,
    nameEn: fresh.nameEn || stored.nameEn,
    fatherName: fresh.fatherName || stored.fatherName,
    className: fresh.className || stored.className,
    group: fresh.group || stored.group,
    mobile: fresh.mobile || stored.mobile,
    guardianMobile: fresh.guardianMobile || stored.guardianMobile,
    address: fresh.address || stored.address,
    updatedAt: new Date().toISOString()
  };
  return saveRoster(list.map((student, i) => (i === index ? row : student)));
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

/* A notice written here is not pushed back to the person who typed it. The
   marker is local bookkeeping only and never syncs. */
function stampWrittenHere(notices) {
  try {
    let record = readJSON(LOCAL_WRITE_KEY, null);
    for (const notice of Array.isArray(notices) ? notices : []) {
      if (notice?.id) record = markLocalSource(record, 'notices', notice.id);
    }
    if (record) writeJSON(LOCAL_WRITE_KEY, record);
  } catch { /* best effort — a missing marker only means one extra notification */ }
}

export function saveNotices(notices) {
  const saved = writeJSON(NOTICES_KEY, notices);
  if (saved) stampWrittenHere(notices);
  return saved;
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
