const { test, expect } = require('./fixtures.cjs');
const mobileViews = ['dashboard', 'students', 'finance', 'routine', 'more'];
const moreViews = ['notices', 'app-management', 'classes', 'exams', 'reports'];
async function enter(page) {
  await page.goto('/admin.html');
  await page.locator('#adminLoginForm button[type=submit]').click();
}
async function bottom(page, view) {
  await page.locator(`.admin-bottom [data-admin-view="${view}"]`).click();
}
for (const width of [320, 390]) {
  test(`compact dashboard and five-item mobile footer (${width}px)`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.clock.setFixedTime(new Date('2026-09-22T12:00:00Z'));
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await enter(page);
    const footer = page.locator('.admin-bottom');
    await expect(footer.locator('button')).toHaveCount(5);
    expect(await footer.locator('button').evaluateAll(buttons => buttons.map(b => b.dataset.adminView))).toEqual(mobileViews);
    await expect(page.locator('#dashTitle')).toBeVisible();
    await expect(page.locator('#adminTodayDate')).toHaveText('২২ সেপ্টেম্বর ২০২৬');
    await expect(page.locator('#adminTodayDate')).toHaveAttribute('datetime', '2026-09-22');
    await expect(page.locator('.admin-hero-stats .admin-stat-tile')).toHaveCount(2);
    await expect(page.locator('#dashPendingCount')).toHaveText('৩');
    await expect(page.locator('#dashAppStatusRow, #dashTodayList, #dashPendingList, #dashNoticeCount')).toHaveCount(0);
    const shortcut = await page.locator('#dashCollectFee').boundingBox();
    const footerBox = await footer.boundingBox();
    expect(shortcut.y + shortcut.height).toBeLessThan(footerBox.y);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    for (const view of mobileViews) {
      await bottom(page, view);
      await expect(page.locator(`.admin-view[data-view-panel="${view}"]`)).toBeVisible();
      await expect(footer.locator('[aria-current=page]')).toHaveCount(1);
      await expect(footer.locator('[aria-current=page]')).toHaveAttribute('data-admin-view', view);
    }
    await expect(page.locator('.admin-more-item')).toHaveCount(6);
    for (const view of moreViews) {
      const button = page.locator(`.admin-more-item[data-admin-view="${view}"]`);
      await button.focus();
      await page.keyboard.press('Enter');
      const panel = page.locator(`.admin-view[data-view-panel="${view}"]`);
      await expect(panel).toBeVisible();
      await expect(panel.locator('h1')).toBeFocused();
      await expect(footer.locator('[aria-current=page]')).toHaveAttribute('data-admin-view', 'more');
      await panel.locator('.admin-more-back').click();
      await expect(page.locator('#moreTitle')).toBeFocused();
      await expect(page.locator('.admin-more-menu')).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    }
    await bottom(page, 'finance');
    await page.locator('#btnFinanceGoReport').click();
    await expect(page.locator('.admin-view[data-view-panel=reports]')).toBeVisible();
    await bottom(page, 'dashboard');
    await page.locator('#dashCollectFee').click();
    await expect(page.locator('[data-finance-view=collection]')).toBeVisible();
    await expect(page.locator('#feeStudentSearch')).toBeFocused();
    await expect(footer.locator('[aria-current=page]')).toHaveAttribute('data-admin-view', 'finance');
    expect(errors).toEqual([]);
  });
}

test('pending summary opens pending-only list and updates after approval', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await enter(page);
  await bottom(page, 'students');
  await page.locator('#studentSearch').fill('রাইসা');
  await page.locator('[data-student-filter=approved]').click();
  await bottom(page, 'dashboard');
  await page.locator('.admin-hero-foot').click();
  await expect(page.locator('#studentSearch')).toHaveValue('');
  await expect(page.locator('[data-student-filter=pending]')).toHaveClass(/active/);
  await expect(page.locator('#studentList .student-row')).toHaveCount(3);
  await page.locator('#studentList [data-action=approve]').first().click();
  await expect(page.locator('#studentList .student-row')).toHaveCount(2);
  await bottom(page, 'dashboard');
  await expect(page.locator('#dashPendingCount')).toHaveText('২');
});

test('secondary controls remain functional and dashboard updates without removed nodes', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await enter(page);
  const original = await page.locator('#dashClassCount').innerText();
  await bottom(page, 'more');
  await page.locator('.admin-more-item[data-admin-view=classes]').click();
  const enabled = page.locator('#classList input:checked');
  const count = await enabled.count();
  const className = await enabled.first().getAttribute('data-class-name');
  await page.locator(`#classList input[data-class-name="${className}"]`).uncheck({ force: true });
  await bottom(page, 'dashboard');
  const newCount = String(count - 1).replace(/\d/g, digit => '০১২৩৪৫৬৭৮৯'[digit]);
  await expect(page.locator('#dashClassCount')).toHaveText(newCount);
  expect(newCount).not.toBe(original);
  await bottom(page, 'more');
  await page.locator('.admin-more-item[data-admin-view=notices]').click();
  await page.locator('#noticeTitle').fill('নতুন নোটিশ');
  await page.locator('#noticeBody').fill('আগামীকালের ক্লাসের সময়সূচি দেখুন।');
  await page.locator('#noticeForm button[type=submit]').click();
  await expect(page.locator('#noticeList')).toContainText('নতুন নোটিশ');
  await bottom(page, 'more');
  await page.locator('.admin-more-item[data-admin-view=app-management]').click();
  await expect(page.locator('#cfgMaintenanceMode')).toBeAttached();
  await page.locator('#btnSaveTopAppSettings').click();
  await expect(page.locator('.admin-toast')).toContainText('সংরক্ষিত');
  expect(errors).toEqual([]);
});

test('wide viewport keeps the same five-item mobile interface without a sidebar', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await enter(page);
  await expect(page.locator('.admin-side, .admin-nav-item')).toHaveCount(0);
  await expect(page.locator('.admin-bottom')).toBeVisible();
  await expect(page.locator('.admin-bottom button')).toHaveCount(5);
  expect((await page.locator('#adminShell').boundingBox()).width).toBe(480);
  for (const view of mobileViews) {
    await bottom(page, view);
    await expect(page.locator(`.admin-view[data-view-panel="${view}"]`)).toBeVisible();
    await expect(page.locator('.admin-bottom [aria-current=page]')).toHaveAttribute('data-admin-view', view);
  }
  for (const view of moreViews) {
    await page.locator(`.admin-more-item[data-admin-view="${view}"]`).click();
    await expect(page.locator(`.admin-view[data-view-panel="${view}"]`)).toBeVisible();
    await expect(page.locator('.admin-bottom [aria-current=page]')).toHaveAttribute('data-admin-view', 'more');
    await page.locator('.admin-view.active .admin-more-back').click();
  }
});
