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
