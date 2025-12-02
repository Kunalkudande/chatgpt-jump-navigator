# ChatGPT Navigation Dropdown

A Chrome extension that adds a floating navigation dropdown to ChatGPT conversations, allowing you to quickly jump to any of your messages in long chats.

## Features

- **Quick Navigation**: Click any message in the dropdown to instantly scroll to it
- **Auto-Detection**: Automatically detects and lists all your messages in the current chat
- **Clean UI**: Modern, gradient-styled dropdown that matches ChatGPT's design
- **Message Counter**: Shows the total number of your messages
- **Smooth Scrolling**: Smooth scroll animation with visual highlighting
- **Dark Mode Support**: Automatically adapts to your system's color scheme
- **Real-time Updates**: Updates the message list as you continue the conversation

## Installation

### Option 1: Load Unpacked Extension (For Development/Testing)

1. **Download the Extension**
   - Download or clone this repository to your computer

2. **Open Chrome Extensions Page**
   - Open Google Chrome
   - Navigate to `chrome://extensions/`
   - Or click the three dots menu → More Tools → Extensions

3. **Enable Developer Mode**
   - Toggle the "Developer mode" switch in the top right corner

4. **Load the Extension**
   - Click "Load unpacked" button
   - Navigate to the `chatdropdown` folder
   - Click "Select Folder"

5. **Verify Installation**
   - You should see "ChatGPT Navigation Dropdown" in your extensions list
   - Make sure the extension is enabled (toggle switch is blue)

## Usage

1. **Go to ChatGPT**
   - Navigate to https://chat.openai.com or https://chatgpt.com
   - Open any conversation

2. **Access the Dropdown**
   - Look for the purple "Messages" button in the top-right corner
   - Click it to open the dropdown menu

3. **Navigate**
   - Click on any message in the list to jump directly to it
   - The message will be highlighted briefly after scrolling
   - Click the × or the button again to close the dropdown

## How It Works

The extension uses:
- **MutationObserver**: Monitors the page for new messages being added
- **Content Script**: Injects JavaScript to detect user messages
- **CSS Injection**: Adds styling for the dropdown UI
- **ScrollIntoView API**: Provides smooth scrolling to selected messages

## Files Structure

```
chatdropdown/
├── manifest.json       # Extension configuration
├── content.js          # Main logic for message detection and navigation
├── styles.css          # Dropdown and button styling
└── README.md           # This file
```

## Customization

### Change Button Position
Edit `styles.css`, line 4-5:
```css
top: 20px;    /* Distance from top */
right: 20px;  /* Distance from right */
```

### Change Colors
Edit the gradient in `styles.css`, line 7:
```css
background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
```

### Change Dropdown Size
Edit `styles.css`, line 36-37:
```css
width: 360px;        /* Dropdown width */
max-height: 600px;   /* Dropdown height */
```

## Troubleshooting

**Dropdown doesn't appear:**
- Make sure you're on chat.openai.com or chatgpt.com
- Refresh the page after installing the extension
- Check that the extension is enabled in `chrome://extensions/`

**Messages not detected:**
- ChatGPT may have updated their HTML structure
- Check the browser console (F12) for errors
- The extension uses multiple selectors to adapt to UI changes

**Styling issues:**
- Clear your browser cache
- Try disabling other ChatGPT extensions temporarily

## Privacy

This extension:
- ✅ Only runs on ChatGPT pages
- ✅ Does not collect or transmit any data
- ✅ Does not require any special permissions
- ✅ All processing happens locally in your browser

## License

Free to use and modify for personal or commercial use.

## Contributing

Feel free to submit issues or pull requests to improve the extension!

## Version History

- **1.0.0** (2025-12-02): Initial release
  - Message detection and navigation
  - Floating dropdown UI
  - Dark mode support
  - Real-time updates
