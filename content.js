// ChatGPT Navigation Dropdown Extension
class ChatGPTNavigator {
  constructor() {
    this.userMessages = [];
    this.dropdown = null;
    this.toggleButton = null;
    this.isOpen = false;
    this.observer = null;
    this.starredMessages = this.loadStarredMessages();
    this.buttonPosition = this.loadButtonPosition();
    this.isDragging = false;
    this.dragOffset = { x: 0, y: 0 };
    
    this.init();
  }

  init() {
    // Wait for ChatGPT to load
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => this.setup());
    } else {
      this.setup();
    }
  }

  setup() {
    this.createUI();
    this.startObserving();
    this.scanExistingMessages();
    this.setupKeyboardShortcuts();
  }

  createUI() {
    // Create toggle button
    this.toggleButton = document.createElement('button');
    this.toggleButton.id = 'chatgpt-nav-toggle';
    this.toggleButton.innerHTML = `
      <span class="chatgpt-nav-button-drag">⋮⋮</span>
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
        <path d="M3 6h14M3 10h14M3 14h14" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
      </svg>
      <span>Messages</span>
    `;
    this.toggleButton.addEventListener('click', (e) => {
      if (!this.isDragging) {
        this.toggleDropdown();
      }
    });
    
    // Make button draggable
    this.makeButtonDraggable();
    
    // Restore button position
    if (this.buttonPosition) {
      this.toggleButton.style.top = this.buttonPosition.top + 'px';
      this.toggleButton.style.left = this.buttonPosition.left + 'px';
      this.toggleButton.style.right = 'auto';
    }

    // Create dropdown container
    this.dropdown = document.createElement('div');
    this.dropdown.id = 'chatgpt-nav-dropdown';
    this.dropdown.className = 'chatgpt-nav-hidden';

    // Create dropdown header
    const header = document.createElement('div');
    header.className = 'chatgpt-nav-header';
    header.innerHTML = `
      <h3>Your Messages</h3>
      <button id="chatgpt-nav-close">×</button>
    `;
    header.querySelector('#chatgpt-nav-close').addEventListener('click', () => this.toggleDropdown());

    // Create search box
    const searchContainer = document.createElement('div');
    searchContainer.className = 'chatgpt-nav-search';
    searchContainer.innerHTML = `
      <input type="text" id="chatgpt-nav-search-input" placeholder="Search messages..." />
    `;
    searchContainer.querySelector('#chatgpt-nav-search-input').addEventListener('input', (e) => this.filterMessages(e.target.value));

    // Create messages list
    const messagesList = document.createElement('div');
    messagesList.id = 'chatgpt-nav-list';
    messagesList.className = 'chatgpt-nav-list';

    this.dropdown.appendChild(header);
    this.dropdown.appendChild(searchContainer);
    this.dropdown.appendChild(messagesList);
    
    // Set initial position if saved, otherwise use default top-right
    // Actual positioning happens when dropdown opens

    // Add to page
    document.body.appendChild(this.toggleButton);
    document.body.appendChild(this.dropdown);
  }

  toggleDropdown() {
    this.isOpen = !this.isOpen;
    if (this.isOpen) {
      // Scan messages fresh every time dropdown opens
      this.scanExistingMessages();
      // Position dropdown relative to button
      this.positionDropdownNearButton();
      this.dropdown.classList.remove('chatgpt-nav-hidden');
      this.dropdown.classList.add('chatgpt-nav-visible');
      this.updateMessagesList();
    } else {
      this.dropdown.classList.remove('chatgpt-nav-visible');
      this.dropdown.classList.add('chatgpt-nav-hidden');
    }
  }

  positionDropdownNearButton() {
    const buttonRect = this.toggleButton.getBoundingClientRect();
    
    // Position dropdown below and aligned with button
    const dropdownTop = buttonRect.bottom + 5;
    const dropdownRight = window.innerWidth - buttonRect.right;
    
    this.dropdown.style.top = dropdownTop + 'px';
    this.dropdown.style.right = dropdownRight + 'px';
    this.dropdown.style.left = 'auto';
  }

  startObserving() {
    // Observe changes to detect new messages
    this.observer = new MutationObserver((mutations) => {
      let shouldUpdate = false;
      
      for (const mutation of mutations) {
        if (mutation.addedNodes.length > 0) {
          shouldUpdate = true;
          break;
        }
      }
      
      if (shouldUpdate) {
        // Debounce updates
        clearTimeout(this.updateTimeout);
        this.updateTimeout = setTimeout(() => {
          this.scanExistingMessages();
          if (this.isOpen) {
            this.updateMessagesList();
          }
        }, 500);
      }
    });

    // Start observing the document
    const targetNode = document.body;
    this.observer.observe(targetNode, {
      childList: true,
      subtree: true
    });
  }

  scanExistingMessages() {
    const messageElements = document.querySelectorAll(
      '[data-message-author-role="user"]'
    );

    this.userMessages = Array.from(messageElements)
      .map((element, index) => {
        const text = element.innerText?.trim();

        // Hard filters
        if (
          !text ||
          text.length < 2 ||
          text.includes('window.__oai_') ||
          text.startsWith('window.')
        ) {
          return null;
        }

        return {
          element,
          text,
          preview: text.length > 80 ? text.slice(0, 80) + '…' : text,
          index
        };
      })
      .filter(Boolean);

    this.updateButtonCounter();
  }

  updateButtonCounter() {
    const countSpan = this.toggleButton.querySelector('.count');
    
    if (this.userMessages.length === 0) {
      countSpan?.remove();
      return;
    }

    if (countSpan) {
      countSpan.textContent = this.userMessages.length;
    } else {
      const span = document.createElement('span');
      span.className = 'count';
      span.textContent = this.userMessages.length;
      this.toggleButton.appendChild(span);
    }
  }

  updateMessagesList() {
    const listContainer = document.getElementById('chatgpt-nav-list');
    
    // Don't clear if already populated to prevent flashing
    const existingCount = listContainer.querySelectorAll('.chatgpt-nav-item').length;
    if (existingCount === this.userMessages.length) {
      return; // No new messages, skip update
    }
    
    listContainer.innerHTML = '';

    if (this.userMessages.length === 0) {
      listContainer.innerHTML = `
        <div class="chatgpt-nav-empty">
          <div class="chatgpt-nav-empty-icon">💬</div>
          <h4>No messages yet</h4>
          <p>
            Start chatting with ChatGPT<br />
            and your questions will appear here for quick navigation.
          </p>
          <div class="chatgpt-nav-empty-hint">
            ⌨️ Tip: Press <b>Ctrl + Shift + M</b> anytime
          </div>
        </div>
      `;
      return;
    }

    this.userMessages.forEach((message, index) => {
      const messageItem = document.createElement('div');
      messageItem.className = 'chatgpt-nav-item';
      messageItem.setAttribute('data-message-index', index);
      
      // Star button
      const starButton = document.createElement('button');
      starButton.className = 'chatgpt-nav-star';
      const isStarred = this.starredMessages.includes(message.text);
      starButton.textContent = isStarred ? '⭐' : '☆';
      starButton.title = isStarred ? 'Unstar message' : 'Star message';
      starButton.addEventListener('click', (e) => {
        e.stopPropagation();
        this.toggleStar(message.text, starButton);
      });
      
      const messageNumber = document.createElement('span');
      messageNumber.className = 'chatgpt-nav-number';
      messageNumber.textContent = `${index + 1}.`;
      
      const messageText = document.createElement('span');
      messageText.className = 'chatgpt-nav-text';
      messageText.textContent = message.preview;
      
      messageItem.appendChild(starButton);
      messageItem.appendChild(messageNumber);
      messageItem.appendChild(messageText);
      
      messageItem.addEventListener('click', () => {
        this.scrollToMessage(message.element);
        this.toggleDropdown(); // Close dropdown after navigation
      });
      
      listContainer.appendChild(messageItem);
    });
  }

  scrollToMessage(element) {
    // Scroll to top of message
    element.scrollIntoView({
      behavior: 'smooth',
      block: 'start'
    });
    
    // Add extra offset to ensure it's at the very top
    setTimeout(() => {
      const elementTop = element.getBoundingClientRect().top;
      window.scrollBy({
        top: elementTop - 80, // 80px offset from top
        behavior: 'smooth'
      });
    }, 100);
    
    // Highlight the message briefly
    element.style.transition = 'background-color 0.3s';
    const originalBg = element.style.backgroundColor;
    element.style.backgroundColor = 'rgba(0, 123, 255, 0.1)';
    
    setTimeout(() => {
      element.style.backgroundColor = originalBg;
    }, 2000);
  }



  // Filter messages by search term
  filterMessages(searchTerm) {
    const items = document.querySelectorAll('.chatgpt-nav-item');
    const term = searchTerm.toLowerCase();
    
    items.forEach(item => {
      const text = item.querySelector('.chatgpt-nav-text').textContent.toLowerCase();
      if (text.includes(term)) {
        item.style.display = 'flex';
      } else {
        item.style.display = 'none';
      }
    });
  }

  // Toggle star on message
  toggleStar(messageText, button) {
    const index = this.starredMessages.indexOf(messageText);
    
    if (index > -1) {
      this.starredMessages.splice(index, 1);
      button.textContent = '☆';
      button.title = 'Star message';
    } else {
      this.starredMessages.push(messageText);
      button.textContent = '⭐';
      button.title = 'Unstar message';
    }
    
    this.saveStarredMessages();
  }

  // Make button draggable
  makeButtonDraggable() {
    let dragStartTime = 0;
    const dragIcon = this.toggleButton.querySelector('.chatgpt-nav-button-drag');
    
    dragIcon.addEventListener('mousedown', (e) => {
      e.stopPropagation(); // Prevent click event on button
      dragStartTime = Date.now();
      this.isDragging = false;
      
      const rect = this.toggleButton.getBoundingClientRect();
      this.dragOffset.x = e.clientX - rect.left;
      this.dragOffset.y = e.clientY - rect.top;
      
      const handleMove = (e) => {
        // If mouse moved, it's a drag
        if (Date.now() - dragStartTime > 100) {
          this.isDragging = true;
        }
        
        if (this.isDragging) {
          const x = e.clientX - this.dragOffset.x;
          const y = e.clientY - this.dragOffset.y;
          
          // Keep within viewport bounds
          const maxX = window.innerWidth - this.toggleButton.offsetWidth;
          const maxY = window.innerHeight - this.toggleButton.offsetHeight;
          
          const boundedX = Math.max(0, Math.min(x, maxX));
          const boundedY = Math.max(0, Math.min(y, maxY));
          
          this.toggleButton.style.left = boundedX + 'px';
          this.toggleButton.style.top = boundedY + 'px';
          this.toggleButton.style.right = 'auto';
          
          // Move dropdown with button if it's open
          if (this.isOpen) {
            this.positionDropdownNearButton();
          }
        }
      };
      
      const handleUp = () => {
        if (this.isDragging) {
          this.saveButtonPosition();
        }
        
        // Reset dragging after a short delay so click handler doesn't fire
        setTimeout(() => {
          this.isDragging = false;
        }, 50);
        
        document.removeEventListener('mousemove', handleMove);
        document.removeEventListener('mouseup', handleUp);
      };
      
      document.addEventListener('mousemove', handleMove);
      document.addEventListener('mouseup', handleUp);
    });
  }

  // Keyboard shortcuts
  setupKeyboardShortcuts() {
    document.addEventListener('keydown', (e) => {
      // Ctrl+Shift+M or Cmd+Shift+M to toggle dropdown
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'M') {
        e.preventDefault();
        this.toggleDropdown();
      }
      
      // When dropdown is open
      if (this.isOpen) {
        // Escape to close
        if (e.key === 'Escape') {
          this.toggleDropdown();
        }
        
        // Focus search with /
        if (e.key === '/' && e.target.id !== 'chatgpt-nav-search-input') {
          e.preventDefault();
          document.getElementById('chatgpt-nav-search-input')?.focus();
        }
      }
    });
  }

  // Local storage helpers
  saveStarredMessages() {
    localStorage.setItem('chatgpt-nav-starred', JSON.stringify(this.starredMessages));
  }

  loadStarredMessages() {
    const saved = localStorage.getItem('chatgpt-nav-starred');
    return saved ? JSON.parse(saved) : [];
  }

  saveButtonPosition() {
    const rect = this.toggleButton.getBoundingClientRect();
    const position = {
      top: rect.top,
      left: rect.left
    };
    localStorage.setItem('chatgpt-nav-button-position', JSON.stringify(position));
  }

  loadButtonPosition() {
    const saved = localStorage.getItem('chatgpt-nav-button-position');
    return saved ? JSON.parse(saved) : null;
  }
}

// Initialize the navigator when the page loads
if (window.location.hostname.includes('openai.com') || window.location.hostname.includes('chatgpt.com')) {
  new ChatGPTNavigator();
}
