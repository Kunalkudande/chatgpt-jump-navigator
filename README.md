# ChatGPT Jump Navigator

Version 3.0.0 — a local Chrome extension for finding and revisiting your prompts in long ChatGPT conversations. Supports `chatgpt.com` and `chat.openai.com`.

## Install or update

1. Open `chrome://extensions` and enable **Developer mode**.
2. Click **Load unpacked** and select this folder (the folder containing `manifest.json`). If already installed from this folder, click the extension's **Reload** button instead.
3. Refresh your ChatGPT tabs. A green **Messages** button appears near the top-right.

You can also extract the release ZIP into a permanent folder and load that folder. Keep it in place while the unpacked extension is installed. No build step, account or API key is needed.

## Use

- Click **Messages**, or press **Ctrl+Shift+M** (**Command+Shift+M** on Mac), to open or close the navigator. Browser-reserved shortcuts can take precedence; the button always works.
- Search the full text of loaded user messages. Multiple words match regardless of their order. Search previews show context near the first matching word.
- Click a message to jump to it. It is briefly outlined, and the panel closes.
- Use **↑/↓** from the search field to focus results, then **Enter** to jump. Enter in search jumps to the first result. Tab reaches star and copy buttons. **Escape** closes and restores focus.
- Click **☆** to bookmark a message, and **Starred** to filter this conversation's bookmarks. Identical prompts remain separate when ChatGPT provides message IDs.
- Toggle **Oldest first / Newest first** to reverse the results.
- Click a message's copy icon, or right-click its row, to copy the full prompt. **Copy results** copies all matching full prompts in the displayed order.
- **First / Latest** jump to the first or last loaded user message.
- Drag the dotted handle to move the floating button. Double-click the handle or choose **Reset position** to restore its default location.
- Clicking outside closes the panel. Search and filter state persist through message updates and reset when switching conversations.

The panel follows ChatGPT's explicit light/dark theme, falling back to the system theme. Layout adapts to small screens and scrolling respects reduced-motion preferences.

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

The navigator indexes **text messages currently loaded in the page**, not hidden history or unloaded/virtualized messages. Scroll the conversation to load older messages. Image-only prompts without extractable text are omitted. When ChatGPT provides no stable message ID, editing a prompt or removing earlier identical prompts can change its fallback bookmark identity. ChatGPT markup can change; detection currently uses `data-message-author-role="user"`.

If the button is missing, reload the extension and refresh the tab. Chrome invalidates content scripts when an extension is reloaded, so existing tabs must be refreshed. The extension repairs its UI if ChatGPT removes the panel during normal navigation.

## Development and verification

Runtime files: `manifest.json`, `content.js`, `styles.css`. No runtime dependencies or bundler.

```sh
npm install
npx playwright install chromium
npm run check
npm test
```

To use an existing Chromium browser, set `BROWSER_PATH` to its executable before running tests. The test uses an intercepted ChatGPT-shaped fixture, mocked extension storage and clipboard, and a real browser DOM. It checks search, duplicates, bookmarks, editing, navigation, reinjection, error handling, observer isolation and viewport containment. Screenshots are saved in `test-results/`.

These automated checks do not connect to a signed-in ChatGPT account. After loading the unpacked extension, verify it once on a live conversation to confirm compatibility with the current ChatGPT markup.

## 3.0.0 changes

Full-text search; conversation-specific bookmarks; optional legacy bookmark import; starred filtering; message sorting; explicit copy controls; reliable first/latest navigation; accessible keyboard controls; responsive theme-aware UI; reduced-motion support; isolated CSS; bounded pointer dragging; observer feedback-loop prevention; clean reinjection; validated local extension storage; and browser regression tests.

## License

Free to use and modify for personal or commercial use.
