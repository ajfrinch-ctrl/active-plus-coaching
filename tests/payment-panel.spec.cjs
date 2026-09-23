/* Payment Receive panel: guarded search (name/mobile/ID/guardian), short profile,
   payment save through the shared financeRepository, receipt PDF and the
   one-click WhatsApp hand-off straight to the student's own number. */
const { test, expect } = require('./fixtures.cjs');

test.use({ viewport: { width: 390, height: 844 } });

async function enter(page) {
  await page.goto('/payment.html');
  await page.locator('#payLoginForm button[type=submit]').click();
  await expect(page.locator('#payShell')).toBeVisible();
}

test('payment portal opens only with the unique user ID and password', async ({ page }) => {
  await page.goto('/payment.html');
  await expect(page.locator('#payEntry')).toBeVisible();
  // Demo credentials are prefilled for the one-tap demo flow.
  await expect(page.locator('#payLoginUser')).toHaveValue('APC-PAY-001');
  await expect(page.locator('#payLoginPin')).toHaveValue('123123');

  // Wrong password is rejected with a Bengali message.
  await page.locator('#payLoginPin').fill('999999');
  await page.locator('#payLoginForm button[type=submit]').click();
  await expect(page.locator('#payLoginError')).toContainText('ইউসার আইডি বা পাসওয়ার্ড সঠিক নয়');
  await expect(page.locator('#payShell')).toBeHidden();

  // Wrong user ID is rejected too.
  await page.locator('#payLoginUser').fill('APC-PAY-002');
  await page.locator('#payLoginPin').fill('123123');
  await page.locator('#payLoginForm button[type=submit]').click();
  await expect(page.locator('#payLoginError')).toBeVisible();
  await expect(page.locator('#payShell')).toBeHidden();

  // Correct credentials open the bare desk: no navigation, no admin views.
  await page.locator('#payLoginUser').fill('APC-PAY-001');
  await page.locator('#payLoginPin').fill('123123');
  await page.locator('#payLoginForm button[type=submit]').click();
  await expect(page.locator('#payShell')).toBeVisible();
  await expect(page.locator('.admin-bottom, .nav-item, [data-admin-view]')).toHaveCount(0);

  // Remembered session survives a reload without the form.
  await page.reload();
  await expect(page.locator('#payShell')).toBeVisible();

  // Exit clears the session and returns to the entry screen.
  await page.locator('#payExitButton').click();
  await expect(page.locator('#payEntry')).toBeVisible();
  await page.reload();
  await expect(page.locator('#payEntry')).toBeVisible();
});

test('the password can be changed from the panel; the new one logs in, the old one is rejected', async ({ page }) => {
  await enter(page);
  await page.locator('#payPinButton').click();
  await expect(page.locator('#payPinBackdrop')).toBeVisible();

  // Wrong current password is rejected.
  await page.locator('#payPinCurrent').fill('111111');
  await page.locator('#payPinNew').fill('456789');
  await page.locator('#payPinConfirm').fill('456789');
  await page.locator('#payPinForm button[type=submit]').click();
  await expect(page.locator('#payPinError')).toContainText('বর্তমান পাসওয়ার্ড সঠিক নয়');

  // Mismatched confirmation is rejected.
  await page.locator('#payPinCurrent').fill('123123');
  await page.locator('#payPinNew').fill('456789');
  await page.locator('#payPinConfirm').fill('456780');
  await page.locator('#payPinForm button[type=submit]').click();
  await expect(page.locator('#payPinError')).toContainText('মিলছে না');

  // Valid change saves and closes the modal (Bangla digits accepted too).
  await page.locator('#payPinConfirm').fill('৪৫৬৭৮৯');
  await page.locator('#payPinForm button[type=submit]').click();
  await expect(page.locator('#payPinBackdrop')).toBeHidden();
  await expect(page.locator('#payToast')).toContainText('পাসওয়ার্ড পরিবর্তন হয়েছে');
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('activePlus.paymentAccount.v1')));
  expect(stored).toEqual({ userId: 'APC-PAY-001', pin: '456789' });

  // Old password no longer works; the new one does.
  await page.locator('#payExitButton').click();
  await expect(page.locator('#payEntry')).toBeVisible();
  await page.locator('#payLoginPin').fill('123123');
  await page.locator('#payLoginForm button[type=submit]').click();
  await expect(page.locator('#payLoginError')).toBeVisible();
  await page.locator('#payLoginPin').fill('456789');
  await page.locator('#payLoginForm button[type=submit]').click();
  await expect(page.locator('#payShell')).toBeVisible();
});

test('payment panel is a bare search desk: entry, empty state, no match', async ({ page }) => {
  await enter(page);
  // Nothing else: no bottom navigation, no admin views.
  await expect(page.locator('.admin-bottom, .nav-item, [data-admin-view]')).toHaveCount(0);
  await expect(page.locator('#payQuickProfile')).toContainText('উপরে সার্চ করে শিক্ষার্থী নির্বাচন করুন');
  await page.locator('#payStudentSearch').fill('কেউ না');
  await expect(page.locator('#paySearchStatus')).toHaveText('কোনো শিক্ষার্থী পাওয়া যায়নি');
  await expect(page.locator('#paySearchResults .fee-search-result')).toHaveCount(0);
});

test('search works by name, mobile, ID and guardian mobile (Bangla digits too)', async ({ page }) => {
  await enter(page);
  const names = async () => page.locator('#paySearchResults .fee-search-result strong').allTextContents();
  await page.locator('#payStudentSearch').fill('রাইসা');
  expect(await names()).toEqual(['রাইসা ইসলাম']);
  await page.locator('#payStudentSearch').fill('01700');
  expect(await names()).toEqual(['রাইসা ইসলাম']);
  await page.locator('#payStudentSearch').fill('০১৮১১'); // Bangla digits, student mobile
  expect(await names()).toEqual(['তহমিদ হাসান']);
  await page.locator('#payStudentSearch').fill('AP-1024');
  expect(await names()).toEqual(['রাইসা ইসলাম']);
  await page.locator('#payStudentSearch').fill('01911223344'); // guardian mobile only
  expect(await names()).toEqual(['তহমিদ হাসান']);
  await page.locator('#payStudentSearch').fill('০১৭৭৭৮৮৯৯০০'); // guardian, Bangla digits
  expect(await names()).toEqual(['সাদিয়া আফরিন']);
});

test('profile shows brief info, payment saves, receipt PDF downloads', async ({ page }) => {
  await enter(page);
  await page.locator('#payStudentSearch').fill('রাইসা');
  await page.locator('#paySearchResults .fee-search-result').click();
  const profile = page.locator('#payQuickProfile');
  await expect(profile).toContainText('রাইসা ইসলাম');
  await expect(profile).toContainText('AP-1024');
  await expect(profile).toContainText('দশম শ্রেণি • বিজ্ঞান বিভাগ');
  await expect(profile).toContainText('০১৭০০০০০০০০');
  await expect(profile).toContainText('০১৮০০০০০০০০');
  await expect(profile).toContainText('বর্তমান মাসের বকেয়া');
  await expect(profile).toContainText('পেমেন্ট নিন');

  await page.locator('#payProfileCollect').click();
  await expect(page.locator('#payCollectionForm')).toBeVisible();
  await expect(page.locator('#payPaymentFor')).toContainText('রাইসা ইসলাম');
  await page.locator('#payFeeAmount').fill('800');
  await page.locator('#payFeeNote').fill('পেমেন্ট কাউন্টার টেস্ট');
  await page.locator('#paySaveButton').click();

  // Receipt modal appears after durable save; transaction is in storage.
  await expect(page.locator('#payReceiptBackdrop')).toBeVisible();
  await expect(page.locator('#payReceiptSub')).toContainText('রসিদ নং: REC-');
  await expect(page.locator('#payReceiptBody')).toContainText('৳৮০০');
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('activePlus.admin.transactions.v1')));
  const added = stored.find(tx => tx.studentId === 'AP-1024' && tx.amount === 800);
  expect(added).toBeTruthy();
  expect(added.collectedBy).toBe('পেমেন্ট কাউন্টার');
  expect(added.note).toBe('পেমেন্ট কাউন্টার টেস্ট');

  const pdf = page.waitForEvent('download');
  await page.locator('#payReceiptDownload').click();
  expect((await pdf).suggestedFilename()).toMatch(/^REC-.*\.pdf$/);

  // Closing refreshes the profile: this month's paid grew by 800.
  await page.locator('#payReceiptClose').click();
  await expect(page.locator('#payReceiptBackdrop')).toBeHidden();
  await expect(page.locator('#payQuickProfile .fee-balance-grid')).toContainText('৳২,৩০০');
});

test('WhatsApp share goes straight to the student number, even when Web Share exists', async ({ page }) => {
  await enter(page);
  await page.locator('#payStudentSearch').fill('তহমিদ');
  await page.locator('#paySearchResults .fee-search-result').click();
  await page.locator('#payProfileCollect').click();
  await page.locator('#payFeeAmount').fill('1500');
  await page.locator('#paySaveButton').click();
  await expect(page.locator('#payReceiptBackdrop')).toBeVisible();

  // The share API being available must not change the target: the button opens
  // the student's own chat and saves the receipt image next to it.
  await page.evaluate(() => {
    window.__shared = null;
    window.__openUrl = null;
    navigator.canShare = data => Boolean(data.files);
    navigator.share = async data => { window.__shared = data; };
    window.open = url => { window.__openUrl = url; };
  });
  const pngDownload = page.waitForEvent('download');
  await page.locator('#payReceiptWhatsApp').click();
  await expect(page.locator('#payToast')).toContainText('হোয়াটসঅ্যাপ চ্যাট', { timeout: 10000 });
  expect(await page.evaluate(() => window.__shared)).toBeNull();

  const url = await page.evaluate(() => window.__openUrl);
  expect(url).toMatch(/^https:\/\/wa\.me\/8801811223344\?text=/);
  expect(decodeURIComponent(url)).toContain('তহমিদ হাসান');
  expect(decodeURIComponent(url)).toContain('রসিদ নং');
  expect((await pngDownload).suggestedFilename()).toMatch(/^REC-.*\.png$/);
});
