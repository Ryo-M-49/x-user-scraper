#!/usr/bin/env node
import { program } from 'commander';
import type { ScraperOptions } from './types.js';

program
  .name('x-user-scraper')
  .description('X (Twitter) user scraper CLI tool')
  .version('1.0.0')
  .option('-k, --keyword <keyword>', 'Search keyword (bio partial match)')
  .option('--min-followers <number>', 'Minimum followers count', '0')
  .option('--max-followers <number>', 'Maximum followers count', 'Infinity')
  .option('-l, --limit <number>', 'Maximum users to fetch', '100')
  .option('-s, --source <type>', 'Data source: search, followers, following', 'search')
  .option('--target-user <username>', 'Target user for followers/following source')
  .option('-o, --output <path>', 'Output file path (default: stdout)')
  .option('--headed', 'Run browser in headed mode', false)
  .option('--profile-path <path>', 'Chrome profile path for logged-in session')
  .parse();

const opts = program.opts();

const options: ScraperOptions = {
  keyword: opts.keyword,
  minFollowers: parseInt(opts.minFollowers, 10),
  maxFollowers: opts.maxFollowers === 'Infinity' ? Infinity : parseInt(opts.maxFollowers, 10),
  limit: parseInt(opts.limit, 10),
  source: opts.source as ScraperOptions['source'],
  targetUser: opts.targetUser,
  output: opts.output,
  headed: opts.headed,
  profilePath: opts.profilePath,
};

console.log('X User Scraper');
console.log('Options:', options);
console.log('\nTODO: Implement scraping logic');
