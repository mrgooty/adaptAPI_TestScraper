'use strict';

// Raw landing table for the Placeholder Carrier website.
// 1:1 with src/models/placeholder-carrier-raw-record.js.
//
// One row per scraped customer, holding the record exactly as the adapter
// extracted it (before normalization) in JSONB. This preserves the source
// shape so normalization can be replayed/audited without re-scraping, and
// carrier-specific quirks are never lost by the shared schema.
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('PlaceholderCarrierRawRecords', {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: Sequelize.DataTypes.INTEGER,
      },
      // The carrier's own customer identifier (from the scraped page URL/fields).
      externalId: {
        type: Sequelize.DataTypes.STRING,
        allowNull: false,
        unique: true,
      },
      // Raw record as scraped: { customer, agent, policies } in this
      // carrier's own shape.
      payload: {
        type: Sequelize.DataTypes.JSONB,
        allowNull: false,
      },
      scrapedAt: {
        type: Sequelize.DataTypes.DATE,
        allowNull: false,
        defaultValue: Sequelize.fn('NOW'),
      },
      createdAt: {
        allowNull: false,
        type: Sequelize.DataTypes.DATE,
        defaultValue: Sequelize.fn('NOW'),
      },
      updatedAt: {
        allowNull: false,
        type: Sequelize.DataTypes.DATE,
        defaultValue: Sequelize.fn('NOW'),
      },
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('PlaceholderCarrierRawRecords');
  },
};
