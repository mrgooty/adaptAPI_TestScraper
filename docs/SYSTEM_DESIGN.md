# System Design: Carrier Scraper

## 1. Requirements

**Functional**
- Scrape structured customer/policy/agent data from insurance carrier portals (currently 2: Placeholder Carrier, Forleast Star).
- Output a single JSON array of normalized records.
- Support adding a 3rd carrier without touching existing carrier code.

**Non-functional**
- Small scale: a handful of pages per carrier, run on-demand (not a service).
- Robust to missing fields / layout quirks per carrier.
- Readable, short-lived script — not a production crawler (no queue, no distributed workers needed).

**Constraints**
- Node.js + Puppeteer already in the repo.
- 30–40 min build budget → favor simplicity over infra (no DB/queue in the hot path).

## 2. High-Level Design

```
scrapers/
  browser.js          # shared Puppeteer launch/teardown helper
  base-carrier.js      # abstract interface every carrier adapter implements
  carriers/
    placeholder-carrier.js
    forleast-star.js
  normalize.js          # maps raw per-carrier shape -> common schema
  index.js               # orchestrator: runs all registered carriers, merges output, writes JSON
```

Data flow: `index.js` → for each carrier adapter → `browser.js` opens a page → adapter's `scrape(page)` extracts raw DOM data → `normalize.js` maps it to the common schema → results concatenated → written to `output/scraped.json`.

**Adapter contract** (`base-carrier.js`):
```js
{
  name: 'placeholder_carrier',
  url: 'https://.../placeholder_carrier',
  scrape(page) -> Promise<RawRecord[]>   // carrier-specific DOM scraping only
}
```
Adding carrier #3 = one new file implementing `scrape(page)` + one line registering it in `index.js`. Nothing else changes.

## 3. Deep Dive

**Common output schema** (per record):
```json
{
  "carrier": "placeholder_carrier",
  "customer": { "name": "", "email": "", "phone": "", "address": "" },
  "policy": { "id": "", "type": "", "premium": "", "status": "", "effectiveDate": "" },
  "agent": { "name": "", "email": "", "phone": "" }
}
```
Unknown/missing fields → `null`, never thrown errors. Each field extraction wrapped defensively (try/catch or optional chaining) so one bad field doesn't kill the record.

**Error handling**: per-carrier try/catch in the orchestrator — if one carrier's page structure breaks, the other carrier's results still get written; failures are logged with carrier name + reason, not swallowed silently.

**Puppeteer instance**: single shared browser launched once in `browser.js`, one page per carrier, closed in a `finally` block.

## 4. Scale & Reliability

Out of scope at this scale — no retries/backoff, no headless-detection evasion, no rate limiting, since these are 2 known mock sites hit once. If this became a recurring/production job, I'd add: retry with backoff on navigation failure, screenshot-on-failure for debugging, a real queue if scraping many carriers concurrently, and persisting to the Postgres models already scaffolded in this repo instead of a flat JSON file.

## 5. Trade-offs

- **Flat JSON output vs. DB persistence**: chose JSON per the prompt's explicit output requirement; the repo already has Sequelize models (`customer.js`, migrations) that could be wired up later for a production version — deliberately not doing that now to stay in scope/time budget.
- **Per-carrier adapter files vs. one big config-driven scraper**: adapters are more code but far more readable and robust to layout differences than a generic config/selector-mapping approach, which tends to break silently on edge cases. Given "similar data, different layouts" per the prompt, explicit adapters are the safer choice.
- **Single shared browser vs. one browser per carrier**: shared browser is faster and simpler for this scale; would isolate per-carrier if carriers needed different launch flags (e.g., proxies).
