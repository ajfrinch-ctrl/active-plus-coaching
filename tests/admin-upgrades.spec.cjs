/* Admin upgrades: routine form controls, student privacy + editing, dashboard money
   summary, the dedicated Report Center downloads and teacher registration control. */
const { test, expect } = require('./fixtures.cjs');
const fs = require('node:fs/promises');

test.use({ viewport: { width: 390, height: 844 } });

async function enter(page) {
  await page.goto('/admin.html');
  await page.locator('#adminLoginForm button[type=submit]').click();
  await expect(page.locator('#adminShell')).toBeVisible();
}
async function bottom(page, view) {
  await page.locator(`.admin-bottom [data-admin-view=${view}]`).click();
}

test('dashboard shows today and this-month money summary with a details shortcut', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-09-22T12:00:00Z'));
  await enter(page);
  await expect(page.locator('#dashTodayAmount')).toHaveText('৳৩,০০০');
  await expect(page.locator('#dashTodaySub')).toHaveText('২ টি লেনদেন');
  await expect(page.locator('#dashMonthAmount')).toHaveText('৳৫,৮০০');
  await expect(page.locator('#dashMonthSub')).toHaveText('সেপ্টেম্বর ২০২৬');
  await expect(page.locator('#dashMonthDue')).toHaveText('৳১,৫০০');
  await expect(page.locator('#dashTotalAmount')).toHaveText('৳১২,৩০০');
  await page.locator('[data-admin-view=finance]').filter({ hasText: 'বিস্তারিত হিসাব' }).click();
  await expect(page.locator('[data-view-panel=finance]')).toBeVisible();
});

test('routine form: class selector, teacher dropdown and subject autofill', async ({ page }) => {
  await enter(page);
  await bottom(page, 'routine');
  // Class dropdown offers every enabled class; teacher dropdown lists the routine teachers.
  await expect(page.locator('#routineClass option')).toHaveCount(13);
  await expect(page.locator('#routineTeacher option')).toHaveCount(7);
  await expect(page.locator('#routineTeacher')).toContainText('মো. সাইফুল ইসলাম');
  // Subject autofill starts from the subjects already in the routine.
  await expect(page.locator('#routineSubjectList option[value="উচ্চতর গণিত"]')).toHaveCount(1);
  await page.locator('#routineSubject').fill('গণিত ল্যাব');
  await page.locator('#routineClass').selectOption('নবম শ্রেণি');
  await page.locator('#routineTeacher').selectOption('তানভীর আহমেদ');
  await page.locator('#routineRoom').fill('রুম ৩০৫');
  await page.locator('#addRoutineForm button[type=submit]').click();
  await expect(page.locator('.admin-toast')).toContainText('নবম শ্রেণি • গণিত ল্যাব');
  const row = page.locator('.routine-row', { hasText: 'গণিত ল্যাব' });
  await expect(row).toContainText('নবম শ্রেণি');
  await expect(row).toContainText('তানভীর আহমেদ');
  // The new subject is remembered: it appears in the autofill list and stays in the input.
  await expect(page.locator('#routineSubjectList option[value="গণিত ল্যাব"]')).toHaveCount(1);
  await expect(page.locator('#routineSubject')).toHaveValue('গণিত ল্যাব');
  // Second entry with the same subject only needs class/teacher/room again.
  await page.locator('#routineClass').selectOption('নবম শ্রেণি');
  await page.locator('#routineTeacher').selectOption('তানভীর আহমেদ');
  await page.locator('#routineRoom').fill('রুম ৩০৬');
  await page.locator('#addRoutineForm button[type=submit]').click();
  await expect(page.locator('.routine-row', { hasText: 'গণিত ল্যাব' })).toHaveCount(2);
});

test('student management hides personal info until selected and supports editing', async ({ page }) => {
  await enter(page);
  await bottom(page, 'students');
  await expect(page.locator('#studentList .student-row')).toHaveCount(8);
  // Nothing personal leaks in the hidden list: no names or mobile numbers.
  await expect(page.locator('#studentList')).not.toContainText('রাইসা');
  await expect(page.locator('#studentList')).not.toContainText('01700000000');
  await expect(page.locator('#studentList')).not.toContainText('০১৭০০০০০০০০');
  await expect(page.locator('#studentList')).toContainText('AP-1024');
  // Selecting reveals the record.
  await page.locator('#studentList [data-action=view][data-id="AP-1024"]').click();
  await expect(page.locator('#adminModalBackdrop')).toBeVisible();
  await expect(page.locator('#adminModalTitle')).toHaveText('রাইসা ইসলাম');
  await expect(page.locator('#adminModalBody')).toContainText('০১৭০০০০০০০০');
  await page.keyboard.press('Escape');
  // Editing: validation errors first, then a successful save.
  await page.locator('#studentList [data-action=edit][data-id="AP-1024"]').click();
  await page.locator('#editStudentName').fill('');
  await page.locator('#studentEditForm button[type=submit]').click();
  await expect(page.locator('#studentEditError')).toContainText('নাম');
  await page.locator('#editStudentName').fill('রাইসা ইসলাম (সম্পাদিত)');
  await page.locator('#editStudentMobile').fill('123');
  await page.locator('#studentEditForm button[type=submit]').click();
  await expect(page.locator('#studentEditError')).toContainText('১১ সংখ্যার');
  await page.locator('#editStudentMobile').fill('01711111111');
  await page.locator('#editStudentFee').fill('2000');
  await page.locator('#studentEditForm button[type=submit]').click();
  await expect(page.locator('.admin-toast')).toContainText('সম্পাদনা করা হয়েছে');
  await expect(page.locator('#studentList')).not.toContainText('রাইসা');
  // The saved record and the finance ledger both reflect the edit.
  await page.locator('#studentList [data-action=view][data-id="AP-1024"]').click();
  await expect(page.locator('#adminModalTitle')).toHaveText('রাইসা ইসলাম (সম্পাদিত)');
  await expect(page.locator('#adminModalBody')).toContainText('০১৭১১১১১১১১');
  await page.keyboard.press('Escape');
  await bottom(page, 'finance');
  await page.locator('#feeStudentSearch').fill('রাইসা');
  await page.locator('.fee-search-result').first().click();
  await expect(page.locator('#feeQuickProfile')).toContainText('রাইসা ইসলাম (সম্পাদিত)');
  await expect(page.locator('.fee-balance-grid dd').first()).toHaveText('৳২,০০০');
  await bottom(page, 'students');
  await expect(page.locator('#studentList')).not.toContainText('01711111111');
});

test('report center: filters, live totals and PDF/CSV downloads', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-09-22T12:00:00Z'));
  await enter(page);
  await bottom(page, 'more');
  await page.locator('.admin-more-item[data-admin-view=reports]').click();
  await expect(page.locator('#reportsTitle')).toBeVisible();
  // Filter dropdowns are populated from the shared dataset.
  await expect(page.locator('#reportClass option')).toHaveCount(13);
  await expect(page.locator('#reportFeeType option')).toHaveCount(7);
  await expect(page.locator('#reportMethod option')).toHaveCount(6);
  // Defaults to the running month.
  await expect(page.locator('#reportTrxCount')).toHaveText('৪ টি');
  await expect(page.locator('#reportGrandTotal')).toHaveText('৳৫,৮০০');
  await page.locator('#reportMonth').selectOption('all');
  await expect(page.locator('#reportTrxCount')).toHaveText('৭ টি');
  await expect(page.locator('#reportGrandTotal')).toHaveText('৳১২,৩০০');
  // Quick report cards summarize without any configuration.
  await expect(page.locator('#reportMeta-today')).toHaveText('২ টি লেনদেন • ৳৩,০০০');
  await expect(page.locator('#reportMeta-dues')).toHaveText('১ জনের বকেয়া • ৳১,৫০০');
  await expect(page.locator('#reportMeta-students')).toContainText('মোট ৮ জন');
  await expect(page.locator('#reportMeta-routine')).toContainText('ক্লাস');
  // PDF download is a real PDF file.
  const pdfDownload = page.waitForEvent('download');
  await page.locator('[data-report-pdf=collection]').click();
  const pdf = await pdfDownload;
  expect(pdf.suggestedFilename()).toMatch(/^APC-collection-report-.*\.pdf$/);
  const pdfBytes = await fs.readFile(await pdf.path());
  expect(pdfBytes.toString('latin1').startsWith('%PDF-1.4')).toBe(true);
  // CSV download opens in Excel with the Bangla header row intact.
  const csvDownload = page.waitForEvent('download');
  await page.locator('[data-report-csv=collection]').click();
  const csv = await csvDownload;
  expect(csv.suggestedFilename()).toMatch(/^APC-collection-report-.*\.csv$/);
  const csvText = (await fs.readFile(await csv.path())).toString('utf8');
  expect(csvText.startsWith('\uFEFF')).toBe(true);
  expect(csvText).toContain('"তারিখ"');
  expect(csvText).toContain('রাইসা ইসলাম');
  // Dues report download works as well.
  const duesDownload = page.waitForEvent('download');
  await page.locator('[data-report-pdf=dues]').click();
  expect((await duesDownload).suggestedFilename()).toMatch(/^APC-dues-report-.*\.pdf$/);
});

test('teacher registration is controlled from the admin panel and enforced in teacher.html', async ({ page }) => {
  await enter(page);
  await bottom(page, 'more');
  await page.locator('.admin-more-item[data-admin-view=app-management]').click();
  await expect(page.locator('#cfgTeacherRegistration')).toBeChecked();
  await expect(page.locator('#teacherRegBadge')).toHaveText('খোলা আছে');
  await expect(page.locator('#teacherRegList')).toContainText('মো. সাইফুল ইসলাম');
  // Turn registration off; the badge reacts instantly and saving enforces it.
  await page.locator('#cfgTeacherRegistration').evaluate(el => el.click());
  await expect(page.locator('#teacherRegBadge')).toHaveText('বন্ধ আছে');
  await page.locator('#btnSaveTopAppSettings').click();
  await expect(page.locator('.admin-toast')).toContainText('বন্ধ');
  await page.goto('/teacher.html');
  await expect(page.locator('#teacherRegNotice')).toBeVisible();
  await expect(page.locator('#teacherEnter')).toBeDisabled();
  // Re-open registration from the admin panel.
  await page.goto('/admin.html');
  await page.locator('#adminLoginForm button[type=submit]').click();
  await expect(page.locator('#adminShell')).toBeVisible();
  await bottom(page, 'more');
  await page.locator('.admin-more-item[data-admin-view=app-management]').click();
  await page.locator('#cfgTeacherRegistration').evaluate(el => el.click());
  await page.locator('#btnSaveTopAppSettings').click();
  await expect(page.locator('.admin-toast')).toContainText('খোলা আছে');
  await page.goto('/teacher.html');
  await expect(page.locator('#teacherRegNotice')).toBeHidden();
  await page.locator('#teacherEnter').click();
  await expect(page.locator('#teacherShell')).toBeVisible();
});

test('class-wise, results and attendance reports download; class filter simplifies students', async ({ page }) => {
  await enter(page);
  // Seed a published exam with attempts and a routine session with attendance,
  // exactly what the teacher panel would save.
  await page.evaluate(async () => {
    const { buildDemoExams } = await import('/js/demo-data.js');
    const db = { version: 1, exams: [], attempts: [] };
    const fixtures = buildDemoExams(Date.now(), 'spec');
    db.exams.push(...fixtures.exams);
    db.attempts.push(...fixtures.attempts);
    localStorage.setItem('activePlus.exams.v1', JSON.stringify(db));
    const { teachingRepository } = await import('/js/teaching-data.js');
    const saved = await teachingRepository.saveActivity({
      type: 'routine', title: 'গণিত ক্লাস', subject: 'গণিত', className: 'দশম শ্রেণি', group: 'বিজ্ঞান বিভাগ',
      status: 'published', date: '2026-09-21', time: '16:00', duration: 60, details: '', room: 'রুম ২০৩'
    });
    const id = saved.activities.find(item => item.type === 'routine').id;
    await teachingRepository.saveProgress(id, { 'AP-1024': 'present', '260810021': 'absent' });
  });
  await page.reload();
  await enter(page);
  await bottom(page, 'more');
  await page.locator('.admin-more-item[data-admin-view=reports]').click();

  // Class-wise report: pick a class, see its students and open them in management.
  await page.locator('#classReportClass').selectOption('দশম শ্রেণি');
  await expect(page.locator('#reportMeta-class')).toContainText('৩ জন');
  await page.locator('#classReportGroup').selectOption('বিজ্ঞান বিভাগ');
  await expect(page.locator('#reportMeta-class')).toContainText('২ জন');
  const classPdf = page.waitForEvent('download');
  await page.locator('[data-report-pdf=class]').click();
  expect((await classPdf).suggestedFilename()).toMatch(/^APC-class-report-.*\.pdf$/);
  await page.locator('[data-action=open-class-students]').click();
  await expect(page.locator('[data-view-panel=students]')).toBeVisible();
  await expect(page.locator('#studentClassFilter')).toHaveValue('দশম শ্রেণি');
  await expect(page.locator('#studentSearch')).toHaveValue('বিজ্ঞান বিভাগ');
  await expect(page.locator('#studentList .student-row')).toHaveCount(2);
  // The same class filter works manually in student management.
  await page.locator('#studentClassFilter').selectOption('নবম শ্রেণি');
  await page.locator('#studentSearch').fill('');
  await expect(page.locator('#studentList .student-row')).toHaveCount(1);

  // Results report: online exam attempts, ranks, grades and absentees.
  await bottom(page, 'more');
  await page.locator('.admin-more-item[data-admin-view=reports]').click();
  const examValue = await page.locator('#resultExamSelect option', { hasText: 'সম্পন্ন MCQ' }).getAttribute('value');
  await page.locator('#resultExamSelect').selectOption(examValue);
  await expect(page.locator('#reportMeta-results')).toHaveText('জমা ৩ জন • অনুপস্থিত ১ জন');
  await page.locator('#resultClassFilter').selectOption('দশম শ্রেণি');
  await expect(page.locator('#reportMeta-results')).toHaveText('জমা ২ জন • অনুপস্থিত ০ জন');
  const resultsPdf = page.waitForEvent('download');
  await page.locator('[data-report-pdf=results]').click();
  expect((await resultsPdf).suggestedFilename()).toMatch(/^APC-results-report-.*\.pdf$/);

  // Attendance report: session picker with present/absent counts and rate.
  await page.locator('#attendanceSessionSelect').selectOption({ index: 1 });
  await expect(page.locator('#reportMeta-attendance')).toHaveText('উপস্থিত ১ জন • অনুপস্থিত ১ জন • হার ৫০%');
  const attendanceCsv = page.waitForEvent('download');
  await page.locator('[data-report-csv=attendance]').click();
  const csv = await attendanceCsv;
  expect(csv.suggestedFilename()).toMatch(/^APC-attendance-report-.*\.csv$/);
  const csvText = (await fs.readFile(await csv.path())).toString('utf8');
  expect(csvText).toContain('"উপস্থিতি"');
  expect(csvText).toContain('অনুপস্থিত');
});
