'use strict';

// Vercel serverless entrypoint. Vercel invokes the exported Express app per
// request — no app.listen() here (src/index.js remains the local/server
// entrypoint). Sequelize connects lazily on first query, so no explicit
// authenticate() is needed on cold start.
require('dotenv').config();

module.exports = require('../src/app');
