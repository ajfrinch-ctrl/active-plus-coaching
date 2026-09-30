/* TEMP real-browser repro (local only, never committed):
   a real Chromium page runs the shipped app against the local mock cloud.
   Question: after the admin approves, does the student's phone leave the
   "pending" screen and can the student log in again? */
import { createServer } from 'node:http';
import { readFileSync, writeFileSync, mkdirSync, rmSync, cpSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import { startMockCloud } from './tests/two-device-harness.mjs';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const RUN = path.join(ROOT, 'tests', '.browser-run');
const PORT = 8093;

/* ---- 1. local copy of the app, Firebase CDN imports pointed at local mocks ---- */
rmSync(RUN, { recursive: true, force: true });
mkdirSync(path.join(RUN, 'mock'), { recursive: true });
for (const entry of ['index.html', 'admin.html', 'manifest.json', 'favicon.ico']) cpSync(path.join(ROOT, entry), path.join(RUN, entry));
for (const dir of ['css', 'js', 'sync', 'firebase', 'assets']) cpSync(path.join(ROOT, dir), path.join(RUN, dir), { recursive: true });
rmSync(path.join(RUN, 'sync', 'sync-core.js'), { force: true }); // replaced below
cpSync(path.join(ROOT, 'sync', 'sync-core.js'), path.join(RUN, 'sync', 'sync-core.js'));

writeFileSync(path.join(RUN, 'firebase', 'firebase-init.js'),
  "export const firebaseApp = { mock: 'app' };\nexport const appCheckReady = Promise.resolve();\n");
writeFileSync(path.join(RUN, 'firebase', 'firebase-config.js'),
  'export const firebaseConfig = { projectId: "mock", appId: "mock", databaseURL: "mock" };\n' +
  'export const APP_CHECK_SITE_KEY = ""; export const FCM_VAPID_KEY = "";\n');
writeFileSync(path.join(RUN, 'firebase', 'firebase-services.js'),
  "export { getAuth, signInAnonymously, setPersistence, browserLocalPersistence } from '/mock/firebase-auth.mock.mjs';\n" +
  "export { getDatabase, ref, get, set, runTransaction, onValue } from '/mock/firebase-database.mock.mjs';\n" +
  "const unavailable = name => () => { throw new Error(name + ' unavailable in the mock'); };\n" +
  "export const signInWithEmailAndPassword = unavailable('signInWithEmailAndPassword');\n" +
  "export const updatePassword = unavailable('updatePassword');\n" +
  "export const getFirestore = unavailable('getFirestore'); export const doc = unavailable('doc'); export const getDoc = unavailable('getDoc');\n" +
  "export const getFunctions = () => ({});\n" +
  "export const httpsCallable = () => async () => { throw new Error('functions/not-deployed'); };\n");

/* the mock cloud and the page share one origin: no CORS, CSP 'self' is satisfied */
writeFileSync(path.join(RUN, 'mock', 'firebase-auth.mock.mjs'),
  "const auth = { currentUser: null, authStateReady: async () => {} };\n" +
  "export const getAuth = () => auth;\n" +
  "export const browserLocalPersistence = {}; export async function setPersistence() {}\n" +
  "export async function signInAnonymously() { auth.currentUser = { uid: 'mock-anon' }; return { user: auth.currentUser }; }\n");
writeFileSync(path.join(RUN, 'mock', 'firebase-database.mock.mjs'), `
const BASE = '/mock-cloud';
const enc = encodeURIComponent;
export const getDatabase = () => ({});
export const ref = (db, nodePath) => ({ path: String(nodePath || '') });
export async function get(node) {
  const res = await fetch(BASE + '/db?path=' + enc(node.path));
  const data = await res.json();
  return { exists: () => data.exists, val: () => data.val };
}
export async function set(node, value) {
  const res = await fetch(BASE + '/db', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ nodePath: node.path, value })
  });
  if (!res.ok) throw new Error('mock rtdb set failed: ' + res.status);
}
export async function runTransaction(node, change) {
  for (let attempt = 0; attempt < 100; attempt++) {
    const before = await fetch(BASE + '/db?path=' + enc(node.path)).then(res => res.json());
    const value = change(before.val);
    if (value === undefined) {
      return { committed: false, snapshot: { val: () => before.val, exists: () => before.val !== undefined } };
    }
    const res = await fetch(BASE + '/db', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ nodePath: node.path, value, expectedRevision: before.revision })
    });
    if (res.status === 409) continue;
    if (!res.ok) throw new Error('mock transaction failed: ' + res.status);
    return { committed: true, snapshot: { val: () => value, exists: () => value !== null } };
  }
  throw new Error('mock transaction retry limit');
}
export function onValue(node, callback) {
  const controller = new AbortController();
  (async () => {
    const res = await fetch(BASE + '/events?path=' + enc(node.path), { signal: controller.signal });
    const decoder = new TextDecoder();
    let buffer = '';
    for await (const chunk of res.body) {
      buffer += decoder.decode(chunk, { stream: true });
      let boundary;
      while ((boundary = buffer.indexOf('\\n\\n')) >= 0) {
        const frame = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 2);
        const line = frame.split('\\n').find(l => l.startsWith('data: '));
        if (!line) continue;
        const event = JSON.parse(line.slice(6));
        callback({ exists: () => event.exists, val: () => event.val });
      }
    }
  })().catch(() => {});
  return () => controller.abort();
}
`);
/* the harness's own "signed in" mark, honoured only in this local copy */
{
  const file = path.join(RUN, 'js', 'sync-session.js');
  writeFileSync(file, readFileSync(file, 'utf8').replace(
    'export async function hasSyncSession() {',
    'export async function hasSyncSession() {\n  if (window.__apcTwoDeviceSignedIn === true) return true;'));
}
/* the app pages import their Firebase service surface through js/realtime-sync.js */
{
  const file = path.join(RUN, 'js', 'realtime-sync.js');
  let source = readFileSync(file, 'utf8');
  source = source.split('https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js').join('/mock/firebase-auth.mock.mjs');
  source = source.split('https://www.gstatic.com/firebasejs/12.2.1/firebase-database.js').join('/mock/firebase-database.mock.mjs');
  source = source.replace(
    'const key = studentKey(local);',
    "try { console.log('[dbg-push] local', JSON.stringify({ status: local && local.status, updatedAt: local && local.updatedAt, id: local && local.student && local.student.id })); } catch {}\n    const key = studentKey(local);");
  source = source.replace(
    "return chooseStudentCopy(local, current) === 'local' ? local : undefined;",
    "const decision = chooseStudentCopy(local, current);\n      try { console.log('[dbg-push] decision', decision, JSON.stringify({ remoteStatus: current && current.status, remoteUpdatedAt: current && current.updatedAt })); } catch {}\n      return decision === 'local' ? local : undefined;");
  source = source.replace(
    'if (sameStudentRecord(local, remote)) {',
    "try { console.log('[dbg-push] adopt', sameStudentRecord(local, remote), JSON.stringify({ localStatus: local && local.status, remoteStatus: remote && remote.status })); } catch {}\n    if (sameStudentRecord(local, remote)) {");
  writeFileSync(file, source);
}
{
  const file = path.join(RUN, 'js', 'firebase-config.js');
  writeFileSync(file, readFileSync(file, 'utf8').split('https://www.gstatic.com/firebasejs/12.2.1/firebase-app.js').join('/mock/firebase-app.mock.mjs'));
}
writeFileSync(path.join(RUN, 'mock', 'firebase-app.mock.mjs'), "export const initializeApp = () => ({ mock: 'app' });\n");
rmSync(path.join(RUN, 'sw.js'), { force: true });

/* ---- 2. one local origin: static files + the mock cloud ---- */
const cloud = await startMockCloud();
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.ico': 'image/x-icon', '.ttf': 'font/ttf', '.svg': 'image/svg+xml' };
const seen = [];
const server = createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const target = cloud.url + url.pathname.replace('/mock-cloud', '') + url.search;
  if (url.pathname.startsWith('/mock-cloud')) {
    const forward = async () => {
      const upstream = await fetch(target, { method: req.method, headers: req.method === 'POST' ? { 'content-type': 'application/json' } : {}, body: req.method === 'POST' ? req : undefined, duplex: 'half' });
      res.writeHead(upstream.status, { 'content-type': upstream.headers.get('content-type') || 'application/json', 'cache-control': 'no-cache' });
      if (!upstream.body) { res.end(); return; }
      for await (const chunk of upstream.body) res.write(chunk);
      res.end();
    };
    forward().catch(error => { seen.push('proxy error: ' + error.message); try { res.writeHead(500); res.end(); } catch {} });
    return;
  }
  const file = path.join(RUN, decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname));
  if (!existsSync(file) || !file.startsWith(RUN)) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' });
  res.end(readFileSync(file));
});
await new Promise(resolve => server.listen(PORT, '127.0.0.1', resolve));
const APP = `http://127.0.0.1:${PORT}`;

/* ---- 3. drive a real browser ---- */
const browser = await chromium.launch({
  executablePath: '/tmp/chromium',
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--no-zygote', '--single-process']
});
const context = await browser.newContext({ viewport: { width: 420, height: 900 } });
await context.addInitScript(() => { window.__apcTwoDeviceSignedIn = true; });
const page = await context.newPage();
page.on('console', message => console.log('[page]', message.type(), message.text()));
page.on('pageerror', error => console.log('[pageerror]', error.message));

const studentId = async () => page.evaluate(() => JSON.parse(localStorage.getItem('active-plus-account-v1') || 'null')?.student?.id || null);
const status = async () => page.evaluate(() => ({
  status: JSON.parse(localStorage.getItem('active-plus-account-v1') || 'null')?.status || null,
  pendingLock: document.getElementById('appShell')?.classList.contains('is-pending') ?? null,
  appHidden: document.getElementById('appShell')?.hidden ?? null,
  authHidden: document.getElementById('authScreen')?.hidden ?? null,
  message: document.getElementById('authMessage')?.textContent || ''
}));

await page.goto(APP + '/index.html');
await page.waitForFunction(() => document.getElementById('loginForm')?.dataset.loginReady === 'true', null, { timeout: 20000 });

/* register through the real form (fill every required field, then submit) */
await page.evaluate(() => document.querySelector('[data-auth-tab="register"]')?.click());
await page.evaluate(() => {
  const specials = {
    mobile: '01711223344', studentMobile: '01711223344', username: 'rahim.student',
    pin: '4827', pinConfirm: '4827', nameBn: 'নতুন শিক্ষার্থী', nameEn: 'Test Student',
    fatherName: 'পিতা', motherName: 'মাতা', guardianMobile: '01711223355', address: 'ঢাকা',
    securityAnswer: 'uttor'
  };
  for (const field of document.querySelectorAll('#registrationForm [required]')) {
    if (field.type === 'checkbox') { field.checked = true; continue; }
    if (specials[field.name] !== undefined) field.value = specials[field.name];
    else if (field.tagName === 'SELECT') field.value = [...field.options].find(option => option.value && !option.disabled)?.value ?? '';
    else if (field.type === 'date') field.value = '2012-01-01';
    else if (field.type === 'tel' || field.type === 'number') field.value = '01711223366';
    else if (field.type === 'password') field.value = '4827';
    else field.value = 'টেস্ট';
    field.dispatchEvent(new Event('input', { bubbles: true }));
    field.dispatchEvent(new Event('change', { bubbles: true }));
  }
});
await page.evaluate(() => document.querySelector('#registrationForm [type=submit]').click());
await page.waitForFunction(() => (document.getElementById('authMessage')?.textContent || '').includes('রেজিস্ট্রেশন সফল'), null, { timeout: 60000 });
const id = await studentId();
console.log('REGISTERED:', id, JSON.stringify(await status()));

/* the student logs in while pending (this is what makes the phone known to the office) */
await page.evaluate(() => {
  document.getElementById('loginMobile').value = 'rahim.student';
  document.getElementById('loginPin').value = '4827';
  document.getElementById('loginForm').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
});
await page.waitForFunction(() => document.getElementById('appShell')?.hidden === false, null, { timeout: 30000 });
console.log('PENDING LOGIN:', JSON.stringify(await status()));

/* the student closes the app; the office approves while the phone is away */
const root = () => cloud.state.activePlusSync?.v1 || {};
const waitCloud = async (predicate, what, timeout = 20000) => {
  const started = Date.now();
  for (;;) {
    if (predicate(root())) return;
    if (Date.now() - started > timeout) throw new Error('cloud wait timed out: ' + what);
    await new Promise(resolve => setTimeout(resolve, 100));
  }
};
await waitCloud(state => Object.values(state.students || {}).some(row => row?.id === id), 'roster row uploaded');
await waitCloud(state => state.studentAccounts && Object.keys(state.studentAccounts).length > 0, 'student login record uploaded');
console.log('PAGE1 OUTBOX:', await page.evaluate(() => localStorage.getItem('activePlus.syncOutbox.v2:students')));
console.log('PAGE1 LOCAL ROW:', await page.evaluate(id => JSON.parse(localStorage.getItem('activePlus.admin.students.v1') || '[]').find(row => row?.id === id)?.status, id));
await page.close();

const row = Object.values(root().students).find(item => item?.id === id);
const approved = { ...row, status: 'approved', reviewedAt: new Date().toISOString(), reviewedBy: 'office.admin.apc', reviewedRole: 'admin', updatedAt: new Date().toISOString() };
const written = await fetch(cloud.url + '/db', {
  method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ nodePath: 'activePlusSync/v1/students/' + id, value: approved })
});
console.log('APPROVAL WRITTEN:', written.status, JSON.stringify(approved.status));

/* the student opens the app again on the same phone */
const page2 = await context.newPage();
page2.on('console', message => console.log('[page2]', message.type(), message.text()));
page2.on('pageerror', error => console.log('[page2-error]', error.message));
const status2 = async () => page2.evaluate(() => ({
  status: JSON.parse(localStorage.getItem('active-plus-account-v1') || 'null')?.status || null,
  pendingLock: document.getElementById('appShell')?.classList.contains('is-pending') ?? null,
  appHidden: document.getElementById('appShell')?.hidden ?? null,
  authHidden: document.getElementById('authScreen')?.hidden ?? null,
  session: sessionStorage.getItem('active-plus-session-v1') !== null || localStorage.getItem('active-plus-session-v1') !== null,
  message: document.getElementById('authMessage')?.textContent || ''
}));
await page2.addInitScript(() => {
  window.__apcAccountTrail = [];
  const proto0 = window.Storage.prototype;
  const originalSet0 = proto0.setItem;
  proto0.setItem = function (key, value) {
    const text = String(key);
    if (text.includes('account') || text.includes('studentAccounts')) {
      let status = null; try { status = JSON.parse(value)?.status ?? null; } catch {}
      window.__apcAccountTrail.push([Date.now(), text, status, new Error('trace').stack.split('\n').slice(1, 6).join(' | ')]);
    }
    return originalSet0.call(this, key, value);
  };
  const originalRemove0 = proto0.removeItem;
  proto0.removeItem = function (key) {
    if (String(key).includes('account')) window.__apcAccountTrail.push([Date.now(), 'REMOVE', String(key)]);
    return originalRemove0.call(this, key);
  };
  window.__apcRosterWrites = [];
  const proto = window.Storage.prototype;
  const originalSet = proto.setItem;
  proto.setItem = function (key, value) {
    if (String(key).includes('students')) {
      window.__apcRosterWrites.push([Date.now(), key, String(value).slice(0, 200), new Error('trace').stack.split('\n').slice(1, 7).join(' | ')]);
    }
    return originalSet.call(this, key, value);
  };
  window.__apcDebugEvents = [];
  window.addEventListener('apc-sync-updated', event => window.__apcDebugEvents.push(['sync-updated', event.detail?.collection]));
  window.addEventListener('storage', event => { if (event.apcRemote) window.__apcDebugEvents.push(['remote-storage', event.key, String(event.newValue).slice(0, 120)]); });
});
await page2.goto(APP + '/index.html');
await page2.waitForFunction(() => document.getElementById('loginForm')?.dataset.loginReady === 'true', null, { timeout: 20000 });
await page2.waitForTimeout(4000); // give the restored session + sync a moment
console.log('AFTER REOPEN (session restored):', JSON.stringify(await status2()));
console.log('SYNC2:', await page2.evaluate(() => ({ state: document.documentElement.dataset.realtimeSync, message: document.documentElement.dataset.realtimeSyncMessage, cloud: document.documentElement.dataset.firebaseConnection })));

/* and log in again explicitly */
await page2.evaluate(() => {
  document.getElementById('loginMobile').value = 'rahim.student';
  document.getElementById('loginPin').value = '4827';
  document.getElementById('loginForm').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
});
await page2.waitForTimeout(6000);
console.log('AFTER RE-LOGIN:', JSON.stringify(await status2()));
console.log('SYNC3:', await page2.evaluate(() => ({ state: document.documentElement.dataset.realtimeSync, message: document.documentElement.dataset.realtimeSyncMessage })));
console.log('CLOUD ACCOUNT STATUS:', JSON.stringify(Object.values(root().studentAccounts || {}).map(record => record?.status)));
console.log('CLOUD ROSTER ROW:', JSON.stringify(Object.values(root().students || {}).find(item => item?.id === id)?.status));
console.log('LOCAL ROSTER ROW:', await page2.evaluate(id => {
  const rows = JSON.parse(localStorage.getItem('activePlus.admin.students.v1') || '[]');
  return rows.find(row => row?.id === id)?.status || null;
}, id));
console.log('OUTBOX:', await page2.evaluate(() => localStorage.getItem('activePlus.syncOutbox.v2:students')));
console.log('ROSTER WRITES:', JSON.stringify(await page2.evaluate(() => window.__apcRosterWrites || null), null, 1).slice(0, 1500));
console.log('ACCOUNT TRAIL:', JSON.stringify(await page2.evaluate(() => window.__apcAccountTrail || null), null, 1).slice(0, 4000));
console.log('DEBUG EVENTS:', JSON.stringify(await page2.evaluate(() => window.__apcDebugEvents || null)).slice(0, 3000));

if (process.env.KEEP_OPEN !== '1') {
  await browser.close();
  server.close();
  await new Promise(resolve => cloud.server.close(resolve));
} else {
  console.log('KEEPING BROWSER OPEN — press Ctrl+C');
  await new Promise(() => {});
}
