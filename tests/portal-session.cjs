/* Shared sign-in for the browser specs.

   Every staff portal used to carry a login form of its own. Signing in now
   happens once, on the shared card in index.html, and a panel opens from the
   device-bound session that sign-in wrote. The specs care about the panel, not
   about re-testing the login form, so they sign in the way a first real
   sign-in does — through the app's own storage layer — and then load the
   panel. That keeps the specs honest (the same code path a user goes through)
   without duplicating the credential UI fifteen times. */

const E2E_PASSWORD = 'Apc-E2E-2026';

const ROLE_USERNAMES = Object.freeze({
  admin: 'admin.apc',
  manager: 'manager.apc',
  teacher: 'teacher.apc',
  payment: 'payment.apc',
  cash: 'payment.apc'
});

/** Provision the role's password and write a valid device-bound session. */
async function seed(page, role, password = E2E_PASSWORD) {
  await page.evaluate(async ({ role, password }) => {
    const auth = await import('/js/staff-auth.js');
    if (role === 'admin') {
      const created = await auth.createInitialAdmin({
        fullName: 'E2E Owner', mobile: '01700000000', email: '',
        password, confirmPassword: password
      });
      if (!created.ok) throw new Error(`first admin: ${created.error}`);
    }
    await auth.provisionStaffAccount(role, password, password);
    const session = await auth.saveStaffSession(role, true);
    if (!session) throw new Error(`no session for ${role}`);
  }, { role, password });
}

/** Sign a role in and land on its panel, signed in. */
async function enterPortal(page, role, panel = role) {
  const target = {
    admin: 'admin.html', manager: 'manager.html',
    teacher: 'teacher.html', payment: 'payment.html'
  }[panel];
  if (!target) throw new Error(`unknown portal: ${panel}`);
  // Seed on a page of the same origin that is not the panel, so the panel's own
  // boot check cannot race the provisioning.
  await page.goto('/offline-roles.html');
  await seed(page, role);
  await page.goto(`/${target}`);
  await page.waitForLoadState('networkidle');
  return page;
}

/** Sign a student in on the shared card and open the student app. */
async function enterStudentApp(page, { id = 'AP-1024', name = 'রাইসা', className = 'দশম শ্রেণি' } = {}) {
  const account = {
    mobile: '01700000000',
    registrationMobile: '01700000000',
    username: 'raisa.islam',
    pin: '246810',
    status: 'active',
    student: { id, name, className }
  };
  await page.addInitScript(key => {
    localStorage.setItem(key, localStorage.getItem(key));
  }, ACCOUNT_KEY);
  await page.goto('/index.html');
  await page.evaluate(async ({ key, account }) => {
    localStorage.setItem(key, JSON.stringify(account));
  }, { key: ACCOUNT_KEY, account });
  await page.reload();
  await page.fill('#loginMobile', account.username);
  await page.fill('#loginPin', account.pin);
  await page.click('#loginForm button[type=submit]');
  await page.waitForLoadState('networkidle');
  return page;
}

const ACCOUNT_KEY = 'active-plus-account-v1';

module.exports = { enterPortal, enterStudentApp, seed, E2E_PASSWORD, ROLE_USERNAMES };
