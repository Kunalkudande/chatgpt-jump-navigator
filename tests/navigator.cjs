const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const root = path.resolve(__dirname, '..');
const script = fs.readFileSync(path.join(root, 'content.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'styles.css'), 'utf8');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));
assert.equal(manifest.manifest_version, 3);
assert.deepEqual(manifest.permissions, ['storage']);

(async () => {
  const browser = await chromium.launch({ headless: true,
    ...(process.env.BROWSER_PATH ? { executablePath: process.env.BROWSER_PATH } : {}) });
  const page = await browser.newPage({ viewport: { width: 1280, height: 850 }, reducedMotion: 'reduce' });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.route('https://chatgpt.com/**', (route) => route.fulfill({ contentType: 'text/html', body: '<!doctype html><html class="light"><body><main></main><textarea id="composer"></textarea><button id="host-button" title="Host tooltip">Host button</button></body></html>' }));
  try {
    await page.goto('https://chatgpt.com/c/first');
    await page.evaluate(() => {
      window.saved = {};
      window.storageListeners = new Set();
      window.chrome = { storage: {
        local: {
          get: async () => structuredClone(window.saved),
          set: async (value) => Object.assign(window.saved, structuredClone(value)),
          remove: async (key) => { delete window.saved[key]; }
        },
        onChanged: { addListener: (fn) => window.storageListeners.add(fn), removeListener: (fn) => window.storageListeners.delete(fn) }
      } };
      Object.defineProperty(navigator, 'clipboard', { value: { writeText: async (text) => {
        if (window.failClipboard) throw Error('Denied');
        window.copied = text;
      } } });
      const main = document.querySelector('main');
      ['A', 'Repeated prompt', 'Repeated prompt', 'Long prompt ' + 'details '.repeat(35) + 'NEEDLE at the end', '<img src=x onerror=alert(1)>'].forEach((text, i) => {
        const node = document.createElement('article');
        node.dataset.messageAuthorRole = 'user';
        node.dataset.messageId = `message-${i}`;
        node.textContent = text;
        main.append(node);
      });
      localStorage.setItem('chatgpt-nav-starred', 'bad-json');
    });
    await page.addStyleTag({ content: css });
    await page.evaluate(script);
    await page.evaluate(() => window.chatGPTNavigatorInstance.ready);
    const toggle = page.locator('.jn-toggle');
    const input = page.getByRole('searchbox');
    const items = page.locator('.jn-item');
    await toggle.click();
    assert.equal(await items.count(), 5, 'includes single-character prompts');
    assert.equal(await page.locator('.jn-item img').count(), 0, 'renders prompt HTML as plain text');
    await input.fill('needle');
    assert.equal(await items.count(), 1, 'searches beyond preview');
    assert.match(await items.innerText(), /NEEDLE/);
    await page.getByRole('button', { name: 'Copy all matching full messages' }).click();
    assert.match(await page.evaluate(() => window.copied), /^4\. Long prompt/);
    await input.fill('no such match');
    assert.equal(await items.count(), 0);
    assert.match(await page.locator('.jn-empty').innerText(), /No matching/);
    await input.fill('');
    await page.getByRole('button', { name: 'Star message 2', exact: true }).click();
    assert.equal(await page.locator('.jn-star[aria-pressed="true"]').count(), 1, 'duplicates have independent bookmarks');
    await page.getByRole('button', { name: 'Show starred messages only' }).click();
    assert.equal(await items.count(), 1);
    await page.evaluate(() => {
      const node = document.createElement('article');
      node.dataset.messageAuthorRole = 'user'; node.dataset.messageId = 'new'; node.textContent = 'New user prompt';
      document.querySelector('main').append(node);
    });
    await page.waitForFunction(() => document.querySelector('.jn-count').textContent === '6');
    assert.equal(await items.count(), 1, 'new messages preserve filter');
    await page.getByRole('button', { name: 'Show starred messages only' }).click();
    await page.getByRole('button', { name: 'Reverse message order' }).click();
    assert.match(await items.first().innerText(), /New user prompt/);
    // A content change to an existing text node must be observed.
    await input.fill('edited');
    await page.evaluate(() => document.querySelector('[data-message-id="new"]').firstChild.data = 'Edited prompt');
    await page.waitForFunction(() => document.querySelectorAll('.jn-item').length === 1);
    await input.fill('needle');
    await input.press('ArrowDown');
    assert.equal(await page.evaluate(() => document.activeElement.className), 'jn-jump');
    await page.keyboard.press('Enter');
    assert.equal(await page.locator('.jn-panel').isVisible(), false);
    assert.equal(await page.locator('.jn-message-highlight').getAttribute('data-message-id'), 'message-3');
    await page.keyboard.press('Control+Shift+m');
    assert.equal(await input.evaluate((node) => document.activeElement === node), true);
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('.jn-panel').isVisible(), false);
    await toggle.click();
    await page.locator('#composer').click();
    assert.equal(await page.locator('.jn-panel').isVisible(), false, 'outside click closes');
    // Keyboard shortcuts must not steal normal typing in ChatGPT's composer.
    await toggle.click();
    await page.locator('#composer').focus();
    await page.keyboard.type('/');
    assert.equal(await page.locator('#composer').inputValue(), '/');
    await input.fill('');
    // Replace a React message node, then navigate before the observer fires.
    await page.evaluate(() => {
      const node = document.querySelector('[data-message-id="message-0"]');
      node.replaceWith(node.cloneNode(true));
    });
    await page.getByRole('button', { name: 'Jump to message 1: A', exact: true }).click();
    assert.equal(await page.locator('.jn-message-highlight').getAttribute('data-message-id'), 'message-0');
    await page.evaluate(() => {
      history.pushState({}, '', '/c/second');
      document.querySelector('main').replaceChildren();
      const node = document.createElement('article');
      node.dataset.messageAuthorRole = 'user'; node.dataset.messageId = 'message-1'; node.textContent = 'Repeated prompt';
      document.querySelector('main').append(node);
    });
    await page.waitForFunction(() => window.chatGPTNavigatorInstance.conversation === '/c/second');
    await toggle.click();
    assert.equal(await page.locator('.jn-star[aria-pressed="true"]').count(), 0, 'stars do not leak across conversations');
    await page.getByRole('button', { name: 'Copy message 1', exact: true }).click();
    assert.equal(await page.evaluate(() => window.copied), 'Repeated prompt');
    await page.evaluate(() => { window.failClipboard = true; });
    await page.getByRole('button', { name: 'Copy message 1', exact: true }).click();
    assert.match(await page.locator('.jn-status').innerText(), /Could not copy/);
    // Reinjecting destroys old listeners, observers and timers.
    await page.evaluate(() => window.chatGPTNavigatorInstance.saveQueue);
    await page.evaluate(script);
    await page.evaluate(() => window.chatGPTNavigatorInstance.ready);
    assert.equal(await page.locator('.jn-toggle').count(), 1);
    assert.equal(await page.evaluate(() => window.storageListeners.size), 1);
    assert.ok(await page.evaluate(() => Object.keys(window.saved).some((key) => key.startsWith('jumpNavigatorStar:'))), 'bookmarks persisted');
    await page.keyboard.press('Control+Shift+m');
    assert.equal(await page.locator('.jn-panel').isVisible(), true, 'single shortcut listener');
    // Cross-tab changes must be reflected without overwriting unrelated stars.
    await page.evaluate(() => {
      const key = 'jumpNavigatorStar:' + window.chatGPTNavigatorInstance.messages[0].key;
      window.saved[key] = true;
      window.storageListeners.forEach((listener) => listener({ [key]: { newValue: true } }, 'local'));
    });
    assert.equal(await page.locator('.jn-star[aria-pressed="true"]').count(), 1);
    // Bookmark restoration and explicit import from the original extension.
    await page.evaluate(() => localStorage.setItem('chatgpt-nav-starred', JSON.stringify(['Repeated prompt'])));
    await page.evaluate(script);
    await page.evaluate(() => window.chatGPTNavigatorInstance.ready);
    await toggle.click();
    assert.equal(await page.locator('.jn-star[aria-pressed="true"]').count(), 1, 'bookmark restored after reinjection');
    await page.getByRole('button', { name: 'Unstar message 1', exact: true }).click();
    await page.evaluate(() => window.chatGPTNavigatorInstance.saveQueue);
    await page.getByRole('button', { name: 'Import old bookmarks matching this conversation' }).click();
    assert.equal(await page.locator('.jn-star[aria-pressed="true"]').count(), 1, 'legacy import');
    await page.evaluate(() => window.chatGPTNavigatorInstance.saveQueue);
    // Quiet assistant streaming and our own renders must not cause recursive scans.
    await page.waitForTimeout(300);
    await page.evaluate(() => {
      const instance = window.chatGPTNavigatorInstance;
      const scan = instance.scan.bind(instance);
      window.scans = 0;
      instance.scan = () => { window.scans++; scan(); };
      const assistant = document.createElement('div');
      assistant.dataset.messageAuthorRole = 'assistant'; document.querySelector('main').append(assistant);
      for (let i = 0; i < 20; i++) assistant.append(document.createTextNode('token'));
      instance.render();
    });
    await page.waitForTimeout(400);
    assert.equal(await page.evaluate(() => window.scans), 0, 'no observer feedback loop');
    // Host page styles are untouched.
    assert.equal(await page.locator('#host-button').evaluate((node) => getComputedStyle(node).position), 'static');
    // Verify responsive containment and dark mode visually.
    fs.mkdirSync(path.join(root, 'test-results'), { recursive: true });
    for (const [width, height, theme] of [[1280, 850, 'light'], [360, 640, 'dark'], [640, 320, 'light']]) {
      await page.setViewportSize({ width, height });
      await page.evaluate((theme) => { document.documentElement.className = theme; }, theme);
      const box = await page.locator('.jn-panel').boundingBox();
      assert.ok(box.x >= 0 && box.y >= 0 && box.x + box.width <= width + 1 && box.y + box.height <= height + 1, `panel contained at ${width}×${height}`);
      await page.screenshot({ path: path.join(root, 'test-results', `${theme}-${width}.png`) });
    }
    await page.setViewportSize({ width: 1280, height: 850 });
    await page.evaluate(() => {
      const main = document.querySelector('main');
      for (let i = 0; i < 250; i++) {
        const node = document.createElement('article');
        node.dataset.messageAuthorRole = 'user'; node.dataset.messageId = `long-${i}`; node.textContent = `Long conversation prompt ${i}`;
        main.append(node);
      }
    });
    await page.waitForFunction(() => document.querySelectorAll('.jn-item').length === 251);
    await input.fill('prompt 249');
    assert.equal(await items.count(), 1, 'long chat search');
    await input.fill('');
    // Pointer dragging must not open/close the panel and must stay within the viewport.
    const handle = await page.locator('.jn-drag').boundingBox();
    await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
    await page.mouse.down();
    await page.mouse.move(70, 720, { steps: 8 });
    await page.mouse.up();
    assert.equal(await page.locator('.jn-panel').isVisible(), true);
    const moved = await toggle.boundingBox();
    assert.ok(moved.x >= 0 && moved.y > 500 && moved.y + moved.height <= 850);
    await page.getByRole('button', { name: 'Restore the navigator button position' }).click();
    assert.equal(await toggle.evaluate((node) => node.style.left), '');
    // A URL change alone is sufficient to reset stale filtering.
    await input.fill('does-not-exist');
    await page.evaluate(() => history.pushState({}, '', '/c/url-only'));
    await page.waitForFunction(() => document.querySelector('input[type="search"]').value === '');
    // UI repairs itself if the SPA removes it.
    await page.evaluate(() => document.getElementById('chatgpt-jump-navigator').remove());
    await page.waitForSelector('.jn-toggle');
    // Rejected writes show feedback without losing the in-memory bookmark or crashing.
    await page.evaluate(() => { chrome.storage.local.set = async () => { throw Error('Quota'); }; });
    await page.getByRole('button', { name: 'Star message 2', exact: true }).click();
    await page.evaluate(() => window.chatGPTNavigatorInstance.saveQueue);
    assert.match(await page.locator('.jn-status').innerText(), /Could not save bookmark/);
    // Failed storage never prevents startup.
    await page.evaluate(() => { chrome.storage.local.get = async () => { throw Error('Unavailable'); }; });
    await page.evaluate(script);
    await page.evaluate(() => window.chatGPTNavigatorInstance.ready);
    assert.equal(await toggle.count(), 1);
    await toggle.click();
    assert.match(await page.locator('.jn-status').innerText(), /Saved settings are unavailable/);
    assert.deepEqual(errors, []);
    console.log('PASS: browser regression checks, storage/clipboard failures, route changes, keyboard navigation, CSS isolation and responsive layouts.');
  } finally { await browser.close(); }
})().catch((error) => { console.error(error); process.exitCode = 1; });
