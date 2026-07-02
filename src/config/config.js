'use strict';

// Per-environment connection settings. scripts/migrate.js (umzug) and the
// runtime app (config/database.js) both read this block so there is a
// single source of truth per environment.
require('dotenv').config();

const shared = {
  dialect: 'postgres',
  logging: process.env.DB_LOGGING === 'true' ? console.log : false,
  ssl:
    process.env.DB_SSL === 'true'
      ? { require: true, rejectUnauthorized: false }
      : false,
};

module.exports = {
  development: {
    ...shared,
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT) || 5432,
    database: process.env.DB_NAME || 'express_app',
    username: process.env.DB_USER || undefined,
    password: process.env.DB_PASSWORD || undefined,
  },
  test: {
    ...shared,
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT) || 5432,
    database: process.env.DB_NAME_TEST || 'express_app_test',
    username: process.env.DB_USER || undefined,
    password: process.env.DB_PASSWORD || undefined,
  },
  production: {
    // Connection comes from DATABASE_URL (see config/database.js, which
    // prefers that env var in every environment when it is set).
    ...shared,
  },
};
