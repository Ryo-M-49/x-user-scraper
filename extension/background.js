// Background service worker for X User Scraper

// Forward messages between popup and content scripts
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Messages from content script to popup
  if (sender.tab) {
    // Forward to popup
    chrome.runtime.sendMessage(message).catch(() => {
      // Popup might be closed, ignore error
    });
  }
  return true;
});

// Handle extension icon click when popup is not available
chrome.action.onClicked.addListener((tab) => {
  if (tab.url?.match(/https:\/\/(x|twitter)\.com/)) {
    // Open popup
    chrome.action.openPopup();
  } else {
    // Navigate to X.com
    chrome.tabs.update(tab.id, { url: 'https://x.com' });
  }
});

console.log('X User Scraper background script loaded');
