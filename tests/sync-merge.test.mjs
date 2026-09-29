import test from 'node:test';
import assert from 'node:assert/strict';
import { preferLocalCopy, recordTime } from '../js/sync-merge.js';

test('the copy with the newest timestamp wins, whichever side it is on', () => {
  const older = { id: 'dolon', pinHash: 'old', updatedAt: '2026-09-20T10:00:00.000Z' };
  const newer = { id: 'dolon', pinHash: 'new', updatedAt: '2026-09-29T10:00:00.000Z' };
  assert.equal(preferLocalCopy(newer, older), true, 'a change made offline must not be reverted');
  assert.equal(preferLocalCopy(older, newer), false, 'a newer cloud copy must be adopted');
});

test('identical and missing timestamps follow the caller rule', () => {
  const one = { pinHash: 'a' };
  const two = { pinHash: 'b' };
  assert.equal(preferLocalCopy(one, two), true, 'a student keeps the copy verified on this device');
  assert.equal(preferLocalCopy(one, two, { localWinsTie: false }), false, 'staff keeps the long-standing cloud-first rule');
  assert.equal(preferLocalCopy(one, null), true, 'nothing in the cloud to prefer');
  assert.equal(preferLocalCopy(null, one), false, 'no local record to keep');
});

test('a record that belongs to another login ID is never preferred', () => {
  const mine = { username: 'dolon', updatedAt: '2026-09-29T10:00:00.000Z' };
  const theirs = { username: 'raisa', updatedAt: '2026-09-20T10:00:00.000Z' };
  const sameRecord = record => record?.username === 'dolon';
  assert.equal(preferLocalCopy(mine, theirs, { sameRecord }), false);
  assert.equal(preferLocalCopy(mine, { username: 'dolon' }, { sameRecord }), true);
});

test('an unparsable timestamp counts as "no timestamp" instead of NaN', () => {
  assert.equal(recordTime({ updatedAt: 'not a date' }), 0);
  assert.equal(recordTime({}), 0);
  assert.equal(recordTime(null), 0);
  assert.equal(recordTime({ updatedAt: '2026-09-29T10:00:00.000Z' }) > 0, true);
});
