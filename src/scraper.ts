import type { Page } from 'playwright';
import type { XUser, ScraperOptions } from './types.js';
import { randomDelay } from './browser.js';

interface RawUserData {
  username: string;
  displayName: string;
  bio: string;
}

export async function scrapeUsers(
  page: Page,
  options: ScraperOptions,
  onUser: (user: XUser) => void
): Promise<void> {
  const { source, targetUser, limit } = options;

  // Navigate to appropriate page
  const url = getSourceUrl(source, targetUser, options.keyword);
  console.log(`Navigating to: ${url}`);
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await randomDelay(2000, 4000);

  const seenUsers = new Set<string>();
  let collectedCount = 0;

  while (collectedCount < limit) {
    // Extract user cards from current view
    const rawUsers = await extractUserCards(page);

    for (const raw of rawUsers) {
      if (seenUsers.has(raw.username)) continue;
      seenUsers.add(raw.username);

      // Fetch detailed user info (followers count, etc.)
      const user = await fetchUserDetails(page, raw);
      if (!user) continue;

      onUser(user);
      collectedCount++;

      if (collectedCount >= limit) break;
    }

    if (collectedCount >= limit) break;

    // Scroll to load more
    const hasMore = await scrollForMore(page);
    if (!hasMore) {
      console.log('No more users to load');
      break;
    }

    await randomDelay(1500, 3000);
  }

  console.log(`Collected ${collectedCount} users`);
}

function getSourceUrl(source: ScraperOptions['source'], targetUser?: string, keyword?: string): string {
  switch (source) {
    case 'search':
      if (!keyword) throw new Error('Keyword is required for search source');
      return `https://x.com/search?q=${encodeURIComponent(keyword)}&src=typed_query&f=user`;
    case 'followers':
      if (!targetUser) throw new Error('Target user is required for followers source');
      return `https://x.com/${targetUser}/followers`;
    case 'following':
      if (!targetUser) throw new Error('Target user is required for following source');
      return `https://x.com/${targetUser}/following`;
  }
}

async function extractUserCards(page: Page): Promise<RawUserData[]> {
  return page.evaluate(() => {
    const users: RawUserData[] = [];
    const cells = document.querySelectorAll('[data-testid="UserCell"]');

    cells.forEach(cell => {
      try {
        // Username (handle)
        const linkEl = cell.querySelector('a[href^="/"]');
        const href = linkEl?.getAttribute('href');
        const username = href?.replace('/', '') || '';

        // Display name
        const nameEl = cell.querySelector('[dir="ltr"] > span');
        const displayName = nameEl?.textContent || '';

        // Bio
        const bioEl = cell.querySelector('[data-testid="UserDescription"]');
        const bio = bioEl?.textContent || '';

        if (username && !username.includes('/')) {
          users.push({ username, displayName, bio });
        }
      } catch {
        // Skip invalid cells
      }
    });

    return users;
  });
}

async function fetchUserDetails(page: Page, raw: RawUserData): Promise<XUser | null> {
  const profileUrl = `https://x.com/${raw.username}`;

  try {
    // Open profile in a new page to get follower counts
    const context = page.context();
    const profilePage = await context.newPage();

    try {
      await profilePage.goto(profileUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
      await randomDelay(1000, 2000);

      // Extract follower/following counts
      const counts = await profilePage.evaluate(() => {
        const getText = (testId: string): string => {
          const el = document.querySelector(`[data-testid="${testId}"]`);
          return el?.textContent || '0';
        };

        // Find links containing "followers" and "following"
        const links = document.querySelectorAll('a[href*="/verified_followers"], a[href*="/followers"], a[href*="/following"]');
        let followers = 0;
        let following = 0;

        links.forEach(link => {
          const href = link.getAttribute('href') || '';
          const text = link.textContent || '';
          const num = parseCount(text);

          if (href.includes('/followers') && !href.includes('/following')) {
            followers = num;
          } else if (href.includes('/following')) {
            following = num;
          }
        });

        function parseCount(text: string): number {
          const match = text.match(/([\d,.]+)\s*[KMB]?/i);
          if (!match) return 0;

          let num = parseFloat(match[1].replace(/,/g, ''));
          const suffix = text.match(/[KMB]/i)?.[0]?.toUpperCase();

          if (suffix === 'K') num *= 1000;
          else if (suffix === 'M') num *= 1000000;
          else if (suffix === 'B') num *= 1000000000;

          return Math.floor(num);
        }

        return { followers, following };
      });

      // Also get bio from profile page if not available
      const bio = raw.bio || await profilePage.evaluate(() => {
        const bioEl = document.querySelector('[data-testid="UserDescription"]');
        return bioEl?.textContent || '';
      });

      return {
        username: raw.username,
        displayName: raw.displayName,
        bio,
        followersCount: counts.followers,
        followingCount: counts.following,
        profileUrl,
      };
    } finally {
      await profilePage.close();
    }
  } catch (error) {
    console.error(`Failed to fetch details for @${raw.username}:`, error);
    return null;
  }
}

async function scrollForMore(page: Page): Promise<boolean> {
  const previousHeight = await page.evaluate(() => document.body.scrollHeight);

  await page.evaluate(() => {
    window.scrollBy(0, window.innerHeight * 2);
  });

  await randomDelay(1500, 2500);

  const newHeight = await page.evaluate(() => document.body.scrollHeight);
  return newHeight > previousHeight;
}
