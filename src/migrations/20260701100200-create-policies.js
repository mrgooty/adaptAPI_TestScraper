'use strict';

// Normalized Policies table (shared across both carrier websites).
// 1:1 with src/models/policy.js. FK to the owning Customer.
// Endorsements are stored as JSONB — small nested records always read with
// their policy, so a separate table buys nothing here.
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('Policies', {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: Sequelize.DataTypes.INTEGER,
      },
      customerId: {
        type: Sequelize.DataTypes.INTEGER,
        allowNull: false,
        references: { table: 'Customers', key: 'id' },
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE',
      },
      // The carrier's own policy identifier (e.g. 'tecvut0rub').
      externalId: {
        type: Sequelize.DataTypes.STRING,
        allowNull: false,
      },
      type: {
        type: Sequelize.DataTypes.STRING,
        allowNull: true,
      },
      status: {
        type: Sequelize.DataTypes.STRING,
        allowNull: true,
      },
      premium: {
        type: Sequelize.DataTypes.DECIMAL(12, 2),
        allowNull: true,
      },
      effectiveDate: {
        type: Sequelize.DataTypes.DATEONLY,
        allowNull: true,
      },
      startDate: {
        type: Sequelize.DataTypes.DATEONLY,
        allowNull: true,
      },
      terminationDate: {
        type: Sequelize.DataTypes.DATEONLY,
        allowNull: true,
      },
      accountId: {
        type: Sequelize.DataTypes.STRING,
        allowNull: true,
      },
      commissionRate: {
        type: Sequelize.DataTypes.STRING,
        allowNull: true,
      },
      numberOfInsureds: {
        type: Sequelize.DataTypes.INTEGER,
        allowNull: true,
      },
      underwriterName: {
        type: Sequelize.DataTypes.STRING,
        allowNull: true,
      },
      underwriterEmail: {
        type: Sequelize.DataTypes.STRING,
        allowNull: true,
      },
      endorsements: {
        type: Sequelize.DataTypes.JSONB,
        allowNull: false,
        defaultValue: [],
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

    // A policy id is unique within its customer, not globally.
    await queryInterface.addConstraint('Policies', {
      fields: ['customerId', 'externalId'],
      type: 'unique',
      name: 'policies_customer_external_id_unique',
    });
    await queryInterface.addIndex('Policies', ['externalId']);
    await queryInterface.addIndex('Policies', ['status']);
  },

  async down(queryInterface) {
    await queryInterface.dropTable('Policies');
  },
};
