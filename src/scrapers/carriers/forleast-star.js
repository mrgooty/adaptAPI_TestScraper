'use strict';

const { getLabeledField, extractTable, safely, listCustomerLinks } = require('../carrier-adapter');

const BASE_URL = 'https://scraping-interview-website.onrender.com/forleast_star';

/**
 * Forleast Star layout notes:
 * - Same label/value text pattern as Placeholder Carrier for Agent/Customer
 *   Details, so we reuse `getLabeledField`. Unlike Placeholder, SSN is
 *   explicitly labeled here.
 * - Policies are NOT paginated and NOT inline — the customer page only
 *   lists policy numbers with a "View Details" link; every field (type,
 *   premium, dates, underwriter, endorsements) lives on the policy's own
 *   detail page, so each policy costs a full navigation.
 * - Endorsements are a nested table on the policy detail page and may be
 *   empty for a given policy.
 */

async function listCustomers(page) {
  return listCustomerLinks(page, BASE_URL);
}

async function listPolicyDetailLinks(page) {
  return page.evaluate(() => {
    return Array.from(document.querySelectorAll('a[href*="/policies/"]')).map((a) => a.href);
  });
}

async function scrapePolicyDetail(page, url) {
  await page.goto(url, { waitUntil: 'networkidle2' });

  const endorsements = await safely(() => extractTable(page, 'table'), []);

  return {
    id: (await getLabeledField(page, 'Policy #')) ?? url.split('/').filter(Boolean).pop(),
    type: await getLabeledField(page, 'Policy Type'),
    premium: await getLabeledField(page, 'Total Written Premium'),
    effectiveDate: await getLabeledField(page, 'Effective Date'),
    startDate: await getLabeledField(page, 'Policy Start Date'),
    terminationDate: await getLabeledField(page, 'Termination Date'),
    accountId: await getLabeledField(page, 'Account ID'),
    status: await getLabeledField(page, 'Status'),
    commissionRate: await getLabeledField(page, 'Commission Rate'),
    numberOfInsureds: await getLabeledField(page, 'Number of Insureds'),
    underwriter: {
      name: await getLabeledField(page, 'Underwriter'),
      email: await getLabeledField(page, 'Underwriter Email'),
    },
    endorsements: endorsements.map((row) => ({
      id: row.ID ?? null,
      type: row.Type ?? null,
      effectiveDate: row['Effective Date'] ?? null,
      description: row.Description ?? null,
    })),
  };
}

async function scrapeCustomer(page, customer) {
  await page.goto(customer.url, { waitUntil: 'networkidle2' });

  const agent = {
    name: await getLabeledField(page, 'Name'), // first "Name:" on the page is the agent's
    producerCode: await getLabeledField(page, 'Producer Code'),
    agency: await getLabeledField(page, 'Agency'),
    agencyCode: await getLabeledField(page, 'Agency Code'),
  };

  const customerInfo = {
    externalId: (await getLabeledField(page, 'Customer ID')) ?? customer.url.split('/').filter(Boolean).pop(),
    name: customer.name,
    address: await getLabeledField(page, 'Address'),
    email: await getLabeledField(page, 'Email'),
    ssn: await getLabeledField(page, 'SSN'),
    dateOfBirth: await getLabeledField(page, 'Date of Birth'),
    profession: await getLabeledField(page, 'Profession'),
    creditScore: await getLabeledField(page, 'Credit Score'),
  };

  const policyLinks = await safely(() => listPolicyDetailLinks(page), []);
  const policies = [];
  for (const url of policyLinks) {
    const policy = await safely(() => scrapePolicyDetail(page, url), null);
    if (policy) policies.push(policy);
  }

  return { customer: customerInfo, agent, policies };
}

module.exports = {
  slug: 'forleast_star',
  baseUrl: BASE_URL,
  listCustomers,
  scrapeCustomer,
};
