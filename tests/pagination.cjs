const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
(async () => {
  const browser = await chromium.launch({ headless: true, ...(process.env.BROWSER_PATH ? { executablePath: process.env.BROWSER_PATH } : {}) });
  const page = await browser.newPage({ viewport: { width: 1280, height: 850 } });
  const errors = []; page.on('pageerror', (error) => errors.push(error.message));
  await page.route('https://chatgpt.com/**', (route) => route.fulfill({ contentType: 'text/html', body: '<!doctype html><html><head><style>body{margin:0}#scroller{height:650px;overflow:auto}.message{min-height:130px}.css-hidden-page{display:none}</style></head><body><div id="scroller"><main id="thread"><section role="main" id="initial-page"></section></main></div></body></html>' }));
  try {
    await page.goto('https://chatgpt.com/c/pagination');
    await page.evaluate(() => {
      window.saved = {};
      window.chrome = { storage: { local: { get: async () => window.saved, set: async (value) => Object.assign(window.saved, value), remove: async (key) => delete window.saved[key] }, onChanged: { addListener() {}, removeListener() {} } } };
      window.addPage = (id, before = false, count = 5) => {
        const section = document.createElement('section'); section.setAttribute('role', 'main'); section.id = id;
        for (let i = 0; i < count; i++) {
          const message = document.createElement('div'); message.className = 'message'; message.dataset.userMessageBubble = 'true'; message.dataset.messageId = `${id}-${i}`; message.textContent = `${id} prompt ${i}`; section.append(message);
        }
        document.querySelector('#thread')[before ? 'prepend' : 'append'](section); return section;
      };
      for (let i = 0; i < 20; i++) {
        const message = document.createElement('div'); message.className = 'message'; message.dataset.userMessageBubble = 'true'; message.dataset.messageId = `initial-${i}`; message.textContent = `Initial prompt ${i}`; document.querySelector('#initial-page').append(message);
      }
    });
    await page.addStyleTag({ content: fs.readFileSync(path.join(root, 'styles.css'), 'utf8') });
    await page.evaluate(fs.readFileSync(path.join(root, 'content.js'), 'utf8'));
    await page.evaluate(() => window.chatGPTNavigatorInstance.ready);
    await page.locator('.jn-toggle').click();
    assert.equal(await page.locator('.jn-item').count(), 20);
    await page.evaluate(() => window.addPage('Older page', true));
    await page.waitForFunction(() => document.querySelector('.jn-count').textContent === '25');
    assert.match(await page.locator('.jn-item').first().innerText(), /Older page prompt 0/, 'new page above an existing role=main window is included automatically');
    const input = page.getByRole('searchbox');
    await input.fill('Older page'); assert.equal(await page.locator('.jn-item').count(), 5);
    await page.evaluate(() => window.addPage('Older page batch two', true, 3));
    await page.waitForFunction(() => document.querySelectorAll('.jn-item').length === 8);
    assert.equal(await input.inputValue(), 'Older page');
    await input.fill('');
    // Keep the dropdown's reading position when earlier results are inserted.
    await page.locator('.jn-list').evaluate((node) => node.scrollTop = 500);
    const anchor = await page.evaluate(() => {
      const list = document.querySelector('.jn-list'), top = list.getBoundingClientRect().top;
      const item = [...list.children].find((item) => item.getBoundingClientRect().bottom > top);
      return { key: item.dataset.key, offset: item.getBoundingClientRect().top - top };
    });
    await page.evaluate(() => window.addPage('Even earlier', true, 4));
    await page.waitForFunction(() => document.querySelector('.jn-count').textContent === '32');
    const after = await page.evaluate((key) => {
      const list = document.querySelector('.jn-list');
      const item = [...list.children].find((item) => item.dataset.key === key);
      return item.getBoundingClientRect().top - list.getBoundingClientRect().top;
    }, anchor.key);
    assert.ok(Math.abs(after - anchor.offset) < 3, 'prepending older results preserves the visible row position');
    // Offscreen auto-contained pages remain part of the loaded history.
    await page.evaluate(() => {
      const section = window.addPage('Offscreen auto', false, 2);
      section.style.contentVisibility = 'auto'; section.style.containIntrinsicSize = 'auto 500px';
      section.style.marginTop = '15000px';
    });
    await page.waitForFunction(() => document.querySelector('.jn-count').textContent === '34');
    await input.fill('Offscreen auto'); assert.equal(await page.locator('.jn-item').count(), 2);
    await input.fill('');
    // The browser can reveal a preloaded page via stylesheet/layout changes, with no DOM mutation.
    await page.evaluate(() => window.addPage('Reveal later', true, 2).classList.add('css-hidden-page'));
    await page.waitForTimeout(800);
    assert.equal(await page.locator('.jn-count').innerText(), '34');
    await page.evaluate(() => {
      const rule = [...document.styleSheets[0].cssRules].find((rule) => rule.selectorText === '.css-hidden-page'); rule.style.display = 'block';
      document.querySelector('#scroller').dispatchEvent(new Event('scroll'));
    });
    await page.waitForFunction(() => document.querySelector('.jn-count').textContent === '36');
    // Delayed pagination markers and then delayed text both update automatically.
    await page.evaluate(() => {
      const section = document.createElement('section'); section.id = 'placeholder-page'; section.innerHTML = '<div class="message" id="placeholder-bubble"></div>'; document.querySelector('#thread').prepend(section);
    });
    await page.waitForTimeout(220);
    await page.evaluate(() => document.querySelector('#placeholder-bubble').setAttribute('data-user-message-bubble', 'true'));
    await page.waitForTimeout(220);
    await page.evaluate(() => document.querySelector('#placeholder-bubble').textContent = 'An older prompt whose text arrived late');
    await page.waitForFunction(() => document.querySelector('.jn-count').textContent === '37');
    // Identical anonymous prompts must not exchange bookmark identities after a prepend.
    await page.evaluate(() => {
      const main = document.querySelector('#thread'); main.replaceChildren();
      for (const label of ['old-first', 'old-second']) {
        const bubble = document.createElement('div'); bubble.dataset.userMessageBubble = 'true'; bubble.dataset.fixture = label; bubble.textContent = 'Repeated anonymous prompt'; main.append(bubble);
      }
    });
    await page.waitForFunction(() => document.querySelectorAll('.jn-item').length === 2);
    const keyBefore = await page.evaluate(() => window.chatGPTNavigatorInstance.messages[1].key);
    await page.getByRole('button', { name: 'Star message 2', exact: true }).click();
    await page.evaluate(() => {
      const bubble = document.createElement('div'); bubble.dataset.userMessageBubble = 'true'; bubble.dataset.fixture = 'new-earlier'; bubble.textContent = 'Repeated anonymous prompt'; document.querySelector('#thread').prepend(bubble);
    });
    await page.waitForFunction(() => document.querySelector('.jn-count').textContent === '3');
    assert.equal(await page.evaluate(() => window.chatGPTNavigatorInstance.messages[2].key), keyBefore);
    assert.equal(await page.getByRole('button', { name: 'Unstar message 3', exact: true }).getAttribute('aria-pressed'), 'true');
    assert.equal(await page.locator('.jn-star[aria-pressed="true"]').count(), 1);
    await page.evaluate(() => document.querySelector('[data-fixture="new-earlier"]').remove());
    await page.waitForFunction(() => document.querySelector('.jn-count').textContent === '2');
    assert.equal(await page.evaluate(() => window.chatGPTNavigatorInstance.messages[1].key), keyBefore);
    await page.evaluate(() => history.pushState({}, '', '/c/other-chat'));
    assert.equal(await page.locator('.jn-count').innerText(), '0', 'pagination state never leaks into another chat');
    assert.deepEqual(errors, []);
    console.log('PASS: prepended pages, nested pagination regions, active search, list anchoring, offscreen auto content, scroll-only reveals, delayed placeholders and stable anonymous bookmarks.');
  } finally { await browser.close(); }
})().catch((error) => { console.error(error); process.exitCode = 1; });
