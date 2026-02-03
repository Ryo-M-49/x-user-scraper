export interface XUser {
  username: string;
  displayName: string;
  bio: string;
  followersCount: number;
  followingCount: number;
  profileUrl: string;
}

export interface ScraperOptions {
  keyword?: string;
  minFollowers: number;
  maxFollowers: number;
  limit: number;
  source: 'search' | 'followers' | 'following';
  targetUser?: string;
  output?: string;
  headed: boolean;
  profilePath?: string;
}
