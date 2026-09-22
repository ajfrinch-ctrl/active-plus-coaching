// These tests exercise the real default demo mode, unlike isolated domain tests.
const { test, expect } = require('@playwright/test');
const EXAMS='activePlus.exams.v1', TEACHING='activePlus.teaching.v1', FINANCE='activePlus.admin.transactions.v1';
test.use({ viewport:{width:390,height:844} });
async function noEmpty(scope) {
  await expect.poll(()=>scope.locator('input, textarea, select').evaluateAll(fields=>fields.filter(f=>f.getClientRects().length && !f.disabled && !['checkbox','radio','hidden','file','submit','button'].includes(f.type) && !f.value).map(f=>f.id||f.name))).toEqual([]);
}
async function enterTeacher(page) { await page.goto('/teacher.html'); await page.locator('#teacherEnter').click(); }
async function enterAdmin(page) { await page.goto('/admin.html'); await page.locator('#adminLoginForm [type=submit]').click(); }

test('fresh install fills login and seeds every domain, including live and completed exams', async ({ page })=>{
  const downloads=[]; page.on('download',d=>downloads.push(d)); await page.goto('/index.html');
  await expect(page.locator('#loginMobile')).toHaveValue('01700000000'); await expect(page.locator('#loginPin')).toHaveValue('123123');
  await noEmpty(page.locator('#loginForm'));
  const counts=await page.evaluate(async()=>{const{examRepository:e}=await import('/js/exam-data.js');const{teachingRepository:t}=await import('/js/teaching-data.js');const{financeRepository:f}=await import('/js/finance-data.js');const db=await e.list();return [(await t.list()).activities.length,db.exams.length,db.attempts.length,(await f.listTransactions()).length];});
  expect(counts).toEqual([5,8,7,7]);
  await page.locator('#loginForm [type=submit]').click(); await expect(page.locator('#appShell')).toBeVisible();
  await page.locator('#homeView [data-view=exams]').click(); await expect(page.locator('[data-student-exam]')).toHaveCount(5);
  await expect(page.locator('[data-student-exam-action=start]')).toHaveCount(1);
  await page.locator('[data-student-exam-action=start]').click(); await expect(page.locator('[data-answer-question]')).toHaveCount(8);
  await expect(page.locator('[data-answer-question]:checked')).toHaveCount(0);
  expect(downloads).toHaveLength(0); // Historical fixtures must not trigger unsolicited PDFs.
});

test('all five registration steps contain usable examples; clearing a field is respected',async({page})=>{
  await page.goto('/index.html'); await page.locator('.auth-tab[data-auth-tab=register]').click();
  for(let step=1;step<=5;step++) { const panel=page.locator(`[data-registration-step="${step}"]`); await noEmpty(panel); if(step<5) await panel.locator('[data-next-step]').click(); }
  await page.locator('#securityAnswer').fill(''); await page.locator('#securityQuestion').selectOption({index:2}); await expect(page.locator('#securityAnswer')).toHaveValue('');
});

test('teacher activities, roster and online exam authoring are populated',async({page})=>{
  await enterTeacher(page); await expect(page.locator('#teacherRecent .teaching-card')).toHaveCount(5);
  await page.locator('.admin-bottom [data-teacher-view=exam]').click(); await expect(page.locator('#teacherRecordList .teaching-card')).toHaveCount(2);
  await page.locator('#teacherNewActivity').click(); await noEmpty(page.locator('#teacherActivityForm')); await page.locator('#teacherModalClose').click();
  await page.locator('.admin-bottom [data-teacher-view=more]').click(); await page.locator('#teacherMore [data-teacher-view=students]').click(); await expect(page.locator('#teacherStudentSearch')).toHaveValue('রাইসা'); await expect(page.locator('#teacherStudentList .teaching-card')).toHaveCount(1);
  await page.locator('#teacherStudentSearch').fill(''); await expect(page.locator('#teacherStudentList .teaching-card')).toHaveCount(0); await expect(page.locator('#teacherStudentSearch')).toHaveValue('');
  await page.locator('.admin-bottom [data-teacher-view=more]').click(); await page.locator('#teacherMore [data-teacher-view=online-exams]').click(); await expect(page.locator('[data-managed-exam]')).toHaveCount(8);
  await page.locator('[data-exam-action=new-mcq]').click(); await noEmpty(page.locator('[data-exam-form]')); await expect(page.locator('[data-parsed-preview]')).toContainText('২টি প্রশ্ন');
});

test('admin finance, notices, routine and approvals show examples but never save automatically',async({page})=>{
  await enterAdmin(page); await page.locator('.admin-bottom [data-admin-view=finance]').click(); await expect(page.locator('#feeStudentSearch')).toHaveValue('রাইসা'); await page.locator('.fee-search-result').first().click(); await page.locator('#feeProfileCollect').click(); await noEmpty(page.locator('#feeCollectionForm'));
  expect(await page.evaluate(key=>JSON.parse(localStorage.getItem(key)).length,FINANCE)).toBe(7);
  await page.locator('.admin-bottom [data-admin-view=routine]').click(); await noEmpty(page.locator('#addRoutineForm'));
  await page.locator('.admin-bottom [data-admin-view=more]').click(); await page.locator('.admin-more-item[data-admin-view=notices]').click(); await noEmpty(page.locator('#noticeForm'));
  await page.locator('.admin-bottom [data-admin-view=more]').click(); await page.locator('[data-admin-view=exams]').click(); await expect(page.locator('[data-managed-exam]')).toHaveCount(8);
  const pending=page.locator('[data-managed-exam]').filter({hasText:'ডেমো: Admin অনুমোদনের অপেক্ষায়'}); await pending.locator('[data-exam-action=detail]').click(); await noEmpty(page.locator('[data-review-form]'));
  expect(await page.evaluate(key=>JSON.parse(localStorage.getItem(key)).exams.find(e=>e.id.endsWith('-pending')).status,EXAMS)).toBe('pending');
});

test('seeding is idempotent, preserves edited records/ledger/account and never repairs corruption silently',async({page})=>{
  await page.goto('/index.html');
  await page.evaluate(({exams,finance})=>{const db=JSON.parse(localStorage.getItem(exams));db.exams[1].title='আমার নিজের পরিবর্তিত শিরোনাম';localStorage.setItem(exams,JSON.stringify(db));localStorage.setItem(finance,'[]');localStorage.setItem('active-plus-account-v1',JSON.stringify({mobile:'01811223344',pin:'789789',status:'active',student:{id:'REAL-1',name:'আমার নিজের নাম',studentMobile:'01811223344',className:'দশম শ্রেণি',group:'বিজ্ঞান'}}));},{exams:EXAMS,finance:FINANCE});
  const before=await page.evaluate(key=>localStorage.getItem(key),EXAMS); await page.reload(); expect(await page.evaluate(key=>localStorage.getItem(key),EXAMS)).toBe(before); expect(await page.evaluate(key=>localStorage.getItem(key),FINANCE)).toBe('[]');
  const account=await page.evaluate(()=>JSON.parse(localStorage.getItem('active-plus-account-v1'))); expect(account.pin).toBe('789789'); expect(account.student.name).toBe('আমার নিজের নাম');
  await page.evaluate(key=>{localStorage.removeItem(`${key}.demo-seeded.v1`);localStorage.setItem(key,'{broken');},EXAMS); await page.reload(); expect(await page.evaluate(key=>localStorage.getItem(key),EXAMS)).toBe('{broken');
});

test('fresh-time samples are additive; profile examples and offline fixtures survive reload',async({page,context})=>{
  await page.goto('/index.html'); await page.locator('#demoLoginButton').click(); await page.locator('.bottom-nav [data-view=profile]').click(); await page.locator('#profileView [data-action=edit-profile]').first().click(); await noEmpty(page.locator('#profileForm')); await page.locator('#editModal [data-close-modal]').click();
  const original=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)).exams,EXAMS);
  await page.locator('#appMain > .demo-preview-note summary').click(); await page.locator('#appMain [data-demo-fresh]').click();
  await expect.poll(()=>page.evaluate(key=>JSON.parse(localStorage.getItem(key)).exams.length,EXAMS)).toBe(16);
  expect(await page.evaluate(key=>JSON.parse(localStorage.getItem(key)).exams.slice(0,8),EXAMS)).toEqual(original);
  await page.evaluate(()=>navigator.serviceWorker.ready); await expect.poll(()=>page.evaluate(()=>!!navigator.serviceWorker.controller)).toBe(true);
  await context.setOffline(true); await page.reload(); expect(await page.evaluate(key=>JSON.parse(localStorage.getItem(key)).exams.length,EXAMS)).toBe(16);
  await context.setOffline(false);
});

for(const viewport of [{width:320,height:740},{width:844,height:390}]) {
  test(`populated demo forms keep the mobile layout at ${viewport.width}px`,async({page})=>{
    await page.setViewportSize(viewport); await enterTeacher(page); await page.locator('.admin-bottom [data-teacher-view=exam]').click(); await page.locator('#teacherNewActivity').click(); await noEmpty(page.locator('#teacherActivityForm'));
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true); await expect(page.locator('#activity-title')).toHaveCSS('font-size','16px');
    await page.locator('#teacherActivityForm [type=submit]').scrollIntoViewIfNeeded(); const b=await page.locator('#teacherActivityForm [type=submit]').boundingBox(); expect(b.y+b.height).toBeLessThanOrEqual(viewport.height);
  });
}

test('demo autofill can be disabled and enabled again from a phone without deleting data',async({page})=>{
  await page.goto('/teacher.html'); await page.locator('#teacherEntry .demo-preview-note summary').click(); await page.locator('#teacherEntry [data-demo-off]').click();
  await expect(page.locator('#teacherEntry [data-demo-on]')).toBeVisible(); expect(await page.evaluate(key=>JSON.parse(localStorage.getItem(key)).exams.length,EXAMS)).toBe(8);
  await page.locator('#teacherEntry [data-demo-on]').click(); await expect(page.locator('#teacherEntry .demo-preview-note')).toBeVisible(); expect(await page.evaluate(key=>JSON.parse(localStorage.getItem(key)).exams.length,EXAMS)).toBe(8);
});
