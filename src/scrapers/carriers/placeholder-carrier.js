'use strict';

const { getLabeledField, extractTable, safely, listCustomerLinks } = require('../carrier-adapter');

const BASE_URL = 'https://scraping-interview-website.onrender.com/placeholder_carrier';

/**
 * Placeholder Carrier layout notes:
 * - Customer list page links straight to each customer's first page of
 *   policies (`/<customerId>/policies/1`).
 * - Agent + customer details are label/value text on the customer page,
 *   e.g. "Name: Gerald Monahan" — no consistent class names, so we match on
 *   the label text itself (see `getLabeledField`).
 * - There's an unlabeled 9-digit number rendered right after Credit Score.
 *   Forleast Star has the equivalent field explicitly labeled "SSN", so we
 *   treat this as the same field the label was just dropped for. This is
 *   exactly the kind of "unexpected format" the brief calls out — we detect
 *   it by shape (bare 9-digit number in the customer block) rather than by
 *   position, so it still works if the site adds/removes a row above it.
 * - Policies are paginated (`/<customerId>/policies/<page>`); page count is
 *   read from the pager links rather than assumed.
 * - Each policy row has a "▶" expand toggle. We try clicking it to reveal
 *   any extra detail; if nothing appears (or the click fails), we move on —
 *   the summary row's fields are still captured either way.
 */

async function listCustomers(page) {
  return listCustomerLinks(page, BASE_URL);
}

async function getUnlabeledSsn(page) {
  return page.evaluate(() => {
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
      // Skip anything inside a table — a 9-digit policy/account number in
      // the policies table would otherwise be mistaken for the SSN. The
      // customer/agent details are label/value text outside any table.
      if (node.parentElement?.closest('table')) continue;
      const text = node.textContent.trim();
      if (/^\d{9}$/.test(text)) return text;
    }
    return null;
  });
}

async function getMaxPolicyPage(page) {
  return page.evaluate(() => {
    const nums = Array.from(document.querySelectorAll('a[href*="/policies/"]'))
      .map((a) => {
        const match = a.href.match(/\/policies\/(\d+)$/);
        return match ? Number(match[1]) : null;
      })
      .filter((n) => n !== null);
    return nums.length ? Math.max(...nums) : 1;
  });
}

async function tryExpandPolicyType(page, policyId) {
  // Best-effort: click the row's expand toggle and see if a "Type" value
  // shows up nearby. Any failure here is non-fatal — the caller just gets
  // `null` back and keeps the rest of the policy's fields.
  return safely(async () => {
    const clicked = await page.evaluate((id) => {
      const row = Array.from(document.querySelectorAll('tr')).find((tr) => tr.textContent.includes(id));
      const toggle = row?.querySelector('td:first-child');
      if (!toggle) return false;
      toggle.click();
      return true;
    }, policyId);
    if (!clicked) return null;

    await page.waitForNetworkIdle({ idleTime: 300, timeout: 2000 }).catch(() => {});

    return page.evaluate((id) => {
      const row = Array.from(document.querySelectorAll('tr')).find((tr) => tr.textContent.includes(id));
      const detailRow = row?.nextElementSibling;
      if (!detailRow) return null;
      const text = detailRow.textContent.replace(/\s+/g, ' ').trim();
      const match = text.match(/type[:\s]+([a-zA-Z_ ]+)/i);
      return match ? match[1].trim() : text || null;
    }, policyId);
  }, null);
}

async function scrapePoliciesAcrossPages(page, customerUrl) {
  const baseCustomerUrl = customerUrl.replace(/\/policies\/\d+$/, '');
  const maxPage = await getMaxPolicyPage(page);

  const policies = [];
  for (let pageNum = 1; pageNum <= maxPage; pageNum += 1) {
    if (pageNum > 1) {
      await page.goto(`${baseCustomerUrl}/policies/${pageNum}`, { waitUntil: 'networkidle2' });
    }
    const rows = await extractTable(page, 'table');
    for (const row of rows) {
      const id = row.Id ?? row.id ?? null;
      if (!id) continue; // skip malformed/spacer rows we couldn't identify
      const type = await tryExpandPolicyType(page, id);
      policies.push({
        id,
        premium: row.Premium ?? null,
        status: row.Status ?? null,
        effectiveDate: row['Effective Date'] ?? null,
        terminationDate: row['Termination Date'] ?? null,
        type,
      });
    }
  }
  return policies;
}

async function scrapeCustomer(page, customer) {
  await page.goto(customer.url, { waitUntil: 'networkidle2' });

  const agent = {
    name: await getLabeledField(page, 'Name'), // NOTE: first "Name:" on the page is the agent's
    producerCode: await getLabeledField(page, 'Producer Code'),
    agency: await getLabeledField(page, 'Agency'),
    agencyCode: await getLabeledField(page, 'Agency Code'),
  };

  const customerInfo = {
    externalId: (await getLabeledField(page, 'Customer ID')) ?? customer.url.split('/').filter(Boolean).pop(),
    name: customer.name,
    address: await getLabeledField(page, 'Address'),
    email: await getLabeledField(page, 'Email'),
    dateOfBirth: await getLabeledField(page, 'Date of Birth'),
    profession: await getLabeledField(page, 'Profession'),
    creditScore: await getLabeledField(page, 'Credit Score'),
    ssn: await safely(() => getUnlabeledSsn(page)),
  };

  const policies = await safely(() => scrapePoliciesAcrossPages(page, customer.url), []);

  return { customer: customerInfo, agent, policies };
}

module.exports = {
  slug: 'placeholder_carrier',
  baseUrl: BASE_URL,
  listCustomers,
  scrapeCustomer,
};
