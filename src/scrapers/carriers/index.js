'use strict';

/**
 * Registry of carrier adapters. To add a third carrier:
 *   1. Create `carriers/<slug>.js` exporting { slug, baseUrl, listCustomers, scrapeCustomer }
 *      (see carrier-adapter.js for the contract and shared DOM helpers).
 *   2. Add it to this array.
 * Nothing in `index.js` or `normalize.js` needs to change.
 */

const placeholderCarrier = require('./placeholder-carrier');
const forleastStar = require('./forleast-star');

module.exports = [placeholderCarrier, forleastStar];
