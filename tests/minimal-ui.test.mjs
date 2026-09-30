import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
const read=p=>readFileSync(p,'utf8');
const pages=['index','admin','manager','teacher','payment','offline-roles'];
test('every page has one new entry and no legacy icon dependencies',()=>{
 for(const page of pages){const s=read(`${page}.html`);assert.equal((s.match(/rel="stylesheet"/g)||[]).length,1);assert.match(s,/css\/design-system.css/);assert.doesNotMatch(s,/<use\b|<symbol\b|icon-sprite|assets\/icons\/(glass|admin)\//);}
 for(const file of readdirSync('js').filter(f=>f.endsWith('.js')))assert.doesNotMatch(read(`js/${file}`),/<use\b|assets\/icons\/(glass|admin)\//);
});
test('new presentation has no storage or Firebase API and no legacy imports',()=>{
 const s=read('js/icons.js');assert.doesNotMatch(s,/localStorage|indexedDB|firebase|realtime-sync/);
 for(const f of ['design-system','foundation','ui-layout','ui-components','ui-forms','ui-features'])assert.doesNotMatch(read(`css/${f}.css`),/gradient\(|backdrop-filter|@import.*(?:aurora|glass|polish)/);
});
// Baseline includes upstream single-flight sync fix merged from main; the UI does not modify it.
test('protected core unchanged from upstream main and all new and protected assets cached',()=>{
 const sw=read('sw.js');
 for(const dir of ['firebase','sync'])for(const file of readdirSync(dir).filter(f=>f.endsWith('.js'))){const p=`${dir}/${file}`;assert.equal(read(p),execFileSync('git',['show',`13ab90a:${p}`],{encoding:'utf8'}));assert.ok(sw.includes(`'./${p}'`),p);}
 for(const f of ['design-system','foundation','ui-layout','ui-components','ui-forms','ui-features'])assert.ok(sw.includes(`'./css/${f}.css'`));
 assert.ok(sw.includes("'./js/realtime-sync.js'"));assert.ok(sw.includes("'./js/icons.js'"));assert.match(sw,/CACHE_VERSION = 116/);
 const added=execFileSync('git',['diff','--unified=0','--','js','sw.js'],{encoding:'utf8'}).split('\n').filter(l=>l.startsWith('+')).join('\n');assert.doesNotMatch(added,/localStorage\.clear\s*\(|indexedDB\.deleteDatabase\s*\(/);
});
test('precache URLs are unique and all local shell assets exist',()=>{
 const shell=read('sw.js').split('const APP_SHELL = [')[1].split('];')[0];
 const paths=[...shell.matchAll(/'\.\/([^']+)'/g)].map(m=>m[1]);
 assert.equal(paths.length,new Set(paths).size,'Cache.addAll rejects duplicate URLs');
 for(const path of paths)readFileSync(path);
 for(const path of ['js/status-surface.js','js/ui-accessibility.js','js/print-tokens.js','css/ui-status.css'])assert.ok(paths.includes(path));
});
