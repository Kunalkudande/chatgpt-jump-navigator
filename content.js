// Isolated content script: no conversation text leaves this tab.
(() => {
  'use strict';
  if (!['chatgpt.com', 'chat.openai.com'].includes(location.hostname)) return;
  window.chatGPTNavigatorInstance?.destroy?.();
  const ROOT = 'chatgpt-jump-navigator';
  const SELECTOR = '[data-message-author-role="user"]';
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
      this.ready = this.init();
    }
    listen(node, event, handler, options = {}) {
      node.addEventListener(event, handler, { ...options, signal: this.events.signal });
    }
    conversationKey() { return location.pathname.replace(/\/$/, '') || '/'; }

    async init() {
      this.createUI();
      this.scan();
      this.listen(document, 'keydown', (event) => this.onKey(event));
      this.listen(document, 'pointerdown', (event) => {
        if (this.isOpen && !this.root.contains(event.target)) this.close(false);
      });
      this.listen(window, 'resize', () => {
        this.placeButton();
        this.placePanel();
      });
      this.observer = new MutationObserver((records) => {
        const relevant = records.some((record) => {
          if (this.root.contains(record.target)) return false;
          if (record.target.nodeType === 1 && record.target.closest(SELECTOR)) return true;
          if (record.target.parentElement?.closest(SELECTOR)) return true;
          if (record.type === 'attributes' && record.attributeName === 'data-message-author-role') return true;
          return [...record.addedNodes, ...record.removedNodes].some((node) =>
            node === this.root || (node.nodeType === 1 &&
              (node.matches(SELECTOR) || node.querySelector(SELECTOR) || node.contains(this.root))));
        });
        if (!relevant && this.conversation === this.conversationKey()) return;
        // Throttle: assistant streaming cannot starve updates or trigger our own redraws.
        if (!this.scanTimer) this.scanTimer = setTimeout(() => {
          this.scanTimer = null;
          if (!this.root.isConnected) document.body.append(this.root);
          this.scan();
        }, 180);
      });
      this.observer.observe(document.body, { subtree: true, childList: true, characterData: true,
        attributes: true, attributeFilter: ['data-message-id', 'data-message-author-role'] });
      this.routeTimer = setInterval(() => {
        if (this.conversation !== this.conversationKey()) this.scan();
      }, 750);
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
      toolbar.append(this.filter, this.sort);
      this.toolbar = toolbar;
      this.results = el('div', 'jn-results');
      this.results.setAttribute('aria-live', 'polite');
      this.list = el('div', 'jn-list');
      this.list.setAttribute('aria-label', 'Matching messages');
      const footer = el('div', 'jn-footer');
      footer.append(this.button('↑ First', 'Jump to first loaded message', () => this.jump(this.messages[0])),
        this.button('↓ Latest', 'Jump to latest loaded message', () => this.jump(this.messages.at(-1))),
        this.button('Copy results', 'Copy all matching full messages', () => this.copy(this.filtered().map((message) => `${message.index + 1}. ${message.text}`).join('\n\n'))));
      this.help = el('p', 'jn-help', '↑ ↓ to browse · Enter to jump · Esc to close');
      const reset = this.button('Reset position', 'Restore the navigator button position', () => this.resetPosition(), 'jn-reset');
      this.status = el('div', 'jn-status');
      this.status.setAttribute('role', 'status');
      this.panel.append(header, search, toolbar, this.results, this.list, footer, this.help, reset, this.status);
      this.root.append(this.toggle, this.panel);
      document.body.append(this.root);
      this.setupDrag();
    }

    readMessages() {
      const occurrences = new Map();
      return [...document.querySelectorAll(SELECTOR)].filter((node) => !this.root.contains(node)).map((node, index) => {
        const content = node.querySelector('.whitespace-pre-wrap') || node;
        const text = content.textContent.trim();
        const digest = hash(text);
        const occurrence = occurrences.get(digest) || 0;
        occurrences.set(digest, occurrence + 1);
        const id = node.getAttribute('data-message-id') || node.closest('[data-message-id]')?.getAttribute('data-message-id');
        return { node, text, index, key: JSON.stringify([this.conversation, id || `${digest}:${occurrence}`]) };
      }).filter((message) => message.text);
    }
    scan() {
      const conversation = this.conversationKey();
      const routeChanged = conversation !== this.conversation;
      if (routeChanged) {
        this.conversation = conversation;
        this.query = '';
        this.input.value = '';
        this.onlyStarred = false;
        this.status.textContent = '';
      }
      const messages = this.readMessages();
      const changed = routeChanged || messages.length !== this.messages.length || messages.some((message, i) =>
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
      this.list.replaceChildren();
      this.filter.setAttribute('aria-pressed', String(this.onlyStarred));
      this.sort.textContent = this.newestFirst ? 'Newest first ↑' : 'Oldest first ↓';
      const messages = this.filtered();
      this.results.textContent = `${messages.length} of ${this.messages.length} loaded messages`;
      if (!messages.length) {
        const empty = el('div', 'jn-empty');
        empty.append(el('strong', '', this.messages.length ? 'No matching messages' : 'No messages loaded yet'),
          el('p', '', this.messages.length ? 'Try another search or turn off the starred filter.' : 'Open a conversation or send a message to get started.'));
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
          if (!this.storageReady) return;
          const enabled = !this.stars.has(message.key);
          enabled ? this.stars.add(message.key) : this.stars.delete(message.key);
          this.saveStar(message.key, enabled);
          this.render();
        }, 'jn-star');
        star.dataset.action = 'star';
        star.setAttribute('aria-pressed', String(starred));
        const copy = this.button('⧉', `Copy message ${message.index + 1}`, () => this.copy(message.text), 'jn-copy');
        copy.dataset.action = 'copy';
        item.append(jump, star, copy);
        item.addEventListener('contextmenu', (event) => { event.preventDefault(); this.copy(message.text); });
        fragment.append(item);
      });
      this.list.append(fragment);
      this.list.scrollTop = scrollTop;
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
    jump(message) {
      if (!message) { this.notify('No message available.'); return; }
      this.scan();
      const current = this.messages.find((entry) => entry.key === message.key);
      if (!current?.node.isConnected) { this.notify('This message is no longer loaded.'); return; }
      current.node.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'center' });
      this.clearHighlight();
      this.highlight = current.node;
      this.highlight.classList.add('jn-message-highlight');
      this.highlightTimer = setTimeout(() => this.clearHighlight(), 2200);
      this.close();
    }
    clearHighlight() {
      clearTimeout(this.highlightTimer);
      this.highlight?.classList.remove('jn-message-highlight');
      this.highlight = null;
    }
    onKey(event) {
      if (event.isComposing) return;
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
      this.events.abort();
      this.observer?.disconnect();
      if (this.storageListener) {
        try { chrome.storage.onChanged.removeListener(this.storageListener); } catch { /* Extension was reloaded. */ }
      }
      clearInterval(this.routeTimer);
      clearTimeout(this.scanTimer);
      clearTimeout(this.dragTimer);
      this.clearHighlight();
      this.root?.remove();
    }
  }
  window.chatGPTNavigatorInstance = new ChatGPTNavigator();
})();
