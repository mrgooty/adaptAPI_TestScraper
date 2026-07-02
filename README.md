# Carrier Data Scraper & API

Scrapes customer, agent, and policy data from two insurance carrier websites, normalizes it into a single schema, and serves it through a REST API (with Swagger docs), an interactive dashboard, and a Postgres database.

The two source websites (hosted at `scraping-interview-website.onrender.com`):

| Carrier | Slug | Layout quirks |
|---|---|---|
| Placeholder Carrier | `placeholder_carrier` | Paginated inline policy tables; SSN rendered as an **unlabeled** 9-digit value; expandable policy rows |
| Forleast Star | `forleast_star` | Policies on separate detail pages; labeled SSN; nested endorsements tables |

> Note: the site runs on Render's free tier and sleeps when idle — the first request can take a minute to wake it. If a scrape returns timeouts, open the site in a browser once, then retry.

---

## Quick start

```bash
npm install

# 1. (Optional, for DB persistence) create the Postgres schema
npm run db:migrate

# 2. Scrape both websites -> output/scraped-data.json (+ DB if reachable)
npm run scrape

# 3. Start the server
npm start
```

Then open:

| URL | What it is |
|---|---|
| http://localhost:3000/dashboard | Interactive dashboard (stats, charts, searchable/sortable customer table) |
| http://localhost:3000/api-docs | Swagger UI — browse and try every endpoint |
| http://localhost:3000/api-docs.json | Raw OpenAPI 3 spec |
| http://localhost:3000/health | Health check |

No data yet? Click **Run Scraper** in the dashboard header — it calls `POST /api/scrape` and refreshes when done.

`npm run dev` starts the server with auto-reload on file changes.

---

## Configuration (`.env`)

```ini
PORT=3000

DB_HOST=localhost
DB_PORT=5432
DB_NAME=express_app
DB_USER=<your postgres user>
DB_PASSWORD=
DB_SSL=false
```

Optional:

- `SCRAPED_DATA_PATH` — where the API reads / the scraper writes the JSON dataset (default `output/scraped-data.json`)
- `DATABASE_URL` — single connection string, used in production (`NODE_ENV=production`)
- `DB_LOGGING=true` — log SQL

Postgres is **optional**: without it the scraper, JSON dataset, API, dashboard, and Swagger all still work — scrape runs just skip DB persistence with a warning.

---

## API

Data endpoints are **database-backed**: they read from the normalized Postgres tables (populated by every scrape) and fall back to the scraped JSON file only when the DB is unreachable or empty. Every response includes a `source` field (`"database"` or `"file"`), and the dashboard header shows which source is live. Full request/response schemas live in Swagger.

| Method & path | Description |
|---|---|
| `GET /api/scraped-data` | Every scraped record (one per customer, with nested agent + policies) |
| `GET /api/customers/:customerId` | One record by the carrier's customer id (e.g. `v1my6wyd`) |
| `GET /api/agents/:agentId` | Agent by producer code, plus every customer they service across carriers |
| `GET /api/policies/:policyId` | Policy by id, with its owning customer/agent (array if the id collides across carriers) |
| `POST /api/scrape` | **Live scrape** — runs the Puppeteer pipeline in-process and refreshes the dataset. Query params: `carrier=<slug>` to scrape one site, `wait=false` to get a 202 immediately instead of waiting. 409 if a scrape is already running. |
| `GET /api/scrape/status` | Whether a scrape is running + summary of the last run (counts, errors, persistence result) |

A fully failed scrape (browser won't launch, both sites down) never overwrites the existing dataset.

---

## Scraper

```bash
npm run scrape                                # both carriers -> output/scraped-data.json
node src/scrapers/index.js --carrier=forleast_star   # one carrier
node src/scrapers/index.js --headless=false          # watch the browser
node src/scrapers/index.js --out=./somewhere.json    # custom output path
```

Design (see `docs/ADR-001-scraper-architecture.md`): each website is a self-contained **adapter** in `src/scrapers/carriers/` exposing `{ slug, baseUrl, listCustomers, scrapeCustomer }`. The orchestrator runs each adapter in isolation (one broken page never kills the run), `normalize.js` maps every carrier's raw shape to the common schema, and missing fields become `null` instead of throwing. Adding a third carrier = one new adapter file + one registry line.

Every scrape (CLI or API) also persists to Postgres **best-effort** (`src/scrapers/persist.js`): all writes in one transaction, upserts keyed on each entity's natural key so re-scraping refreshes rows instead of duplicating them.

---

## Database schema

Five tables, migrated by umzug (`npm run db:migrate`), each 1:1 with a model in `src/models/`:

**Raw landing tables** — the data from each website exactly as scraped (JSONB payload per customer), so normalization can be replayed or audited without re-scraping:

- `PlaceholderCarrierRawRecords`
- `ForleastStarRawRecords`

**Normalized tables** — shared across carriers:

- `Agents` — unique `(carrier, producerCode)`
- `Customers` — unique `(carrier, externalId)`, FK → `Agents`, includes `ssn`
- `Policies` — unique `(customerId, externalId)`, FK → `Customers`, endorsements as JSONB

Associations: `Agent.hasMany(Customer)` / `Customer.belongsTo(Agent)`, `Customer.hasMany(Policy)` / `Policy.belongsTo(Customer)`.

Migration commands:

```bash
npm run db:migrate          # apply pending
npm run db:migrate:status   # what's applied / pending
npm run db:migrate:down     # roll back the most recent
```

---

## Project structure

```
src/
  index.js                 # entrypoint: connect DB (non-fatal), start server
  app.js                   # express app: routes, swagger, static, error handling
  config/
    config.js              # per-env DB settings (single source of truth)
    database.js            # sequelize instance
    swagger.js             # OpenAPI spec (schemas + scans route JSDoc)
  routes/dataRoutes.js     # data + scrape endpoints (@openapi JSDoc blocks)
  controllers/
    dataController.js      # read endpoints over the JSON dataset
    scrapeController.js    # live-scrape trigger + status (single-run guard)
  models/                  # 5 sequelize models, 1:1 with migrations
  migrations/              # 5 tables (umzug, timestamp-ordered)
  scrapers/
    index.js               # orchestrator + CLI
    browser.js             # shared Puppeteer lifecycle (lazy ESM import)
    carrier-adapter.js     # adapter contract + shared DOM helpers
    normalize.js           # carrier shapes -> common schema
    persist.js             # raw + normalized DB upserts (transactional)
    carriers/              # one adapter per website + registry
public/dashboard.html      # self-contained dashboard
public/vendor/             # Chart.js served locally (no CDN dependency)
scripts/migrate.js         # umzug runner
docs/                      # ADR + system design notes
output/scraped-data.json   # the normalized dataset (gitignored — contains PII)
```

---

## Troubleshooting

| Symptom | Fix |
|---|---|
| `ERR_REQUIRE_ESM ... puppeteer` | Already handled — `browser.js` loads puppeteer via dynamic `import()`. If you see this, pull the latest code. |
| `Could not find Chrome (ver. ...)` | `npx puppeteer browsers install chrome` |
| Scrape times out / 0 records | The source site sleeps on Render's free tier — open it in a browser to wake it, then retry. A failed run never clobbers existing data. |
| `Database unavailable, continuing without it` on boot | Postgres isn't running. Everything except DB persistence still works. Start Postgres (e.g. `brew services start postgresql@15`) and run `npm run db:migrate`. |
| Dashboard says no data | Click **Run Scraper**, or run `npm run scrape`, then Refresh. |
| Port in use | Change `PORT` in `.env`. |

## Security notes

- Scraped data contains PII (SSNs, DOBs); `output/` is gitignored — don't commit it.
- Dashboard escapes all scraped values before rendering (scraped sites are untrusted input).
- The API is read-only except `POST /api/scrape`; there's no auth — don't expose it publicly as-is.
