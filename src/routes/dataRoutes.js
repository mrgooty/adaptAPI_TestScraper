const express = require('express');
const router = express.Router();
const { getScrapedData, getCustomerById, getAgentById, getPolicyById } = require('../controllers/dataController');
const { triggerScrape, getScrapeStatus } = require('../controllers/scrapeController');

/**
 * @openapi
 * /api/scraped-data:
 *   get:
 *     summary: Get every scraped customer record
 *     description: >
 *       One entry per customer, with nested agent and policies. Served from the
 *       normalized Postgres tables when the database is reachable and populated;
 *       falls back to output/scraped-data.json otherwise. The `source` field says
 *       which one you got.
 *     tags: [Data]
 *     responses:
 *       200:
 *         description: All scraped records
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:
 *                   type: array
 *                   items: { $ref: '#/components/schemas/CustomerRecord' }
 *       404:
 *         description: No scraped-data.json found — run `npm run scrape` first
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/NotFound' }
 */
router.get('/scraped-data', getScrapedData);

/**
 * @openapi
 * /api/customers/{customerId}:
 *   get:
 *     summary: Get one customer record by carrier customer id
 *     description: Looks up by `customer.externalId`, the id each carrier assigns its own customers (e.g. "v1my6wyd"), not an array index.
 *     tags: [Customers]
 *     parameters:
 *       - in: path
 *         name: customerId
 *         required: true
 *         schema: { type: string }
 *         example: v1my6wyd
 *     responses:
 *       200:
 *         description: Matching customer record
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data: { $ref: '#/components/schemas/CustomerRecord' }
 *       404:
 *         description: No customer with that id
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/NotFound' }
 */
router.get('/customers/:customerId', getCustomerById);

/**
 * @openapi
 * /api/agents/{agentId}:
 *   get:
 *     summary: Get an agent and everyone they service, by producer code
 *     description: Agents aren't scraped as a standalone list — each customer record embeds the agent servicing them. This aggregates every customer/policy tied to the given producer code across carriers.
 *     tags: [Agents]
 *     parameters:
 *       - in: path
 *         name: agentId
 *         required: true
 *         description: The agent's producer code (e.g. "890K3ZLV")
 *         schema: { type: string }
 *         example: 890K3ZLV
 *     responses:
 *       200:
 *         description: Agent details plus the customers they service
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:
 *                   type: object
 *                   properties:
 *                     agent: { $ref: '#/components/schemas/Agent' }
 *                     customers:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           carrier: { type: string }
 *                           customer: { $ref: '#/components/schemas/Customer' }
 *                           policyCount: { type: integer }
 *       404:
 *         description: No agent with that producer code
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/NotFound' }
 */
router.get('/agents/:agentId', getAgentById);

/**
 * @openapi
 * /api/policies/{policyId}:
 *   get:
 *     summary: Get a policy by id, with its owning customer/agent
 *     description: Policy ids are only unique within a carrier. If the id collides across carriers, an array of matches is returned instead of a single object.
 *     tags: [Policies]
 *     parameters:
 *       - in: path
 *         name: policyId
 *         required: true
 *         schema: { type: string }
 *         example: tecvut0rub
 *     responses:
 *       200:
 *         description: Matching policy (or policies, if the id collided across carriers)
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:
 *                   oneOf:
 *                     - type: object
 *                       properties:
 *                         carrier: { type: string }
 *                         policy: { $ref: '#/components/schemas/Policy' }
 *                         customer: { $ref: '#/components/schemas/Customer' }
 *                         agent: { $ref: '#/components/schemas/Agent' }
 *                     - type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           carrier: { type: string }
 *                           policy: { $ref: '#/components/schemas/Policy' }
 *                           customer: { $ref: '#/components/schemas/Customer' }
 *                           agent: { $ref: '#/components/schemas/Agent' }
 *       404:
 *         description: No policy with that id
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/NotFound' }
 */
router.get('/policies/:policyId', getPolicyById);

/**
 * @openapi
 * /api/scrape:
 *   post:
 *     summary: Run a live scrape of the carrier sites
 *     description: >
 *       Launches the Puppeteer pipeline in-process, scrapes both carrier portals
 *       (or one, via `carrier`), and refreshes the normalized dataset served by the
 *       read endpoints and the dashboard. When Postgres is reachable, results are
 *       also persisted — raw landing tables per website plus normalized
 *       Agents/Customers/Policies (see `persistence` in the response). Only one
 *       scrape may run at a time. By default the response waits for completion;
 *       pass `wait=false` for a 202 and poll `GET /api/scrape/status`.
 *     tags: [Scraper]
 *     parameters:
 *       - in: query
 *         name: carrier
 *         required: false
 *         description: Scrape only this carrier slug (e.g. "placeholder_carrier", "forleast_star")
 *         schema: { type: string }
 *       - in: query
 *         name: wait
 *         required: false
 *         description: Set to "false" to return 202 immediately instead of waiting
 *         schema: { type: string, enum: ['true', 'false'] }
 *     responses:
 *       200:
 *         description: Scrape finished; summary of the run
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data: { $ref: '#/components/schemas/ScrapeRun' }
 *       202:
 *         description: Scrape started in the background (wait=false)
 *       400:
 *         description: Unknown carrier slug
 *       409:
 *         description: A scrape is already running
 *       500:
 *         description: The scrape itself failed (e.g. browser could not launch)
 */
router.post('/scrape', triggerScrape);

/**
 * @openapi
 * /api/scrape/status:
 *   get:
 *     summary: Scraper status and last-run summary
 *     tags: [Scraper]
 *     responses:
 *       200:
 *         description: Current scraper state
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:
 *                   type: object
 *                   properties:
 *                     running: { type: boolean }
 *                     startedAt: { type: string, nullable: true }
 *                     carrier: { type: string, nullable: true }
 *                     carriers: { type: array, items: { type: string } }
 *                     dataFileExists: { type: boolean }
 *                     lastRun: { $ref: '#/components/schemas/ScrapeRun' }
 */
router.get('/scrape/status', getScrapeStatus);

module.exports = router;
