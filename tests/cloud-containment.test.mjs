import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { registerHooks } from 'node:module';
import { loadPage } from './jsdom-harness.mjs';

// The deployed policy has no descendant grants: RTDB parent denies alone would
// not override a deeper true rule. Assert the complete closed policy.
test('database rules deny every client, including persisted anonymous tokens', () => {
  const policy = JSON.parse(readFileSync(new URL('../database.rules.json', import.meta.url)));
  assert.deepEqual(policy, { rules: { '.read': false, '.write': false } });
});

test('production containment makes zero Firebase calls on login, retries, diagnostics or local login', async t => {
  const ctx = await loadPage('index.html', { seed: { 'activePlus.demo.autofill.v1': 'off' } });
  globalThis.Storage = ctx.window.Storage;
  let sdkLoads = 0;
  let sdkCalls = 0;
  const blocked = () => { sdkCalls++; throw new Error('Unexpected cloud activity'); };
  globalThis.__closedCloud = {
    firebaseApp: {}, appCheckReady: Promise.resolve(), getAuth: blocked,
    signInAnonymously: blocked, setPersistence: blocked, browserLocalPersistence: {},
    getDatabase: blocked, ref: blocked, get: blocked, set: blocked,
    runTransaction: blocked, onValue: blocked
  };
  const hooks = registerHooks({ load(url, context, nextLoad) {
    if (url.endsWith('/firebase/firebase-init.js') || url.endsWith('/firebase/firebase-services.js')) {
      sdkLoads++;
      return { format: 'module', shortCircuit: true,
        source: `export const { ${Object.keys(globalThis.__closedCloud).join(', ')} } = globalThis.__closedCloud;` };
    }
    return nextLoad(url, context);
  } });
  t.after(() => { hooks.deregister(); ctx.window.close(); delete globalThis.__closedCloud; });

  const { LEGACY_CLOUD_ENABLED } = await import('../sync/cloud-access.js');
  assert.equal(LEGACY_CLOUD_ENABLED, false);
  const storage = await import('../js/storage.js');
  const { initLogin } = await import('../js/login.js');
  let admitted = 0;
  initLogin({ state: { account: null, student: {} }, onAuthenticated: () => { admitted++; } });
  await import('../js/realtime-sync-entry.js');
  for (let i = 0; i < 5; i++) {
    ctx.window.dispatchEvent(new ctx.window.Event('online'));
    ctx.window.dispatchEvent(new ctx.window.Event('apc-sync-retry'));
    ctx.window.dispatchEvent(new ctx.window.Event('apc-session-ready'));
  }
  ctx.type(ctx.$('#loginMobile'), 'unknown.student');
  ctx.type(ctx.$('#loginPin'), '123456');
  ctx.submit(ctx.$('#loginForm'));
  await ctx.waitFor(() => ctx.$('#loginForm').getAttribute('aria-busy') !== 'true');
  assert.equal(admitted, 0);
  assert.equal(await storage.hasSession(), false);
  assert.match(ctx.document.body.textContent, /ক্লাউড সিঙ্ক ও অন্য ডিভাইসের অ্যাকাউন্ট আনা সাময়িক বন্ধ/);

  const facade = await import('../sync/sync-core.js');
  for (const run of [() => facade.startRealtimeSync(), () => facade.ensureCloudAuth(),
    () => facade.hydrateStaffAccounts(), () => facade.hydrateUserIdentifiers(),
    () => facade.firstAdminExistsOnline(), () => facade.SyncService.usernameTakenOnline('name')]) {
    await assert.rejects(run, { code: 'cloud-paused', retryable: false });
  }
  const { diagnoseFirebaseSync } = await import('../js/firebase-diagnostics.js');
  const { testFirebaseOnlineConnection } = await import('../js/firebase-online-test.js');
  assert.equal((await diagnoseFirebaseSync()).reason, 'cloud-paused');
  assert.equal((await testFirebaseOnlineConnection()).reason, 'cloud-paused');
  const push = await import('../js/push-notifications.js');
  assert.equal((await push.enablePush()).status, 'cloud-paused');
  assert.equal((await push.syncPushRegistration()).status, 'cloud-paused');
  assert.equal(sdkLoads, 0, 'normal login and explicit retries must not even load the Firebase implementation');

  await storage.persistAccount({ username: 'local.student', mobile: '01712345678', pin: '123456',
    status: 'active', student: { id: 'LOCAL-1', name: 'Student' } });
  ctx.type(ctx.$('#loginMobile'), 'local.student');
  ctx.submit(ctx.$('#loginForm'));
  await ctx.waitFor(() => ctx.$('#loginForm').getAttribute('aria-busy') !== 'true');
  assert.equal(admitted, 1, 'valid local credentials still work');
  assert.equal(await storage.hasSession(), true);
  ctx.$('#authScreen').hidden = true;
  ctx.window.dispatchEvent(new ctx.window.Event('apc-session-ready'));
  await new Promise(resolve => setTimeout(resolve, 350));
  assert.equal(ctx.document.documentElement.dataset.realtimeSync, 'paused');
  assert.equal(sdkLoads, 0, 'successful local login must not load the cloud implementation');

  // Legacy callers importing the implementation directly cannot bypass policy.
  const implementation = await import('../js/realtime-sync.js');
  assert.equal((await implementation.startRealtimeSync()).reason, 'cloud-paused');
  await assert.rejects(() => implementation.ensureCloudAuth(), { code: 'cloud-paused' });
  assert.equal((await implementation.hydrateUserIdentifiers({ identifier: 'someone', password: 'wrong' })).ok, false);
  assert.equal((await implementation.hydrateStaffAccounts()).ok, false);
  assert.equal((await implementation.firstAdminExistsOnline()).ok, false);
  assert.equal((await implementation.usernameTakenOnline('someone')).ok, false);
  ctx.window.localStorage.setItem('activePlus.admin.students.v1', '[]');
  ctx.window.dispatchEvent(new ctx.window.Event('online'));
  assert.equal(sdkCalls, 0, 'no auth, reads, writes, transactions or subscriptions');
});
