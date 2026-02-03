let isRunning = false;
let settings = {};
let seenUsers = new Set();
let collectedCount = 0;

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'start') {
    settings = message.settings;
    seenUsers.clear();
    collectedCount = 0;
    isRunning = true;
    startScraping();
  } else if (message.action === 'stop') {
    isRunning = false;
  }
});

async function startScraping() {
  sendStatus('Starting...', 'info');

  // Determine page type
  const url = window.location.href;
  let pageType = 'unknown';

  if (url.includes('/search') && url.includes('f=user')) {
    pageType = 'search';
  } else if (url.includes('/followers')) {
    pageType = 'followers';
  } else if (url.includes('/following')) {
    pageType = 'following';
  } else if (url.includes('/search')) {
    // Redirect to user search
    sendStatus('Switching to People tab...', 'info');
    const newUrl = url.includes('f=') ? url.replace(/f=\w+/, 'f=user') : url + '&f=user';
    window.location.href = newUrl;
    return;
  }

  if (pageType === 'unknown') {
    sendStatus('Please navigate to a search results page or follower/following list', 'error');
    chrome.runtime.sendMessage({ action: 'done' });
    return;
  }

  sendStatus(`Scraping ${pageType} page...`, 'info');

  while (isRunning && collectedCount < settings.limit) {
    // Extract users from current view
    const users = extractUsersFromPage();

    for (const user of users) {
      if (!isRunning || collectedCount >= settings.limit) break;
      if (seenUsers.has(user.username)) continue;
      seenUsers.add(user.username);

      // Apply filters
      if (filterUser(user)) {
        collectedCount++;
        chrome.runtime.sendMessage({ action: 'userFound', user });
      }
    }

    if (!isRunning || collectedCount >= settings.limit) break;

    // Scroll to load more
    const hasMore = await scrollAndWait();
    if (!hasMore) {
      sendStatus('No more users to load', 'info');
      break;
    }
  }

  isRunning = false;
  chrome.runtime.sendMessage({ action: 'done' });
}

function extractUsersFromPage() {
  const users = [];
  const cells = document.querySelectorAll('[data-testid="UserCell"]');

  cells.forEach(cell => {
    try {
      const user = extractUserFromCell(cell);
      if (user) users.push(user);
    } catch (e) {
      console.error('Error extracting user:', e);
    }
  });

  return users;
}

function extractUserFromCell(cell) {
  // Find the username link
  const links = cell.querySelectorAll('a[href^="/"]');
  let username = '';
  let profileUrl = '';

  for (const link of links) {
    const href = link.getAttribute('href');
    // Skip non-user links
    if (href && !href.includes('/') && href.length > 1) {
      continue;
    }
    // Find the @username link
    if (href && href.match(/^\/[a-zA-Z0-9_]+$/)) {
      username = href.slice(1);
      profileUrl = `https://x.com${href}`;
      break;
    }
  }

  if (!username) return null;

  // Display name - look for the first span with dir="ltr" or "auto" that contains text
  let displayName = '';
  const nameContainer = cell.querySelector('a[href="/' + username + '"] span');
  if (nameContainer) {
    displayName = nameContainer.textContent || '';
  }

  // Bio
  const bioEl = cell.querySelector('[data-testid="UserDescription"]');
  const bio = bioEl?.textContent || '';

  // Try to extract follower count from cell if available
  const { followersCount, followingCount } = extractCountsFromCell(cell);

  return {
    username,
    displayName: displayName || username,
    bio,
    followersCount,
    followingCount,
    profileUrl,
  };
}

function extractCountsFromCell(cell) {
  // Sometimes the cell shows follower counts
  let followersCount = 0;
  let followingCount = 0;

  const text = cell.textContent || '';

  // Try to match patterns like "1.2K Followers" or "123 Following"
  const followersMatch = text.match(/([\d,.]+[KMB]?)\s*[Ff]ollowers?/i);
  const followingMatch = text.match(/([\d,.]+[KMB]?)\s*[Ff]ollowing/i);

  if (followersMatch) {
    followersCount = parseCount(followersMatch[1]);
  }
  if (followingMatch) {
    followingCount = parseCount(followingMatch[1]);
  }

  return { followersCount, followingCount };
}

function parseCount(text) {
  if (!text) return 0;

  const cleanText = text.replace(/,/g, '').trim();
  const match = cleanText.match(/([\d.]+)([KMB])?/i);

  if (!match) return 0;

  let num = parseFloat(match[1]);
  const suffix = (match[2] || '').toUpperCase();

  if (suffix === 'K') num *= 1000;
  else if (suffix === 'M') num *= 1000000;
  else if (suffix === 'B') num *= 1000000000;

  return Math.floor(num);
}

function filterUser(user) {
  const { keyword, minFollowers, maxFollowers } = settings;

  // Follower count filter (only if we have the data)
  if (user.followersCount > 0) {
    if (user.followersCount < minFollowers) return false;
    if (maxFollowers && user.followersCount > maxFollowers) return false;
  }

  // Keyword filter
  if (keyword) {
    const lowerKeyword = keyword.toLowerCase();
    const lowerBio = (user.bio || '').toLowerCase();
    const lowerName = (user.displayName || '').toLowerCase();
    const lowerUsername = (user.username || '').toLowerCase();

    if (!lowerBio.includes(lowerKeyword) &&
        !lowerName.includes(lowerKeyword) &&
        !lowerUsername.includes(lowerKeyword)) {
      return false;
    }
  }

  return true;
}

async function scrollAndWait() {
  const previousHeight = document.body.scrollHeight;

  window.scrollBy(0, window.innerHeight * 2);

  // Wait for content to load
  await sleep(1500 + Math.random() * 1000);

  const newHeight = document.body.scrollHeight;
  return newHeight > previousHeight;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function sendStatus(text, type) {
  chrome.runtime.sendMessage({ action: 'status', text, type });
}

// Let popup know content script is ready
console.log('X User Scraper content script loaded');
