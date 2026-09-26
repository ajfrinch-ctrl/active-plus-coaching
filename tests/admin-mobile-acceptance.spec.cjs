const { test, expect } = require('./fixtures.cjs');

async function setup(page) {
  await page.goto('/admin.html');
  await page.locator('#initialAdminName').fill('Admin Review');
  await page.locator('#initialAdminMobile').fill('01711222333');
  await page.locator('#initialAdminUsername').fill('review.admin.apc');
  await page.locator('#initialAdminPassword').fill('Review123');
  await page.locator('#initialAdminConfirm').fill('Review123');
  await page.locator('#initialAdminForm button[type=submit]').click();
  await page.locator('#bootstrapCredentialsDone').click();
  await expect(page.locator('#adminShell')).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
}

for (const width of [320, 360, 375, 390, 412, 430]) {
  test(`Admin sections, icons and footer fit at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await setup(page);
    for (const view of ['dashboard', 'students', 'finance', 'routine', 'more', 'exams', 'notices', 'reports', 'classes', 'app-management']) {
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
    const images = page.locator('.admin-shell img[src^="assets/icons/admin/"]');
    for (const image of await images.all()) {
      await expect.poll(() => image.evaluate(el => el.complete && el.naturalWidth > 0)).toBe(true);
    }
    await page.locator('.admin-bottom [data-admin-view="finance"]').click();
    await expect(page.locator('.admin-bottom [aria-current="page"]')).toHaveAttribute('data-admin-view', 'finance');
    await page.evaluate(() => { location.hash = 'teaching'; });
    await expect(page.locator('[data-view-panel="teaching"]')).toHaveCount(0);
    expect(errors).toEqual([]);
  });
}
