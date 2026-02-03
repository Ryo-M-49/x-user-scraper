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

  // First pass: collect usernames from the list
  let usernames = [];

  while (isRunning && usernames.length < settings.limit * 2) {
    const cells = document.querySelectorAll('[data-testid="UserCell"]');

    for (const cell of cells) {
      const username = extractUsernameFromCell(cell);
      if (username && !seenUsers.has(username)) {
        seenUsers.add(username);

        // Get basic info from cell
        const basicInfo = extractBasicInfoFromCell(cell, username);

        // Pre-filter by keyword if set (skip users that don't match)
        if (settings.keyword && !matchesKeyword(basicInfo, settings.keyword)) {
          continue;
        }

        usernames.push({ username, basicInfo });
      }
    }

    if (usernames.length >= settings.limit * 2) break;

    const hasMore = await scrollAndWait();
    if (!hasMore) break;
  }

  sendStatus(`Found ${usernames.length} candidates, fetching details...`, 'info');

  // Second pass: fetch profile pages to get follower counts
  for (const { username, basicInfo } of usernames) {
    if (!isRunning || collectedCount >= settings.limit) break;

    sendStatus(`Fetching @${username}... (${collectedCount}/${settings.limit})`, 'info');

    try {
      const counts = await fetchUserCounts(username);

      const user = {
        ...basicInfo,
        followersCount: counts.followers,
        followingCount: counts.following,
      };

      // Apply follower count filter
      if (filterByFollowers(user)) {
        collectedCount++;
        chrome.runtime.sendMessage({ action: 'userFound', user });
        sendStatus(`Found: @${username} (${user.followersCount} followers) [${collectedCount}/${settings.limit}]`, 'info');
      }

      // Delay between requests
      await sleep(500 + Math.random() * 500);
    } catch (e) {
      console.error(`Error fetching @${username}:`, e);
    }
  }

  isRunning = false;
  chrome.runtime.sendMessage({ action: 'done' });
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

async function fetchUserCounts(username) {
  const profileUrl = `https://x.com/${username}`;

  const response = await fetch(profileUrl, {
    credentials: 'include',
    headers: {
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    },
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const html = await response.text();

  // Parse the HTML
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');

  let followers = 0;
  let following = 0;

  // Find follower count link
  const followerLink = doc.querySelector('a[href*="/verified_followers"], a[href*="/followers"]:not([href*="/following"])');
  if (followerLink) {
    const text = followerLink.textContent || '';
    followers = parseCount(text);
  }

  // Find following count link
  const followingLink = doc.querySelector('a[href*="/following"]');
  if (followingLink) {
    const text = followingLink.textContent || '';
    following = parseCount(text);
  }

  return { followers, following };
}

function parseCount(text) {
  if (!text) return 0;

  // Extract numbers from text like "4,057 フォロワー" or "1.5M Followers"
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

function filterByFollowers(user) {
  const { minFollowers, maxFollowers } = settings;

  if (minFollowers > 0 && user.followersCount < minFollowers) return false;
  if (maxFollowers && maxFollowers < Infinity && user.followersCount > maxFollowers) return false;

  return true;
}

async function scrollAndWait() {
  const previousHeight = document.body.scrollHeight;
  window.scrollBy(0, window.innerHeight * 2);
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

console.log('X User Scraper content script loaded');
