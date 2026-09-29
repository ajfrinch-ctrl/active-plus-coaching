import test from 'node:test';
import assert from 'node:assert/strict';
import { collectionPayload, remoteToLocal } from '../js/sync-collections.js';
import { encodeRealtimeRecords, decodeRealtimeRecords } from '../js/realtime-value-codec.js';

test('routine classes keep the order the manager entered, not Firebase key order', () => {
  const classes = [
    { id: 'RTN-9', subject: 'প্রথম', time: '09:00' },
    { id: 'RTN-10', subject: 'দ্বিতীয়', time: '10:00' },
    { id: 'RTN-100', subject: 'তৃতীয়', time: '11:00' }
  ];
  const local = { sat: { date: '2026-09-29', classes } };
  const records = collectionPayload('routine', local);
  // Firebase returns object keys in key order: 'RTN-10' < 'RTN-100' < 'RTN-9'.
  const asReturnedByFirebase = Object.fromEntries(Object.keys(records).sort().map(key => [key, records[key]]));
  const restored = remoteToLocal('routine', asReturnedByFirebase);
  assert.deepEqual(restored.sat.classes.map(item => item.id), ['RTN-9', 'RTN-10', 'RTN-100']);
  assert.equal(restored.sat.date, '2026-09-29');
  for (const item of restored.sat.classes) {
    assert.equal(Object.hasOwn(item, '_syncDay'), false, 'transport markers never reach the app');
    assert.equal(Object.hasOwn(item, '_syncOrder'), false);
  }
  assert.deepEqual(restored.sun, { date: '', classes: [] });
});

test('a whole routine survives the transport codec unchanged', () => {
  const local = {
    sat: { date: '2026-09-29', classes: [{ id: 'R1', subject: 'গণিত', progress: {} }] },
    sun: { date: '', classes: [] }
  };
  const payload = collectionPayload('routine', local);
  const back = decodeRealtimeRecords(encodeRealtimeRecords(payload));
  const restored = remoteToLocal('routine', back);
  assert.deepEqual(restored.sat, local.sat);
  assert.deepEqual(restored.sun, { date: '', classes: [] });
  assert.deepEqual(Object.keys(restored), ['sat', 'sun', 'mon', 'tue', 'wed', 'thu']);
});

test('teaching keeps its document shape and settings pass through', () => {
  const teaching = { version: 1, activities: [{ id: 'A1', progress: {}, title: 'x' }] };
  assert.deepEqual(remoteToLocal('teaching', collectionPayload('teaching', teaching)), teaching);
  const settings = { appName: 'Active Plus', enabled: { dark: true } };
  assert.deepEqual(collectionPayload('settings', settings), settings);
  assert.deepEqual(remoteToLocal('settings', settings), settings);
  assert.equal(collectionPayload('settings', 'broken'), null);
  assert.equal(collectionPayload('teaching', { version: 2, activities: [] }), null, 'an unknown version is not uploaded');
});
