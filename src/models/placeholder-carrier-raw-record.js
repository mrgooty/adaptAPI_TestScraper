'use strict';

const { Model } = require('@sequelize/core');

// 1:1 with migrations/20260701100300-create-placeholder-carrier-raw-records.js
// (table: PlaceholderCarrierRawRecords). Raw landing table for the
// Placeholder Carrier website — one row per customer, as scraped.
module.exports = (sequelize, DataTypes) => {
  class PlaceholderCarrierRawRecord extends Model {
    static associate() {}
  }

  PlaceholderCarrierRawRecord.init(
    {
      // The carrier's own customer identifier.
      externalId: { type: DataTypes.STRING, allowNull: false, unique: true },
      // Raw { customer, agent, policies } exactly as the adapter extracted it.
      payload: { type: DataTypes.JSONB, allowNull: false },
      scrapedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    },
    {
      sequelize,
      modelName: 'PlaceholderCarrierRawRecord',
      tableName: 'PlaceholderCarrierRawRecords',
    }
  );

  return PlaceholderCarrierRawRecord;
};
