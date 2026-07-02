'use strict';

const path = require('path');
require('dotenv').config();

const { Sequelize } = require('@sequelize/core');
const { Umzug, SequelizeStorage } = require('umzug');
const sequelize = require('../src/config/database.js');

const umzug = new Umzug({
  migrations: {
    glob: path.join(__dirname, '../src/migrations/*.js'),
    resolve: ({ name, path: migrationPath }) => {
      const migration = require(migrationPath);

      return {
        name,
        up: async () => migration.up(sequelize.queryInterface, Sequelize),
        down: async () => migration.down(sequelize.queryInterface, Sequelize),
      };
    },
  },
  context: sequelize.queryInterface,
  storage: new SequelizeStorage({ sequelize }),
  logger: console,
});

async function run() {
  const command = process.argv[2] || 'up';

  // On Vercel this runs as the build step (see "vercel-build" in
  // package.json) so the Neon tables exist before the first request.
  // Fail fast with a clear message rather than a confusing ECONNREFUSED.
  // Keyed on VERCEL (always set in Vercel builds) rather than NODE_ENV,
  // which Vercel does not guarantee during the build step.
  if ((process.env.VERCEL || process.env.NODE_ENV === 'production') && !process.env.DATABASE_URL) {
    console.error(
      'Migration failed: DATABASE_URL is not set. Add it (plus DB_SSL=true) in ' +
        'Vercel → Project → Settings → Environment Variables, then redeploy.'
    );
    process.exit(1);
  }

  try {
    await sequelize.authenticate();

    if (command === 'down') {
      await umzug.down();
      console.log('Migrations rolled back');
    } else if (command === 'status') {
      const executed = await umzug.executed();
      const pending = await umzug.pending();
      console.log('Executed:', executed.map((m) => m.name));
      console.log('Pending:', pending.map((m) => m.name));
    } else {
      await umzug.up();
      console.log('Migrations applied');
    }
  } catch (err) {
    console.error('Migration failed:', err.message);
    process.exitCode = 1;
  } finally {
    await sequelize.close();
  }
}

run();
