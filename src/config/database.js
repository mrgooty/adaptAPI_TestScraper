'use strict';

const { Sequelize } = require('@sequelize/core');
const { PostgresDialect } = require('@sequelize/postgres');
const config = require('./config.js');

const env = process.env.NODE_ENV || 'development';
const envConfig = config[env];

const options = {
  dialect: PostgresDialect,
  logging: envConfig.logging,
  ssl: envConfig.ssl,
};

if (envConfig.use_env_variable) {
  const rawUrl = process.env[envConfig.use_env_variable];
  if (rawUrl) {
    // Hosted Postgres providers (Neon, Supabase, Heroku) append pg-specific
    // params like `?sslmode=require&channel_binding=require` to their
    // connection strings, but Sequelize v7 rejects URL params it doesn't
    // know. Strip them and translate sslmode into the dialect's ssl option.
    const url = new URL(rawUrl);
    const sslmode = url.searchParams.get('sslmode');
    url.searchParams.delete('sslmode');
    url.searchParams.delete('channel_binding');
    options.url = url.toString();
    if (sslmode && sslmode !== 'disable') {
      options.ssl = { require: true, rejectUnauthorized: false };
    }
  }
} else {
  options.host = envConfig.host;
  options.port = envConfig.port;
  options.database = envConfig.database;
  options.user = envConfig.username;
  options.password = envConfig.password;
}

const sequelize = new Sequelize(options);

module.exports = sequelize;
