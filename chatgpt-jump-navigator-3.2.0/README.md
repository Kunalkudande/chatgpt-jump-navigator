# ChatGPT Jump Navigator

Version 3.2.0 — a local Chrome extension for finding and revisiting your prompts in long ChatGPT conversations. Supports `chatgpt.com` and `chat.openai.com`.

## Install or update

1. Open `chrome://extensions` and enable **Developer mode**.
2. Click **Load unpacked** and select this folder (the folder containing `manifest.json`). If already installed from this folder, click the extension's **Reload** button instead.
3. Refresh your ChatGPT tabs. A green **Messages** button appears near the top-right.

You can also extract the release ZIP into a permanent folder and load that folder. Keep it in place while the unpacked extension is installed. No build step, account or API key is needed.

## Use

- Click **Messages**, or press **Ctrl+Shift+M** (**Command+Shift+M** on Mac), to open or close the navigator. Browser-reserved shortcuts can take precedence; the button always works.
- Search the full text of loaded user messages. Multiple words match regardless of their order. Search previews show context near the first matching word.
- Click a message to jump to its beginning. The panel closes; navigation checks and corrects the position while lazy layout settles, then briefly outlines the target. Wheel, touch, pointer or navigation-key input cancels correction immediately.
- Use **↑/↓** from the search field to focus results, then **Enter** to jump. Enter in search jumps to the first result. Tab reaches star and copy buttons. **Escape** closes and restores focus.
- Click **☆** to bookmark a message, and **Starred** to filter this conversation's bookmarks. Identical prompts remain separate when ChatGPT provides message IDs.
- Toggle **Oldest first / Newest first** to reverse the results.
- Click a message's copy icon, or right-click its row, to copy the full prompt. **Copy results** copies all matching full prompts in the displayed order.
- **First** jumps to the first loaded user message. **Latest** goes to the actual bottom of the conversation, including the final assistant reply. To revisit the last user prompt specifically, select its row.
- Drag the dotted handle to move the floating button. Double-click the handle or choose **Reset position** to restore its default location.
- Clicking outside closes the panel. Search and filter state persist through message updates and reset when switching conversations.
- When ChatGPT loads an earlier history batch above, the navigator adds it automatically in conversation order. Nested scroll events and a settled-layout refresh also catch content revealed without a new message mutation. The dropdown preserves the row you are reading when older results are prepended.

The panel follows ChatGPT's explicit light/dark theme, falling back to the system theme. Layout adapts to small screens. Message jumps use direct positioning without a long smooth-scroll animation.

On chat switches, rows, search and filters clear before the new content is accepted. A switching state appears while old content is still mounted. Detected messages stay associated with their owning chat; inactive or unrelated main regions are excluded. Back/forward navigation and reused React message nodes are handled. If a conversation switch is cancelled, the active route is rescanned.

## Existing bookmarks

Earlier versions used ChatGPT's page `localStorage` and stored entire prompt text. If that old data is available, **Import old stars** appears in the toolbar. Open the relevant conversation and click it to import matching loaded prompts. Repeat in other conversations as needed. The extension leaves the original data intact; it cannot determine which conversation an old text-only bookmark belonged to.

The files that existed before this upgrade are preserved locally in `.review-backup/`. This backup is excluded from Git and the release ZIP.

## Privacy and permissions

- Runs only on the two ChatGPT domains listed in the manifest.
- No analytics, remote scripts, network requests or data collection.
- Reads loaded user-message text to display and search it. It never stores full prompts in the new extension storage.
- Uses `chrome.storage.local` for bookmark identifiers, sort preference and button position. Bookmarks are scoped by conversation path and message ID, with a text-hash/occurrence fallback when an ID is unavailable. These local preferences are not synced across devices.
- Bookmark changes propagate between tabs without replacing other conversations' bookmarks.
- Clipboard writes occur only when you click a copy control or right-click a message row. Clipboard failure and storage failure show an inline message.
- The only declared API permission is `storage`. The static content-script matches grant access to ChatGPT pages; no separate broad host permissions are requested.

## Limits and troubleshooting

The navigator indexes **text messages currently present in the page**, including offscreen sections skipped by content-visibility:auto. It cannot fetch history that ChatGPT has not loaded, or read messages removed from the DOM by virtualization. Scroll the conversation to load older messages; the index updates as the page exposes them. Image-only prompts without extractable text are omitted. Anonymous prompt identities stay attached to mounted nodes when earlier identical prompts are prepended, but editing/remounting can still weaken identity when no stable message ID is provided. ChatGPT markup can change; detection supports author-role markers, explicit user-turn markers, user-message test IDs and user-message bubbles in the conversation. Nested wrappers are deduplicated, and assistant/sidebar/inactive hidden content is excluded.

If visible prompts are missing, click **Rescan**. When no prompts are detected, **Copy detection diagnostics** is available below the list. It copies only the extension version and DOM selector counts—never prompt text, message IDs or the conversation URL. Share those counts to help diagnose a new page layout. These additional layouts are verified with browser fixtures; compatibility with a particular live ChatGPT experiment still needs confirmation on that page.

Version 3.0.2 adds the `data-user-message-bubble="true"` marker confirmed in the affected page's Elements screenshot. This layout has `bg-user-message` bubbles inside `group/user-message` wrappers, with none of the older author-role or conversation-turn markers. A regression fixture reproduces that structure with neutral sample text and verifies detection, text extraction, search, copy, jumping, text edits and delayed marker assignment.

If the button is missing, reload the extension and refresh the tab. Chrome invalidates content scripts when an extension is reloaded, so existing tabs must be refreshed. The extension repairs its UI if ChatGPT removes the panel during normal navigation.

## Development and verification

Runtime files: `manifest.json`, `content.js`, `styles.css`. No runtime dependencies or bundler.

The `icons/` folder contains original SVG artwork and generated PNG extension icons. Keep it with the runtime files when packaging.

```sh
npm install
npx playwright install chromium
npm run check
npm test
```

To use an existing Chromium browser, set `BROWSER_PATH` to its executable before running tests. The test uses an intercepted ChatGPT-shaped fixture, mocked extension storage and clipboard, and a real browser DOM. It checks search, duplicates, bookmarks, editing, navigation, reinjection, error handling, observer isolation and viewport containment. Screenshots are saved in `test-results/`.

The additional navigation suite reproduces both URL-before-DOM and DOM-before-URL chat transitions, cancelled navigation, old roots kept mounted, CSS-hidden chats, back navigation, React node reuse, stale callbacks, nested scrolling in a 240-turn conversation, content-visibility layout shifts, delayed answer height growth, target remounting, user cancellation and searching/rescanning 1,200 loaded prompts. Message text is cached in memory and invalidated on relevant mutations to reduce repeated work in large chats.

Scroll verification is bounded to eight seconds. It handles a temporarily unmounted target when it reappears, but cannot fetch history that ChatGPT has never rendered. If the selected message remains unmounted, the panel reopens with an explanation. Anonymous identical prompts still have weaker identity when message IDs are unavailable. The existing bookmark storage format remains unchanged. Automated fixtures cannot guarantee behavior in every live ChatGPT experiment.

`npm run test:install` loads the real unpacked extension into a temporary browser profile and verifies that main-world SPA navigation clears stale rows in the content script's isolated world. Use a Chromium build that supports command-line unpacked extension loading (verified with Microsoft Edge). These tests do not use your browser profile or signed-in account.

The pagination suite also verifies earlier-page prepending inside nested main regions, offscreen auto-contained pages, scroll-only reveals, delayed markers/text, search updates, list-position anchoring and bookmark identity when identical anonymous prompts are inserted above.

## Store listing and discoverability

STORE_LISTING.md contains the new title, summary, ready-to-paste description, release note and privacy-field wording. STORE_SEO_GUIDE.md explains how to apply and measure the listing changes. PRIVACY.md supplies policy source material to complete with your publisher contact and host publicly. This work does not publish the live listing or guarantee a search ranking.

The `store-assets/` folder contains three 1280×800 screenshots of the real extension UI with fictional example prompts, a 440×280 promotional tile and a 128×128 store icon. Run `npm run build:store-assets` to regenerate them (Playwright and Sharp are development dependencies only). Store graphic assets are separate from the runtime ZIP.

These automated checks do not connect to a signed-in ChatGPT account. After loading the unpacked extension, verify it once on a live conversation to confirm compatibility with the current ChatGPT markup.

## 3.0.0 changes

Full-text search; conversation-specific bookmarks; optional legacy bookmark import; starred filtering; message sorting; explicit copy controls; reliable first/latest navigation; accessible keyboard controls; responsive theme-aware UI; reduced-motion support; isolated CSS; bounded pointer dragging; observer feedback-loop prevention; clean reinjection; validated local extension storage; and browser regression tests.

## License

Free to use and modify for personal or commercial use.
