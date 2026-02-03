#!/usr/bin/env node
import { program } from 'commander';
import type { ScraperOptions } from './types.js';
import { launchBrowser, checkLoginStatus } from './browser.js';
import { scrapeUsers } from './scraper.js';
import { filterUser } from './filter.js';
import { TsvExporter } from './exporter.js';

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

async function main() {
  // Validate options
  if (options.source === 'search' && !options.keyword) {
    console.error('Error: --keyword is required for search source');
    process.exit(1);
  }

  if ((options.source === 'followers' || options.source === 'following') && !options.targetUser) {
    console.error(`Error: --target-user is required for ${options.source} source`);
    process.exit(1);
  }

  console.error('Starting X User Scraper...');
  console.error(`Source: ${options.source}`);
  if (options.keyword) console.error(`Keyword: ${options.keyword}`);
  if (options.targetUser) console.error(`Target user: ${options.targetUser}`);
  console.error(`Followers range: ${options.minFollowers} - ${options.maxFollowers}`);
  console.error(`Limit: ${options.limit}`);

  // Launch browser
  const context = await launchBrowser({
    headed: options.headed,
    profilePath: options.profilePath,
  });

  const page = await context.newPage();

  try {
    // Check login status
    const isLoggedIn = await checkLoginStatus(page);
    if (!isLoggedIn) {
      console.error('Please log in to X.com first, then run again.');
      if (options.headed) {
        console.error('Waiting for manual login... Press Ctrl+C to cancel.');
        await page.waitForURL('**/home', { timeout: 300000 }); // 5 min timeout
        console.error('Login detected, continuing...');
      } else {
        process.exit(1);
      }
    }

    // Setup exporter
    const exporter = new TsvExporter(options.output);

    // Scrape users
    await scrapeUsers(page, options, (user) => {
      // Apply filters
      if (filterUser(user, options)) {
        exporter.addUser(user);
        console.error(`Found: @${user.username} (${user.followersCount} followers)`);
      }
    });

    // Flush output
    exporter.flush();

    console.error(`\nDone! Found ${exporter.count} matching users.`);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  } finally {
    await context.close();
  }
}

main();
