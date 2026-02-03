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
    // Get user cells from current view
    const cells = document.querySelectorAll('[data-testid="UserCell"]');

    for (const cell of cells) {
      if (!isRunning || collectedCount >= settings.limit) break;

      const username = extractUsernameFromCell(cell);
      if (!username || seenUsers.has(username)) continue;
      seenUsers.add(username);

      sendStatus(`Fetching @${username}...`, 'info');

      // Hover to get follower count
      const user = await extractUserWithHover(cell, username);
      if (!user) continue;

      // Apply filters
      if (filterUser(user)) {
        collectedCount++;
        chrome.runtime.sendMessage({ action: 'userFound', user });
        sendStatus(`Found: @${username} (${collectedCount}/${settings.limit})`, 'info');
      }

      // Small delay between hovers
      await sleep(300 + Math.random() * 200);
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

async function extractUserWithHover(cell, username) {
  // Get basic info from cell
  let displayName = '';
  const nameContainer = cell.querySelector(`a[href="/${username}"] span`);
  if (nameContainer) {
    displayName = nameContainer.textContent || '';
  }

  const bioEl = cell.querySelector('[data-testid="UserDescription"]');
  const bio = bioEl?.textContent || '';

  // Find the link to hover over (username link)
  const userLink = cell.querySelector(`a[href="/${username}"]`);
  if (!userLink) {
    return {
      username,
      displayName: displayName || username,
      bio,
      followersCount: 0,
      followingCount: 0,
      profileUrl: `https://x.com/${username}`,
    };
  }

  // Trigger hover
  const rect = userLink.getBoundingClientRect();
  const mouseEnterEvent = new MouseEvent('mouseenter', {
    bubbles: true,
    cancelable: true,
    clientX: rect.left + rect.width / 2,
    clientY: rect.top + rect.height / 2,
  });
  userLink.dispatchEvent(mouseEnterEvent);

  // Wait for popup to appear
  let followersCount = 0;
  let followingCount = 0;

  for (let i = 0; i < 20; i++) { // Max 2 seconds wait
    await sleep(100);

    // Look for the hover card popup
    const hoverCard = document.querySelector('[data-testid="HoverCard"]');
    if (hoverCard) {
      const counts = extractCountsFromHoverCard(hoverCard);
      followersCount = counts.followersCount;
      followingCount = counts.followingCount;
      break;
    }
  }

  // Remove hover
  const mouseLeaveEvent = new MouseEvent('mouseleave', {
    bubbles: true,
    cancelable: true,
  });
  userLink.dispatchEvent(mouseLeaveEvent);

  // Wait for popup to disappear
  await sleep(100);

  return {
    username,
    displayName: displayName || username,
    bio,
    followersCount,
    followingCount,
    profileUrl: `https://x.com/${username}`,
  };
}

function extractCountsFromHoverCard(hoverCard) {
  let followersCount = 0;
  let followingCount = 0;

  // Find links containing follower/following counts
  const links = hoverCard.querySelectorAll('a[href*="/followers"], a[href*="/following"], a[href*="/verified_followers"]');

  links.forEach(link => {
    const href = link.getAttribute('href') || '';
    const text = link.textContent || '';

    if (href.includes('/followers') || href.includes('/verified_followers')) {
      if (!href.includes('/following')) {
        followersCount = parseCount(text);
      }
    }
    if (href.includes('/following')) {
      followingCount = parseCount(text);
    }
  });

  // Also try to find counts in span elements
  if (followersCount === 0 || followingCount === 0) {
    const spans = hoverCard.querySelectorAll('span');
    spans.forEach(span => {
      const text = span.textContent || '';
      if (text.match(/followers?$/i)) {
        const count = parseCount(text);
        if (count > 0) followersCount = count;
      }
      if (text.match(/following$/i)) {
        const count = parseCount(text);
        if (count > 0) followingCount = count;
      }
    });
  }

  return { followersCount, followingCount };
}

function parseCount(text) {
  if (!text) return 0;

  // Match patterns like "1,234", "1.2K", "1.5M", "12万"
  const match = text.match(/([\d,.]+)\s*([KMB万億])?/i);
  if (!match) return 0;

  let num = parseFloat(match[1].replace(/,/g, ''));
  const suffix = (match[2] || '').toUpperCase();

  if (suffix === 'K' || suffix === '万') num *= 1000;
  else if (suffix === 'M' || suffix === '億') num *= 1000000;
  else if (suffix === 'B') num *= 1000000000;

  return Math.floor(num);
}

function filterUser(user) {
  const { keyword, minFollowers, maxFollowers } = settings;

  // Follower count filter
  if (minFollowers > 0 && user.followersCount < minFollowers) return false;
  if (maxFollowers && maxFollowers < Infinity && user.followersCount > maxFollowers) return false;

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

console.log('X User Scraper content script loaded');
