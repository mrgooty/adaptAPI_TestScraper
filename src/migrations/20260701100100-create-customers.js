'use strict';

// Normalized Customers table (shared across both carrier websites).
// 1:1 with src/models/customer.js. FK to the servicing Agent.
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('Customers', {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: Sequelize.DataTypes.INTEGER,
      },
      // Source carrier slug ('placeholder_carrier' | 'forleast_star').
      carrier: {
        type: Sequelize.DataTypes.STRING,
        allowNull: false,
      },
      // The carrier's own customer identifier (e.g. 'v1my6wyd').
      externalId: {
        type: Sequelize.DataTypes.STRING,
        allowNull: false,
      },
      // The agent servicing this customer (each carrier page embeds one).
      agentId: {
        type: Sequelize.DataTypes.INTEGER,
        allowNull: true,
        references: { table: 'Agents', key: 'id' },
        onDelete: 'SET NULL',
        onUpdate: 'CASCADE',
      },
      name: {
        type: Sequelize.DataTypes.STRING,
        allowNull: false,
      },
      address: {
        type: Sequelize.DataTypes.STRING,
        allowNull: true,
      },
      email: {
        type: Sequelize.DataTypes.STRING,
        allowNull: true,
      },
      // Both carriers expose SSN (Forleast Star labels it; Placeholder
      // Carrier renders it as an unlabeled 9-digit value).
      ssn: {
        type: Sequelize.DataTypes.STRING(11),
        allowNull: true,
      },
      dateOfBirth: {
        type: Sequelize.DataTypes.DATEONLY,
        allowNull: true,
      },
      profession: {
        type: Sequelize.DataTypes.STRING,
        allowNull: true,
      },
      creditScore: {
        type: Sequelize.DataTypes.INTEGER,
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

    // A customer id is unique within a carrier, not globally.
    await queryInterface.addConstraint('Customers', {
      fields: ['carrier', 'externalId'],
      type: 'unique',
      name: 'customers_carrier_external_id_unique',
    });
    await queryInterface.addIndex('Customers', ['email']);
    await queryInterface.addIndex('Customers', ['agentId']);
  },

  async down(queryInterface) {
    await queryInterface.dropTable('Customers');
  },
};
