'use strict';

const { Model } = require('@sequelize/core');

// 1:1 with migrations/20260701100400-create-forleast-star-raw-records.js
// (table: ForleastStarRawRecords). Raw landing table for the Forleast Star
// website — one row per customer, as scraped.
module.exports = (sequelize, DataTypes) => {
  class ForleastStarRawRecord extends Model {
    static associate() {}
  }

  ForleastStarRawRecord.init(
    {
      // The carrier's own customer identifier.
      externalId: { type: DataTypes.STRING, allowNull: false, unique: true },
      // Raw { customer, agent, policies } exactly as the adapter extracted it.
      payload: { type: DataTypes.JSONB, allowNull: false },
      scrapedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    },
    {
      sequelize,
      modelName: 'ForleastStarRawRecord',
      tableName: 'ForleastStarRawRecords',
    }
  );

  return ForleastStarRawRecord;
};
