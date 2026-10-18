const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const script = fs.readFileSync(path.join(root, 'content.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'styles.css'), 'utf8');
const errors = [];

(async () => {
  const browser = await chromium.launch({ headless: true, ...(process.env.BROWSER_PATH ? { executablePath: process.env.BROWSER_PATH } : {}) });
  async function fixture(count = 2) {
    const page = await browser.newPage({ viewport: { width: 1280, height: 850 } });
    page.on('pageerror', (error) => errors.push(error.message));
    await page.route('https://chatgpt.com/**', (route) => route.fulfill({ contentType: 'text/html', body: '<!doctype html><html><head><style>body{margin:0;height:100vh;overflow:hidden}#scroller{height:650px;overflow-y:auto;overflow-anchor:none}main{display:block}.prompt{height:70px}.answer{height:500px}#composer{position:fixed;bottom:0}</style></head><body><div id="scroller"><main></main></div><textarea id="composer"></textarea></body></html>' }));
    await page.goto('https://chatgpt.com/c/a');
    await page.evaluate((count) => {
      window.saved = {};
      window.chrome = { storage: { local: { get: async () => window.saved, set: async (value) => Object.assign(window.saved, value), remove: async (key) => delete window.saved[key] }, onChanged: { addListener() {}, removeListener() {} } } };
      const main = document.querySelector('main');
      for (let i = 0; i < count; i++) {
        const prompt = document.createElement('div'); prompt.className = 'prompt'; prompt.dataset.userMessageBubble = 'true'; prompt.dataset.messageId = `a-${i}`; prompt.textContent = `Chat A prompt ${i}`;
        const answer = document.createElement('div'); answer.className = 'answer'; answer.dataset.messageAuthorRole = 'assistant'; answer.textContent = 'Assistant reply';
        main.append(prompt, answer);
      }
    }, count);
    await page.addStyleTag({ content: css }); await page.evaluate(script);
    await page.evaluate(() => window.chatGPTNavigatorInstance.ready);
    return page;
  }
  const texts = (page) => page.evaluate(() => window.chatGPTNavigatorInstance.messages.map((message) => message.text));
  const waitDone = (page) => page.waitForFunction(() => !window.chatGPTNavigatorInstance.jumpOperation, { timeout: 10000 });
  try {
    const page = await fixture();
    await page.locator('.jn-toggle').click();
    await page.getByRole('searchbox').fill('Chat A');
    await page.evaluate(() => {
      window.staleMessage = window.chatGPTNavigatorInstance.messages[0];
      history.pushState({}, '', '/c/b');
    });
    assert.deepEqual(await texts(page), [], 'URL switch clears old rows before React updates the DOM');
    assert.match(await page.locator('.jn-empty').innerText(), /Switching/);
    await page.waitForTimeout(900);
    assert.deepEqual(await texts(page), [], 'old tree is never relabelled as Chat B during a slow transition');
    await page.evaluate(() => {
      const main = document.createElement('main'); main.id = 'chat-b';
      main.innerHTML = '<div data-user-message-bubble="true" data-message-id="b-0">Chat B only prompt</div>';
      document.querySelector('#scroller').append(main); // Keep old Chat A fully mounted and visible.
    });
    await page.waitForFunction(() => window.chatGPTNavigatorInstance.messages.length === 1);
    assert.deepEqual(await texts(page), ['Chat B only prompt']);
    assert.equal(await page.getByRole('searchbox').inputValue(), '');
    await page.evaluate(() => {
      const old = document.querySelector('main').cloneNode(true); old.style.display = 'none'; document.body.append(old);
      const another = document.createElement('main'); another.innerHTML = '<div data-user-message-bubble="true">Unrelated retained root</div>'; document.body.append(another);
    });
    await page.waitForTimeout(300);
    assert.deepEqual(await texts(page), ['Chat B only prompt'], 'active main scope excludes CSS-hidden and unrelated retained roots');
    const scroll = await page.locator('#scroller').evaluate((node) => node.scrollTop);
    await page.evaluate(() => window.chatGPTNavigatorInstance.jump(window.staleMessage));
    assert.equal(await page.locator('#scroller').evaluate((node) => node.scrollTop), scroll, 'a stale row callback cannot navigate the new chat');
    await page.evaluate(() => history.back());
    await page.waitForFunction(() => window.chatGPTNavigatorInstance.conversation === '/c/a');
    assert.deepEqual(await texts(page), ['Chat A prompt 0', 'Chat A prompt 1'], 'back navigation restores only the owning chat');
    await page.close();

    const reused = await fixture();
    await reused.evaluate(() => history.pushState({}, '', '/c/reused'));
    assert.deepEqual(await texts(reused), []);
    await reused.evaluate(() => {
      const main = document.querySelector('main');
      const prompt = main.querySelector('[data-user-message-bubble]');
      prompt.dataset.messageId = 'reused-0'; prompt.textContent = 'New chat on a reused React node';
      main.querySelectorAll('.prompt,.answer').forEach((node) => { if (node !== prompt) node.remove(); });
    });
    await reused.waitForFunction(() => window.chatGPTNavigatorInstance.messages.length === 1);
    assert.deepEqual(await texts(reused), ['New chat on a reused React node']);
    await reused.close();

    const earlyDom = await fixture();
    await earlyDom.evaluate(() => {
      const link = document.createElement('a'); link.id = 'switch-before-url'; link.href = '/c/dom-first'; link.textContent = 'Switch chat'; document.body.prepend(link);
      link.addEventListener('click', (event) => {
        event.preventDefault();
        setTimeout(() => document.querySelector('main').innerHTML = '<div data-user-message-bubble="true" data-message-id="dom-first-0">DOM-first new conversation</div>', 150);
        setTimeout(() => history.pushState({}, '', '/c/dom-first'), 500);
      });
    });
    await earlyDom.locator('#switch-before-url').click();
    assert.deepEqual(await texts(earlyDom), [], 'sidebar intent clears the old list before a delayed router commit');
    await earlyDom.waitForTimeout(300);
    assert.deepEqual(await texts(earlyDom), [], 'DOM-before-URL updates are not indexed into the wrong conversation');
    await earlyDom.waitForFunction(() => window.chatGPTNavigatorInstance.messages.length === 1);
    assert.deepEqual(await texts(earlyDom), ['DOM-first new conversation']);
    assert.equal(await earlyDom.evaluate(() => JSON.parse(window.chatGPTNavigatorInstance.messages[0].key)[0]), '/c/dom-first');
    await earlyDom.close();

    const cancelledRoute = await fixture();
    await cancelledRoute.evaluate(() => {
      const realTimeout = window.setTimeout;
      window.setTimeout = (handler, delay, ...args) => realTimeout(handler, delay === 8000 ? 200 : delay, ...args);
      const link = document.createElement('a'); link.id = 'cancelled-route'; link.href = '/c/never-committed'; link.textContent = 'Cancelled route';
      link.addEventListener('click', (event) => event.preventDefault()); document.body.prepend(link);
    });
    await cancelledRoute.locator('#cancelled-route').click();
    await cancelledRoute.waitForFunction(() => window.chatGPTNavigatorInstance.conversation === '/c/a' && window.chatGPTNavigatorInstance.messages.length === 2);
    assert.deepEqual(await texts(cancelledRoute), ['Chat A prompt 0', 'Chat A prompt 1'], 'cancelled navigation restores the current chat instead of staying stuck');
    await cancelledRoute.close();

    const long = await fixture(240);
    await long.evaluate(() => {
      document.querySelectorAll('.answer').forEach((answer, index) => {
        answer.style.contentVisibility = 'auto'; answer.style.containIntrinsicSize = 'auto 500px'; answer.style.height = 'auto';
        const text = document.createElement('div'); text.style.height = `${500 + (index % 4) * 500}px`; text.textContent = 'A lazily laid out long answer'; answer.replaceChildren(text);
      });
      const tail = document.createElement('div'); tail.id = 'tail'; tail.className = 'answer'; tail.style.height = '22000px'; document.querySelector('main').append(tail);
      document.querySelector('#composer').addEventListener('focus', () => { window.composerFocuses = (window.composerFocuses || 0) + 1; });
    });
    await long.locator('#composer').focus();
    await long.keyboard.press('Control+Shift+m');
    await long.evaluate(() => window.composerFocuses = 0);
    await long.locator('.jn-jump').last().click();
    await long.waitForTimeout(300);
    await long.evaluate(() => document.querySelector('.answer').style.height = '30000px'); // Late image/content layout shift above the target.
    await waitDone(long);
    const reached = await long.evaluate(() => {
      const container = document.querySelector('#scroller');
      const target = document.querySelector('[data-message-id="a-239"]');
      return { offset: target.getBoundingClientRect().top - container.getBoundingClientRect().top, scroll: container.scrollTop, focuses: window.composerFocuses };
    });
    assert.ok(Math.abs(reached.offset - 80) < 4, JSON.stringify(reached));
    assert.ok(reached.scroll > 100000, 'reaches the final prompt in a very long nested scroller');
    assert.equal(reached.focuses, 0, 'jump does not focus the ChatGPT composer and trigger its auto-scroll');
    await long.locator('.jn-toggle').click();
    await long.getByRole('button', { name: 'Jump to bottom of conversation', exact: true }).click();
    await long.waitForTimeout(300);
    await long.evaluate(() => document.querySelector('#tail').style.height = '40000px');
    await waitDone(long);
    assert.ok(await long.locator('#scroller').evaluate((node) => Math.abs(node.scrollTop - (node.scrollHeight - node.clientHeight)) < 4), 'Latest reaches the actual bottom after delayed height growth');
    await long.locator('.jn-toggle').click();
    await long.locator('.jn-jump').first().click();
    await long.waitForTimeout(150);
    await long.mouse.move(400, 300); await long.mouse.wheel(0, 600);
    await long.waitForTimeout(200);
    assert.equal(await long.evaluate(() => Boolean(window.chatGPTNavigatorInstance.jumpOperation)), false, 'manual scrolling cancels correction');
    const manualTop = await long.locator('#scroller').evaluate((node) => node.scrollTop);
    await long.waitForTimeout(600);
    assert.equal(await long.locator('#scroller').evaluate((node) => node.scrollTop), manualTop, 'correction does not fight user scrolling');

    // A virtual renderer can briefly remove a jump target, then mount a new node for it.
    await long.locator('.jn-toggle').click(); await long.locator('.jn-jump').last().click();
    await long.waitForTimeout(150);
    await long.evaluate(() => {
      const original = document.querySelector('[data-message-id="a-239"]');
      const replacement = original.cloneNode(true); replacement.classList.remove('jn-message-highlight');
      const placeholder = document.createElement('div'); placeholder.style.height = '70px'; original.replaceWith(placeholder);
      setTimeout(() => placeholder.replaceWith(replacement), 400);
    });
    await waitDone(long);
    assert.equal(await long.locator('[data-message-id="a-239"].jn-message-highlight').count(), 1, 'highlight follows a remounted target');
    assert.ok(await long.locator('[data-message-id="a-239"]').evaluate((node) => Math.abs(node.getBoundingClientRect().top - document.querySelector('#scroller').getBoundingClientRect().top - 80) < 4));

    await long.locator('.jn-toggle').click(); await long.locator('.jn-jump').first().click();
    await long.evaluate(() => history.pushState({}, '', '/c/new-during-jump'));
    assert.equal(await long.evaluate(() => Boolean(window.chatGPTNavigatorInstance.jumpOperation)), false, 'route changes cancel pending scroll correction');
    assert.deepEqual(await texts(long), []);
    await long.close();

    const large = await fixture(1200);
    await large.locator('.jn-toggle').click();
    assert.equal(await large.locator('.jn-item').count(), 1200);
    await large.getByRole('searchbox').fill('prompt 1199');
    assert.equal(await large.locator('.jn-item').count(), 1, 'search works with 1,200 loaded prompts');
    const scanTime = await large.evaluate(() => {
      const start = performance.now();
      for (let i = 0; i < 4; i++) window.chatGPTNavigatorInstance.scan();
      return performance.now() - start;
    });
    assert.ok(scanTime < 2000, `four cached rescans should not stall a large chat: ${Math.round(scanTime)}ms`);
    await large.close();
    assert.deepEqual(errors, []);
    console.log('PASS: slow chat switches, retained/hidden roots, back navigation, reused React nodes, stale callbacks, 240-turn nested scrolling, late layout shifts, actual bottom, composer focus, remounts and user/route cancellation.');
  } finally { await browser.close(); }
})().catch((error) => { console.error(error); process.exitCode = 1; });
