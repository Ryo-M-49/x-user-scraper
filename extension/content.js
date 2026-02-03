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

  const url = window.location.href;
  let pageType = 'unknown';

  if (url.includes('/search') && url.includes('f=user')) {
    pageType = 'search';
  } else if (url.includes('/followers')) {
    pageType = 'followers';
  } else if (url.includes('/following')) {
    pageType = 'following';
  } else if (url.includes('/search')) {
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

  const BATCH_SIZE = 5;
  const fetchedUsers = new Set();
  let processedCells = new Set();
  let noNewUsersCount = 0;
  const MAX_NO_NEW_USERS = 3; // Stop after 3 scrolls with no new users

  // Keep collecting and fetching until we have enough matches
  while (isRunning && collectedCount < settings.limit) {
    // Collect a batch of candidates from current view
    const candidates = [];
    const cells = document.querySelectorAll('[data-testid="UserCell"]');

    for (const cell of cells) {
      if (candidates.length >= BATCH_SIZE) break;

      const cellId = cell.textContent?.slice(0, 100);
      if (processedCells.has(cellId)) continue;
      processedCells.add(cellId);

      const username = extractUsernameFromCell(cell);
      if (!username || seenUsers.has(username)) continue;
      seenUsers.add(username);

      const basicInfo = extractBasicInfoFromCell(cell, username);

      // Pre-filter by keyword if set
      if (settings.keyword && !matchesKeyword(basicInfo, settings.keyword)) {
        continue;
      }

      candidates.push({ username, basicInfo });
    }

    // If we found candidates, fetch their details
    if (candidates.length > 0) {
      noNewUsersCount = 0;
      sendStatus(`Fetching ${candidates.length} users... (${collectedCount}/${settings.limit})`, 'info');

      const results = await Promise.all(
        candidates.map(({ username, basicInfo }) =>
          fetchUserWithCounts(username, basicInfo).catch(err => {
            console.error(`Error fetching @${username}:`, err);
            return null;
          })
        )
      );

      for (const user of results) {
        if (!isRunning || collectedCount >= settings.limit) break;
        if (!user) continue;

        if (fetchedUsers.has(user.username)) continue;
        fetchedUsers.add(user.username);

        // Apply follower count filter
        if (filterByFollowers(user)) {
          collectedCount++;
          chrome.runtime.sendMessage({ action: 'userFound', user });
          sendStatus(`Found: @${user.username} (${user.followersCount} followers) [${collectedCount}/${settings.limit}]`, 'info');
        }
      }

      await sleep(200);
    } else {
      noNewUsersCount++;
    }

    // Check if we need more
    if (collectedCount >= settings.limit) break;

    // Scroll to load more
    const prevHeight = document.body.scrollHeight;
    window.scrollBy(0, window.innerHeight * 2);
    await sleep(1500 + Math.random() * 1000);
    const newHeight = document.body.scrollHeight;

    // If no new content loaded and no new users found multiple times, stop
    if (newHeight === prevHeight && noNewUsersCount >= MAX_NO_NEW_USERS) {
      sendStatus('No more users to load', 'info');
      break;
    }
  }

  isRunning = false;
  chrome.runtime.sendMessage({ action: 'done' });
}

async function fetchUserWithCounts(username, basicInfo) {
  const response = await chrome.runtime.sendMessage({
    action: 'fetchUserCounts',
    username: username,
  });

  if (!response.success) {
    throw new Error(response.error);
  }

  return {
    ...basicInfo,
    followersCount: response.counts.followers,
    followingCount: response.counts.following,
  };
}

function extractUsernameFromCell(cell) {
  const links = cell.querySelectorAll('a[href^="/"]');
  for (const link of links) {
    const href = link.getAttribute('href');
    if (href && href.match(/^\/[a-zA-Z0-9_]+$/)) {
      return href.slice(1);
    }
  }
  return null;
}

function extractBasicInfoFromCell(cell, username) {
  let displayName = '';
  const nameContainer = cell.querySelector(`a[href="/${username}"] span`);
  if (nameContainer) {
    displayName = nameContainer.textContent || '';
  }

  const bioEl = cell.querySelector('[data-testid="UserDescription"]');
  const bio = bioEl?.textContent || '';

  return {
    username,
    displayName: displayName || username,
    bio,
    profileUrl: `https://x.com/${username}`,
  };
}

function matchesKeyword(basicInfo, keyword) {
  const lowerKeyword = keyword.toLowerCase();
  const lowerBio = (basicInfo.bio || '').toLowerCase();
  const lowerName = (basicInfo.displayName || '').toLowerCase();
  const lowerUsername = (basicInfo.username || '').toLowerCase();

  return lowerBio.includes(lowerKeyword) ||
         lowerName.includes(lowerKeyword) ||
         lowerUsername.includes(lowerKeyword);
}

function filterByFollowers(user) {
  const { minFollowers, maxFollowers } = settings;

  if (minFollowers > 0 && user.followersCount < minFollowers) return false;
  if (maxFollowers && maxFollowers < Infinity && user.followersCount > maxFollowers) return false;

  return true;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function sendStatus(text, type) {
  chrome.runtime.sendMessage({ action: 'status', text, type });
}

console.log('X User Scraper content script loaded');
