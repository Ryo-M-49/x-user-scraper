import { chromium, type BrowserContext, type Page } from 'playwright';
import { existsSync, mkdirSync } from 'fs';
import { join } from 'path';

export interface BrowserOptions {
  headed: boolean;
  profilePath?: string;
}

function getDefaultProfilePath(): string {
  // Use a local profile directory for this tool
  const profileDir = join(process.cwd(), '.chrome-profile');
  if (!existsSync(profileDir)) {
    mkdirSync(profileDir, { recursive: true });
  }
  return profileDir;
}

export async function launchBrowser(options: BrowserOptions): Promise<BrowserContext> {
  const profilePath = options.profilePath || getDefaultProfilePath();

  console.error(`Using profile: ${profilePath}`);

  const context = await chromium.launchPersistentContext(profilePath, {
    headless: !options.headed,
    args: [
      '--disable-blink-features=AutomationControlled',
      '--disable-dev-shm-usage',
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-infobars',
      '--window-size=1280,800',
      '--disable-web-security',
      '--allow-running-insecure-content',
    ],
    viewport: { width: 1280, height: 800 },
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    ignoreDefaultArgs: ['--enable-automation'],
  });

  // Remove webdriver property
  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', {
      get: () => undefined,
    });
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
      console.error('Logged in successfully');
      return true;
    }
  } catch {
    // Timeout - probably not logged in
  }

  console.error('Not logged in. Please log in manually in the browser.');
  return false;
}

export async function randomDelay(min = 1000, max = 3000): Promise<void> {
  const delay = Math.floor(Math.random() * (max - min + 1)) + min;
  await new Promise(resolve => setTimeout(resolve, delay));
}
