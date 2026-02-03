import type { XUser, ScraperOptions } from './types.js';

export function filterUser(user: XUser, options: ScraperOptions): boolean {
  const { keyword, minFollowers, maxFollowers } = options;

  // Follower count filter
  if (user.followersCount < minFollowers) {
    return false;
  }
  if (user.followersCount > maxFollowers) {
    return false;
  }

  // Keyword filter (bio partial match, case-insensitive)
  if (keyword) {
    const lowerKeyword = keyword.toLowerCase();
    const lowerBio = user.bio.toLowerCase();
    const lowerName = user.displayName.toLowerCase();

    // Search in both bio and display name
    if (!lowerBio.includes(lowerKeyword) && !lowerName.includes(lowerKeyword)) {
      return false;
    }
  }

  return true;
}

export function createUserFilter(options: ScraperOptions): (user: XUser) => boolean {
  return (user: XUser) => filterUser(user, options);
}
