# ChatGPT Jump Navigator privacy information

Version 3.2.0 · Updated 18 October 2026

ChatGPT Jump Navigator reads user-message text already loaded on supported ChatGPT pages to provide in-conversation search, bookmarks, copying and message navigation. New history is indexed when the page loads it or reveals loaded sections. The extension does not fetch private account history or send chat text to another service.

Message text and detection caches are processed in memory in the browser. They are not saved as a conversation archive. The navigator list is scoped to the current conversation; switching chats clears its displayed list. Full prompts are not persisted in extension storage.

The extension uses chrome.storage.local for conversation-specific bookmark identifiers, sort preference and launcher position. Bookmark identifiers may contain a conversation path, a page-provided message ID, or a text hash and duplicate-message occurrence. These local preferences are not synced to another browser by the extension. Removing the extension removes its local extension storage.

The extension makes no network requests, includes no analytics and loads no remote executable code. It runs only on chatgpt.com and chat.openai.com. Copy actions write selected text to the clipboard only when requested by the user. Detection diagnostics include version, selector counts and operational state, without conversation URLs, message IDs or prompt text; they are copied only when the user chooses that action.

Older versions used ChatGPT page localStorage to save starred prompt text. The optional Import old stars control reads that data locally to match loaded prompts. It does not send the old data anywhere or delete it automatically.

ChatGPT itself, the browser and any separately installed extensions have their own privacy behavior, which this extension does not control. ChatGPT Jump Navigator is independent and is not affiliated with or endorsed by OpenAI.

Publisher preparation: add your public support/contact information and any distribution-specific details before hosting this text as your public store privacy policy. This file is supplied policy source material; no policy URL has been published automatically.
