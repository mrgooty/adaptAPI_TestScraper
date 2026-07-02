'use strict';

const { Model } = require('@sequelize/core');

// 1:1 with migrations/20260701100200-create-policies.js (table: Policies).
module.exports = (sequelize, DataTypes) => {
  class Policy extends Model {
    static associate(models) {
      Policy.belongsTo(models.Customer, { foreignKey: 'customerId', as: 'customer' });
    }
  }

  Policy.init(
    {
      customerId: { type: DataTypes.INTEGER, allowNull: false },
      // The carrier's own policy identifier (e.g. 'tecvut0rub').
      // Unique per customer (see policies_customer_external_id_unique).
      externalId: { type: DataTypes.STRING, allowNull: false },
      type: { type: DataTypes.STRING, allowNull: true },
      status: { type: DataTypes.STRING, allowNull: true },
      premium: { type: DataTypes.DECIMAL(12, 2), allowNull: true },
      effectiveDate: { type: DataTypes.DATEONLY, allowNull: true },
      startDate: { type: DataTypes.DATEONLY, allowNull: true },
      terminationDate: { type: DataTypes.DATEONLY, allowNull: true },
      accountId: { type: DataTypes.STRING, allowNull: true },
      commissionRate: { type: DataTypes.STRING, allowNull: true },
      numberOfInsureds: { type: DataTypes.INTEGER, allowNull: true },
      underwriterName: { type: DataTypes.STRING, allowNull: true },
      underwriterEmail: { type: DataTypes.STRING, allowNull: true },
      // Small nested records always read with their policy — kept as JSONB.
      endorsements: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
    },
    {
      sequelize,
      modelName: 'Policy',
      indexes: [{ unique: true, fields: ['customerId', 'externalId'] }],
    }
  );

  return Policy;
};
