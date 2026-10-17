# Changes

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
