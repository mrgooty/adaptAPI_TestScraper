'use strict';

const fs = require('fs');
const path = require('path');

const { scrapeAll } = require('../scrapers');
const { persistScrape } = require('../scrapers/persist');
const carriers = require('../scrapers/carriers');
const { DATA_PATH } = require('./dataController');

/**
 * Live-scrape trigger for the API. Runs the same pipeline as
 * `npm run scrape` in-process and refreshes the JSON file the read
 * endpoints (and dashboard) serve, so "live data" is one POST away.
 *
 * Only one scrape can run at a time — Puppeteer sessions are heavy and the
 * two runs would race on the output file — so a second POST while one is
 * in flight gets a 409 with the current status instead of a second browser.
 */
const state = {
  running: false,
  startedAt: null,
  carrier: null,
  lastRun: null, // { finishedAt, durationMs, carrier, recordCount, errorCount, errors, ok }
};

async function runScrape(carrierSlug) {
  const startedAt = new Date();
  state.running = true;
  state.startedAt = startedAt.toISOString();
  state.carrier = carrierSlug || null;

  try {
    const { records, raws, errors } = await scrapeAll({ headless: true, carrierSlug: carrierSlug || null });

    // Don't clobber a good dataset with an empty one when the whole run
    // failed (e.g. Chrome didn't launch, or both sites were unreachable).
    const totalFailure = records.length === 0 && errors.length > 0;
    let persistence = null;
    if (!totalFailure) {
      // The JSON file is the DB-less fallback store. On serverless hosts
      // (Vercel) the filesystem is read-only, so a failed write is fine —
      // there, Postgres (below) is the only store that matters.
      try {
        fs.mkdirSync(path.dirname(DATA_PATH), { recursive: true });
        fs.writeFileSync(DATA_PATH, JSON.stringify(records, null, 2));
      } catch (err) {
        console.warn(`Could not write ${DATA_PATH} (read-only filesystem?): ${err.message}`);
      }
      // Raw landing tables + normalized Agents/Customers/Policies.
      persistence = await persistScrape({ records, raws });
    }

    state.lastRun = {
      ok: !totalFailure,
      finishedAt: new Date().toISOString(),
      durationMs: Date.now() - startedAt.getTime(),
      carrier: carrierSlug || 'all',
      recordCount: records.length,
      errorCount: errors.length,
      errors,
      persistence,
    };
  } catch (err) {
    state.lastRun = {
      ok: false,
      finishedAt: new Date().toISOString(),
      durationMs: Date.now() - startedAt.getTime(),
      carrier: carrierSlug || 'all',
      recordCount: 0,
      errorCount: 1,
      errors: [{ carrier: carrierSlug || 'all', message: err.message }],
    };
  } finally {
    state.running = false;
    state.startedAt = null;
    state.carrier = null;
  }

  return state.lastRun;
}

/**
 * POST /api/scrape[?carrier=slug][&wait=false]
 * Kicks off a live scrape of both carrier sites (or just one). By default
 * the response waits for the run to finish and includes the summary; pass
 * `wait=false` to get a 202 immediately and poll GET /api/scrape/status.
 */
const triggerScrape = async (req, res) => {
  if (state.running) {
    return res.status(409).json({
      success: false,
      message: 'A scrape is already running',
      status: { running: true, startedAt: state.startedAt, carrier: state.carrier },
    });
  }

  const carrierSlug = req.query.carrier || null;
  if (carrierSlug && !carriers.some((c) => c.slug === carrierSlug)) {
    return res.status(400).json({
      success: false,
      message: `Unknown carrier "${carrierSlug}". Known carriers: ${carriers.map((c) => c.slug).join(', ')}`,
    });
  }

  const run = runScrape(carrierSlug);

  if (req.query.wait === 'false') {
    // Fire-and-forget; surface failures via /api/scrape/status.
    run.catch(() => {});
    return res.status(202).json({
      success: true,
      message: 'Scrape started. Poll GET /api/scrape/status for progress.',
    });
  }

  const result = await run;
  res.status(result.ok ? 200 : 500).json({ success: result.ok, data: result });
};

/** GET /api/scrape/status — is a run in flight, and how did the last one go. */
const getScrapeStatus = (req, res) => {
  res.status(200).json({
    success: true,
    data: {
      running: state.running,
      startedAt: state.startedAt,
      carrier: state.carrier,
      carriers: carriers.map((c) => c.slug),
      dataFileExists: fs.existsSync(DATA_PATH),
      lastRun: state.lastRun,
    },
  });
};

module.exports = { triggerScrape, getScrapeStatus };
