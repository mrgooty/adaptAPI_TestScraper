require('dotenv').config();

const app = require('./app');
const db = require('./models');

const PORT = process.env.PORT || 3000;

async function start() {
  try {
    await db.sequelize.authenticate();
    console.log('Database connection established');
  } catch (err) {
    // Non-fatal: the read API and dashboard serve from the scraped JSON file.
    // The database is only used to persist scrape results (raw + normalized
    // tables); without it, scrapes still run and refresh the JSON — they just
    // skip persistence with a warning.
    console.warn(`Database unavailable, continuing without it: ${err.message}`);
    console.warn('(Scrapes will skip DB persistence until Postgres is reachable; everything else works.)');
  }

  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

start();
