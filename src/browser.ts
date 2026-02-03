import { chromium, type BrowserContext, type Page } from 'playwright';
import { homedir } from 'os';
import { join } from 'path';

export interface BrowserOptions {
  headed: boolean;
  profilePath?: string;
}

function getDefaultProfilePath(): string {
  const home = homedir();
  const platform = process.platform;

  if (platform === 'win32') {
    return join(home, 'AppData', 'Local', 'Google', 'Chrome', 'User Data');
  } else if (platform === 'darwin') {
    return join(home, 'Library', 'Application Support', 'Google', 'Chrome');
  } else {
    return join(home, '.config', 'google-chrome');
  }
}

export async function launchBrowser(options: BrowserOptions): Promise<BrowserContext> {
  const profilePath = options.profilePath || getDefaultProfilePath();

  console.log(`Using Chrome profile: ${profilePath}`);

  const context = await chromium.launchPersistentContext(profilePath, {
    headless: !options.headed,
    channel: 'chrome',
    args: [
      '--disable-blink-features=AutomationControlled',
    ],
    viewport: { width: 1280, height: 800 },
  });

  return context;
}

export async function checkLoginStatus(page: Page): Promise<boolean> {
  await page.goto('https://x.com/home', { waitUntil: 'domcontentloaded' });

  // Wait for either logged-in state or login prompt
  try {
    await page.waitForSelector('[data-testid="primaryColumn"]', { timeout: 10000 });
    // Check if we're on the home timeline (logged in)
    const url = page.url();
    if (url.includes('/home')) {
      console.log('Logged in successfully');
      return true;
    }
  } catch {
    // Timeout - probably not logged in
  }

  console.log('Not logged in. Please log in manually in the browser.');
  return false;
}

export async function randomDelay(min = 1000, max = 3000): Promise<void> {
  const delay = Math.floor(Math.random() * (max - min + 1)) + min;
  await new Promise(resolve => setTimeout(resolve, delay));
}
