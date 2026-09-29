/* Shared decision helper for cross-device identity merges: which copy of the
   same logical record is the newer one? Kept separate from the Firebase module
   so the rule itself can be unit-tested without a project or a browser. */

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
