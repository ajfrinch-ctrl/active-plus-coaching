/* Two-device integration harness: runs the REAL app code in two isolated
   Node/jsdom processes ("device A" and "device B", each with its own
   localStorage and module graph) against a shared in-memory mock of the
   Firebase Realtime Database. The only change to the app code is the import
   specifier of the three Firebase CDN modules, which is rewritten to local
   mock modules that speak a tiny RTDB-compatible protocol over loopback HTTP.

   Everything else — the storage-write bridge, the sync/push/merge rules, the
   listeners, the login flows — is exercised exactly as shipped. */

import http from 'node:http';
import { spawn } from 'node:child_process';
import { cpSync, mkdirSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const TESTS_DIR = path.dirname(fileURLToPath(import.meta.url));
const RUN_DIR = path.join(TESTS_DIR, '.two-device-run');
const REPO_DIR = path.dirname(TESTS_DIR);

/* -------------------------------------------------------------------------
   Mock Realtime Database — the shared "cloud" both devices connect to.
   Supports exactly what js/realtime-sync.js uses: get, set, onValue and
   anonymous sign-in (a no-op). Semantics: set overwrites the path subtree
   and notifies every listener whose path is the written path, its ancestor
   or its descendant.
   ---------------------------------------------------------------------- */

function getAt(tree, nodePath) {
  const keys = String(nodePath || '').split('/').filter(Boolean);
  let node = tree;
  for (const key of keys) {
    if (node === null || typeof node !== 'object') return undefined;
    node = node[key];
  }
  return node;
}

function setAt(tree, nodePath, value) {
  const keys = String(nodePath || '').split('/').filter(Boolean);
  if (!keys.length) throw new Error('mock rtdb: root writes are not supported');
  let node = tree;
  for (let i = 0; i < keys.length - 1; i += 1) {
    const key = keys[i];
    if (node[key] === null || typeof node[key] !== 'object') node[key] = {};
    node = node[key];
  }
  const last = keys[keys.length - 1];
  if (value === null) delete node[last];
  else node[last] = value;
}

const affects = (listenerPath, writtenPath) =>
  !listenerPath || !writtenPath ||
  listenerPath === writtenPath ||
  listenerPath.startsWith(writtenPath + '/') ||
  writtenPath.startsWith(listenerPath + '/');

export function startMockCloud() {
  const state = {};
  const subscribers = new Set();
  const send = (sub, nodePath) => {
    const val = getAt(state, nodePath);
    try {
      sub.res.write(`data: ${JSON.stringify({ path: nodePath, exists: val !== undefined, val: val === undefined ? null : val })}\n\n`);
    } catch { subscribers.delete(sub); }
  };
  const broadcast = writtenPath => {
    for (const sub of subscribers) {
      if (affects(sub.path, writtenPath)) send(sub, sub.path);
    }
  };
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost');
    if (req.method === 'GET' && url.pathname === '/db') {
      const val = getAt(state, url.searchParams.get('path'));
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ exists: val !== undefined, val: val === undefined ? null : val }));
      return;
    }
    if (req.method === 'POST' && url.pathname === '/db') {
      let body = '';
      req.on('data', chunk => { body += chunk; });
      req.on('end', () => {
        try {
          const { nodePath, value } = JSON.parse(body);
          setAt(state, nodePath, value);
          broadcast(nodePath);
          res.writeHead(200, { 'content-type': 'application/json' });
          res.end('{"ok":true}');
        } catch (error) {
          res.writeHead(500, { 'content-type': 'application/json' });
          res.end(JSON.stringify({ error: String(error.message || error) }));
        }
      });
      return;
    }
    if (req.method === 'GET' && url.pathname === '/events') {
      const sub = { path: url.searchParams.get('path') || '', res };
      res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache', connection: 'keep-alive' });
      subscribers.add(sub);
      req.on('close', () => subscribers.delete(sub));
      return;
    }
    res.writeHead(404);
    res.end();
  });
  return new Promise(resolve => {
    server.listen(0, '127.0.0.1', () => {
      resolve({ server, state, url: `http://127.0.0.1:${server.address().port}` });
    });
  });
}

/* -------------------------------------------------------------------------
   Build a runnable copy of the app whose only difference is that the three
   Firebase CDN import specifiers point at the local mock modules.
   ---------------------------------------------------------------------- */

function buildAppCopy(cloudUrl) {
  rmSync(RUN_DIR, { recursive: true, force: true });
  mkdirSync(path.join(RUN_DIR, 'mock'), { recursive: true });
  cpSync(path.join(REPO_DIR, 'js'), path.join(RUN_DIR, 'js'), { recursive: true });

  const mockAppUrl = pathToFileUrl(path.join(RUN_DIR, 'mock', 'firebase-app.mock.mjs'));
  const mockAuthUrl = pathToFileUrl(path.join(RUN_DIR, 'mock', 'firebase-auth.mock.mjs'));
  const mockDbUrl = pathToFileUrl(path.join(RUN_DIR, 'mock', 'firebase-database.mock.mjs'));
  const CDN = 'https://www.gstatic.com/firebasejs/12.2.1/';

  writeFileSync(path.join(RUN_DIR, 'mock', 'firebase-app.mock.mjs'),
    "export const initializeApp = () => ({ mock: 'app' });\n");
  writeFileSync(path.join(RUN_DIR, 'mock', 'firebase-auth.mock.mjs'),
    "export const getAuth = () => ({ mock: 'auth' });\n" +
    "export async function signInAnonymously() { return { user: { uid: 'mock-anon' } }; }\n");
  writeFileSync(path.join(RUN_DIR, 'mock', 'firebase-database.mock.mjs'), `
/* Minimal RTDB client over loopback HTTP (see two-device-harness.mjs). */
const BASE = ${JSON.stringify(cloudUrl)};
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
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ nodePath: node.path, value })
  });
  if (!res.ok) throw new Error('mock rtdb set failed: ' + res.status);
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
  })().catch(() => { /* stream closed when the device quits */ });
  return () => controller.abort();
}
`);

  const swap = (file, replacements) => {
    const target = path.join(RUN_DIR, 'js', file);
    let source = readFileSync(target, 'utf8');
    for (const [from, to] of replacements) source = source.split(from).join(to);
    writeFileSync(target, source);
  };
  swap('firebase-config.js', [[CDN + 'firebase-app.js', mockAppUrl]]);
  swap('realtime-sync.js', [
    [CDN + 'firebase-auth.js', mockAuthUrl],
    [CDN + 'firebase-database.js', mockDbUrl]
  ]);
  /* The version query would create a second module instance inside one
     process; the browser deduplicates by URL+query, so make Node match. */
  swap('login.js', [['./realtime-sync.js?v=20260929-1100', './realtime-sync.js']]);
}

function pathToFileUrl(p) {
  return 'file://' + path.resolve(p).split(path.sep).map(segment => encodeURIComponent(segment)).join('/');
}

/* -------------------------------------------------------------------------
   Device process control — spawn a child jsdom "phone" and talk JSON lines.
   ---------------------------------------------------------------------- */

export function buildDevices() {
  return { buildAppCopy };
}

export class Device {
  constructor(name, cloudUrl) {
    this.name = name;
    this.cloudUrl = cloudUrl;
    this.child = null;
    this.pending = new Map();
    this.nextId = 1;
    this.buffer = '';
  }

  start() {
    this.child = spawn(process.execPath, [path.join(TESTS_DIR, 'two-device-child.mjs')], {
      cwd: REPO_DIR,
      env: { ...process.env, MOCK_CLOUD_URL: this.cloudUrl, DEVICE: this.name },
      stdio: ['pipe', 'pipe', 'pipe']
    });
    this.child.stdout.setEncoding('utf8');
    this.child.stdout.on('data', chunk => {
      this.buffer += chunk;
      let newline;
      while ((newline = this.buffer.indexOf('\n')) >= 0) {
        const line = this.buffer.slice(0, newline).trim();
        this.buffer = this.buffer.slice(newline + 1);
        if (!line) continue;
        let message;
        try { message = JSON.parse(line); } catch { continue; }
        const pending = this.pending.get(message.id);
        if (!pending) continue;
        this.pending.delete(message.id);
        if (message.error) pending.reject(new Error(`[${this.name}:${message.cmd}] ${message.error}`));
        else pending.resolve(message.result);
      }
    });
    this.child.stderr.setEncoding('utf8');
    this.child.stderr.on('data', chunk => {
      if (process.env.TWO_DEVICE_DEBUG) process.stderr.write(`[${this.name}] ${chunk}`);
    });
    this.child.on('exit', code => {
      for (const pending of this.pending.values()) pending.reject(new Error(`[${this.name}] device exited (${code})`));
      this.pending.clear();
    });
  }

  run(cmd, args = {}, timeout = 60000) {
    const id = String(this.nextId++);
    const payload = JSON.stringify({ id, cmd, args }) + '\n';
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`[${this.name}:${cmd}] timed out after ${timeout}ms`));
      }, timeout);
      this.pending.set(id, {
        resolve: value => { clearTimeout(timer); resolve(value); },
        reject: error => { clearTimeout(timer); reject(error); }
      });
      this.child.stdin.write(payload);
    });
  }

  async stop() {
    if (!this.child) return;
    const child = this.child;
    this.child = null;
    try { await this.run('quit', {}, 5000); } catch { /* already gone */ }
    try { child.kill('SIGKILL'); } catch { /* already exited */ }
  }
}
