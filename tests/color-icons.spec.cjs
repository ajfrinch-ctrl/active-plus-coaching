const { test, expect } = require('./fixtures.cjs');
test.use({ serviceWorkers: 'block' });

for (const theme of ['light', 'dark']) test(`all colour/glyph artwork renders without invalid SVG or clipping (${theme})`, async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error' && /<path>|<svg>|SVG|attribute d/i.test(message.text())) errors.push(message.text()); });
  await page.goto('/preview/wallet-140/icons.html');
  await expect(page.locator('#illustrations svg')).toHaveCount(33);
  await expect(page.locator('#glyphs svg')).toHaveCount(63);
  await page.locator(`[data-icon-theme="${theme}"]`).click();
  await page.evaluate(() => document.fonts.ready);
  const bad = await page.locator('.picture svg').evaluateAll(icons => icons.flatMap(svg => {
    const box = svg.getBBox();
    if (!box.width || !box.height || box.x < -.1 || box.y < -.1 || box.x + box.width > 24.1 || box.y + box.height > 24.1) return [svg.dataset.icon + ': cropped/empty'];
    if (svg.dataset.iconStyle === 'color') {
      const fills = new Set([...svg.querySelectorAll('[fill]')].map(el => getComputedStyle(el).fill).filter(fill => fill !== 'none'));
      if (fills.size < 2) return [svg.dataset.icon + ': not multicolour'];
    }
    return [];
  }));
  expect(bad).toEqual([]);
  for (const width of [320, 390, 1280]) {
    await page.setViewportSize({ width, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  if (theme === 'dark') await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(0, 0, 0)');
  expect(errors).toEqual([]);
});
