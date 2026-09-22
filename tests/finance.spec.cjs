const { test, expect } = require('./fixtures.cjs');
const fs = require('node:fs/promises');
const KEY = 'activePlus.admin.transactions.v1';
async function enter(page) {
  await page.goto('/admin.html');
  await page.locator('#adminLoginForm button[type=submit]').click();
  await page.locator('[data-admin-view=finance]:visible').first().click();
}
async function select(page, query = 'ইমরান') {
  await page.locator('#feeStudentSearch').fill(query);
  await page.locator('.fee-search-result').first().click();
}
async function verifyPDF(page, bytes) {
  const pdf = bytes.toString('latin1');
  expect(pdf.startsWith('%PDF-1.4')).toBe(true);
  expect(pdf.trimEnd().endsWith('%%EOF')).toBe(true);
  expect(pdf).toContain('/Type /Page ');
  const imageStart = pdf.indexOf('stream\n', pdf.indexOf('4 0 obj')) + 7;
  const length = Number(pdf.slice(pdf.indexOf('4 0 obj'), imageStart).match(/\/Length (\d+)/)[1]);
  const jpeg = bytes.subarray(imageStart, imageStart + length);
  expect(jpeg[0]).toBe(0xff);
  expect(jpeg[1]).toBe(0xd8);
  expect(jpeg.length).toBeGreaterThan(10000);
  const dimensions = await page.evaluate(async base64 => {
    const data = Uint8Array.from(atob(base64), ch => ch.charCodeAt(0));
    const image = await createImageBitmap(new Blob([data], { type: 'image/jpeg' }));
    const result = [image.width, image.height];
    image.close();
    return result;
  }, jpeg.toString('base64'));
  expect(dimensions[0]).toBe(1520);
  expect(dimensions[1]).toBeGreaterThan(1500);
}

for (const width of [320, 390, 1280]) {
  test(`search → profile → partial payment → receipt → reload (${width}px)`, async ({ page }) => {
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.setViewportSize({ width, height: 844 });
    await page.clock.setFixedTime(new Date('2026-09-22T12:00:00Z'));
    await enter(page);
    await expect(page.locator('.fee-search-result')).toHaveCount(0);
    await expect(page.locator('#feeCollectionForm')).toBeHidden();
    await expect(page.locator('#recentTrxList .trx-item')).toHaveCount(5);
    await page.locator('#feeStudentSearch').fill('nobody-here');
    await expect(page.locator('#feeSearchStatus')).toHaveText('কোনো শিক্ষার্থী পাওয়া যায়নি');
    for (const query of ['RAISA', '০১৭০০০০০০০০', 'ap-1024']) {
      await page.locator('#feeStudentSearch').fill(query);
      await expect(page.locator('.fee-search-result')).toHaveCount(1);
      await expect(page.locator('.fee-search-result')).toContainText('AP-1024');
    }
    await select(page);
    await expect(page.locator('#feeQuickProfile')).toContainText('01555667788');
    await expect(page.locator('.fee-balance-grid dd')).toHaveText(['৳১,৫০০', '৳৮০০', '৳১,৫০০']);
    await page.locator('#feeProfileCollect').click();
    await page.locator('#feeAmount').fill('0');
    await page.locator('#feeSaveButton').click();
    await expect(page.locator('#adminModalBackdrop')).toBeHidden();
    await page.locator('#feeAmount').fill('500');
    await page.locator('#feeMethod').selectOption('বিকাশ (bKash)');
    await page.locator('#feeTrxId').fill('BK-TEST-99');
    await page.locator('#feeNote').fill('<img src=x onerror=alert(1)>');
    // Two immediate submits must produce just one saved transaction.
    await page.locator('#feeCollectionForm').evaluate(form => { form.requestSubmit(); form.requestSubmit(); });
    await expect(page.locator('#receiptPreviewBox')).toBeVisible();
    await expect(page.locator('#receiptPreviewBox')).toContainText('BK-TEST-99');
    await expect(page.locator('#receiptPreviewBox')).toContainText('<img src=x onerror=alert(1)>');
    await expect(page.locator('#receiptPreviewBox img')).toHaveCount(1);
    await expect(page.locator('.fee-balance-grid dd')).toHaveText(['৳১,৫০০', '৳১,৩০০', '৳১,০০০']);
    expect(await page.evaluate(key => JSON.parse(localStorage.getItem(key)).length, KEY)).toBe(8);
    await expect(page.locator('#recentTrxList .trx-item')).toHaveCount(5);
    await expect(page.locator('#recentTrxList .trx-item').first()).toContainText('ইমরান');
    // The receipt is a real PDF download, without a print dialog or popup.
    await page.evaluate(() => { window.printCalls = 0; window.print = () => window.printCalls++; });
    await expect(page.locator('[data-modal-action=print-receipt]')).toHaveCount(0);
    const downloadPromise = page.waitForEvent('download');
    await page.locator('[data-modal-action=download-receipt]').click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/^REC-2609-.*\.pdf$/);
    await verifyPDF(page, await fs.readFile(await download.path()));
    expect(await page.evaluate(() => window.printCalls)).toBe(0);
    expect(page.context().pages()).toHaveLength(1);
    await page.locator('#adminModalClose').focus();
    await page.keyboard.press('Shift+Tab');
    await expect(page.locator('[data-modal-action=close]')).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(page.locator('#adminModalClose')).toBeFocused();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.keyboard.press('Escape');
    await expect(page.locator('#adminModalBackdrop')).toBeHidden();
    await expect(page.locator('#feeProfileCollect')).toBeFocused();
    await page.locator('#feeStudentSearch').fill('');
    await expect(page.locator('.fee-search-result')).toHaveCount(0);
    await expect(page.locator('#feeProfileCollect')).toHaveCount(0);
    await page.reload();
    await page.locator('#adminLoginForm button[type=submit]').click();
    await page.locator('[data-admin-view=finance]:visible').first().click();
    await expect(page.locator('#recentTrxList .trx-item').first()).toContainText('ইমরান');
    await page.locator('#recentTrxList [data-action=view-receipt]').first().click();
    await expect(page.locator('#receiptPreviewBox')).toContainText('BK-TEST-99');
    await page.keyboard.press('Escape');
    const secondDownload = page.waitForEvent('download');
    await page.locator('#recentTrxList [data-action=download-receipt]').first().click();
    expect((await secondDownload).suggestedFilename()).toBe(download.suggestedFilename());
    expect(errors).toEqual([]);
  });
}

test('storage failure preserves form, leaves totals unchanged, never issues a receipt', async ({ page }) => {
  await enter(page);
  await select(page);
  await page.locator('#feeProfileCollect').click();
  await page.locator('#feeAmount').fill('450');
  await page.evaluate(key => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function(k, v) {
      if (k === key) throw new DOMException('Full', 'QuotaExceededError');
      return original.call(this, k, v);
    };
  }, KEY);
  await page.locator('#feeSaveButton').click();
  await expect(page.locator('#feeSaveError')).toBeVisible();
  await expect(page.locator('#feeAmount')).toHaveValue('450');
  await expect(page.locator('#feeSaveButton')).toBeEnabled();
  await expect(page.locator('#adminModalBackdrop')).toBeHidden();
  await expect(page.locator('#financeTrxCount')).toHaveText('৭ টি');
});

test('pending/rejected profile status, switching student, corrupt storage fails closed', async ({ page }) => {
  await enter(page);
  await select(page, 'সাদিয়া');
  await expect(page.locator('#feeQuickProfile .badge')).toHaveText('অপেক্ষমাণ');
  await page.locator('#feeProfileCollect').click();
  await select(page, 'ফারহান');
  await expect(page.locator('#feeQuickProfile .badge')).toHaveText('বাতিল');
  await expect(page.locator('#feeCollectionForm')).toBeHidden();
  await page.evaluate(key => localStorage.setItem(key, 'corrupt'), KEY);
  await enter(page);
  await select(page);
  await expect(page.locator('#financeLoadError')).toBeVisible();
  await expect(page.locator('#feeProfileCollect')).toBeDisabled();
});

test('year rollover uses current month in form, profile and ledger', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2027-01-02T12:00:00Z'));
  await enter(page);
  await select(page, 'রাইসা');
  await expect(page.locator('.fee-balance-grid dd')).toHaveText(['৳১,৫০০', '৳০', '৳১,৫০০']);
  await page.locator('#feeProfileCollect').click();
  await expect(page.locator('#feeMonth')).toHaveValue('জানুয়ারি ২০২৭');
  await page.locator('[data-finance-tab=students]').click();
  await expect(page.locator('#studentLedgerList')).toContainText('জানুয়ারি ২০২৭');
});


test('ledger quick collection goes through the same profile and payment flow', async ({ page }) => {
  await enter(page);
  await page.locator('[data-finance-tab=students]').click();
  await page.locator('[data-action=quick-collect][data-id="260613004"]').click();
  await expect(page.locator('#feeQuickProfile')).toContainText('ইমরান');
  await expect(page.locator('#feeCollectionForm')).toBeHidden();
  await page.locator('#feeProfileCollect').click();
  await expect(page.locator('#feeStudent')).toHaveValue('260613004');
});

test('installed PWA can collect and download a branded receipt offline', async ({ page, context }) => {
  await enter(page);
  await page.evaluate(async () => {
    await navigator.serviceWorker.register('/sw.js');
    await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller) await new Promise(resolve => navigator.serviceWorker.addEventListener('controllerchange', resolve, { once: true }));
  });
  await context.setOffline(true);
  await page.reload();
  await page.locator('#adminLoginForm button[type=submit]').click();
  await page.locator('[data-admin-view=finance]:visible').first().click();
  await select(page);
  await page.locator('#feeProfileCollect').click();
  await page.locator('#feeSaveButton').click();
  await expect(page.locator('#receiptPreviewBox')).toBeVisible();
  const pending = page.waitForEvent('download');
  await page.locator('[data-modal-action=download-receipt]').click();
  const downloaded = await pending;
  expect(downloaded.suggestedFilename()).toMatch(/\.pdf$/);
  await verifyPDF(page, await fs.readFile(await downloaded.path()));
});


// Block service workers here so the intentionally aborted asset cannot be served
// from the Admin panel's new offline cache instead of the simulated network.
test.describe('uncached PDF assets', () => {
  test.use({ serviceWorkers: 'block' });
test('PDF asset failure restores download button and allows retry', async ({ page }) => {
  const logo = '**/assets/icons/app-logo.png';
  await page.route(logo, route => route.abort());
  await enter(page);
  await page.locator('#recentTrxList [data-action=view-receipt]').first().click();
  const button = page.locator('[data-modal-action=download-receipt]');
  let downloads = 0;
  page.on('download', () => downloads++);
  await button.click();
  await expect(page.locator('.admin-toast')).toContainText('রসিদ ডাউনলোড হয়নি');
  await expect(button).toBeEnabled();
  await expect(button).toHaveText('রসিদ ডাউনলোড');
  expect(downloads).toBe(0);
  await page.unroute(logo);
  const pending = page.waitForEvent('download');
  await button.click();
  expect((await pending).suggestedFilename()).toMatch(/\.pdf$/);
});

});

test('long Bangla notes and unbroken references fit in the downloaded PDF', async ({ page }) => {
  await enter(page);
  const pdf = await page.evaluate(async () => {
    const { createReceiptPDF } = await import('/js/finance-receipt.js');
    const { initialTransactions } = await import('/js/admin-data.js');
    const blob = await createReceiptPDF({
      ...initialTransactions[0],
      trxRef: 'R'.repeat(120),
      note: 'মাসিক বেতনের আংশিক পরিশোধ। '.repeat(30).slice(0, 500)
    });
    return { type: blob.type, data: [...new Uint8Array(await blob.arrayBuffer())] };
  });
  expect(pdf.type).toBe('application/pdf');
  await verifyPDF(page, Buffer.from(pdf.data));
});
