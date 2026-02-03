// Background service worker for X User Scraper

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'fetchUserCounts') {
    fetchUserCountsViaTab(message.username)
      .then(counts => sendResponse({ success: true, counts }))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true; // Keep channel open for async response
  }

  // Forward messages from content script to popup
  if (sender.tab) {
    chrome.runtime.sendMessage(message).catch(() => {});
  }
  return true;
});

async function fetchUserCountsViaTab(username) {
  const profileUrl = `https://x.com/${username}`;

  // Create a new tab (not active)
  const tab = await chrome.tabs.create({
    url: profileUrl,
    active: false,
  });

  try {
    // Wait for the page to load
    await waitForTabLoad(tab.id);

    // Wait a bit more for JS to render
    await sleep(2000);

    // Execute script to extract counts
    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: extractCountsFromPage,
    });

    const counts = results[0]?.result || { followers: 0, following: 0 };
    return counts;
  } finally {
    // Close the tab
    await chrome.tabs.remove(tab.id);
  }
}

function extractCountsFromPage() {
  let followers = 0;
  let following = 0;

  // Find follower count link
  const followerLink = document.querySelector('a[href*="/verified_followers"], a[href$="/followers"]');
  if (followerLink) {
    const text = followerLink.textContent || '';
    followers = parseCountText(text);
  }

  // Find following count link
  const followingLink = document.querySelector('a[href$="/following"]');
  if (followingLink) {
    const text = followingLink.textContent || '';
    following = parseCountText(text);
  }

  function parseCountText(text) {
    if (!text) return 0;
    const match = text.match(/([\d,.]+)\s*([KMB万億])?/i);
    if (!match) return 0;

    let num = parseFloat(match[1].replace(/,/g, ''));
    const suffix = (match[2] || '').toUpperCase();

    if (suffix === 'K') num *= 1000;
    else if (suffix === 'M') num *= 1000000;
    else if (suffix === 'B') num *= 1000000000;
    else if (suffix === '万') num *= 10000;
    else if (suffix === '億') num *= 100000000;

    return Math.floor(num);
  }

  return { followers, following };
}

function waitForTabLoad(tabId) {
  return new Promise((resolve) => {
    const listener = (id, changeInfo) => {
      if (id === tabId && changeInfo.status === 'complete') {
        chrome.tabs.onUpdated.removeListener(listener);
        resolve();
      }
    };
    chrome.tabs.onUpdated.addListener(listener);
  });
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

console.log('X User Scraper background script loaded');
