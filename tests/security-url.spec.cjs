const { test, expect } = require('./fixtures.cjs');

test('credential query strings are scrubbed before login pages load app assets', async ({ page }) => {
  for (const path of ['index.html', 'admin.html', 'teacher.html', 'payment.html', 'manager.html', 'offline-roles.html']) {
    await page.goto(`/${path}?username=admin.apc&password=123123&tracking=private#finance`);
    await expect.poll(() => page.evaluate(() => location.href)).toBe(`http://127.0.0.1:8000/${path}#finance`);
  }

  await page.goto('/admin.html?username=admin.apc&password=123123');
  await expect(page.locator('#adminLoginUser')).toHaveValue('');
  await expect(page.locator('#adminLoginPin')).toHaveValue('');
});
