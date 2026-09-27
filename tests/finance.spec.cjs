/* Admin finance is intentionally read-only. Cash entry is covered by the
   Payment Counter specs (payment-entry.spec.cjs and payment-panel.spec.cjs). */
const { test, expect } = require('./fixtures.cjs');
const fs = require('node:fs/promises');

async function enterFinance(page, width = 390) {
  await page.setViewportSize({ width, height: 844 });
  await page.clock.setFixedTime(new Date('2026-09-22T12:00:00Z'));
  await page.goto('/admin.html');
  await page.locator('#adminLoginForm button[type=submit]').click();
  await page.locator('.admin-bottom [data-admin-view=reports]').click();
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
  test(`Admin can monitor finance without cash-entry controls at ${width}px`, async ({ page }) => {
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await enterFinance(page, width);
    await expect(page.locator('#financeTotalCollected')).not.toBeEmpty();
    await expect(page.locator('#financeMonthCollected')).not.toBeEmpty();
    await expect(page.locator('#financeTotalDue')).not.toBeEmpty();
    await expect(page.locator('#recentTrxList .trx-item')).toHaveCount(5);
    await expect(page.locator('#feeStudentSearch, #feeCollectionForm, #feeProfileCollect, #btnFinanceGoCollect, #dashCollectFee')).toHaveCount(0);

    await page.locator('[data-finance-tab=students]').click();
    await expect(page.locator('#studentLedgerList .ledger-item').first()).toContainText('ইমরান');
    await expect(page.locator('#studentLedgerList [data-action=quick-collect]')).toHaveCount(0);

    // The monitoring panels now live inside the Report Center.
    await page.locator('.admin-bottom [data-admin-view=reports]').click();
    await expect(page.locator('.admin-view[data-view-panel=reports]')).toBeVisible();
    await page.locator('#reportMonth').selectOption('all');
    await expect(page.locator('#reportTrxCount')).toHaveText('৭ টি');
    await expect(page.locator('#reportGrandTotal')).toHaveText('৳১২,৩০০');
    await expect(page.locator('#reportCollectionList .report-payment')).toHaveCount(7);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(errors).toEqual([]);
  });
}

test('Admin may inspect and download an existing receipt, but cannot collect a fee', async ({ page }) => {
  await enterFinance(page);
  await page.locator('#recentTrxList [data-action=view-receipt]').first().click();
  await expect(page.locator('#receiptPreviewBox')).toBeVisible();
  const pending = page.waitForEvent('download');
  await page.locator('[data-modal-action=download-receipt]').click();
  const downloaded = await pending;
  expect(downloaded.suggestedFilename()).toMatch(/\.pdf$/);
  await verifyPDF(page, await fs.readFile(await downloaded.path()));
  await expect(page.locator('#feeCollectionForm, #feeSaveButton')).toHaveCount(0);
});
