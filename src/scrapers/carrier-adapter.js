'use strict';

/**
 * Contract every carrier adapter must implement, plus DOM-scraping helpers
 * shared across carriers.
 *
 * Adding a new carrier = create `carriers/<slug>.js` exporting an object
 * that satisfies this shape, then register it in `carriers/index.js`.
 * Nothing else in the pipeline needs to change.
 *
 * @typedef {Object} CarrierAdapter
 * @property {string} slug            - stable id, e.g. "placeholder_carrier"
 * @property {string} baseUrl         - carrier portal entry point
 * @property {(page: import('puppeteer').Page) => Promise<{name: string, url: string}[]>} listCustomers
 *   Scrape the customer index page and return links to each customer's detail page.
 * @property {(page: import('puppeteer').Page, customer: {name: string, url: string}) => Promise<object>} scrapeCustomer
 *   Given a customer link, navigate and extract the raw carrier-shaped record
 *   (customer, agent, policies). Shape is carrier-specific — `normalize.js`
 *   maps it to the common schema.
 */

/**
 * Finds a "Label: value" pair anywhere on the page and returns the value.
 * Works regardless of the surrounding tag (p, li, dt/dd, div) because it
 * walks text nodes rather than relying on a specific selector or class name
 * — the two mock sites use different markup for the same kind of label/value
 * pair, so a selector-based approach breaks immediately on the second carrier.
 *
 * Returns `null` if the label isn't found, rather than throwing, so a
 * missing/renamed field degrades to a null value instead of crashing the run.
 */
async function getLabeledField(page, label) {
  return page.evaluate((labelText) => {
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
      const text = node.textContent.trim();
      if (text === labelText || text === `${labelText}:`) {
        const container = node.parentElement?.closest('p,li,dt,div,td,th') || node.parentElement;
        if (!container) continue;
        const full = container.textContent.replace(/\s+/g, ' ').trim();
        const value = full.slice(full.indexOf(labelText) + labelText.length).replace(/^:\s*/, '').trim();
        return value || null;
      }
    }
    return null;
  }, label);
}

/**
 * Generic HTML table -> array of row objects, keyed by header text. Reads
 * headers dynamically instead of assuming column order/count, so it survives
 * a carrier adding/reordering/removing a column.
 */
async function extractTable(page, tableSelector) {
  return page.evaluate((selector) => {
    const table = document.querySelector(selector);
    if (!table) return [];

    const headerCells = Array.from(table.querySelectorAll('thead th, tr:first-child th'));
    const headers = headerCells.map((th) => th.textContent.trim());

    const bodyRows = Array.from(table.querySelectorAll('tbody tr')).filter(
      (tr) => tr.querySelectorAll('td').length > 0
    );

    return bodyRows
      .map((tr) => {
        const cells = Array.from(tr.querySelectorAll('td')).map((td) => td.textContent.trim());
        if (cells.every((c) => c === '')) return null; // skip spacer/blank rows
        const row = {};
        headers.forEach((header, i) => {
          row[header || `col${i}`] = cells[i] ?? null;
        });
        return row;
      })
      .filter(Boolean);
  }, tableSelector);
}

/** Runs an extractor and returns `fallback` (default null) instead of throwing. */
async function safely(fn, fallback = null) {
  try {
    return await fn();
  } catch {
    return fallback;
  }
}

/**
 * Navigates to a carrier's customer index page and returns a de-duplicated
 * list of customer detail links. Both mock sites use the same index pattern
 * (anchor per customer, href under the carrier's base path), so this is
 * shared; a future carrier with a different index layout can simply not
 * use it and implement its own `listCustomers`.
 */
async function listCustomerLinks(page, baseUrl) {
  await page.goto(baseUrl, { waitUntil: 'networkidle2' });
  return page.evaluate((base) => {
    const links = Array.from(document.querySelectorAll('a[href]'));
    const seen = new Set();
    return links
      .filter((a) => a.href.startsWith(base + '/') && a.href !== base)
      .map((a) => ({ name: a.textContent.trim(), url: a.href }))
      .filter((c) => {
        if (seen.has(c.url)) return false;
        seen.add(c.url);
        return true;
      });
  }, baseUrl);
}

module.exports = { getLabeledField, extractTable, safely, listCustomerLinks };
