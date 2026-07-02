'use strict';

const path = require('path');
const swaggerJsdoc = require('swagger-jsdoc');

const options = {
  definition: {
    openapi: '3.0.3',
    info: {
      title: 'Carrier Data API',
      version: '1.0.0',
      description:
        'API over the data produced by the carrier scrapers. Reads are served from the normalized ' +
        'Postgres tables (Agents/Customers/Policies) when the database is reachable, falling back to ' +
        'the scraped JSON file otherwise — responses include a `source` field. ' +
        'Data is keyed by each carrier\'s own identifiers: customer.externalId, agent.producerCode, and policy.id.',
    },
    servers: [{ url: '/', description: 'Current server' }],
    tags: [
      { name: 'Data', description: 'Bulk scraped data' },
      { name: 'Customers', description: 'Lookup by customer id' },
      { name: 'Agents', description: 'Lookup by agent producer code' },
      { name: 'Policies', description: 'Lookup by policy id' },
      { name: 'Scraper', description: 'Trigger live scrapes and check their status' },
    ],
    components: {
      schemas: {
        Customer: {
          type: 'object',
          properties: {
            externalId: { type: 'string', nullable: true, example: 'v1my6wyd' },
            name: { type: 'string', nullable: true, example: 'Gerald Monahan' },
            address: { type: 'string', nullable: true },
            email: { type: 'string', nullable: true },
            ssn: { type: 'string', nullable: true },
            dateOfBirth: { type: 'string', nullable: true, example: '1994-03-06' },
            profession: { type: 'string', nullable: true },
            creditScore: { type: 'integer', nullable: true, example: 759 },
          },
        },
        Agent: {
          type: 'object',
          properties: {
            name: { type: 'string', nullable: true, example: 'Rosemarie Thompson' },
            producerCode: { type: 'string', nullable: true, example: '890K3ZLV' },
            agency: { type: 'string', nullable: true },
            agencyCode: { type: 'string', nullable: true },
          },
        },
        Endorsement: {
          type: 'object',
          properties: {
            id: { type: 'string', nullable: true },
            type: { type: 'string', nullable: true },
            effectiveDate: { type: 'string', nullable: true },
            description: { type: 'string', nullable: true },
          },
        },
        Policy: {
          type: 'object',
          properties: {
            id: { type: 'string', nullable: true, example: 'tecvut0rub' },
            type: { type: 'string', nullable: true, example: 'auto' },
            status: { type: 'string', nullable: true, example: 'active' },
            premium: { type: 'number', nullable: true, example: 9083.09 },
            effectiveDate: { type: 'string', nullable: true },
            startDate: { type: 'string', nullable: true },
            terminationDate: { type: 'string', nullable: true },
            accountId: { type: 'string', nullable: true },
            commissionRate: { type: 'string', nullable: true },
            numberOfInsureds: { type: 'integer', nullable: true },
            underwriter: {
              type: 'object',
              nullable: true,
              properties: { name: { type: 'string', nullable: true }, email: { type: 'string', nullable: true } },
            },
            endorsements: { type: 'array', items: { $ref: '#/components/schemas/Endorsement' } },
          },
        },
        CustomerRecord: {
          type: 'object',
          properties: {
            carrier: { type: 'string', example: 'placeholder_carrier' },
            customer: { $ref: '#/components/schemas/Customer' },
            agent: { $ref: '#/components/schemas/Agent' },
            policies: { type: 'array', items: { $ref: '#/components/schemas/Policy' } },
          },
        },
        ScrapeRun: {
          type: 'object',
          nullable: true,
          description: 'Summary of a scrape run',
          properties: {
            ok: { type: 'boolean', example: true },
            finishedAt: { type: 'string', example: '2026-07-01T18:04:11.000Z' },
            durationMs: { type: 'integer', example: 48211 },
            carrier: { type: 'string', example: 'all' },
            recordCount: { type: 'integer', example: 9 },
            errorCount: { type: 'integer', example: 0 },
            errors: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  carrier: { type: 'string' },
                  customer: { type: 'string', nullable: true },
                  message: { type: 'string' },
                },
              },
            },
            persistence: {
              type: 'object',
              nullable: true,
              description: 'DB persistence outcome (null if the run failed before writing)',
              properties: {
                persisted: { type: 'boolean', example: true },
                reason: { type: 'string', nullable: true, example: 'database unavailable: connect ECONNREFUSED' },
                counts: {
                  type: 'object',
                  nullable: true,
                  properties: {
                    raw: { type: 'integer', example: 9 },
                    agents: { type: 'integer', example: 9 },
                    customers: { type: 'integer', example: 9 },
                    policies: { type: 'integer', example: 24 },
                  },
                },
              },
            },
          },
        },
        NotFound: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: false },
            message: { type: 'string', example: 'No customer found with id "does-not-exist"' },
          },
        },
      },
    },
  },
  // Route files carry the @openapi JSDoc blocks this scans for.
  apis: [path.join(__dirname, '..', 'routes', '*.js')],
};

module.exports = swaggerJsdoc(options);
