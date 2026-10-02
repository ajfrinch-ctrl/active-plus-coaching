/* Accessible-name scan for one page/role pair (tool, not a test).
   Runs in its own process, exactly like tests/ui-sweep.mjs: the jsdom harness
   owns the globals and an ES module is only evaluated once per process, so two
   page states cannot share one. Prints JSON:
     { file, mode, views: [...], unnamed: [{ view, control }] }
   Usage: node tests/a11y-scan.mjs <page> <mode>   (mode: guest|student|<staff role>) */
import { loadPage } from './jsdom-harness.mjs';
import { provisionStaff, seedStaffSession, STAFF_TEST_PASSWORD } from './staff-harness.mjs';

const [file, mode] = process.argv.slice(2);
const ctx = await loadPage(file, { seed: { 'activePlus.demo.autofill.v1': 'off' } });
// Never touch the live project: every fetch fails fast, like an offline device.
const offline = async () => { throw new Error('offline (a11y scan)'); };
ctx.window.fetch = offline;
globalThis.fetch = offline;
const { window, document } = ctx;
const settle = async () => { await ctx.flush(2); await new Promise(resolve => setTimeout(resolve, 10)); };

if (mode === 'guest') {
  await import('../js/main.js');
} else if (mode === 'student') {
  const { hashPassword } = await import('../js/password-hash.js');
  const { buildSessionRecord } = await import('../js/session.js');
  window.localStorage.setItem('active-plus-account-v1', JSON.stringify({
    mobile: '01700000000', registrationMobile: '01700000000', username: 'raisa.islam',
    pinHash: await hashPassword('246810'), status: 'active',
    student: { id: 'AP-1024', name: 'রাইসা আক্তার', className: 'দশম শ্রেণি', group: 'A' }
  }));
  window.localStorage.setItem('active-plus-session-v1', JSON.stringify(buildSessionRecord({ owner: 'raisa.islam' })));
  await import('../js/main.js');
  await ctx.waitFor(() => ctx.$('#appShell') && ctx.$('#appShell').hidden === false);
} else {
  await provisionStaff(mode, STAFF_TEST_PASSWORD);
  seedStaffSession(window, mode);
  const panel = { 'admin.html': 'admin', 'manager.html': 'manager', 'teacher.html': 'teacher', 'payment.html': 'payment' }[file];
  if (!panel) { console.error(`unknown page for staff mode: ${file}`); process.exit(2); }
  await import(`../js/${panel}.js`);
  await import('../js/theme-entry.js');
}
await settle();

const VIEW_CONTAINERS = '.view, .admin-view, .manager-view, .teacher-view, .payment-view, .auth-panel, [data-view-panel]';
const visible = element => {
  if (element.closest('[hidden]') || element.hidden) return false;
  const container = element.closest(VIEW_CONTAINERS);
  if (container && !container.classList.contains('active')) return false;
  const style = window.getComputedStyle(element);
  return style.display !== 'none' && style.visibility !== 'hidden';
};
const labelledByText = element => (element.getAttribute('aria-labelledby') || '')
  .split(/\s+/).filter(Boolean).map(id => document.getElementById(id)?.textContent || '').join(' ').trim();
const accessibleName = element => {
  const explicit = (element.getAttribute('aria-label') || labelledByText(element) || '').trim();
  if (explicit) return explicit;
  if (element.id) {
    const label = document.querySelector(`label[for="${element.id}"]`);
    if (label?.textContent.trim()) return label.textContent.trim();
  }
  const wrapping = element.closest('label');
  // A label that only wraps icons and the control itself names nothing — and
  // an aria-label on the <label> names the label, not the control inside it.
  if (wrapping) {
    const clone = wrapping.cloneNode(true);
    clone.querySelectorAll('input, select, textarea, button, svg').forEach(node => node.remove());
    if (clone.textContent.trim()) return clone.textContent.trim();
  }
  if (['BUTTON', 'A'].includes(element.tagName)) {
    const alt = element.querySelector('img[alt]')?.getAttribute('alt') || '';
    return (element.textContent || '').trim() || alt || (element.getAttribute('title') || '').trim();
  }
  // A submit/button input is named by its value; every other control is not.
  const valueIsName = element.tagName === 'INPUT' && ['submit', 'button', 'reset', 'image'].includes(element.type);
  return (valueIsName ? (element.value || '').trim() : '') || (element.getAttribute('title') || '').trim();
};

const navAttribute = { 'admin.html': 'data-admin-view', 'manager.html': 'data-manager-view', 'teacher.html': 'data-teacher-view', 'index.html': 'data-view' }[file];
const seen = new Set();
const views = [];
const unnamed = [];
const scan = view => {
  for (const control of ctx.$$('button, [role="button"], a[href], input:not([type="hidden"]), select, textarea, [tabindex="0"]')) {
    if (!visible(control) || accessibleName(control)) continue;
    const descriptor = `${control.tagName.toLowerCase()}${control.id ? '#' + control.id : ''}${control.getAttribute('name') ? '[name=' + control.getAttribute('name') + ']' : ''}`;
    unnamed.push({ view, control: descriptor });
  }
};

for (const button of navAttribute ? ctx.$$(`[${navAttribute}]`) : []) {
  const view = button.getAttribute(navAttribute);
  if (seen.has(view)) continue;
  seen.add(view);
  ctx.click(button);
  await settle();
  views.push(view);
  scan(view);
}
if (!views.length) { views.push('default'); scan('default'); }

console.log(JSON.stringify({ file, mode, views, unnamed }));
process.exit(0);
