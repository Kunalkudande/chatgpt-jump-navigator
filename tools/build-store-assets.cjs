// Code-rendered brand assets and screenshots of the real extension UI with fictional prompts.
const { chromium } = require('playwright');
const sharp = require('sharp');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const assets = path.join(root, 'store-assets');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
(async () => {
  fs.mkdirSync(assets, { recursive: true });
  for (const size of [16, 32, 48, 128]) await sharp(Buffer.from(read('icons/icon.svg'))).resize(size, size).png().toFile(path.join(root, 'icons', `icon${size}.png`));
  fs.copyFileSync(path.join(root, 'icons/icon128.png'), path.join(assets, 'store-icon-128.png'));
  const icon = 'data:image/png;base64,' + fs.readFileSync(path.join(root, 'icons/icon128.png')).toString('base64');
  const browser = await chromium.launch({ headless: true, ...(process.env.BROWSER_PATH ? { executablePath: process.env.BROWSER_PATH } : {}) });
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
    const base = `<!doctype html><html class="light"><head><meta charset="utf-8"><style>
      *{box-sizing:border-box}body{margin:0;font:16px/1.5 system-ui,sans-serif;color:#13382e;background:#f1f8f4;width:1280px;height:800px;overflow:hidden}
      .brand{position:absolute;top:46px;left:64px;display:flex;gap:12px;align-items:center;font-weight:700;font-size:18px}.brand img{width:44px;height:44px}
      .hero{position:absolute;top:164px;left:68px;width:600px}.eyebrow{font-size:11px;font-weight:750;letter-spacing:2.6px;color:#087b61}.hero h1{font-size:59px;font-weight:740;letter-spacing:-2.8px;line-height:1.08;margin:20px 0 22px;white-space:pre-line}.hero p{font-size:19px;color:#527166;max-width:480px;margin:0}.tags{display:flex;gap:8px;margin-top:28px}.tags span{padding:7px 13px;background:white;border:1px solid #cfdfd6;border-radius:22px;font-size:12px;color:#426252}
      .demo{position:absolute;left:68px;top:505px;width:555px;max-height:245px;overflow:hidden;padding:20px 24px;background:#ffffffb8;border:1px solid #d8e6de;border-radius:16px;font-size:12px;color:#4c6b5c}.demo-label{font-size:10px;font-weight:750;letter-spacing:1.2px;margin-bottom:12px;color:#678375}.demo [data-user-message-bubble]{padding:8px 10px;border-radius:7px;background:#e8f2ec;margin:6px 0;color:#234e3b}.caption{position:absolute;bottom:30px;right:60px;font-size:11px;color:#6a8477}.orb{position:absolute;right:-160px;top:70px;width:720px;height:720px;background:#dfefe5;border-radius:50%}
      #chatgpt-jump-navigator .jn-toggle{top:93px!important;right:62px!important;left:auto!important}
      #chatgpt-jump-navigator .jn-panel{top:155px!important;left:800px!important;width:390px!important;max-height:590px!important}
    </style></head><body><div class="orb"></div><div class="brand"><img src="${icon}" alt=""><span>ChatGPT Jump Navigator</span></div>
      <div class="hero"><div class="eyebrow">SEARCH &amp; BOOKMARKS FOR YOUR CHAT</div><h1 id="headline"></h1><p id="subhead"></p><div class="tags"><span>Full-message search</span><span>Local bookmarks</span><span>No extension account</span></div></div>
      <main class="demo"><div class="demo-label">EXAMPLE CONVERSATION · FICTIONAL PROMPTS</div><div id="source"></div></main><div class="caption">Actual extension interface · sample conversation</div></body></html>`;
    await page.route('https://chatgpt.com/**', (route) => route.fulfill({ contentType: 'text/html', body: base }));
    const prompts = ['Compare the two project proposals.', 'Build a monthly budget for a small online shop.', 'Turn the project notes into a weekly checklist.', 'Summarize the budget assumptions and next steps.', 'Draft a clear launch announcement.'];
    for (const scene of ['search', 'bookmarks', 'history']) {
      await page.goto('https://chatgpt.com/c/store-demo');
      await page.addStyleTag({ content: read('styles.css') });
      await page.evaluate(({ prompts, scene }) => {
        window.saved = {};
        window.chrome = { storage: { local: { get: async () => window.saved, set: async (value) => Object.assign(window.saved, value), remove: async (key) => delete window.saved[key] }, onChanged: { addListener() {}, removeListener() {} } } };
        document.querySelector('#headline').textContent = scene === 'search' ? 'Find the prompt.\nSkip the scrolling.' : scene === 'bookmarks' ? 'Keep your best\nprompts close.' : 'Older messages.\nAutomatically found.';
        document.querySelector('#subhead').textContent = scene === 'search' ? 'Search the full text of messages in your current ChatGPT conversation.' : scene === 'bookmarks' ? 'Star useful prompts and return to them with one click.' : 'Your message list updates as ChatGPT loads earlier history above.';
        const source = document.querySelector('#source');
        const selected = scene === 'history' ? prompts.slice(3) : prompts;
        selected.forEach((text, i) => { const node = document.createElement('div'); node.dataset.userMessageBubble = 'true'; node.dataset.messageId = `${scene}-${i}`; node.textContent = text; source.append(node); });
      }, { prompts, scene });
      await page.evaluate(read('content.js')); await page.evaluate(() => window.chatGPTNavigatorInstance.ready);
      await page.locator('.jn-toggle').click();
      if (scene === 'search') await page.getByRole('searchbox').fill('budget');
      if (scene === 'bookmarks') {
        await page.getByRole('button', { name: 'Star message 2', exact: true }).click();
        await page.getByRole('button', { name: 'Star message 4', exact: true }).click();
        await page.getByRole('button', { name: 'Show starred messages only' }).click();
      }
      if (scene === 'history') {
        await page.evaluate((texts) => {
          const batch = document.createDocumentFragment();
          texts.forEach((text, i) => { const node = document.createElement('div'); node.dataset.userMessageBubble = 'true'; node.dataset.messageId = `older-${i}`; node.textContent = text; batch.append(node); });
          document.querySelector('#source').prepend(batch);
        }, prompts.slice(0, 3));
        await page.waitForFunction(() => document.querySelector('.jn-count').textContent === '5');
      }
      await page.screenshot({ path: path.join(assets, `screenshot-${scene}-1280x800.png`), omitBackground: false });
    }
    await page.setViewportSize({ width: 440, height: 280 });
    await page.setContent(`<!doctype html><html><body style="margin:0;width:440px;height:280px;background:#eff7f2;font-family:system-ui,sans-serif;color:#153e30;box-sizing:border-box;padding:25px 30px;overflow:hidden"><div style="display:flex;align-items:center;gap:10px;font-size:11px;font-weight:650;color:#587869"><img src="${icon}" width="46" height="46">SEARCH &amp; BOOKMARKS</div><h1 style="font-size:30px;line-height:1.12;letter-spacing:-1px;margin:18px 0 12px">ChatGPT Jump<br>Navigator</h1><p style="font-size:14px;margin:0;color:#4d6f5b">Find your place in long conversations.</p><div style="display:flex;gap:8px;margin-top:18px;font-size:11px;color:#087b61"><span>Search messages</span><span>·</span><span>Save prompts</span><span>·</span><span>Jump back</span></div></body></html>`);
    await page.screenshot({ path: path.join(assets, 'promo-small-440x280.png'), omitBackground: false });
    for (const file of fs.readdirSync(assets).filter((file) => file.endsWith('.png'))) {
      const info = await sharp(path.join(assets, file)).metadata();
      console.log(`${file}: ${info.width}x${info.height}, alpha=${Boolean(info.hasAlpha)}`);
    }
  } finally { await browser.close(); }
})().catch((error) => { console.error(error); process.exitCode = 1; });
