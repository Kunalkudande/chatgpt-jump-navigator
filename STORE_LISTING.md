# Chrome Web Store listing · 3.2.0

Upload the extension package to the existing listing, then paste the description below into Store listing. The package already contains the title, short description and icons. This document prepares metadata; it does not change the live listing.

## Title

ChatGPT Jump Navigator - Search & Bookmarks

## Short description (from manifest)

Search messages in long ChatGPT conversations, bookmark prompts, and jump to earlier messages as chat history loads.

## Full description — ready to paste

```text
Find the right prompt in a long ChatGPT conversation without endless scrolling.

ChatGPT Jump Navigator adds a compact message navigator to your current chat. Search the full text of your prompts, bookmark useful messages, and jump back to the part of the conversation you need.

SEARCH YOUR CURRENT CHAT
Search complete user messages, including text beyond the short preview. Enter multiple words to narrow the list. Useful for finding a project requirement, a research question, a budget assumption or a prompt you want to reuse.

BOOKMARK USEFUL PROMPTS
Star important messages and switch to the Starred filter to revisit them. Bookmarks are associated with their conversation and saved locally in your browser.

FOLLOW OLDER HISTORY AS IT LOADS
When ChatGPT loads earlier messages above the current view, the navigator updates automatically. It also includes messages already present in offscreen, lazily rendered sections. Search and filtering remain active while new history appears.

JUMP TO THE RIGHT PLACE
Select a prompt to return to its beginning. The navigator checks the position while the page layout settles. First takes you to the earliest loaded prompt; Latest takes you to the bottom of the conversation, including the final assistant reply.

COPY AND REUSE YOUR MESSAGES
Copy a complete prompt or copy all matching results in the displayed order. Choose oldest-first or newest-first sorting when reviewing a long discussion.

KEYBOARD-FRIENDLY NAVIGATION
Open the navigator with Ctrl+Shift+M on Windows or Command+Shift+M on Mac, when the browser allows that shortcut. Use arrow keys to browse results, Enter to jump and Escape to close. You can always use the Messages button instead.

FITS YOUR WORKFLOW
Move the floating button to a convenient position, reset it when needed, and use the light or dark interface. Chat switches clear the previous list so you can focus on the current conversation.

LOCAL PROCESSING
No extension account, API key or separate subscription is required. The extension processes loaded messages in your browser. It has no analytics, makes no network requests and does not send conversation text to an external service. Bookmark identifiers, button position and sort preference are stored locally; full prompts are not saved in extension storage.

IMPORTANT SCOPE
This tool searches user messages loaded in the current chat, not every conversation in your account. Scroll in ChatGPT to load earlier history; the extension cannot fetch unseen or removed messages. Image-only prompts without readable text are not indexed. ChatGPT interface changes may affect compatibility, and message identity is less reliable when the page provides no stable IDs.

GET STARTED
Install the extension, refresh an open ChatGPT tab, and click Messages. Works on chatgpt.com and chat.openai.com. If a newly loaded prompt is missing, use Rescan.

ChatGPT Jump Navigator is an independent extension and is not affiliated with or endorsed by OpenAI. ChatGPT is a product of OpenAI.
```

## Graphic assets to upload

- `store-assets/store-icon-128.png` — store icon, 128 × 128.
- `store-assets/screenshot-search-1280x800.png` — first screenshot, demonstrates full-message search.
- `store-assets/screenshot-bookmarks-1280x800.png` — second screenshot, demonstrates starred filtering.
- `store-assets/screenshot-history-1280x800.png` — third screenshot, demonstrates older messages added to the list.
- `store-assets/promo-small-440x280.png` — small promotional tile.

The screenshots use the real extension interface with fictional sample prompts and are labelled as an example conversation. They include no private chat content. Screenshots and promo tile are opaque RGB PNGs; the icon has transparency.

## Privacy-field wording

Single purpose: “Find, bookmark and navigate user messages within the current ChatGPT conversation.”

Storage justification: “Stores conversation-specific bookmark identifiers, message sort order and the floating button position in chrome.storage.local. Full prompts are not persisted. Data is processed locally and is not transmitted to a server.”

Website access: “Static content scripts run only on chatgpt.com and chat.openai.com to read loaded user-message text and scroll to selected prompts. No remote-host access or background network requests are used.”

Match every dashboard privacy declaration to the actual local-processing behavior and your hosted privacy policy. Use PRIVACY.md as source material, add publisher contact details and host it at a public HTTPS URL before providing it as your policy link.

## Release note

Version 3.2.0 automatically refreshes the navigator as earlier chat history loads, supports nested pagination windows and offscreen content, preserves the dropdown reading position, and keeps anonymous bookmarks stable when earlier identical prompts are inserted. It also adds clearer listing metadata and an original navigation/search icon.
