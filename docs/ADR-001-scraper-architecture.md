# ADR-001: Per-Carrier Adapter Pattern for the Insurance Carrier Scraper

**Status:** Accepted
**Date:** 2026-07-01
**Deciders:** Prashanth

## Context

We need to scrape customer/policy/agent data from multiple insurance carrier portals that share similar underlying data but render it with different page layouts. The scraper must be easy to extend to a third carrier, tolerate missing/unexpected fields, and produce one normalized JSON array. Time budget is small (~30-40 min), so the design must stay simple — no service, no queue, single Node process using the Puppeteer instance already in `scrapers/browser.js`.

## Decision

Use a **per-carrier adapter pattern**: each carrier gets its own file exposing `{ name, url, scrape(page) }`. A shared `browser.js` owns the Puppeteer lifecycle; an orchestrator (`index.js`) loops over registered adapters, runs each one in isolation with its own try/catch, normalizes raw output to a common schema, and writes the merged JSON array.

## Options Considered

### Option A: Per-carrier adapter files (chosen)

| Dimension | Assessment |
|-----------|------------|
| Complexity | Low-Med — one file per carrier, explicit code |
| Cost | N/A (local script) |
| Scalability (to more carriers) | Good — new carrier = new file + one registration line |
| Team familiarity | High — plain functions, no abstraction magic |

**Pros:** explicit and readable; failures in one carrier's DOM structure are isolated; easy to unit-test a single carrier; matches "similar data, different layouts" from the prompt.
**Cons:** some duplication of boilerplate (selectors, waits) across adapters if not factored into shared helpers.

### Option B: Generic config-driven scraper (CSS-selector map per carrier)

| Dimension | Assessment |
|-----------|------------|
| Complexity | Low upfront, High hidden (edge-case handling lives in the generic engine) |
| Cost | N/A |
| Scalability | Good for uniform layouts, poor once layouts diverge structurally |
| Team familiarity | Medium — requires understanding the generic engine's conventions |

**Pros:** very little code per new carrier if layouts are near-identical (just a selector map).
**Cons:** breaks down as soon as one carrier needs different logic (e.g., paginated tables vs. cards, nested vs. flat data) — exactly the risk flagged by "different layouts" in the prompt. Debugging failures means reading the generic engine, not the carrier's own code.

## Trade-off Analysis

Option A trades a bit of per-carrier boilerplate for isolation and clarity — a bad selector in carrier B's adapter can't silently corrupt carrier A's output, and reviewers can read one carrier's logic top-to-bottom without jumping into a shared interpreter. Given the prompt explicitly says the two sites have "similar data, different layouts," a generic selector-map (Option B) is a false economy: it looks simpler for 2 carriers but accumulates conditional branches per-carrier anyway, just inside one file instead of separated cleanly. Option A scales that complexity linearly and predictably.

## Consequences

- Adding a 3rd carrier is a self-contained diff: one new file + one line in the registry.
- Common schema + normalization step in `normalize.js` keeps the final output consistent even though scraping logic diverges per carrier.
- Missing fields resolve to `null` rather than throwing, so partial data still surfaces (robustness requirement).
- (Updated 2026-07-01) Scrape runs now also persist to Postgres best-effort (`scrapers/persist.js`): one raw JSONB landing table per website (`PlaceholderCarrierRawRecords`, `ForleastStarRawRecords`) plus normalized `Agents`/`Customers`/`Policies`. The flat JSON file remains the source of truth for the API/dashboard; an unreachable DB only skips persistence with a warning.

## Action Items

1. [x] Design common output schema (customer/policy/agent).
2. [ ] Implement `scrapers/browser.js` shared Puppeteer helper.
3. [ ] Implement `scrapers/base-carrier.js` interface + `scrapers/carriers/placeholder-carrier.js` + `forleast-star.js`.
4. [ ] Implement `scrapers/normalize.js` and `scrapers/index.js` orchestrator.
5. [ ] Run against both live sites, verify JSON output, fix layout-specific bugs.
