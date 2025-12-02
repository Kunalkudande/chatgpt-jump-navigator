// ChatGPT Navigation Dropdown Extension
class ChatGPTNavigator {
  constructor() {
    this.userMessages = [];
    this.dropdown = null;
    this.toggleButton = null;
    this.isOpen = false;
    this.observer = null;
    
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
  }

  createUI() {
    // Create toggle button
    this.toggleButton = document.createElement('button');
    this.toggleButton.id = 'chatgpt-nav-toggle';
    this.toggleButton.innerHTML = `
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
        <path d="M3 6h14M3 10h14M3 14h14" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
      </svg>
      <span>Messages</span>
    `;
    this.toggleButton.addEventListener('click', () => this.toggleDropdown());

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

    // Create messages list
    const messagesList = document.createElement('div');
    messagesList.id = 'chatgpt-nav-list';
    messagesList.className = 'chatgpt-nav-list';

    this.dropdown.appendChild(header);
    this.dropdown.appendChild(messagesList);

    // Add to page
    document.body.appendChild(this.toggleButton);
    document.body.appendChild(this.dropdown);
  }

  toggleDropdown() {
    this.isOpen = !this.isOpen;
    if (this.isOpen) {
      this.dropdown.classList.remove('chatgpt-nav-hidden');
      this.dropdown.classList.add('chatgpt-nav-visible');
      this.updateMessagesList();
    } else {
      this.dropdown.classList.remove('chatgpt-nav-visible');
      this.dropdown.classList.add('chatgpt-nav-hidden');
    }
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
    // Find all user messages - ChatGPT uses different selectors
    // Try multiple selectors to be compatible with UI changes
    const possibleSelectors = [
      '[data-message-author-role="user"]',
      '.group.w-full.text-token-text-primary[data-testid*="conversation-turn"]',
      'div[class*="group"][class*="w-full"]'
    ];

    let messageElements = [];
    
    for (const selector of possibleSelectors) {
      const elements = document.querySelectorAll(selector);
      if (elements.length > 0) {
        // Filter to only user messages
        messageElements = Array.from(elements).filter(el => {
          const role = el.getAttribute('data-message-author-role');
          if (role === 'user') return true;
          
          // Additional check: look for user avatar or indicators
          const hasUserIndicator = el.querySelector('[data-testid="profile-button"]') || 
                                   el.textContent.length > 0;
          return hasUserIndicator;
        });
        
        if (messageElements.length > 0) break;
      }
    }

    // Extract message data
    this.userMessages = messageElements.map((element, index) => {
      // Get the actual message text
      const textElement = element.querySelector('[data-message-author-role="user"] > div > div') ||
                         element.querySelector('.whitespace-pre-wrap') ||
                         element.querySelector('div[class*="markdown"]') ||
                         element;
      
      let text = textElement ? textElement.textContent.trim() : '';
      
      // Limit preview length
      const preview = text.length > 80 ? text.substring(0, 80) + '...' : text;
      
      return {
        element: element,
        text: text,
        preview: preview || `Message ${index + 1}`,
        index: index
      };
    });

    // Update counter on button
    this.updateButtonCounter();
  }

  updateButtonCounter() {
    const count = this.userMessages.length;
    const countSpan = this.toggleButton.querySelector('.count');
    
    if (count > 0) {
      if (countSpan) {
        countSpan.textContent = count;
      } else {
        const newCount = document.createElement('span');
        newCount.className = 'count';
        newCount.textContent = count;
        this.toggleButton.appendChild(newCount);
      }
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
      listContainer.innerHTML = '<div class="chatgpt-nav-empty">No messages yet</div>';
      return;
    }

    this.userMessages.forEach((message, index) => {
      const messageItem = document.createElement('div');
      messageItem.className = 'chatgpt-nav-item';
      
      const messageNumber = document.createElement('span');
      messageNumber.className = 'chatgpt-nav-number';
      messageNumber.textContent = `${index + 1}.`;
      
      const messageText = document.createElement('span');
      messageText.className = 'chatgpt-nav-text';
      messageText.textContent = message.preview;
      
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
    element.scrollIntoView({
      behavior: 'smooth',
      block: 'center'
    });
    
    // Highlight the message briefly
    element.style.transition = 'background-color 0.3s';
    const originalBg = element.style.backgroundColor;
    element.style.backgroundColor = 'rgba(0, 123, 255, 0.1)';
    
    setTimeout(() => {
      element.style.backgroundColor = originalBg;
    }, 2000);
  }
}

// Initialize the navigator when the page loads
if (window.location.hostname.includes('openai.com') || window.location.hostname.includes('chatgpt.com')) {
  new ChatGPTNavigator();
}
