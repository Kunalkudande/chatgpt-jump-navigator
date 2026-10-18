// Isolated content script: no conversation text leaves this tab.
(() => {
  'use strict';
  if (!['chatgpt.com', 'chat.openai.com'].includes(location.hostname)) return;
  window.chatGPTNavigatorInstance?.destroy?.();
  const ROOT = 'chatgpt-jump-navigator';
  // ChatGPT has multiple conversation renderers; the inner author marker is not universal.
  const USER_MARKERS = '[data-message-author-role="user"], [data-turn="user"], [data-turn-role="user"], [data-testid="user-message"], [data-user-message-bubble="true"]';
  const BUBBLE = '[data-user-message-bubble="true"], .user-message-bubble-color';
  const SELECTOR = `${USER_MARKERS}, .user-message-bubble-color`;
  const ASSISTANT = '[data-message-author-role="assistant"], [data-turn="assistant"], [data-turn-role="assistant"]';
  const TURN = '[data-testid^="conversation-turn-"]';
  const IGNORE = 'nav, aside, [hidden], [inert], [aria-hidden="true"], [contenteditable="true"], script, style, template';
  const STORAGE = 'jumpNavigatorV3';
  const STAR_PREFIX = 'jumpNavigatorStar:';
  const clamp = (value, min, max) => Math.max(min, Math.min(value, Math.max(min, max)));
  const hash = (text) => {
    let value = 2166136261;
    for (let i = 0; i < text.length; i++) value = Math.imul(value ^ text.charCodeAt(i), 16777619);
    return (value >>> 0).toString(36);
  };
  const el = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  };

  class ChatGPTNavigator {
    constructor() {
      this.events = new AbortController();
      this.messages = [];
      this.stars = new Set();
      this.query = '';
      this.onlyStarred = false;
      this.newestFirst = false;
      this.isOpen = false;
      this.conversation = this.conversationKey();
      this.position = null;
      this.saveQueue = Promise.resolve();
      this.owners = new WeakMap();
      this.textCache = new WeakMap();
      this.transition = null;
      this.routeEpoch = 0;
      this.ready = this.init();
    }
    listen(node, event, handler, options = {}) {
      node.addEventListener(event, handler, { ...options, signal: this.events.signal });
    }
    conversationKey() { return location.pathname.replace(/\/$/, '') || '/'; }
    keyForUrl(url) { return new URL(url, location.href).pathname.replace(/\/$/, '') || '/'; }
    scheduleScan(delay = 180) {
      if (this.scanTimer) return;
      this.scanTimer = setTimeout(() => {
        this.scanTimer = null;
        if (!this.root.isConnected) document.body.append(this.root);
        this.scan();
      }, delay);
    }
    scheduleSettledScan() {
      clearTimeout(this.settleTimer);
      this.settleTimer = setTimeout(() => this.scheduleScan(0), 500);
    }
    isRenderable(node) {
      // Offscreen content-visibility:auto is part of the loaded chat, unlike display:none.
      if (node.checkVisibility) return node.checkVisibility({ checkVisibilityCSS: true, contentVisibilityAuto: false });
      for (let parent = node; parent; parent = parent.parentElement) {
        const style = getComputedStyle(parent);
        if (style.display === 'none' || style.visibility !== 'visible' || style.contentVisibility === 'hidden') return false;
      }
      return true;
    }
    messageScope(node) {
      const explicit = node.closest('[data-conversation-id]');
      if (explicit) return explicit;
      let scope = node.closest('main, [role="main"]');
      // Pagination windows can each be role=main inside a single outer conversation main.
      while (scope?.parentElement?.closest('main, [role="main"]')) scope = scope.parentElement.closest('main, [role="main"]');
      return scope;
    }
    expectRoute(key) {
      this.expectedRoute = key;
      this.beginRoute(key);
      clearTimeout(this.routeIntentTimer);
      this.routeIntentTimer = setTimeout(() => {
        if (this.expectedRoute === key) { this.expectedRoute = null; this.scan(); }
      }, 8000);
    }
    invalidate(record) {
      let node = record.target.nodeType === 1 ? record.target : record.target.parentElement;
      while (node) {
        const message = node.closest(SELECTOR);
        if (!message) break;
        this.textCache.delete(message);
        node = message.parentElement;
      }
    }
    beginRoute(key) {
      if (key === this.conversation) return;
      this.cancelJump();
      this.clearHighlight();
      // Keep old identities separate until the new renderer actually supplies new content.
      const old = this.messages.length ? this.messages.map((message) => ({ node: message.node, text: message.text, id: message.id })) : (this.transition?.old || []);
      this.transition = { old, signatures: new Set(old.map((message) => `${message.id || ''}\n${message.text}`)) };
      this.conversation = key;
      this.activeRoot = null;
      this.routeEpoch++;
      this.messages = [];
      this.query = '';
      this.input.value = '';
      this.onlyStarred = false;
      this.list.replaceChildren();
      this.list.scrollTop = 0;
      this.status.textContent = '';
      this.update();
    }

    async init() {
      this.createUI();
      this.scan();
      this.listen(document, 'keydown', (event) => this.onKey(event));
      // The Navigation API fires for the app's own pushState as well as back/forward.
      // Patching history in an isolated content-script world would miss main-world calls.
      if (window.navigation) {
        this.listen(window.navigation, 'navigate', (event) => {
          if (!event.hashChange && event.destination?.url) {
            this.expectRoute(this.keyForUrl(event.destination.url));
          }
        });
        this.listen(window.navigation, 'currententrychange', () => { clearTimeout(this.routeIntentTimer); this.expectedRoute = null; this.scan(); });
        this.listen(window.navigation, 'navigateerror', () => { clearTimeout(this.routeIntentTimer); this.expectedRoute = null; this.scan(); });
      }
      this.listen(window, 'popstate', () => { this.beginRoute(this.conversationKey()); this.scan(); });
      this.listen(document, 'click', (event) => {
        if (event.defaultPrevented || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
        const link = event.target.closest?.('a[href]');
        if (!link || link.target === '_blank') return;
        const url = new URL(link.href, location.href);
        if (url.origin !== location.origin || !/\/(?:c\/|project\/|g\/)|^\/$/.test(url.pathname)) return;
        if (this.keyForUrl(url) !== this.conversation) {
          // Some routers render the new tree before pushState. Record sidebar intent first.
          const key = this.keyForUrl(url);
          this.expectRoute(key);
        }
      }, { capture: true });
      for (const type of ['wheel', 'touchstart', 'pointerdown']) this.listen(document, type, (event) => {
        this.cancelJump();
      }, { capture: true, passive: true });
      this.listen(document, 'pointerdown', (event) => {
        if (this.isOpen && !this.root.contains(event.target)) this.close(false);
      });
      this.listen(window, 'resize', () => {
        this.placeButton();
        this.placePanel();
        this.scheduleScan(); this.scheduleSettledScan();
      });
      this.listen(document, 'scroll', (event) => {
        if (this.root.contains(event.target)) return;
        if (event.target.nodeType === 1 && event.target.closest('nav,aside')) return;
        this.scheduleScan(220); this.scheduleSettledScan();
      }, { capture: true, passive: true });
      this.listen(document, 'scrollend', (event) => {
        if (!this.root.contains(event.target)) this.scheduleScan(0);
      }, { capture: true, passive: true });
      this.observer = new MutationObserver((records) => {
        records.forEach((record) => this.invalidate(record));
        const routeChanged = !this.expectedRoute && this.conversation !== this.conversationKey();
        if (routeChanged) this.beginRoute(this.conversationKey());
        const relevant = records.some((record) => {
          if (this.root.contains(record.target)) return false;
          if (record.target.nodeType === 1 && record.target.closest(SELECTOR)) return true;
          if (record.target.parentElement?.closest(SELECTOR)) return true;
          if (record.type === 'attributes') {
            if (record.attributeName === 'style') {
              const previous = document.createElement('div').style;
              previous.cssText = record.oldValue || '';
              return ['display', 'visibility', 'content-visibility'].some((name) => previous.getPropertyValue(name) !== record.target.style.getPropertyValue(name));
            }
            if (record.attributeName !== 'class') return true;
            // Ignore ordinary styling and our own jump highlight changes.
            return record.target.classList.contains('user-message-bubble-color') ||
              (record.oldValue || '').split(/\s+/).includes('user-message-bubble-color') || Boolean(record.target.querySelector(SELECTOR));
          }
          return [...record.addedNodes, ...record.removedNodes].some((node) =>
            node === this.root || (node.nodeType === 1 &&
              (node.matches(SELECTOR) || node.querySelector(SELECTOR) || node.contains(this.root))));
        });
        if (!relevant && !routeChanged && !this.transition) return;
        // A follow-up catches pagination placeholders that become layout-ready after insertion.
        this.scheduleScan(); this.scheduleSettledScan();
      });
      this.observer.observe(document.body, { subtree: true, childList: true, characterData: true,
        attributes: true, attributeOldValue: true,
        attributeFilter: ['data-message-id', 'data-chatgpt-search-message-ids', 'data-conversation-id', 'data-message-author-role', 'data-user-message-bubble', 'data-turn', 'data-turn-role', 'data-testid', 'class', 'style', 'hidden', 'inert', 'aria-hidden'] });
      this.routeTimer = setInterval(() => {
        if (this.conversation !== this.conversationKey() || this.transition) this.scan();
      }, 250);
      try {
        const all = await chrome.storage.local.get(null);
        const saved = all[STORAGE];
        this.stars = new Set(Object.keys(all).filter((key) => key.startsWith(STAR_PREFIX) && all[key] === true).map((key) => key.slice(STAR_PREFIX.length)));
        if (saved && typeof saved === 'object') {
          if (Number.isFinite(saved.position?.left) && Number.isFinite(saved.position?.top)) this.position = saved.position;
          this.newestFirst = saved.newestFirst === true;
        }
      } catch {
        this.notify('Saved settings are unavailable. Changes will last for this tab only.');
      }
      if (this.events.signal.aborted) return;
      this.storageReady = true;
      this.storageListener = (changes, area) => {
        if (area !== 'local') return;
        let changed = false;
        for (const [key, change] of Object.entries(changes)) {
          if (!key.startsWith(STAR_PREFIX)) continue;
          change.newValue === true ? this.stars.add(key.slice(STAR_PREFIX.length)) : this.stars.delete(key.slice(STAR_PREFIX.length));
          changed = true;
        }
        if (changed && this.isOpen) this.render();
      };
      try { chrome.storage.onChanged.addListener(this.storageListener); } catch { /* Unavailable after extension reload. */ }
      this.offerLegacyImport();
      this.placeButton();
      this.update();
    }

    button(text, label, handler, className = 'jn-control') {
      const button = el('button', className, text);
      button.type = 'button';
      button.setAttribute('aria-label', label);
      button.title = label;
      // Detached rows must be collectible; the lifetime signal is for global listeners.
      button.addEventListener('click', handler);
      return button;
    }
    createUI() {
      document.getElementById(ROOT)?.remove();
      this.root = el('div');
      this.root.id = ROOT;
      this.toggle = this.button('', 'Open message navigator (Ctrl or Command + Shift + M)', () => {
        if (!this.suppressClick) this.isOpen ? this.close() : this.open();
      }, 'jn-toggle');
      this.handle = el('span', 'jn-drag', '⠿');
      this.handle.title = 'Drag to reposition; double-click to reset';
      this.handle.setAttribute('aria-hidden', 'true');
      this.count = el('span', 'jn-count', '0');
      this.toggle.append(this.handle, el('span', '', 'Messages'), this.count);
      this.toggle.setAttribute('aria-expanded', 'false');
      this.toggle.setAttribute('aria-controls', 'jn-panel');
      this.panel = el('section', 'jn-panel');
      this.panel.id = 'jn-panel';
      this.panel.hidden = true;
      this.panel.setAttribute('role', 'dialog');
      this.panel.setAttribute('aria-label', 'Message navigator');
      const header = el('div', 'jn-header');
      const heading = el('div');
      heading.append(el('h2', '', 'Your messages'), el('p', '', 'Find your place in the conversation'));
      header.append(heading, this.button('×', 'Close navigator', () => this.close()));
      const search = el('div', 'jn-search');
      this.input = el('input');
      this.input.type = 'search';
      this.input.placeholder = 'Search full messages…';
      this.input.setAttribute('aria-label', 'Search full messages');
      this.input.autocomplete = 'off';
      this.listen(this.input, 'input', () => { this.query = this.input.value; this.render(); });
      search.append(this.input);
      const toolbar = el('div', 'jn-toolbar');
      this.filter = this.button('☆ Starred', 'Show starred messages only', () => {
        this.onlyStarred = !this.onlyStarred;
        this.render();
      });
      this.sort = this.button('Oldest first ↓', 'Reverse message order', () => {
        this.newestFirst = !this.newestFirst;
        this.render();
        this.save();
      });
      toolbar.append(this.filter, this.sort, this.button('↻ Rescan', 'Rescan loaded conversation messages', () => {
        this.scan(); this.render();
        this.notify(this.messages.length ? `Found ${this.messages.length} loaded messages.` : 'No user messages detected. Copy diagnostics to help identify this page layout.');
      }));
      this.toolbar = toolbar;
      this.results = el('div', 'jn-results');
      this.results.setAttribute('aria-live', 'polite');
      this.list = el('div', 'jn-list');
      this.list.setAttribute('aria-label', 'Matching messages');
      const footer = el('div', 'jn-footer');
      footer.append(this.button('↑ First', 'Jump to first loaded message', () => { this.scan(); this.jump(this.messages[0]); }),
        this.button('↓ Latest', 'Jump to bottom of conversation', () => this.jumpBottom()),
        this.button('Copy results', 'Copy all matching full messages', () => {
          this.scan(); this.copy(this.filtered().map((message) => `${message.index + 1}. ${message.text}`).join('\n\n'));
        }));
      this.help = el('p', 'jn-help', '↑ ↓ to browse · Enter to jump · Esc to close');
      const reset = this.button('Reset position', 'Restore the navigator button position', () => this.resetPosition(), 'jn-reset');
      this.diagnosticButton = this.button('Copy detection diagnostics', 'Copy detection counts without conversation text', () => this.copy(JSON.stringify(this.diagnostics(), null, 2)), 'jn-reset');
      this.status = el('div', 'jn-status');
      this.status.setAttribute('role', 'status');
      this.panel.append(header, search, toolbar, this.results, this.list, footer, this.help, reset, this.diagnosticButton, this.status);
      this.root.append(this.toggle, this.panel);
      document.body.append(this.root);
      this.setupDrag();
    }

    messageNodes() {
      const candidates = [...document.querySelectorAll(SELECTOR)].filter((node) => {
        if (this.root.contains(node) || node.closest(IGNORE) || node.closest(ASSISTANT)) return false;
        if (!this.transition && this.activeRoot?.isConnected && this.isRenderable(this.activeRoot) && !this.activeRoot.contains(node)) return false;
        // Cached chats may remain mounted under CSS-hidden panels, without a hidden attribute.
        if (!this.isRenderable(node)) return false;
        const container = node.closest('[data-conversation-id]');
        const chatId = this.conversation.match(/\/c\/([^/]+)/)?.[1];
        if (chatId && container && ![chatId, this.conversation].includes(container.getAttribute('data-conversation-id'))) return false;
        // A bubble-color class alone is accepted only inside the conversation, never the sidebar.
        if (!node.matches(USER_MARKERS) &&
          !node.closest(`main, [role="main"], ${TURN}`)) return false;
        return true;
      });
      const candidateSet = new Set(candidates);
      return candidates.filter((node) => {
        // A turn, inner author wrapper and bubble can all identify the same prompt.
        for (let parent = node.parentElement; parent; parent = parent.parentElement) {
          if (candidateSet.has(parent)) return false;
        }
        return true;
      });
    }
    messageText(node) {
      if (this.textCache.has(node)) return this.textCache.get(node);
      const bubble = node.matches(BUBBLE) ? node : node.querySelector(BUBBLE);
      const body = bubble || node;
      const chunks = [...body.querySelectorAll('.whitespace-pre-wrap')].filter((chunk) =>
        !chunk.parentElement?.closest('.whitespace-pre-wrap') || !body.contains(chunk.parentElement.closest('.whitespace-pre-wrap')));
      const clean = (element) => {
        const copy = element.cloneNode(true);
        copy.querySelectorAll('button, [role="button"], textarea, input, select, script, style, .sr-only, [aria-hidden="true"]').forEach((control) => control.remove());
        return copy.textContent.trim();
      };
      const text = chunks.length ? chunks.map(clean).filter(Boolean).join('\n\n') : clean(body);
      this.textCache.set(node, text);
      return text;
    }
    readMessages() {
      const occurrences = new Map();
      let entries = this.messageNodes().map((node) => {
        const text = this.messageText(node);
        const id = node.getAttribute('data-message-id') || node.querySelector('[data-message-id]')?.getAttribute('data-message-id') ||
          node.closest('[data-message-id]')?.getAttribute('data-message-id') || node.getAttribute('data-turn-id');
        return { node, text, id };
      }).filter(({ node, text, id }) => {
        if (!text) return false;
        const owner = this.owners.get(node);
        if (owner && owner.conversation !== this.conversation && owner.text === text && owner.id === id) return false;
        // During URL-before-DOM transitions even a cloned old tree is not a new conversation.
        if (this.transition?.old.some((entry) => entry.node.isConnected && entry.node.getClientRects().length) &&
          this.transition.signatures.has(`${id || ''}\n${text}`) && owner?.conversation !== this.conversation &&
          !node.closest('[data-conversation-id]')) return false;
        return true;
      });
      // Once a chat's visible main region is identified, do not index retained sibling roots.
      const activeRoot = entries[0] && this.messageScope(entries[0].node);
      if (activeRoot) {
        this.activeRoot = activeRoot;
        entries = entries.filter((entry) => activeRoot.contains(entry.node));
      }
      if (this.transition && (entries.length || !this.transition.old.some((entry) => entry.node.isConnected && entry.node.getClientRects().length))) this.transition = null;
      // Preserve anonymous prompt identities when older identical prompts are prepended.
      const reserved = new Set(entries.map(({ node, text, id }) => {
        const owner = this.owners.get(node);
        return !id && owner?.conversation === this.conversation && owner.text === text && owner.id === id ? owner.key : null;
      }).filter(Boolean));
      const used = new Set();
      return entries.map(({ node, text, id }, index) => {
        const digest = hash(text), occurrence = occurrences.get(digest) || 0;
        const owner = this.owners.get(node);
        let slot = occurrence;
        let key = JSON.stringify([this.conversation, id || `${digest}:${slot}`]);
        if (!id && owner?.conversation === this.conversation && owner.text === text && owner.id === id && owner.key) key = owner.key;
        else if (!id) {
          while (reserved.has(key) || used.has(key)) key = JSON.stringify([this.conversation, `${digest}:${++slot}`]);
        }
        used.add(key); occurrences.set(digest, slot + 1);
        this.owners.set(node, { conversation: this.conversation, text, id, key });
        return { node, text, id, index, key };
      });
    }
    diagnostics() {
      const count = (selector) => document.querySelectorAll(selector).length;
      // Deliberately excludes URLs, conversation IDs, prompts and message text.
      return { extensionVersion: chrome.runtime?.getManifest?.().version || '3.2.0',
        mainRegions: count('main, [role="main"]'), conversationTurns: count(TURN),
        authorUserMarkers: count('[data-message-author-role="user"]'), userTurnMarkers: count('[data-turn="user"]'),
        userTurnRoleMarkers: count('[data-turn-role="user"]'), userTestIdMarkers: count('[data-testid="user-message"]'),
        userBubbleMarkers: count('.user-message-bubble-color'),
        userBubbleAttributeMarkers: count('[data-user-message-bubble="true"]'), detectedUserMessages: this.messages.length,
        switchingConversation: Boolean(this.transition), navigationActive: Boolean(this.jumpOperation) };
    }
    scan() {
      // A user can click a row before the MutationObserver callback is delivered.
      this.observer?.takeRecords().forEach((record) => this.invalidate(record));
      if (this.expectedRoute && this.conversationKey() !== this.expectedRoute) return;
      const routeChanged = this.conversationKey() !== this.conversation;
      if (routeChanged) this.beginRoute(this.conversationKey());
      const wasSwitching = Boolean(this.transition);
      const messages = this.readMessages();
      const changed = routeChanged || wasSwitching !== Boolean(this.transition) || messages.length !== this.messages.length || messages.some((message, i) =>
        message.text !== this.messages[i]?.text || message.key !== this.messages[i]?.key);
      this.messages = messages; // React may replace DOM nodes without changing their text.
      if (changed) this.update();
    }
    update() {
      this.count.textContent = this.messages.length;
      if (this.isOpen) this.render();
    }
    filtered() {
      const terms = this.query.toLocaleLowerCase().trim().split(/\s+/).filter(Boolean);
      const messages = this.messages.filter((message) => (!this.onlyStarred || this.stars.has(message.key)) &&
        terms.every((term) => message.text.toLocaleLowerCase().includes(term)));
      return this.newestFirst ? messages.reverse() : messages;
    }
    render() {
      const focus = document.activeElement;
      const focusedKey = focus?.closest('.jn-item')?.dataset.key;
      const focusedAction = focus?.dataset.action;
      const scrollTop = this.list.scrollTop;
      const listTop = this.list.getBoundingClientRect().top;
      const anchor = scrollTop > 2 && this.isOpen ? [...this.list.children].find((item) => item.dataset.key && item.getBoundingClientRect().bottom > listTop) : null;
      const anchorKey = anchor?.dataset.key;
      const anchorOffset = anchor ? anchor.getBoundingClientRect().top - listTop : 0;
      this.list.replaceChildren();
      this.filter.setAttribute('aria-pressed', String(this.onlyStarred));
      this.sort.textContent = this.newestFirst ? 'Newest first ↑' : 'Oldest first ↓';
      const messages = this.filtered();
      this.diagnosticButton.hidden = this.messages.length > 0;
      this.results.textContent = `${messages.length} of ${this.messages.length} loaded messages`;
      if (!messages.length) {
        const empty = el('div', 'jn-empty');
        empty.append(el('strong', '', this.transition ? 'Switching conversation…' : this.messages.length ? 'No matching messages' : 'No messages loaded yet'),
          el('p', '', this.transition ? 'Waiting for this chat’s messages to appear.' : this.messages.length ? 'Try another search or turn off the starred filter.' : 'If a prompt is visible, try Rescan. If it stays empty, copy detection diagnostics below.'));
        this.list.append(empty);
      }
      const fragment = document.createDocumentFragment();
      messages.forEach((message) => {
        const item = el('div', 'jn-item');
        item.dataset.key = message.key;
        const jump = this.button('', `Jump to message ${message.index + 1}: ${message.text.slice(0, 160)}`, () => this.jump(message), 'jn-jump');
        jump.dataset.action = 'jump';
        jump.append(el('span', 'jn-number', String(message.index + 1).padStart(2, '0')), el('span', 'jn-preview', this.preview(message.text)));
        const starred = this.stars.has(message.key);
        const star = this.button(starred ? '★' : '☆', `${starred ? 'Unstar' : 'Star'} message ${message.index + 1}`, () => {
          this.scan();
          if (!this.messages.some((entry) => entry.key === message.key)) return;
          if (!this.storageReady) return;
          const enabled = !this.stars.has(message.key);
          enabled ? this.stars.add(message.key) : this.stars.delete(message.key);
          this.saveStar(message.key, enabled);
          this.render();
        }, 'jn-star');
        star.dataset.action = 'star';
        star.setAttribute('aria-pressed', String(starred));
        const copy = this.button('⧉', `Copy message ${message.index + 1}`, () => {
          this.scan();
          if (this.messages.some((entry) => entry.key === message.key)) this.copy(message.text);
        }, 'jn-copy');
        copy.dataset.action = 'copy';
        item.append(jump, star, copy);
        item.addEventListener('contextmenu', (event) => {
          event.preventDefault(); this.scan();
          if (this.messages.some((entry) => entry.key === message.key)) this.copy(message.text);
        });
        fragment.append(item);
      });
      this.list.append(fragment);
      this.list.scrollTop = scrollTop;
      if (anchorKey) {
        const replacement = [...this.list.children].find((item) => item.dataset.key === anchorKey);
        if (replacement) this.list.scrollTop += replacement.getBoundingClientRect().top - this.list.getBoundingClientRect().top - anchorOffset;
      }
      if (focusedKey) {
        const item = [...this.list.children].find((node) => node.dataset.key === focusedKey);
        ([...(item?.querySelectorAll('button') || [])].find((button) => button.dataset.action === focusedAction) || this.input).focus({ preventScroll: true });
      }
      this.placePanel();
    }
    preview(text) {
      const term = this.query.trim().split(/\s+/)[0];
      const match = term ? text.toLocaleLowerCase().indexOf(term.toLocaleLowerCase()) : 0;
      const start = Math.max(0, match - 40);
      const snippet = text.slice(start, start + 180).replace(/\s+/g, ' ');
      return `${start ? '…' : ''}${snippet}${start + 180 < text.length ? '…' : ''}`;
    }
    open() {
      this.cancelJump();
      this.previousFocus = document.activeElement;
      this.isOpen = true;
      this.panel.hidden = false;
      this.toggle.setAttribute('aria-expanded', 'true');
      this.scan();
      this.render();
      this.input.focus();
    }
    close(restoreFocus = true) {
      this.isOpen = false;
      this.panel.hidden = true;
      this.toggle.setAttribute('aria-expanded', 'false');
      if (restoreFocus) (this.previousFocus?.isConnected ? this.previousFocus : this.toggle).focus({ preventScroll: true });
    }
    scrollContainer(node) {
      for (let parent = node?.parentElement; parent; parent = parent.parentElement) {
        if (/(auto|scroll|overlay)/.test(getComputedStyle(parent).overflowY) && parent.scrollHeight > parent.clientHeight + 1) return parent;
      }
      return document.scrollingElement || document.documentElement;
    }
    scrollBounds(container) {
      if (container === document.scrollingElement || container === document.documentElement) return { top: 0, height: innerHeight };
      const rect = container.getBoundingClientRect();
      return { top: rect.top + container.clientTop, height: container.clientHeight };
    }
    cancelJump() {
      clearTimeout(this.jumpTimer);
      this.jumpOperation = null;
      this.clearHighlight();
    }
    finishJump(operation, error) {
      if (this.jumpOperation !== operation) return;
      this.cancelJump();
      if (error) { this.open(); this.notify(error); return; }
      const target = this.messages.find((entry) => entry.key === operation.key)?.node;
      if (target) {
        this.clearHighlight(); this.highlight = target; target.classList.add('jn-message-highlight');
        this.highlightTimer = setTimeout(() => this.clearHighlight(), 2200);
      }
    }
    tickJump(operation) {
      if (this.jumpOperation !== operation) return;
      if (operation.epoch !== this.routeEpoch || operation.conversation !== this.conversationKey()) { this.cancelJump(); return; }
      const elapsed = performance.now() - operation.started;
      const message = this.messages.find((entry) => entry.key === operation.key);
      const target = message?.node?.isConnected ? message.node : null;
      if (target) operation.container = this.scrollContainer(target);
      const container = operation.container;
      if (!container?.isConnected) { this.finishJump(operation, 'The conversation changed while navigating. Rescan and try again.'); return; }
      const bounds = this.scrollBounds(container);
      const max = Math.max(0, container.scrollHeight - container.clientHeight);
      let desired;
      if (operation.bottom) desired = max;
      else if (target) desired = clamp(container.scrollTop + target.getBoundingClientRect().top - bounds.top - Math.min(80, bounds.height / 5), 0, max);
      else desired = clamp(operation.lastTop, 0, max); // Recover a temporarily unmounted target.
      operation.lastTop = desired;
      const delta = Math.abs(container.scrollTop - desired);
      if (delta > 2) {
        // Instant correction avoids a multi-second smooth animation being interrupted by React.
        container.scrollTo({ top: desired, behavior: 'instant' });
        operation.stableSince = performance.now();
      }
      if (operation.lastHeight !== container.scrollHeight || (!target && !operation.bottom)) operation.stableSince = performance.now();
      operation.lastHeight = container.scrollHeight;
      const pendingImage = [...container.querySelectorAll('img')].some((img) => !img.complete && img.getBoundingClientRect().top <= bounds.top + bounds.height);
      if (elapsed >= 1600 && performance.now() - operation.stableSince >= 500 && !pendingImage && (target || operation.bottom)) {
        this.finishJump(operation); return;
      }
      if (elapsed > 8000) {
        if (!target && !operation.bottom) this.finishJump(operation, 'This message is not currently rendered. Scroll to load that part of the chat, then rescan.');
        else this.finishJump(operation);
        return;
      }
      this.jumpTimer = setTimeout(() => this.tickJump(operation), 100);
    }
    startJump(message, bottom = false) {
      this.cancelJump(); this.clearHighlight();
      const container = this.scrollContainer(message.node);
      const operation = { key: message.key, conversation: this.conversation, epoch: this.routeEpoch, bottom,
        container, started: performance.now(), stableSince: performance.now(), lastTop: container.scrollTop, lastHeight: container.scrollHeight };
      this.jumpOperation = operation;
      this.highlight = message.node;
      this.highlight.classList.add('jn-message-highlight');
      // Focusing ChatGPT's composer can trigger its own auto-scroll. Keep focus on the launcher.
      this.close(false); this.toggle.focus({ preventScroll: true });
      this.tickJump(operation);
    }
    jumpBottom() {
      this.scan();
      const message = this.messages.at(-1);
      if (!message || this.transition) { this.notify('Wait for this conversation to finish loading.'); return; }
      this.startJump(message, true);
    }
    jump(message) {
      if (!message) { this.notify('No message available.'); return; }
      this.scan();
      const current = this.messages.find((entry) => entry.key === message.key);
      if (!current?.node.isConnected) { this.notify('This message is no longer loaded.'); return; }
      this.startJump(current);
    }
    clearHighlight() {
      clearTimeout(this.highlightTimer);
      this.highlight?.classList.remove('jn-message-highlight');
      this.highlight = null;
    }
    onKey(event) {
      if (event.isComposing) return;
      if (['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', 'Escape', ' '].includes(event.key)) this.cancelJump();
      if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key.toLowerCase() === 'm') {
        event.preventDefault();
        if (!event.repeat) this.isOpen ? this.close() : this.open();
        return;
      }
      if (!this.isOpen) return;
      if (event.key === 'Escape') { event.preventDefault(); this.close(); return; }
      if (!this.panel.contains(event.target)) return;
      const jumps = [...this.list.querySelectorAll('.jn-jump')];
      const current = jumps.indexOf(event.target);
      if (['ArrowDown', 'ArrowUp'].includes(event.key) && (event.target === this.input || current >= 0)) {
        event.preventDefault();
        const next = current < 0 ? (event.key === 'ArrowDown' ? 0 : jumps.length - 1) : clamp(current + (event.key === 'ArrowDown' ? 1 : -1), 0, jumps.length - 1);
        jumps[next]?.focus();
      } else if (event.key === 'Enter' && event.target === this.input) {
        event.preventDefault();
        jumps[0]?.click();
      }
    }
    placeButton() {
      if (!this.position) return;
      this.position = { left: clamp(this.position.left, 8, innerWidth - this.toggle.offsetWidth - 8),
        top: clamp(this.position.top, 8, innerHeight - this.toggle.offsetHeight - 8) };
      Object.assign(this.toggle.style, { left: `${this.position.left}px`, top: `${this.position.top}px`, right: 'auto' });
    }
    placePanel() {
      if (!this.isOpen) return;
      const button = this.toggle.getBoundingClientRect();
      this.panel.style.maxHeight = `${Math.min(560, innerHeight - 24)}px`;
      const panel = this.panel.getBoundingClientRect();
      const below = button.bottom + 8;
      const top = below + panel.height <= innerHeight - 12 ? below : button.top - panel.height - 8;
      Object.assign(this.panel.style, { left: `${clamp(button.right - panel.width, 12, innerWidth - panel.width - 12)}px`,
        top: `${clamp(top, 12, innerHeight - panel.height - 12)}px` });
    }
    setupDrag() {
      this.listen(this.handle, 'pointerdown', (event) => {
        if (event.button !== 0) return;
        event.preventDefault();
        const rect = this.toggle.getBoundingClientRect();
        this.drag = { id: event.pointerId, x: event.clientX, y: event.clientY, left: rect.left, top: rect.top, moved: false };
        this.handle.setPointerCapture(event.pointerId);
      });
      this.listen(this.handle, 'pointermove', (event) => {
        if (!this.drag || this.drag.id !== event.pointerId) return;
        const dx = event.clientX - this.drag.x, dy = event.clientY - this.drag.y;
        if (!this.drag.moved && Math.hypot(dx, dy) < 5) return;
        this.drag.moved = true;
        this.suppressClick = true;
        this.position = { left: this.drag.left + dx, top: this.drag.top + dy };
        this.placeButton();
        this.placePanel();
      });
      const finish = () => {
        if (!this.drag) return;
        if (this.drag.moved) this.save();
        this.drag = null;
        clearTimeout(this.dragTimer);
        this.dragTimer = setTimeout(() => { this.suppressClick = false; }, 0);
      };
      this.listen(this.handle, 'pointerup', finish);
      this.listen(this.handle, 'pointercancel', finish);
      this.listen(this.handle, 'lostpointercapture', finish);
      this.listen(this.handle, 'dblclick', (event) => {
        event.preventDefault();
        this.resetPosition();
      });
    }
    resetPosition() {
      this.position = null;
      this.toggle.removeAttribute('style');
      this.placePanel();
      this.save();
    }
    offerLegacyImport() {
      // Old versions saved full prompts in page storage. Import only on an explicit click.
      try {
        const saved = JSON.parse(localStorage.getItem('chatgpt-nav-starred') || '[]');
        if (!Array.isArray(saved) || !saved.some((value) => typeof value === 'string')) return;
        this.legacyStars = new Set(saved.filter((value) => typeof value === 'string'));
        this.toolbar.append(this.button('Import old stars', 'Import old bookmarks matching this conversation', () => {
          this.scan();
          let count = 0;
          for (const message of this.messages) {
            if (this.legacyStars.has(message.text) && !this.stars.has(message.key)) {
              this.stars.add(message.key);
              this.saveStar(message.key, true);
              count++;
            }
          }
          this.render();
          this.notify(`Imported ${count} bookmarks from the loaded conversation.`);
        }));
      } catch { /* Corrupt or inaccessible legacy storage must never prevent startup. */ }
    }
    async copy(text) {
      if (!text) { this.notify('No matching messages to copy.'); return; }
      try { await navigator.clipboard.writeText(text); this.notify('Copied to clipboard.'); }
      catch { this.notify('Could not copy. Check clipboard access and try again.'); }
    }
    notify(text) { this.status.textContent = text; }
    save() {
      if (!this.storageReady) return;
      const value = { position: this.position, newestFirst: this.newestFirst };
      this.saveQueue = this.saveQueue.then(() => chrome.storage.local.set({ [STORAGE]: value })).catch(() => {
        this.notify('Could not save settings. Changes will last for this tab only.');
      });
    }
    saveStar(key, enabled) {
      // Independent keys prevent one tab from overwriting another conversation's stars.
      this.saveQueue = this.saveQueue.then(() => enabled
        ? chrome.storage.local.set({ [STAR_PREFIX + key]: true })
        : chrome.storage.local.remove(STAR_PREFIX + key)).catch(() => {
        this.notify('Could not save bookmark. It will last for this tab only.');
      });
    }
    destroy() {
      this.cancelJump();
      this.events.abort();
      this.observer?.disconnect();
      if (this.storageListener) {
        try { chrome.storage.onChanged.removeListener(this.storageListener); } catch { /* Extension was reloaded. */ }
      }
      clearInterval(this.routeTimer);
      clearTimeout(this.routeIntentTimer);
      clearTimeout(this.scanTimer);
      clearTimeout(this.settleTimer);
      clearTimeout(this.dragTimer);
      this.clearHighlight();
      this.root?.remove();
    }
  }
  window.chatGPTNavigatorInstance = new ChatGPTNavigator();
})();
