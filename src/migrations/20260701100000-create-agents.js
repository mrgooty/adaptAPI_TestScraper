'use strict';

// Normalized Agents table (shared across both carrier websites).
// 1:1 with src/models/agent.js.
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('Agents', {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: Sequelize.DataTypes.INTEGER,
      },
      // Source carrier slug ('placeholder_carrier' | 'forleast_star').
      // STRING, not ENUM, so a third carrier needs no schema change.
      carrier: {
        type: Sequelize.DataTypes.STRING,
        allowNull: false,
      },
      name: {
        type: Sequelize.DataTypes.STRING,
        allowNull: false,
      },
      // The carrier's stable agent identifier.
      producerCode: {
        type: Sequelize.DataTypes.STRING,
        allowNull: false,
      },
      agency: {
        type: Sequelize.DataTypes.STRING,
        allowNull: true,
      },
      agencyCode: {
        type: Sequelize.DataTypes.STRING,
        allowNull: true,
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

    // A producer code identifies an agent within a carrier.
    await queryInterface.addConstraint('Agents', {
      fields: ['carrier', 'producerCode'],
      type: 'unique',
      name: 'agents_carrier_producer_code_unique',
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('Agents');
  },
};
