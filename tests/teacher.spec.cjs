const { test, expect } = require('./fixtures.cjs');
const KEY = 'activePlus.teaching.v1';
test.use({ viewport: { width: 390, height: 844 } });
async function enter(page) {
  await page.goto('/teacher.html'); await page.locator('#teacherEnter').click(); await expect(page.locator('#teacherShell')).toBeVisible();
}
async function create(page, type, title, overrides = {}) {
  const nav = ['suggestion'].includes(type) ? 'more' : type;
  await page.locator(`.admin-bottom [data-teacher-view=${nav}]`).click();
  if (type === 'suggestion') await page.locator('#teacherMore [data-teacher-view=suggestion]').click();
  await page.locator('#teacherNewActivity').click();
  await page.locator('#activity-title').fill(title);
  await page.locator('#activity-subject').fill('গণিত');
  await page.locator('#activity-details').fill('প্রথম অধ্যায় পড়বে।\nঅনুশীলনী ১ সমাধান করবে।');
  await page.locator('#activity-status').selectOption(overrides.status || 'published');
  if (type !== 'suggestion') { await page.locator('#activity-date').fill('2026-10-01'); await page.locator('#activity-time').fill('17:00'); }
  for (const [key, value] of Object.entries(overrides)) {
    if (['status', 'className'].includes(key)) await page.locator(`#activity-${key}`).selectOption(value);
    else await page.locator(`#activity-${key}`).fill(value);
  }
  await page.locator('#teacherActivityForm [type=submit]').click();
  await expect(page.locator('#teacherModalBackdrop')).toBeHidden();
  return page.locator('#teacherRecordList .teaching-card').filter({ has: page.getByRole('heading', { name: title, exact: true }) });
}
async function studentPage(context) {
  const page = await context.newPage(); await page.goto('/index.html');
  if (await page.locator('#authScreen').isVisible()) await page.locator('#demoLoginButton').click();
  await page.locator('.bottom-nav [data-view=courses]').click(); return page;
}
async function seed(page, activities) {
  await page.evaluate(async activities => {
    const { teachingRepository: repo } = await import('/js/teaching-data.js');
    for (const a of activities) await repo.saveActivity({ type: 'suggestion', title: 'শিক্ষকের নোট', subject: 'গণিত', className: 'দশম শ্রেণি', status: 'published', ...a });
  }, activities);
}

test('exam CRUD, draft isolation, zero marks and reload persistence', async ({ page, context }) => {
  await enter(page);
  let card = await create(page, 'exam', 'গণিত মূল্যায়ন', { status: 'draft', group: 'বিজ্ঞান' });
  await expect(card.locator('[data-record-action=progress]')).toHaveCount(0);
  const student = await studentPage(context);
  await expect(student.locator('#learningList .teaching-card')).toHaveCount(0);
  await card.locator('[data-record-action=edit]').click(); await page.locator('#activity-status').selectOption('published'); await page.locator('#teacherActivityForm [type=submit]').click();
  await expect(student.locator('#learningList')).toContainText('গণিত মূল্যায়ন');
  await card.locator('[data-record-action=progress]').click();
  await expect(page.locator('[data-progress-id]')).toHaveCount(2);
  await page.locator('[data-progress-id="AP-1024"]').fill('0');
  await page.locator('[data-progress-id="260810021"]').fill('88');
  await page.locator('#teacherProgressForm [type=submit]').click();
  await student.locator('.bottom-nav [data-view=results]').click();
  await expect(student.locator('#teacherResultsList')).toContainText('প্রাপ্ত নম্বর: ০ / ১০০');
  await expect(student.locator('#teacherResultsList')).not.toContainText('৮৮');
  await page.reload(); await page.locator('#teacherEnter').click(); await page.locator('.admin-bottom [data-teacher-view=exam]').click();
  card = page.locator('#teacherRecordList .teaching-card'); await card.locator('[data-record-action=progress]').click();
  await expect(page.locator('[data-progress-id="AP-1024"]')).toHaveValue('0'); await page.locator('#teacherModalClose').click();
  await card.locator('[data-record-action=edit]').click(); await page.locator('#activity-totalMarks').fill('80'); await page.locator('#teacherActivityForm [type=submit]').click();
  await expect(page.locator('#teacherSaveError')).toContainText('পূর্ণমান'); await expect(page.locator('#activity-totalMarks')).toHaveValue('80'); await page.locator('#teacherModalClose').click();
  await card.locator('[data-record-action=delete]').click(); await page.locator('[data-close-teacher]').click(); await expect(card).toBeVisible();
  await card.locator('[data-record-action=delete]').click(); await page.locator('#teacherDeleteForm [type=submit]').click();
  await expect(page.locator('#teacherRecordList .teaching-card')).toHaveCount(0);
  await expect(student.locator('#teacherResultsBoard')).toBeHidden();
});

test('homework student self-report is visible to teacher, review is visible to student', async ({ page, context }) => {
  await enter(page); const card = await create(page, 'homework', 'আজকের বাড়ির কাজ');
  const student = await studentPage(context);
  await student.locator('[data-learning-filter=homework]').click();
  await expect(student.locator('#learningList')).toContainText('খাতা/ফাইল জমা নয়');
  await student.locator('[data-complete-homework]').click();
  await expect(student.locator('#learningList .learning-outcome')).toHaveText('সম্পন্ন জানিয়েছে');
  await card.locator('[data-record-action=progress]').click(); await expect(page.locator('[data-progress-id="AP-1024"]')).toHaveValue('done');
  await page.locator('[data-progress-id="AP-1024"]').selectOption('reviewed'); await page.locator('#teacherProgressForm [type=submit]').click();
  await expect(student.locator('#learningList .learning-outcome')).toHaveText('দেখা হয়েছে');
  await expect(student.locator('[data-complete-homework]')).toHaveCount(0);
});

test('routine creation, attendance, schedule conflicts and student routine', async ({ page, context }) => {
  await enter(page); const card = await create(page, 'routine', 'অতিরিক্ত গণিত ক্লাস', { room: 'কক্ষ ২' });
  await card.locator('[data-record-action=progress]').click(); await page.locator('[data-progress-id="AP-1024"]').selectOption('present'); await page.locator('#teacherProgressForm [type=submit]').click();
  const student = await studentPage(context); await student.locator('.bottom-nav [data-view=routine]').click();
  await expect(student.locator('#teacherRoutineList')).toContainText('অতিরিক্ত গণিত ক্লাস'); await expect(student.locator('#teacherRoutineList')).toContainText('উপস্থিত');
  await expect(student.locator('#teacherRoutineList')).toContainText('কক্ষ ২');
  await page.locator('#teacherNewActivity').click(); await page.locator('#activity-title').fill('সংঘর্ষ'); await page.locator('#activity-subject').fill('বাংলা');
  await page.locator('#activity-date').fill('2026-10-01'); await page.locator('#activity-time').fill('17:30'); await page.locator('#activity-status').selectOption('published');
  await page.locator('#teacherActivityForm [type=submit]').click(); await expect(page.locator('#teacherSaveError')).toContainText('আরেকটি ক্লাস/পরীক্ষা');
});

test('suggestions, subject links, class/group scope, draft filter and escaped content', async ({ page, context }) => {
  await enter(page);
  await create(page, 'suggestion', '<img src=x onerror=alert(1)> সাজেশন', { resourceURL: 'https://example.com/notes', group: 'বিজ্ঞান বিভাগ' });
  await create(page, 'suggestion', 'অন্য শ্রেণির সাজেশন', { className: 'নবম শ্রেণি' });
  await create(page, 'suggestion', 'অন্য বিভাগের সাজেশন', { group: 'মানবিক' });
  await create(page, 'suggestion', 'খসড়া সাজেশন', { status: 'draft' });
  await page.locator('[data-status=draft]').click(); await expect(page.locator('#teacherRecordList .teaching-card')).toHaveCount(1);
  const student = await studentPage(context); await student.locator('[data-learning-filter=suggestion]').click();
  await expect(student.locator('#learningList .teaching-card')).toHaveCount(1); await expect(student.locator('#learningList img')).toHaveCount(0);
  await expect(student.locator('.teaching-resource')).toHaveAttribute('href', 'https://example.com/notes');
  await expect(student.locator('#learningList')).not.toContainText('অন্য'); await expect(student.locator('#learningList')).not.toContainText('খসড়া');
  await expect(student.locator('[data-record-action]')).toHaveCount(0);
});

test('write failure keeps entered work and does not falsely save; corrupt storage fails closed', async ({ page }) => {
  await enter(page); await page.locator('[data-new-activity=homework]').click();
  await page.locator('#activity-title').fill('হারাবে না'); await page.locator('#activity-subject').fill('গণিত');
  await page.evaluate(key => { const real = Storage.prototype.setItem; Storage.prototype.setItem = function(k, v) { if (k === key) throw new DOMException('quota', 'QuotaExceededError'); return real.call(this, k, v); }; }, KEY);
  await page.locator('#teacherActivityForm [type=submit]').click(); await expect(page.locator('#teacherSaveError')).toContainText('সংরক্ষণ হয়নি');
  await expect(page.locator('#activity-title')).toHaveValue('হারাবে না'); await expect(page.locator('#teacherActivityForm [type=submit]')).toBeEnabled();
  expect(await page.evaluate(key => localStorage.getItem(key), KEY)).toBeNull(); await expect(page.locator('.admin-toast')).toHaveCount(0);
  await page.reload(); await page.evaluate(key => localStorage.setItem(key, '{broken'), KEY); await page.locator('#teacherEnter').click();
  await expect(page.locator('#teacherEntryError')).toBeVisible(); await expect(page.locator('#teacherShell')).toBeHidden();
  expect(await page.evaluate(key => localStorage.getItem(key), KEY)).toBe('{broken');
});

test('student roster needs query, matches Bengali mobile/ID, excludes pending and empty results', async ({ page }) => {
  await enter(page); await page.locator('.admin-bottom [data-teacher-view=more]').click(); await page.locator('[data-teacher-view=students]').click();
  await expect(page.locator('#teacherStudentList .teaching-card')).toHaveCount(0);
  await page.locator('#teacherStudentSearch').fill('০১৭০০০০০০০০'); await expect(page.locator('#teacherStudentList')).toContainText('রাইসা ইসলাম');
  await page.locator('[data-student-detail]').click(); await expect(page.locator('#teacherModalBody')).toContainText('এখনও কোনো নম্বর'); await page.keyboard.press('Escape');
  await page.locator('#teacherStudentSearch').fill('260909032'); await expect(page.locator('#teacherStudentList')).toHaveText('কোনো শিক্ষার্থী পাওয়া যায়নি');
  await page.locator('#teacherStudentSearch').fill(''); await expect(page.locator('#teacherStudentList .teaching-card')).toHaveCount(0);
});

for (const viewport of [{ width: 320, height: 740 }, { width: 390, height: 844 }, { width: 844, height: 390 }, { width: 1280, height: 800 }]) {
  test(`mobile-only teacher panel: fixed bars, five tabs and reachable modal (${viewport.width}px)`, async ({ page }) => {
    await page.setViewportSize(viewport); await enter(page);
    await expect(page.locator('.admin-bottom-item')).toHaveCount(5);
    await seed(page, Array.from({ length: 6 }, (_, i) => ({ title: `সাজেশন ${i}` })));
    await expect(page.locator('#teacherRecent .teaching-card')).toHaveCount(5);
    await page.locator('#teacherMain').evaluate(el => { el.scrollTop = el.scrollHeight; });
    await expect.poll(() => page.evaluate(() => {
      const top = document.querySelector('.admin-topbar').getBoundingClientRect(), foot = document.querySelector('.admin-bottom').getBoundingClientRect(), main = document.querySelector('#teacherMain').getBoundingClientRect();
      return Math.abs(top.top) < 1 && Math.abs(foot.bottom - innerHeight) < 1 && Math.abs(main.top - top.bottom) <= 1 && Math.abs(main.bottom - foot.top) <= 1 && document.documentElement.scrollWidth <= innerWidth && document.querySelector('#teacherShell').offsetWidth <= 480 && window.scrollY === 0;
    })).toBe(true);
    await page.locator('.admin-bottom [data-teacher-view=exam]').click(); await expect.poll(() => page.locator('#teacherMain').evaluate(el => el.scrollTop)).toBe(0);
    await page.locator('#teacherNewActivity').click(); await expect(page.locator('#teacherMain')).toHaveCSS('overflow-y', 'hidden');
    await page.locator('#activity-title').fill('মোবাইল পরীক্ষা'); await page.locator('#activity-subject').fill('গণিত');
    const submit = page.locator('#teacherActivityForm [type=submit]'); await submit.scrollIntoViewIfNeeded();
    const rect = await submit.boundingBox(); expect(rect.y + rect.height).toBeLessThanOrEqual(viewport.height);
    await expect(page.locator('#activity-title')).toHaveCSS('font-size', '16px');
    await submit.click(); await expect(page.locator('#teacherModalBackdrop')).toBeHidden();
    await expect(page.locator('#teacherRecordList')).toContainText('মোবাইল পরীক্ষা');
  });
}

test('teacher page, modules and student feed work offline after precache', async ({ page, context }) => {
  await enter(page); await page.evaluate(async () => { await navigator.serviceWorker.ready; });
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
  await context.setOffline(true); await page.reload(); await page.locator('#teacherEnter').click();
  await create(page, 'suggestion', 'অফলাইন সাজেশন');
  const student = await studentPage(context); await expect(student.locator('#learningList')).toContainText('অফলাইন সাজেশন');
  await context.setOffline(false);
});

test('login and Admin More expose the separate panel', async ({ page }) => {
  await page.goto('/index.html'); await expect(page.locator('#authScreen a[href="teacher.html"]')).toBeVisible();
  await page.goto('/admin.html'); await page.locator('#adminLoginForm [type=submit]').click(); await page.locator('.admin-bottom [data-admin-view=more]').click();
  await page.locator('a[href="teacher.html"]').click(); await expect(page.locator('#teacherEnter')).toBeVisible();
});

test('profile class changes immediately re-scope the student feed and teacher roster', async ({ page, context }) => {
  await enter(page); await seed(page, [{ title: 'দশমের কাজ' }, { title: 'নবমের কাজ', className: 'নবম শ্রেণি' }]);
  const student = await studentPage(context); await expect(student.locator('#learningList')).toContainText('দশমের কাজ');
  await student.locator('.bottom-nav [data-view=profile]').click(); await student.locator('#profileView [data-action=edit-profile]').first().click();
  await student.locator('#classInput').selectOption('নবম শ্রেণি'); await student.locator('#profileForm [type=submit]').click();
  await student.locator('.bottom-nav [data-view=courses]').click();
  await expect(student.locator('#learningList')).toContainText('নবমের কাজ'); await expect(student.locator('#learningList')).not.toContainText('দশমের কাজ');
  await page.locator('.admin-bottom [data-teacher-view=more]').click(); await page.locator('[data-teacher-view=students]').click();
  await page.locator('#teacherStudentSearch').fill('AP-1024'); await expect(page.locator('#teacherStudentList')).toContainText('নবম শ্রেণি');
});

test('concurrent teacher tabs preserve both saves and immediately refresh each other', async ({ page, context }) => {
  await enter(page); const other = await context.newPage(); await enter(other);
  await Promise.all([seed(page, [{ title: 'প্রথম ট্যাবের কাজ' }]), seed(other, [{ title: 'দ্বিতীয় ট্যাবের কাজ' }])]);
  await expect(page.locator('#teacherRecent .teaching-card')).toHaveCount(2); await expect(other.locator('#teacherRecent .teaching-card')).toHaveCount(2);
  expect(await page.evaluate(key => JSON.parse(localStorage.getItem(key)).activities.length, KEY)).toBe(2);
});
