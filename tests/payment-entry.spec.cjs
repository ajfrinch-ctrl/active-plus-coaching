/* Direct entry into the Payment Receive desk from the student login page:
   the counter user ID + password typed there must auto-login (no second form),
   and the modernised desk keeps collection to a few taps. */
const { test, expect } = require('./fixtures.cjs');

test.use({ viewport: { width: 390, height: 844 } });

test('the login page has a payment counter tab that opens the desk directly', async ({ page }) => {
  await page.goto('/index.html');
  await expect(page.locator('#authScreen')).toBeVisible();

  await page.locator('[data-auth-tab="payment"]').click();
  await expect(page.locator('#paymentPanel')).toBeVisible();
  await expect(page.locator('#loginPanel')).toBeHidden();
  // Demo credentials are prefilled for the one-tap counter flow.
  await expect(page.locator('#payPortalUser')).toHaveValue('APC-PAY-001');
  await expect(page.locator('#payPortalPin')).toHaveValue('123123');

  // Wrong password stays on the login page with a Bengali message.
  await page.locator('#payPortalPin').fill('999999');
  await page.locator('#payPortalLoginForm button[type=submit]').click();
  await expect(page.locator('#payPortalError')).toContainText('ইউসার আইডি বা পাসওয়ার্ড সঠিক নয়');
  await expect(page).toHaveURL(/index\.html$/);

  // Correct ID + password hands the session over and lands on the desk.
  await page.locator('#payPortalPin').fill('123123');
  await page.locator('#payPortalLoginForm button[type=submit]').click();
  await page.waitForURL('**/payment.html');
  await expect(page.locator('#payShell')).toBeVisible();
  await expect(page.locator('#payEntry')).toBeHidden();
});

test('the counter ID typed in the student login form also auto-logs into the desk', async ({ page }) => {
  await page.goto('/index.html');

  // A wrong counter password is refused with an explanation; the student app stays closed.
  await page.locator('#loginMobile').fill('APC-PAY-001');
  await page.locator('#loginPin').fill('000000');
  await page.locator('#loginForm button[type=submit]').click();
  await expect(page.locator('#authMessage')).toContainText('পেমেন্ট পোর্টালের ইউসার আইডি বা পাসওয়ার্ড সঠিক নয়');
  await expect(page.locator('#appShell')).toBeHidden();

  // The right pair opens the desk without any extra form.
  await page.locator('#loginPin').fill('123123');
  await page.locator('#loginForm button[type=submit]').click();
  await page.waitForURL('**/payment.html');
  await expect(page.locator('#payShell')).toBeVisible();
  await expect(page.locator('#payEntry')).toBeHidden();
});

test('the desk collects with keypad, method pills and the sticky bar', async ({ page }) => {
  await page.goto('/payment.html');
  await page.locator('#payLoginForm button[type=submit]').click();
  await expect(page.locator('#payShell')).toBeVisible();

  // One tap, no typing: a student with dues comes from the quick picks.
  await expect(page.locator('#payQuickPicks .pay-pick').first()).toBeVisible();
  await page.locator('#payQuickPicks .pay-pick').first().click();
  await expect(page.locator('#payStickyBar')).toBeVisible();
  await expect(page.locator('#payProfileCollect')).toBeVisible();

  await page.locator('#payProfileCollect').click();
  await expect(page.locator('#payCollectionForm')).toBeVisible();

  // Method pills write the shared method value.
  await page.locator('#payFeeMethodGroup [data-pay-method="বিকাশ (bKash)"]').click();
  await expect(page.locator('#payFeeMethodGroup [data-pay-method="বিকাশ (bKash)"]')).toHaveAttribute('aria-checked', 'true');

  // Keypad types the amount; the submit label shows the live total.
  await page.locator('#payFeeAmount').fill('');
  await page.locator('#payKeypad [data-pay-key="7"]').click();
  await page.locator('#payKeypad [data-pay-key="0"]').click();
  await page.locator('#payKeypad [data-pay-key="0"]').click();
  await expect(page.locator('#payFeeAmount')).toHaveValue('700');
  await expect(page.locator('#paySaveLabel')).toContainText('৳৭০০');

  await page.locator('#paySaveButton').click();
  await expect(page.locator('#payReceiptBackdrop')).toBeVisible();
  await expect(page.locator('#payReceiptBody')).toContainText('৳৭০০');

  // Today's summary and activity list pick the collection up.
  await page.locator('#payReceiptClose').click();
  await expect(page.locator('#payTodayList .pay-activity-row').first()).toBeVisible();
  await expect(page.locator('#payTodayAmount')).not.toHaveText('৳০');

  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('activePlus.admin.transactions.v1')));
  const added = stored.find(tx => tx.amount === 700 && tx.method === 'বিকাশ (bKash)');
  expect(added).toBeTruthy();
  expect(added.collectedBy).toBe('পেমেন্ট কাউন্টার');
});
