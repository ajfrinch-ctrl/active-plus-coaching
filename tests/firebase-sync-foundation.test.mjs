import test from 'node:test';
import assert from 'node:assert/strict';
import { createSyncQueue } from '../firebase-sync/sync-queue.js';
import { createSyncEngine } from '../firebase-sync/sync-engine.js';
import { createSyncStatus } from '../firebase-sync/sync-status.js';
const principal = { uid:'u1', tenant:'school1', verified:true };
const policies = { students:{ allowDelete:false } };
const locks = new Map();
const withLock = (name, fn) => {
 const next = (locks.get(name) || Promise.resolve()).catch(()=>{}).then(fn);
 locks.set(name,next); return next;
};
function setup(commit = async item => ({operationId:item.id,kind:'applied',version:1})) {
 const values = new Map([['legacy','untouched']]);
 const storage = { getItem:k=>values.get(k)??null, setItem:(k,v)=>values.set(k,v) };
 const queue = createSyncQueue({storage,principal,withLock});
 const status = createSyncStatus();
 let clock = 100, connected = true, user = principal;
 const engine = createSyncEngine({queue,principal,status,policies,withLock,transport:{commit},
  auth:{currentPrincipal:async()=>user},online:()=>connected,now:()=>clock,random:()=>0.5});
 const item = (id='op1',recordId='s1') => ({id,recordId,entity:'students',operation:'CREATE',payload:{name:'Student'},
  createdAt:1,updatedAt:1,retryCount:0,syncStatus:'SYNC_PENDING',deviceId:'d1',principal,baseVersion:0,nextAttemptAt:0});
 return {values,storage,queue,status,engine,item,setClock:v=>clock=v,setOnline:v=>connected=v,setUser:v=>user=v};
}
test('queue persists across recreation without touching legacy storage',async()=>{
 const s=setup(); await s.queue.enqueue(s.item());
 const restored=createSyncQueue({storage:s.storage,principal,withLock});
 assert.equal((await restored.list()).length,1);assert.equal(s.values.get('legacy'),'untouched');
});
test('unknown/corrupt queue preserved rather than reset',async()=>{
 const s=setup(); s.storage.setItem(s.queue.key,'{"schemaVersion":99}');
 await assert.rejects(s.queue.enqueue(s.item()),{code:'QUEUE_SCHEMA_UNSUPPORTED'});
 assert.equal(s.storage.getItem(s.queue.key),'{"schemaVersion":99}');
});
test('offline performs no requests and later synchronizes',async()=>{
 let calls=0; const s=setup(async i=>{calls++;return {operationId:i.id,kind:'applied',version:1};});
 await s.queue.enqueue(s.item());s.setOnline(false);await s.engine.push();assert.equal(calls,0);
 assert.equal(s.status.get().state,'OFFLINE');s.setOnline(true);await s.engine.push();
 assert.equal(s.status.get().state,'SYNCED');assert.equal(calls,1);
});
test('lost acknowledgement retries same operation ID with persistent backoff',async()=>{
 const ids=[];const s=setup(async i=>{ids.push(i.id);if(ids.length===1)throw {code:'NETWORK_ERROR'};return {operationId:i.id,kind:'duplicate',version:1};});
 await s.queue.enqueue(s.item());await s.engine.push();
 assert.equal((await s.queue.list())[0].nextAttemptAt,2100);
 await s.engine.push();assert.equal(ids.length,1);s.setClock(2100);await s.engine.push();
 assert.deepEqual(ids,['op1','op1']);assert.equal(s.status.get().state,'SYNCED');
});
test('conflict blocks later writes on same record but not unrelated records',async()=>{
 const ids=[];const s=setup(async i=>{ids.push(i.id);return {operationId:i.id,kind:i.id==='op1'?'conflict':'applied',version:1};});
 await s.queue.enqueue(s.item());await s.queue.enqueue(s.item('op2'));await s.queue.enqueue(s.item('op3','s2'));
 await s.engine.push();assert.deepEqual(ids,['op1','op3']);assert.equal(s.status.get().state,'SYNC_CONFLICT');
});
test('invalid secret payload is isolated and never transmitted',async()=>{
 const ids=[];const s=setup(async i=>{ids.push(i.id);return {operationId:i.id,kind:'applied',version:1};});
 const item=s.item();item.payload={password:'not-real-test-value'};await s.queue.enqueue(item);
 await s.queue.enqueue(s.item('op2','s2'));await s.engine.push();
 assert.deepEqual(ids,['op2']);assert.equal((await s.queue.list())[0].errorCode,'SENSITIVE_PAYLOAD');
});
test('unverified or different account cannot drain queue',async()=>{
 let calls=0;const s=setup(async()=>{calls++;});await s.queue.enqueue(s.item());
 s.setUser({...principal,verified:false});await s.engine.push();
 s.setUser({...principal,uid:'u2'});await s.engine.push();assert.equal(calls,0);
});
test('simultaneous flushes are serialized across engine instances',async()=>{
 let calls=0;const s=setup(async i=>{calls++;return {operationId:i.id,kind:'applied',version:1};});
 await s.queue.enqueue(s.item());await Promise.all([s.engine.push(),s.engine.push()]);
 assert.equal(calls,1);
});
test('terminal errors remain durable, never disappear after retry limit',async()=>{
 const s=setup(async()=>{throw {code:'INVALID_ARGUMENT'};});await s.queue.enqueue(s.item());
 await s.engine.push();assert.equal((await s.queue.list())[0].syncStatus,'SYNC_FAILED');
 await s.engine.retry('op1');assert.equal((await s.queue.list())[0].syncStatus,'SYNC_PENDING');
});
test('storage quota error is reported, not treated as a saved operation',async()=>{
 const s=setup();s.storage.setItem=()=>{throw new Error('quota');};
 await assert.rejects(s.queue.enqueue(s.item()),/quota/);
});
