const { test, expect } = require('./fixtures.cjs');
const READ_KEY = 'activePlus.notices.read.v1:AP-1024';
const CONFIG_KEY = 'active-plus-app-config-v1';
test.use({ viewport: { width: 390, height: 844 } });
async function enter(page) {
  await page.goto('/index.html');
  await page.locator('#demoLoginButton').click();
  await expect(page.locator('#appShell')).toBeVisible();
}

test('only bell opens notices; read state survives closing, reload and offline', async ({ page, context }) => {
  await enter(page);
  await expect(page.locator('#noticeShortcut, #noticeStrip, .js-notice-open')).toHaveCount(0);
  await expect(page.locator('.notification-dot')).toBeVisible();
  await page.locator('#notificationButton').click();
  await expect(page.locator('#noticeModal')).toBeVisible();
  await expect(page.locator('.notification-dot')).toBeHidden();
  await expect(page.locator('#noticeListStudent .unread')).toHaveCount(0);
  await expect(page.locator('#noticeReadStatus')).toContainText('সব নোটিশ পড়া হয়েছে');
  await page.locator('#noticeModal .modal-action').click();
  await page.reload();
  await expect(page.locator('.notification-dot')).toBeHidden();
  await page.evaluate(async () => navigator.serviceWorker.ready);
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
  await context.setOffline(true); await page.reload();
  await expect(page.locator('.notification-dot')).toBeHidden();
  await page.locator('#notificationButton').click();
  await expect(page.locator('#noticeListStudent .notice-detail')).toHaveCount(3);
  await context.setOffline(false);
});

test('read receipts sync across tabs and edited broadcasts become unread without HTML injection', async ({ page, context }) => {
  await enter(page);
  const other = await context.newPage(); await other.goto('/index.html');
  await expect(other.locator('.notification-dot')).toBeVisible();
  await page.locator('#notificationButton').click();
  await expect(other.locator('.notification-dot')).toBeHidden();
  await page.locator('#noticeModal .modal-action').click();
  const message = '<img src=x onerror=alert(1)> নতুন ক্লাসের সময়';
  await other.evaluate(({ key, message }) => localStorage.setItem(key, JSON.stringify({ broadcastAlert: true, broadcastMessage: message })), { key: CONFIG_KEY, message });
  await expect(page.locator('.notification-dot')).toBeVisible();
  await expect(page.locator('#notificationButton')).toHaveAttribute('aria-label', 'নোটিশ দেখুন — ১টি অপঠিত');
  await page.locator('#notificationButton').click();
  await expect(page.locator('#noticeListStudent')).toContainText(message);
  await expect(page.locator('#noticeListStudent img')).toHaveCount(0);
  await expect(page.locator('.notification-dot')).toBeHidden();
  await page.reload(); await expect(page.locator('.notification-dot')).toBeHidden();
});

test('read state belongs to the student, not every account on the device', async ({ page }) => {
  await enter(page); await page.locator('#notificationButton').click();
  expect(await page.evaluate(key => JSON.parse(localStorage.getItem(key)).length, READ_KEY)).toBe(3);
  await page.evaluate(() => {
    const key = 'active-plus-account-v1', account = JSON.parse(localStorage.getItem(key));
    account.student.id = 'ANOTHER-STUDENT'; localStorage.setItem(key, JSON.stringify(account));
  });
  await page.reload(); await expect(page.locator('.notification-dot')).toBeVisible();
});

test('unreadable receipt storage is preserved and failed persistence is explained', async ({ page }) => {
  await enter(page);
  await page.evaluate(key => localStorage.setItem(key, '{broken'), READ_KEY);
  await page.reload(); await page.locator('#notificationButton').click();
  await expect(page.locator('.feedback-toast')).toContainText('ডিভাইসে সংরক্ষণ হয়নি');
  expect(await page.evaluate(key => localStorage.getItem(key), READ_KEY)).toBe('{broken');
  await expect(page.locator('.notification-dot')).toBeHidden();
  await page.reload(); await expect(page.locator('.notification-dot')).toBeVisible();
});

for (const width of [320, 390, 480]) {
  test(`work board: summary, filters, completion persistence and no overflow at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 }); await enter(page);
    await page.evaluate(async () => {
      const { teachingRepository: repo } = await import('/js/teaching-data.js');
      for (const type of ['homework', 'suggestion', 'routine']) await repo.saveActivity({ type, title: type === 'homework' ? 'বীজগণিত অনুশীলনী' : 'সহায়ক পাঠ', subject: 'গণিত', className: 'দশম শ্রেণি', status: 'published', date: '2026-10-01', time: '17:00', duration: 60, details: 'প্রথম অধ্যায়ের অনুশীলনী সমাধান করো।', room: 'কক্ষ ২' });
    });
    await page.locator('#teacherHomeLink').click();
    await expect(page.locator('#learningSummary strong')).toHaveText(['৩', '১', '০']);
    await page.locator('[data-learning-filter=homework]').click();
    await expect(page.locator('#learningList .learning-card')).toHaveCount(1);
    await page.locator('#learningList .learning-card-toggle').click();
    await expect(page.locator('#learningList .learning-meta')).toContainText('জমার শেষ সময়');
    await expect(page.locator('#learningList .learning-teacher')).toContainText('শিক্ষক');
    await page.locator('[data-complete-homework]').click();
    await expect(page.locator('#learningSummary strong')).toHaveText(['৩', '০', '১']);
    await expect(page.locator('#learningList .learning-state')).toHaveText('সম্পন্ন');
    await expect(page.locator('[data-complete-homework]')).toHaveCount(0);
    await page.reload(); await page.locator('.bottom-nav [data-view=courses]').click();
    await expect(page.locator('#learningSummary strong')).toHaveText(['৩', '০', '১']);
    await page.locator('[data-learning-filter=exam]').click();
    await expect(page.locator('#learningList .teacher-empty')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth && document.querySelector('#appMain').scrollWidth <= document.querySelector('#appMain').clientWidth)).toBe(true);
  });
}

test('courses view: half/half filter tiles (odd last full) and tap-to-see details', async ({ page }) => {
  await enter(page);
  await page.locator('.bottom-nav [data-view=courses]').click();
  // Category tiles: exactly two per row; the lone last tile spans the full row.
  const columns = await page.locator('#learningFilters').evaluate(el => getComputedStyle(el).gridTemplateColumns.trim().split(/\s+/).length);
  expect(columns).toBe(2);
  const rowWidth = await page.locator('#learningFilters').evaluate(el => el.getBoundingClientRect().width);
  const routineTile = await page.locator('[data-learning-filter=routine]').evaluate(el => el.getBoundingClientRect().width);
  const allTile = await page.locator('[data-learning-filter=all]').evaluate(el => el.getBoundingClientRect().width);
  expect(routineTile).toBeGreaterThan(rowWidth * 0.9); // last tile is full width
  expect(allTile).toBeLessThan(rowWidth * 0.6);        // first tile is half width

  // Teacher work cards: collapsed summary, tap reveals the full details.
  await page.evaluate(async () => {
    const { teachingRepository: repo } = await import('/js/teaching-data.js');
    await repo.saveActivity({ type: 'homework', title: 'রেখা ও কোণ', subject: 'জ্যামিতি', className: 'দশম শ্রেণি', status: 'published', date: '2026-10-02', time: '17:00', details: 'অনুশীলনী ৬.১ সমাধান করো।', room: 'কক্ষ ২' });
  });
  const card = page.locator('#learningList .learning-card').first();
  await expect(card.locator('.learning-brief')).toContainText('জমার শেষ সময়');
  await expect(card.locator('.learning-card-details')).toBeHidden();
  await card.locator('.learning-card-toggle').click();
  await expect(card.locator('.learning-card-details')).toBeVisible();
  await expect(card.locator('.teaching-body')).toContainText('অনুশীলনী ৬.১');
  await card.locator('.learning-card-toggle').click();
  await expect(card.locator('.learning-card-details')).toBeHidden();

  // Demo course list: tapping a subject reveals its detail rows.
  const course = page.locator('.course-item').first();
  await expect(course.locator('.course-item-details')).toBeHidden();
  await course.locator('summary').click();
  await expect(course.locator('.course-item-details')).toBeVisible();
  await expect(course.locator('.course-item-details')).toContainText('চলতি অধ্যায়');
  await course.locator('summary').click();
  await expect(course.locator('.course-item-details')).toBeHidden();
});

test('material button generates the PDF in-app offline; external links still download', async ({ page }) => {
  // Simulate a device that seeded demo fixtures while they still pointed at
  // the retired demo-study-notes file; prepareDemoData must clear those links
  // so the material button regenerates the sheet in-app instead of 404ing.
  await page.addInitScript(async () => {
    localStorage.setItem('activePlus.demo.autofill.v1', 'on');
    const { buildDemoTeaching } = await import('/js/demo-data.js');
    const activities = buildDemoTeaching(Date.now()).map(a => ({ ...a, resourceURL: 'https://example.com/demo-study-notes.txt' }));
    localStorage.setItem('activePlus.teaching.v1', JSON.stringify({ version: 1, activities }));
  });
  await enter(page);
  await page.locator('.bottom-nav [data-view=courses]').click();
  await page.locator('[data-learning-filter=suggestion]').click();

  const stored = await page.evaluate(async () => {
    const { teachingRepository } = await import('/js/teaching-data.js');
    const db = await teachingRepository.list();
    return db.activities.filter(a => a.demoFixture).map(a => a.resourceURL || '');
  });
  expect(stored.length).toBeGreaterThan(0);
  expect(stored.some(url => url.includes('demo-study-notes'))).toBe(false);

  // No external file: the button generates the sheet PDF inside the app.
  const card = page.locator('#learningList .learning-card').first();
  await card.locator('.learning-card-toggle').click();
  await card.locator('a.teaching-resource[data-material]').click();
  await expect(page.locator('#resourceModal')).toBeVisible();
  await expect(page.locator('#resourceModalMeta')).toContainText('ActivePlus-material-');
  const download = page.waitForEvent('download');
  await page.locator('#resourceDownload').click();
  const material = await download;
  expect(material.suggestedFilename()).toMatch(/^ActivePlus-material-[a-z]+-\d{4}-\d{2}-\d{2}\.pdf$/);
  const materialPath = await material.path();
  const { statSync, readFileSync } = require('node:fs');
  expect(statSync(materialPath).size).toBeGreaterThan(10000);
  expect(readFileSync(materialPath).slice(0, 5).toString()).toBe('%PDF-');
  const appSource = readFileSync('js/student-teaching.js', 'utf8');
  const successMessage = appSource.match(/status\.textContent = '([^']+)';\n    \} catch \{/)[1];
  await expect(page.locator('#resourceModalStatus')).toContainText(successMessage.slice(0, 12));
  await expect(page.locator('#resourceModal')).toBeVisible();
  await page.locator('#resourceModal .modal-action').click();
  await expect(page.locator('#resourceModal')).toBeHidden();

  // External files still download directly through the same popup.
  await page.evaluate(async () => {
    const { teachingRepository: repo } = await import('/js/teaching-data.js');
    await repo.saveActivity({ type: 'suggestion', title: 'Reference link card', subject: 'গণিত', className: 'দশম শ্রেণি', status: 'published', details: 'নমুনা বিবরণ।', resourceURL: new URL('/assets/icons/app-logo.png', location.href).href });
  });
  const external = page.locator('#learningList .learning-card').filter({ hasText: 'Reference link card' });
  await external.locator('.learning-card-toggle').click();
  await external.locator('a.teaching-resource:not([data-material])').click();
  await expect(page.locator('#resourceModalMeta')).toContainText('app-logo.png');
  const externalDownload = page.waitForEvent('download');
  await page.locator('#resourceDownload').click();
  expect((await externalDownload).suggestedFilename()).toBe('app-logo.png');
});
