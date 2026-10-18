// Verify route events cross Chrome's main-world / isolated-world boundary correctly.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const path = require('node:path');
(async () => {
  const root = path.resolve(__dirname, '..');
  const context = await chromium.launchPersistentContext('', { headless: true,
    ...(process.env.BROWSER_PATH ? { executablePath: process.env.BROWSER_PATH } : {}),
    ignoreDefaultArgs: ['--disable-extensions'], args: [`--disable-extensions-except=${root}`, `--load-extension=${root}`] });
  try {
    const errors = [];
    await context.route('https://chatgpt.com/**', (route) => route.fulfill({ contentType: 'text/html', body: '<!doctype html><html><body><main><div data-user-message-bubble="true">Chat A prompt from actual content-script installation</div></main></body></html>' }));
    const page = await context.newPage(); page.on('pageerror', (error) => errors.push(error.message));
    await page.goto('https://chatgpt.com/c/a');
    await page.locator('.jn-toggle').click();
    assert.equal(await page.locator('.jn-item').count(), 1);
    assert.equal(await page.evaluate(() => typeof window.chatGPTNavigatorInstance), 'undefined', 'extension runs in the real isolated world');
    await page.evaluate(() => history.pushState({}, '', '/c/b'));
    await page.waitForFunction(() => document.querySelectorAll('.jn-item').length === 0);
    await page.waitForTimeout(500);
    assert.equal(await page.locator('.jn-item').count(), 0, 'main-world pushState clears stale rows in the isolated content script');
    await page.evaluate(() => {
      document.querySelector('main').innerHTML = '<div data-user-message-bubble="true">Chat B replacement prompt</div>';
    });
    await page.waitForFunction(() => document.querySelectorAll('.jn-item').length === 1);
    assert.match(await page.locator('.jn-item').innerText(), /Chat B replacement prompt/);
    assert.doesNotMatch(await page.locator('.jn-item').innerText(), /Chat A/);
    assert.deepEqual(errors, []);
    console.log('PASS: real unpacked extension installation and cross-world SPA route isolation in a temporary profile.');
  } finally { await context.close(); }
})().catch((error) => { console.error(error); process.exitCode = 1; });
