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
  options.url = process.env[envConfig.use_env_variable];
} else {
  options.host = envConfig.host;
  options.port = envConfig.port;
  options.database = envConfig.database;
  options.user = envConfig.username;
  options.password = envConfig.password;
}

const sequelize = new Sequelize(options);

module.exports = sequelize;
