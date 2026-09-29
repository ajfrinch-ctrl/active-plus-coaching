import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';

test('green chip requires successful sync; pending/offline/error/paused never green', async () => {
 const dom = new JSDOM('<header class="admin-topbar"><div class="admin-topbar-actions"></div></header>', { runScripts:'outside-only' });
 const { window:w }=dom;
 const observers=[];
 const Observer=w.MutationObserver;
 w.MutationObserver=class extends Observer { constructor(fn) { super(fn); observers.push(this); } };
 let online=true;
 Object.defineProperty(w.navigator,'onLine',{get:()=>online});
 w.eval(readFileSync(new URL('../js/topbar-connectivity.js',import.meta.url),'utf8'));
 w.document.dispatchEvent(new w.Event('DOMContentLoaded'));
 const root=w.document.documentElement;
 const tick=()=>new Promise(resolve=>setTimeout(resolve,0));
 const visible=()=>{const c=w.document.querySelector('.topbar-sync-chip');return c&&!c.hidden;};
 root.dataset.realtimeSync='online';await tick();assert.ok(!visible());
 root.dataset.firebaseLastSync='2026-09-29T00:00:00.000Z';await tick();
 assert.ok(visible());assert.match(w.document.querySelector('.topbar-sync-chip').textContent,/🟢 সিঙ্ক হয়েছে/);
 for(const state of ['pending','connecting','error','conflict','paused','offline']) {
  root.dataset.realtimeSync=state;await tick();assert.ok(!visible(),state);
 }
 root.dataset.realtimeSync='online';await tick();assert.ok(visible());
 online=false;w.dispatchEvent(new w.Event('offline'));assert.ok(!visible());
 for (const observer of observers) observer.disconnect();
 dom.window.close();
});
