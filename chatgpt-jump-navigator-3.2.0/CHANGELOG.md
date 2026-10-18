# Changes

## 3.2.0

- Automatically rescan nested conversation scrolling and settled layout to discover earlier history without requiring the user to reopen the panel.
- Include offscreen auto-contained messages while excluding truly hidden/inactive content. Use the outer conversation main region instead of locking onto an inner pagination window.
- Keep full-text search and filters current as older pages arrive; preserve the visible row position when results are prepended.
- Preserve keys of mounted anonymous duplicate prompts so prepending older copies does not transfer existing bookmarks.
- Add a focused pagination regression suite covering earlier batches, layout-only reveals, delayed placeholders, active search, dropdown anchoring and duplicate bookmarks.
- Clarify store title and short description, add an original search/navigation icon, ready-to-paste listing copy, privacy source text, a discoverability guide and real-interface store graphics using fictional prompts.

## 3.1.0

- Clear rows and filters at chat navigation, wait for replacement content and track each detected node's conversation ownership. Scope reads to the active main region and exclude CSS-hidden/inert cached chats.
- Cancel pending jumps on route changes and reject stale row actions from the previous chat. Handle back/forward navigation and reused React nodes.
- Replace one-shot smooth scrolling with direct positioning in the nearest scroll container, followed by bounded correction for lazy layout, late height changes and remounted targets. Manual user input cancels correction.
- Make Latest reach the actual conversation bottom, including the final assistant reply. Individual rows align the beginning of the selected prompt near the top.
- Avoid restoring focus to ChatGPT's composer during jumps, which can trigger host auto-scroll.
- Cache extracted text and invalidate it on relevant mutations for more responsive large-chat rescanning. Preserve the existing bookmark storage format.
- Add regression tests for slow switches, retained roots, back navigation, stale callbacks, reused nodes, 240-turn layout/scrolling failures and 1,200-message search/rescan behavior.

## 3.0.2

- Add support for `data-user-message-bubble="true"`, the explicit user marker confirmed in the affected ChatGPT page's Elements screenshot.
- Read the new bubble body when nested inside older turn wrappers, and observe marker changes after initial rendering.
- Include the new marker count in text-free detection diagnostics.
- Reproduce the screenshot's wrapper structure with neutral text in regression tests; verify search, copying, jump targets, text edits and delayed classification.

## 3.0.1

- Fix the single-selector limitation that could show zero loaded prompts when a conversation uses user-turn wrappers or user-message bubbles without the legacy author-role marker.
- Support mixed message renderers without counting the same prompt twice, and preserve message IDs when they move to an inner wrapper.
- Extract multiple text sections and omit copy/edit controls, hidden duplicates, assistant output and sidebar items.
- Observe delayed user-turn markers, bubble classes, text edits and visibility changes.
- Add Rescan and a text-free detection diagnostic export for unrecognized layouts.
- Add regression fixtures for alternate layouts, no legacy author-role markers, deduplication, identity preservation and delayed classification.

## 3.0.0

- Search full prompt text instead of only the shortened preview; preserve filtering through live updates.
- Isolate bookmark identities by conversation and message, with separate storage keys to avoid cross-tab overwrites.
- Store identifiers and preferences in extension storage instead of adding prompt text to ChatGPT page storage. Offer an explicit import of legacy stars.
- Add starred filtering, reverse order, visible copy buttons, copying all results, first/latest navigation and reset position.
- Replace leaking reinitialization paths with one instance that disconnects observers, listeners and timers on reinjection.
- Ignore extension DOM changes and assistant-only streaming in the mutation observer. Refresh user text edits, removals and React node replacements.
- Remove global CSS selectors that altered ChatGPT's tooltips and scrollbars. Add theme-aware colors and viewport-bound layouts.
- Improve semantic controls, focus handling, keyboard navigation, pointer dragging, reduced-motion behavior and storage/clipboard error feedback.
- Remove redundant host permissions and add automated browser regression checks.

Historical `ISSUES_FIXED.md` is an earlier review supplied with the original folder. Its claims describe that earlier review and are not a record of verification for this release. See README for the current implementation and limits.
