'use strict';

/**
 * Persists a scrape run to Postgres:
 *   1. Raw landing tables — one per website, the record exactly as scraped
 *      (PlaceholderCarrierRawRecords / ForleastStarRawRecords).
 *   2. Normalized tables — Agents, Customers, Policies.
 *
 * Everything is best-effort by design: if the database is unreachable the
 * caller gets `{ persisted: false, reason }` back and the scrape's JSON
 * output remains the source of truth for the API/dashboard. All writes for
 * a run happen in one transaction, so a half-failed run never leaves the
 * DB partially updated.
 *
 * Upsert strategy is find-then-create/update on each entity's natural key
 * — (carrier, producerCode) for agents, (carrier, externalId) for
 * customers, externalId for raw rows — so re-scraping refreshes rows
 * instead of duplicating them. A customer's policies are replaced
 * wholesale on each run: policies that disappear from the carrier portal
 * disappear here too.
 */

const RAW_MODEL_BY_CARRIER = {
  placeholder_carrier: 'PlaceholderCarrierRawRecord',
  forleast_star: 'ForleastStarRawRecord',
};

// DATEONLY columns reject junk strings; normalize.js falls back to the raw
// value when it can't parse a date, so only pass through clean ISO dates.
function isoDateOrNull(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
}

async function upsertByKey(Model, where, values, transaction) {
  const existing = await Model.findOne({ where, transaction });
  if (existing) {
    await existing.update(values, { transaction });
    return existing;
  }
  return Model.create({ ...where, ...values }, { transaction });
}

/**
 * @param {object} opts
 * @param {object[]} opts.records normalized records (normalize.js shape)
 * @param {{carrier: string, raw: object}[]} opts.raws raw adapter payloads
 * @param {boolean} [opts.closeConnection=false] close the pool afterwards
 *   (CLI runs need this so the process can exit; the server must not).
 * @returns {Promise<{persisted: boolean, reason?: string, counts?: object}>}
 */
async function persistScrape({ records = [], raws = [], closeConnection = false } = {}) {
  const db = require('../models');

  try {
    await db.sequelize.authenticate();
  } catch (err) {
    if (closeConnection) await db.sequelize.close().catch(() => {});
    return { persisted: false, reason: `database unavailable: ${err.message}` };
  }

  const counts = { raw: 0, agents: 0, customers: 0, policies: 0 };

  try {
    await db.sequelize.transaction(async (transaction) => {
      // 1. Raw landing tables (one per website).
      for (const { carrier, raw } of raws) {
        const modelName = RAW_MODEL_BY_CARRIER[carrier];
        const externalId = raw?.customer?.externalId;
        if (!modelName || !externalId) continue;
        await upsertByKey(
          db[modelName],
          { externalId: String(externalId) },
          { payload: raw, scrapedAt: new Date() },
          transaction
        );
        counts.raw += 1;
      }

      // 2. Normalized entities.
      for (const rec of records) {
        let agentRow = null;
        if (rec.agent?.producerCode) {
          agentRow = await upsertByKey(
            db.Agent,
            { carrier: rec.carrier, producerCode: rec.agent.producerCode },
            {
              name: rec.agent.name ?? 'Unknown',
              agency: rec.agent.agency ?? null,
              agencyCode: rec.agent.agencyCode ?? null,
            },
            transaction
          );
          counts.agents += 1;
        }

        if (!rec.customer?.externalId) continue;
        const customerRow = await upsertByKey(
          db.Customer,
          { carrier: rec.carrier, externalId: String(rec.customer.externalId) },
          {
            agentId: agentRow ? agentRow.id : null,
            name: rec.customer.name ?? 'Unknown',
            address: rec.customer.address ?? null,
            email: rec.customer.email ?? null,
            ssn: rec.customer.ssn ?? null,
            dateOfBirth: isoDateOrNull(rec.customer.dateOfBirth),
            profession: rec.customer.profession ?? null,
            creditScore: typeof rec.customer.creditScore === 'number' ? rec.customer.creditScore : null,
          },
          transaction
        );
        counts.customers += 1;

        // Replace this customer's policies wholesale with the fresh scrape.
        await db.Policy.destroy({ where: { customerId: customerRow.id }, transaction });
        for (const p of rec.policies || []) {
          if (p?.id == null) continue;
          await db.Policy.create(
            {
              customerId: customerRow.id,
              externalId: String(p.id),
              type: p.type ?? null,
              status: p.status ?? null,
              premium: typeof p.premium === 'number' ? p.premium : null,
              effectiveDate: isoDateOrNull(p.effectiveDate),
              startDate: isoDateOrNull(p.startDate),
              terminationDate: isoDateOrNull(p.terminationDate),
              accountId: p.accountId ?? null,
              commissionRate: p.commissionRate != null ? String(p.commissionRate) : null,
              numberOfInsureds: typeof p.numberOfInsureds === 'number' ? p.numberOfInsureds : null,
              underwriterName: p.underwriter?.name ?? null,
              underwriterEmail: p.underwriter?.email ?? null,
              endorsements: Array.isArray(p.endorsements) ? p.endorsements : [],
            },
            { transaction }
          );
          counts.policies += 1;
        }
      }
    });
  } catch (err) {
    if (closeConnection) await db.sequelize.close().catch(() => {});
    return { persisted: false, reason: `persist failed (rolled back): ${err.message}` };
  }

  if (closeConnection) await db.sequelize.close().catch(() => {});
  return { persisted: true, counts };
}

module.exports = { persistScrape };
