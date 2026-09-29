/* Shared decision helpers for cross-device identity merges. Kept separate from
   the Firebase module so the rules themselves can be unit-tested without a
   project or a browser. */
import { isPasswordRecord } from './password-hash.js';
import { normalizeUsername, contactNumber } from './account-policy.js';

/** Wall-clock of the newest change; 0 for records written by older versions
    (they carry no timestamp, so they must never outrank a stamped copy). */
export const recordTime = record => Date.parse(record?.updatedAt || '') || 0;

/**
 * True when the local copy should be kept (and uploaded) instead of the remote
 * one. `sameRecord` guards against adopting a record that belongs to another
 * login ID; `localWinsTie` decides records whose timestamps are equal or absent.
 */
export function preferLocalCopy(local, remote, { sameRecord = () => true, localWinsTie = true } = {}) {
  if (!remote) return true;
  if (!local) return false;
  if (!sameRecord(remote)) return false;
  const localTime = recordTime(local);
  const remoteTime = recordTime(remote);
  return localTime === remoteTime ? localWinsTie : localTime > remoteTime;
}

const staffRecordValid = value =>
  Boolean(value) && typeof value === 'object' &&
  typeof value.username === 'string' && isPasswordRecord(value.password);

/**
 * Which copy of a staff role account wins: 'local', 'remote' or 'conflict'.
 *
 *  • the cloud copy is the one every other device knows, so it is the default;
 *  • a newer local change (a password changed while offline) is uploaded;
 *  • a local account that was never personalised (a fresh default from a
 *    re-installed or reset device) never overrides a real cloud account;
 *  • two different Admin usernames mean two different owners: the real Admin
 *    must not be replaced by a system created on an unsynced device.
 */
export function chooseStaffCopy(local, remote, { role = '' } = {}) {
  if (!staffRecordValid(remote)) return 'local';
  if (!staffRecordValid(local)) return 'remote';
  if (role === 'admin' && local.username !== remote.username) return 'conflict';
  const personalised = !local.mustChangePassword;
  return personalised && preferLocalCopy(local, remote, { localWinsTie: false }) ? 'local' : 'remote';
}

/** Two login records describe the same student only when the person matches. */
export function sameStudentRecord(first, second) {
  if (!first || !second) return false;
  const idOf = value => value.student?.id || value.studentId || '';
  const firstId = idOf(first), secondId = idOf(second);
  if (firstId && secondId) return firstId === secondId;
  const phoneOf = value => contactNumber(value.registrationMobile || value.mobile || '');
  const firstPhone = phoneOf(first), secondPhone = phoneOf(second);
  return Boolean(firstPhone) && firstPhone === secondPhone;
}

export const loginIdOf = record =>
  normalizeUsername(record?.username || record?.student?.username || '');

/**
 * Which copy of a student login wins: 'local', 'remote' or 'conflict'. The
 * record is keyed by the login ID, so a *different* student under the same key
 * can only mean a duplicate registration on a device that had not synced yet —
 * that must never overwrite the account other devices already use.
 */
export function chooseStudentCopy(local, remote) {
  if (!local) return 'remote';
  if (!remote || !isPasswordRecord(remote.pinHash)) return 'local';
  if (!sameStudentRecord(local, remote)) return 'conflict';
  return preferLocalCopy(local, remote) ? 'local' : 'remote';
}
