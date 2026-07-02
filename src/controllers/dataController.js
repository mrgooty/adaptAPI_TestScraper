'use strict';

const fs = require('fs');
const path = require('path');

// Same default path the scraper writes to (src/scrapers/index.js).
// Overridable via SCRAPED_DATA_PATH so a deployed instance can point
// elsewhere without code changes.
const DATA_PATH =
  process.env.SCRAPED_DATA_PATH || path.join(__dirname, '..', '..', 'output', 'scraped-data.json');

/**
 * Data source strategy: DATABASE FIRST, file fallback.
 *
 * Every scrape persists to the normalized Postgres tables (Agents,
 * Customers, Policies), so the API reads from there — the dashboard is
 * backed by the database, not a static file. If the DB is unreachable or
 * hasn't been populated yet, we fall back to output/scraped-data.json so
 * the app still works without Postgres. Responses carry a `source` field
 * ("database" | "file") so it's always clear where the data came from.
 */

/** Maps a Customer row (with agent + policies included) to the API's record shape. */
function toRecordShape(row) {
  const c = typeof row.get === 'function' ? row.get({ plain: true }) : row;
  return {
    carrier: c.carrier,
    customer: {
      externalId: c.externalId,
      name: c.name,
      address: c.address,
      email: c.email,
      ssn: c.ssn,
      dateOfBirth: c.dateOfBirth,
      profession: c.profession,
      creditScore: c.creditScore,
    },
    agent: c.agent
      ? {
          name: c.agent.name,
          producerCode: c.agent.producerCode,
          agency: c.agent.agency,
          agencyCode: c.agent.agencyCode,
        }
      : { name: null, producerCode: null, agency: null, agencyCode: null },
    policies: (c.policies || []).map((p) => ({
      id: p.externalId,
      type: p.type,
      status: p.status,
      // DECIMAL comes back from pg as a string; the API contract is a number.
      premium: p.premium != null ? Number(p.premium) : null,
      effectiveDate: p.effectiveDate,
      startDate: p.startDate,
      terminationDate: p.terminationDate,
      accountId: p.accountId,
      commissionRate: p.commissionRate,
      numberOfInsureds: p.numberOfInsureds,
      underwriter:
        p.underwriterName || p.underwriterEmail
          ? { name: p.underwriterName, email: p.underwriterEmail }
          : null,
      endorsements: Array.isArray(p.endorsements) ? p.endorsements : [],
    })),
  };
}

async function loadFromDatabase() {
  const db = require('../models');
  const rows = await db.Customer.findAll({
    include: ['agent', 'policies'],
    order: [
      ['carrier', 'ASC'],
      ['name', 'ASC'],
    ],
  });
  return rows.map(toRecordShape);
}

function loadFromFile() {
  if (!fs.existsSync(DATA_PATH)) {
    const err = new Error(
      `No data available: database is empty/unreachable and no scraped data found at ${DATA_PATH}. ` +
        'Run a scrape first (POST /api/scrape or "npm run scrape").'
    );
    err.code = 'NOT_FOUND';
    throw err;
  }
  try {
    const parsed = JSON.parse(fs.readFileSync(DATA_PATH, 'utf-8'));
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    err.code = 'PARSE_ERROR';
    throw err;
  }
}

// Log why we're on the file fallback once per fallback episode (not per
// request), and log again when the database comes back.
let onDbFallback = false;
function noteDbFallback(reason) {
  if (!onDbFallback) console.warn(`Data API: falling back to JSON file (${reason})`);
  onDbFallback = true;
}
function noteDbRecovered() {
  if (onDbFallback) console.log('Data API: database is back — serving from Postgres again');
  onDbFallback = false;
}

/**
 * Loads all records: database first; falls back to the JSON file when the
 * DB is unreachable or has no rows yet. Throws a tagged error (`err.code`)
 * only when neither source can provide data.
 *
 * @returns {Promise<{records: object[], source: 'database'|'file'}>}
 */
async function loadData() {
  try {
    const records = await loadFromDatabase();
    if (records.length > 0) {
      noteDbRecovered();
      return { records, source: 'database' };
    }
    noteDbFallback('database reachable but has no rows yet');
  } catch (err) {
    noteDbFallback(`database read failed: ${err.message}`);
  }
  return { records: loadFromFile(), source: 'file' };
}

function handleLoadError(err, res) {
  if (err.code === 'NOT_FOUND') {
    return res.status(404).json({ success: false, message: err.message });
  }
  return res.status(500).json({ success: false, message: `Failed to load data: ${err.message}` });
}

const getScrapedData = async (req, res) => {
  try {
    const { records, source } = await loadData();
    res.status(200).json({ success: true, source, data: records });
  } catch (err) {
    handleLoadError(err, res);
  }
};

/**
 * GET /api/customers/:customerId
 * Looks up by the carrier's own customer identifier (`customer.externalId`,
 * e.g. "v1my6wyd"), not an internal array index, since that's the only
 * stable id the scrapers capture per carrier.
 */
const getCustomerById = async (req, res) => {
  try {
    const { records, source } = await loadData();
    const record = records.find((r) => r.customer?.externalId === req.params.customerId);
    if (!record) {
      return res.status(404).json({ success: false, message: `No customer found with id "${req.params.customerId}"` });
    }
    res.status(200).json({ success: true, source, data: record });
  } catch (err) {
    handleLoadError(err, res);
  }
};

/**
 * GET /api/agents/:agentId
 * Looks up by producerCode (the carrier's stable agent identifier) and
 * aggregates every customer/policy tied to that agent across carriers.
 */
const getAgentById = async (req, res) => {
  try {
    const { records, source } = await loadData();
    const matches = records.filter((r) => r.agent?.producerCode === req.params.agentId);
    if (matches.length === 0) {
      return res.status(404).json({ success: false, message: `No agent found with producer code "${req.params.agentId}"` });
    }
    const agent = matches[0].agent;
    const customers = matches.map((r) => ({
      carrier: r.carrier,
      customer: r.customer,
      policyCount: Array.isArray(r.policies) ? r.policies.length : 0,
    }));
    res.status(200).json({ success: true, source, data: { agent, customers } });
  } catch (err) {
    handleLoadError(err, res);
  }
};

/**
 * GET /api/policies/:policyId
 * Policy ids are only unique within a carrier, so this returns every match
 * (usually one) with its owning customer/agent/carrier for context.
 */
const getPolicyById = async (req, res) => {
  try {
    const { records, source } = await loadData();
    const matches = [];
    for (const record of records) {
      const policy = (record.policies || []).find((p) => p.id === req.params.policyId);
      if (policy) {
        matches.push({ carrier: record.carrier, policy, customer: record.customer, agent: record.agent });
      }
    }
    if (matches.length === 0) {
      return res.status(404).json({ success: false, message: `No policy found with id "${req.params.policyId}"` });
    }
    res.status(200).json({ success: true, source, data: matches.length === 1 ? matches[0] : matches });
  } catch (err) {
    handleLoadError(err, res);
  }
};

module.exports = { getScrapedData, getCustomerById, getAgentById, getPolicyById, DATA_PATH };
