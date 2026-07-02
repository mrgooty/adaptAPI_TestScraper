'use strict';

/**
 * Orchestrator: runs every registered carrier adapter, normalizes results
 * to a common schema, and writes the combined JSON array.
 *
 * Usage:
 *   node src/scrapers/index.js                     # scrape all carriers -> output/scraped-data.json
 *   node src/scrapers/index.js --out=./out.json     # custom output path
 *   node src/scrapers/index.js --headless=false     # watch it run in a real browser window
 *   node src/scrapers/index.js --carrier=forleast_star  # scrape just one carrier (useful while debugging an adapter)
 */

const fs = require('fs');
const path = require('path');

const { BrowserManager } = require('./browser');
const carriers = require('./carriers');
const { normalizeRecord } = require('./normalize');

function parseArgs(argv) {
  const args = { out: path.join(__dirname, '..', '..', 'output', 'scraped-data.json'), headless: true, carrier: null };
  for (const raw of argv) {
    const [key, value] = raw.replace(/^--/, '').split('=');
    if (key === 'out') args.out = value;
    if (key === 'headless') args.headless = value !== 'false';
    if (key === 'carrier') args.carrier = value;
  }
  return args;
}

/**
 * Scrapes every registered carrier (or just `carrierSlug` if given).
 * Failures are isolated per customer and per carrier — one broken page
 * doesn't stop the rest of the run — and collected in `errors` so the
 * caller can decide how noisy to be about them.
 *
 * Returns both the normalized records and the raw per-carrier payloads so
 * callers can persist the raw landing tables alongside the normalized ones.
 *
 * @returns {Promise<{ records: object[], raws: {carrier: string, raw: object}[], errors: {carrier: string, customer?: string, message: string}[] }>}
 */
async function scrapeAll({ headless = true, carrierSlug = null } = {}) {
  const manager = new BrowserManager({ headless });
  const records = [];
  const raws = [];
  const errors = [];

  const adaptersToRun = carrierSlug ? carriers.filter((c) => c.slug === carrierSlug) : carriers;

  for (const adapter of adaptersToRun) {
    // `page` creation (and therefore browser launch) lives INSIDE this
    // try/catch too — if Chrome fails to launch, or this carrier's page
    // can't be created, we record it as this carrier's error and move on
    // to the next carrier instead of losing every result gathered so far.
    let page;
    try {
      page = await manager.newPage();
      const customers = await adapter.listCustomers(page);
      for (const customer of customers) {
        try {
          const raw = await adapter.scrapeCustomer(page, customer);
          raws.push({ carrier: adapter.slug, raw });
          records.push(normalizeRecord(adapter.slug, raw));
        } catch (err) {
          errors.push({ carrier: adapter.slug, customer: customer.name, message: err.message });
        }
      }
    } catch (err) {
      errors.push({ carrier: adapter.slug, message: err.message });
    } finally {
      if (page) await page.close().catch(() => {});
    }
  }

  await manager.close().catch(() => {});

  return { records, raws, errors };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const { records, raws, errors } = await scrapeAll({ headless: args.headless, carrierSlug: args.carrier });

  fs.mkdirSync(path.dirname(args.out), { recursive: true });
  fs.writeFileSync(args.out, JSON.stringify(records, null, 2));

  console.log(`Scraped ${records.length} customer record(s) -> ${args.out}`);
  if (errors.length) {
    console.warn(`${errors.length} error(s) during scrape:`);
    errors.forEach((e) => console.warn(`  [${e.carrier}${e.customer ? '/' + e.customer : ''}] ${e.message}`));
  }

  // Best-effort DB persistence: raw landing tables + normalized entities.
  // A missing/unreachable Postgres never fails the scrape — the JSON file
  // above is always written first.
  const { persistScrape } = require('./persist');
  const result = await persistScrape({ records, raws, closeConnection: true });
  if (result.persisted) {
    const c = result.counts;
    console.log(`Persisted to DB: ${c.raw} raw, ${c.agents} agent, ${c.customers} customer, ${c.policies} policy row(s)`);
  } else {
    console.warn(`DB persistence skipped: ${result.reason}`);
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.error('Scrape failed:', err);
    process.exitCode = 1;
  });
}

module.exports = { scrapeAll };
