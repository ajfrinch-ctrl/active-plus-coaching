import test from 'node:test';
import assert from 'node:assert/strict';
import { createRecordSync, mergeRecordOperations } from '../js/record-sync.js';

const clone = value => JSON.parse(JSON.stringify(value));
function device(cloud, initial = {}, disk = {}) {
  let local = clone(initial);
  let fail = false;
  let gate = null;
  const bridge = createRecordSync({
    loadState: () => disk.state,
    saveState: value => { disk.state = clone(value); },
    readLocal: () => local,
    writeLocal: value => { local = clone(value); },
    commit: async operations => {
      if (gate) await gate;
      if (fail) throw new Error('permission-denied');
      cloud.value = mergeRecordOperations(cloud.value, operations);
      return clone(cloud.value);
    }
  });
  return {
    bridge, disk,
    local: () => local,
    edit(value) { local = clone(value); bridge.capture(); },
    fail(value) { fail = value; },
    gate(value) { gate = value; }
  };
}

test('first sync fills missing records without overwriting an existing cloud record', async () => {
  const cloud = { value: { a: { text: 'cloud' }, b: { text: 'other device' } } };
  const d = device(cloud, { a: { text: 'old local' }, c: { text: 'never uploaded' } });
  d.bridge.receive(cloud.value);
  await d.bridge.flush();
  assert.deepEqual(d.local(), { ...cloud.value });
  assert.equal(cloud.value.a.text, 'cloud');
  assert.equal(cloud.value.c.text, 'never uploaded');
});

test('two devices changing different records preserve both changes', async () => {
  const cloud = { value: {} };
  const a = device(cloud), b = device(cloud);
  a.edit({ a: { amount: 500 } });
  b.edit({ b: { amount: 600 } });
  await Promise.all([a.bridge.flush(), b.bridge.flush()]);
  assert.deepEqual(cloud.value, { a: { amount: 500 }, b: { amount: 600 } });
});

test('failed writes and deletions survive restarting the browser outbox', async () => {
  const cloud = { value: { a: { text: 'before' }, b: { text: 'delete me' } } };
  const first = device(cloud);
  first.bridge.receive(cloud.value);
  first.edit({ a: { text: 'offline edit' } });
  first.fail(true);
  await assert.rejects(first.bridge.flush());
  const rebooted = device(cloud, first.local(), first.disk);
  rebooted.bridge.receive(cloud.value);
  assert.equal(rebooted.local().a.text, 'offline edit');
  assert.equal(rebooted.local().b, undefined);
  await rebooted.bridge.flush();
  assert.deepEqual(cloud.value, { a: { text: 'offline edit' } });
  assert.equal(rebooted.bridge.hasPending(), false);
});

test('empty remote snapshot clears previously synced records, without resurrection', async () => {
  const cloud = { value: { a: { text: 'old' } } };
  const d = device(cloud);
  d.bridge.receive(cloud.value);
  cloud.value = {};
  d.bridge.receive(cloud.value);
  assert.deepEqual(d.local(), {});
  const rebooted = device(cloud, d.local(), d.disk);
  await rebooted.bridge.flush();
  assert.deepEqual(cloud.value, {});
});

test('an edit made during an in-flight write is not discarded by its acknowledgement', async () => {
  const cloud = { value: {} }, d = device(cloud);
  let release;
  d.gate(new Promise(resolve => { release = resolve; }));
  d.edit({ a: { text: 'one' } });
  const flight = d.bridge.flush();
  d.edit({ a: { text: 'two' } });
  d.gate(null);
  release();
  await flight;
  assert.equal(cloud.value.a.text, 'two');
  assert.equal(d.bridge.hasPending(), false);
});
