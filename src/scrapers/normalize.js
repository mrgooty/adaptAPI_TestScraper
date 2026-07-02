'use strict';

/**
 * Maps a carrier-specific raw record into the common output schema. Keeping
 * this in one place means every carrier's quirks (currency symbols, date
 * formats, unlabeled fields) get normalized the same way, and the JSON
 * output is consistent even though the scraping logic per carrier isn't.
 *
 * Missing fields become `null` rather than being omitted, so consumers of
 * the JSON can rely on every record having the same keys.
 */

function toNumber(value) {
  if (value === null || value === undefined) return null;
  const cleaned = String(value).replace(/[^0-9.-]/g, '');
  if (cleaned === '') return null;
  const n = Number(cleaned);
  return Number.isNaN(n) ? null : n;
}

function toIsoDate(value) {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? value : d.toISOString().slice(0, 10);
}

function normalizePolicy(rawPolicy = {}) {
  return {
    id: rawPolicy.id ?? null,
    type: rawPolicy.type ?? null,
    status: rawPolicy.status ? String(rawPolicy.status).toLowerCase() : null,
    premium: toNumber(rawPolicy.premium ?? rawPolicy.totalWrittenPremium),
    effectiveDate: toIsoDate(rawPolicy.effectiveDate),
    startDate: toIsoDate(rawPolicy.startDate),
    terminationDate: toIsoDate(rawPolicy.terminationDate),
    accountId: rawPolicy.accountId ?? null,
    commissionRate: rawPolicy.commissionRate ?? null,
    numberOfInsureds: rawPolicy.numberOfInsureds != null ? toNumber(rawPolicy.numberOfInsureds) : null,
    underwriter: rawPolicy.underwriter
      ? { name: rawPolicy.underwriter.name ?? null, email: rawPolicy.underwriter.email ?? null }
      : null,
    endorsements: Array.isArray(rawPolicy.endorsements)
      ? rawPolicy.endorsements.map((e) => ({
          id: e.id ?? null,
          type: e.type ?? null,
          effectiveDate: toIsoDate(e.effectiveDate),
          description: e.description ?? null,
        }))
      : [],
  };
}

function normalizeRecord(carrierSlug, raw = {}) {
  return {
    carrier: carrierSlug,
    customer: {
      externalId: raw.customer?.externalId ?? null,
      name: raw.customer?.name ?? null,
      address: raw.customer?.address ?? null,
      email: raw.customer?.email ?? null,
      ssn: raw.customer?.ssn ?? null,
      dateOfBirth: toIsoDate(raw.customer?.dateOfBirth),
      profession: raw.customer?.profession ?? null,
      creditScore: raw.customer?.creditScore != null ? toNumber(raw.customer.creditScore) : null,
    },
    agent: {
      name: raw.agent?.name ?? null,
      producerCode: raw.agent?.producerCode ?? null,
      agency: raw.agent?.agency ?? null,
      agencyCode: raw.agent?.agencyCode ?? null,
    },
    policies: Array.isArray(raw.policies) ? raw.policies.map(normalizePolicy) : [],
  };
}

module.exports = { normalizeRecord, toNumber, toIsoDate };
