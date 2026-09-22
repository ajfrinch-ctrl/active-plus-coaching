const { test, expect } = require('./fixtures.cjs');

async function barsStayInPlace(page, { header, footer, main }) {
  await expect.poll(() => page.evaluate(({ header, footer, main }) => {
    const top = document.querySelector(header).getBoundingClientRect();
    const bottom = document.querySelector(footer).getBoundingClientRect();
    const content = document.querySelector(main).getBoundingClientRect();
    return Math.abs(top.top) < 1 && Math.abs(bottom.bottom - innerHeight) < 1 &&
      Math.abs(content.top - top.bottom) <= 1 && Math.abs(content.bottom - bottom.top) <= 1;
  }, { header, footer, main })).toBe(true);
  await expect(page.locator(header)).toHaveCSS('position', 'fixed');
  await expect(page.locator(footer)).toHaveCSS('position', 'fixed');
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
}

for (const viewport of [{ width: 320, height: 740 }, { width: 390, height: 844 }, { width: 844, height: 390 }]) {
  test(`student header/footer stay fixed while middle scrolls (${viewport.width}px)`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto('/index.html');
    await page.locator('#demoLoginButton').click();
    const selectors = { header: '#appShell .topbar', footer: '.bottom-nav', main: '#appMain' };
    await barsStayInPlace(page, selectors);
    await page.locator('#appMain').evaluate(el => { el.scrollTop = el.scrollHeight; });
    await expect.poll(() => page.locator('#appMain').evaluate(el => el.scrollTop)).toBeGreaterThan(76);
    await expect(page.locator('#appShell .topbar')).toHaveClass(/is-scrolled/);
    await barsStayInPlace(page, selectors);
    const lastBottom = await page.locator('#homeView > :last-child').evaluate(el => el.getBoundingClientRect().bottom);
    const footerTop = (await page.locator('.bottom-nav').boundingBox()).y;
    expect(lastBottom).toBeLessThanOrEqual(footerTop);
    // Identity/scroll position reset when a bottom tab changes the view.
    await page.locator('.bottom-nav [data-view=routine]').click();
    await expect.poll(() => page.locator('#appMain').evaluate(el => el.scrollTop)).toBe(0);
    await expect(page.locator('#appShell .topbar')).not.toHaveClass(/is-scrolled/);
    await barsStayInPlace(page, selectors);
    await page.setViewportSize({ width: 390, height: 520 });
    await barsStayInPlace(page, selectors);
    // Actual header size, not a hard-coded offset, reserves the content space.
    await page.locator('#appShell .topbar').evaluate(el => { el.style.paddingBottom = '24px'; });
    await barsStayInPlace(page, selectors);
  });

  test(`admin header/footer stay fixed on long forms and reports (${viewport.width}px)`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto('/admin.html');
    await page.locator('#adminLoginForm button[type=submit]').click();
    await page.locator('.admin-bottom [data-admin-view=finance]').click();
    await page.locator('[data-finance-tab=reports]').click();
    await page.locator('#reportMonth').selectOption('all');
    const selectors = { header: '.admin-topbar', footer: '.admin-bottom', main: '#adminMain' };
    await barsStayInPlace(page, selectors);
    await page.locator('#adminMain').evaluate(el => { el.scrollTop = el.scrollHeight; });
    await expect.poll(() => page.locator('#adminMain').evaluate(el => el.scrollTop)).toBeGreaterThan(300);
    await barsStayInPlace(page, selectors);
    const last = page.locator('#reportCollectionList .report-payment').last();
    expect((await last.boundingBox()).y + (await last.boundingBox()).height).toBeLessThanOrEqual((await page.locator('.admin-bottom').boundingBox()).y);
    await last.locator('[data-action=view-receipt]').click();
    await expect(page.locator('#adminMain')).toHaveCSS('overflow-y', 'hidden');
    const scrollBefore = await page.locator('#adminMain').evaluate(el => el.scrollTop);
    await page.locator('[data-modal-action=close]').click();
    await expect(page.locator('#adminMain')).toHaveCSS('overflow-y', 'auto');
    expect(await page.locator('#adminMain').evaluate(el => el.scrollTop)).toBe(scrollBefore);
    await page.locator('.admin-bottom [data-admin-view=more]').click();
    await expect.poll(() => page.locator('#adminMain').evaluate(el => el.scrollTop)).toBe(0);
    await barsStayInPlace(page, selectors);
    await page.setViewportSize({ width: 390, height: 520 });
    await barsStayInPlace(page, selectors);
    await page.locator('.admin-topbar').evaluate(el => { el.style.height = '90px'; });
    await barsStayInPlace(page, selectors);
  });
}

for (const entry of ['index.html', 'admin.html']) {
  test(`login header stays fixed while the auth form scrolls (${entry})`, async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 400 });
    await page.goto('/' + entry);
    await page.locator('.auth-screen').evaluate(el => { el.scrollTop = el.scrollHeight; });
    await expect.poll(() => page.locator('.auth-screen').evaluate(el => el.scrollTop)).toBeGreaterThan(0);
    expect((await page.locator('.auth-topbar').boundingBox()).y).toBe(0);
    expect(await page.evaluate(() => window.scrollY)).toBe(0);
    if (entry === 'index.html') {
      await page.locator('.auth-tab[data-auth-tab=register]').click();
      await expect.poll(() => page.locator('#authScreen').evaluate(el => el.scrollTop)).toBe(0);
    }
  });
}

test('pending account confirmation still scrolls to its logout button', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 400 });
  await page.addInitScript(() => localStorage.setItem('active-plus-account-v1', JSON.stringify({ status: 'pending', studentId: 'PENDING-1', student: { name: 'শিক্ষার্থী' } })));
  await page.goto('/index.html');
  await expect(page.locator('#pendingScreen')).toBeVisible();
  await expect(page.locator('.bottom-nav')).toBeHidden();
  await page.locator('#pendingScreen').evaluate(el => { el.scrollTop = el.scrollHeight; });
  await expect.poll(() => page.locator('#pendingScreen').evaluate(el => el.scrollTop)).toBeGreaterThan(0);
  await page.locator('#pendingLogout').click();
  await expect(page.locator('#authScreen')).toBeVisible();
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
});
