'use strict';

/**
 * Shared Puppeteer lifecycle helper.
 *
 * Carrier adapters never call `puppeteer.launch()` themselves — they ask a
 * `BrowserManager` for a page. That keeps launch options (headless mode,
 * timeouts, user agent, viewport) in one customizable place instead of
 * duplicated across every carrier file.
 */

// Puppeteer v23+ ships as an ES Module, so `require('puppeteer')` throws
// ERR_REQUIRE_ESM on Node versions without require(esm) support (< 22.12).
// Dynamic import() works from CommonJS on every Node version; cache the
// promise so the module is only loaded once.
let puppeteerPromise = null;
function loadPuppeteer() {
  if (!puppeteerPromise) {
    puppeteerPromise = import('puppeteer').then((mod) => mod.default ?? mod);
  }
  return puppeteerPromise;
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
    const puppeteer = await loadPuppeteer();
    this.browser = await puppeteer.launch({
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
