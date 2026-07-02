'use strict';

/**
 * Shared Puppeteer lifecycle helper.
 *
 * Carrier adapters never call `puppeteer.launch()` themselves — they ask a
 * `BrowserManager` for a page. That keeps launch options (headless mode,
 * timeouts, user agent, viewport) in one customizable place instead of
 * duplicated across every carrier file.
 */

// Two launch environments:
//   - Local/server (default): full `puppeteer` with its own downloaded Chrome.
//   - Serverless (Vercel/AWS Lambda): no bundled Chrome fits the function
//     size limit, so we use `puppeteer-core` + `@sparticuz/chromium`
//     (a Lambda-compatible Chromium build).
//
// Both are loaded via dynamic import(): puppeteer v23+ ships as an ES Module,
// so `require()` throws ERR_REQUIRE_ESM on Node < 22.12. The promise is
// cached so each module loads once per process.
const IS_SERVERLESS = Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);

let launcherPromise = null;
function loadLauncher() {
  if (!launcherPromise) {
    launcherPromise = IS_SERVERLESS
      ? Promise.all([import('puppeteer-core'), import('@sparticuz/chromium')]).then(
          ([pptr, chr]) => ({ puppeteer: pptr.default ?? pptr, chromium: chr.default ?? chr })
        )
      : import('puppeteer').then((mod) => ({ puppeteer: mod.default ?? mod, chromium: null }));
  }
  return launcherPromise;
}

const DEFAULT_OPTIONS = {
  headless: true,
  // Bump if the target site is slow; individual page calls can still
  // override this per-navigation.
  defaultTimeoutMs: 20_000,
  viewport: { width: 1366, height: 900 },
  userAgent:
    'Mozilla/5.0 (compatible; CarrierScraper/1.0; +https://example.com/bot)',
  launchArgs: ['--no-sandbox', '--disable-setuid-sandbox'],
};

class BrowserManager {
  /**
   * @param {Partial<typeof DEFAULT_OPTIONS>} options
   */
  constructor(options = {}) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
    this.browser = null;
  }

  async launch() {
    if (this.browser) return this.browser;
    const { puppeteer, chromium } = await loadLauncher();
    this.browser = chromium
      ? await puppeteer.launch({
          // Serverless: chromium's own args include the sandbox/memory flags
          // a locked-down function environment requires.
          headless: true,
          args: chromium.args,
          executablePath: await chromium.executablePath(),
        })
      : await puppeteer.launch({
          headless: this.options.headless,
          args: this.options.launchArgs,
        });
    return this.browser;
  }

  /**
   * Opens a fresh page with the manager's default viewport/timeout/UA
   * already applied, so carrier adapters just navigate and scrape.
   */
  async newPage() {
    const browser = await this.launch();
    const page = await browser.newPage();
    await page.setViewport(this.options.viewport);
    await page.setUserAgent(this.options.userAgent);
    page.setDefaultTimeout(this.options.defaultTimeoutMs);
    page.setDefaultNavigationTimeout(this.options.defaultTimeoutMs);
    return page;
  }

  async close() {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
  }
}

module.exports = { BrowserManager };
