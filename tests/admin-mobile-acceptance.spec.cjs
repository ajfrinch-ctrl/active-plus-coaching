const { test, expect } = require('./fixtures.cjs');

/* First use lives on the LOGIN page only: the Admin is created there with a
   generated Login User ID ("review.admin.apc"), and the option disappears for
   good afterwards. This spec (unrunnable without a browser binary) mirrors
   tests/first-admin-setup.test.mjs, which drives the same flow in jsdom. */
async function setup(page) {
  await page.goto('/index.html');
  await page.locator('#openFirstAdmin').click();
  await page.locator('#firstAdminName').fill('Review Admin');
  // The id is generated, never typed: only the locked preview is on screen.
  await expect(page.locator('#firstAdminIdPreview')).toHaveText('review.admin.apc');
  await expect(page.locator('#firstAdminPanel input[name="username"]')).toHaveCount(0);
  await page.locator('#firstAdminMobile').fill('01711222333');
  await page.locator('#firstAdminPassword').fill('Review123');
  await page.locator('#firstAdminConfirm').fill('Review123');
  await page.locator('#firstAdminForm button[type=submit]').click();
  // The first-use workflow is gone once the Admin exists.
  await expect(page.locator('#firstAdminPanel')).toHaveCount(0);
  await expect(page.locator('#openFirstAdmin')).toHaveCount(0);
  // …and the generated id signs in like any other Admin.
  await expect(page.locator('#loginMobile')).toHaveValue('review.admin.apc');
  await page.locator('#loginForm button[type=submit]').click();
  const bootstrap = page.locator('#bootstrapCredentialsDone');
  if (await bootstrap.count()) await bootstrap.click();
  await expect(page.locator('#adminShell')).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
}

for (const width of [320, 360, 375, 390, 412, 430]) {
  test(`Admin sections, icons and footer fit at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await setup(page);
    for (const view of ['dashboard', 'staff', 'students', 'reports', 'more', 'roles', 'data', 'backup', 'security', 'settings', 'profile']) {
      await page.evaluate(view => { location.hash = view; }, view);
      await expect(page.locator(`.admin-view.active[data-view-panel="${view}"]`)).toBeVisible();
      const result = await page.evaluate(() => {
        const bar = document.querySelector('.admin-bottom').getBoundingClientRect();
        const main = document.querySelector('#adminMain');
        main.scrollTop = main.scrollHeight;
        const overflow = [...document.querySelectorAll('.admin-shell *')].filter(el => {
          const r = el.getBoundingClientRect();
          return r.width && r.height && (r.left < -1 || r.right > innerWidth + 1);
        }).map(el => el.className);
        return {
          overflow,
          pageOverflow: document.documentElement.scrollWidth > innerWidth,
          covered: document.querySelector('.admin-view.active').getBoundingClientRect().bottom > bar.top + 1,
          footerVisible: bar.top >= 0 && bar.bottom <= innerHeight,
          labels: [...document.querySelectorAll('.admin-bottom .nav-label')].every(el => parseFloat(getComputedStyle(el).fontSize) >= 11 && el.scrollWidth <= el.clientWidth + 1)
        };
      });
      expect(result, view).toEqual({ overflow: [], pageOverflow: false, covered: false, footerVisible: true, labels: true });
    }
    await expect(page.locator('.admin-bottom button')).toHaveCount(5);
    // Icons are inline SVG now: one per container, drawn, and never overflowing
    // the chip, card, button, header or bottom bar that holds them.
    const icons = page.locator('.admin-shell svg.nav-icon, .admin-shell svg.admin-feature-icon-svg, .admin-shell svg.admin-more-icon-svg, .admin-shell svg.app-topbar-icon');
    expect(await icons.count()).toBeGreaterThan(4);
    const iconFit = await page.evaluate(() => {
      const bad = [];
      for (const svg of document.querySelectorAll('.admin-shell svg.nav-icon, .admin-shell svg.admin-feature-icon-svg, .admin-shell svg.admin-more-icon-svg, .admin-shell svg.app-topbar-icon')) {
        const box = svg.getBoundingClientRect();
        const parent = svg.parentElement.getBoundingClientRect();
        if (!box.width || !box.height) bad.push('empty:' + svg.parentElement.className);
        else if (box.width > parent.width + 1 || box.height > parent.height + 1) bad.push('overflow:' + svg.parentElement.className);
        if (!svg.querySelector('path, circle, rect')) bad.push('blank:' + svg.parentElement.className);
      }
      return bad;
    });
    expect(iconFit).toEqual([]);
    await page.locator('.admin-bottom [data-admin-view="staff"]').click();
    await expect(page.locator('.admin-bottom [aria-current="page"]')).toHaveAttribute('data-admin-view', 'staff');
    await page.evaluate(() => { location.hash = 'finance'; });
    await expect(page.locator('[data-view-panel="teaching"]')).toHaveCount(0);
    expect(errors).toEqual([]);
  });
}
