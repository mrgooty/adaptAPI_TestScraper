'use strict';

const { Model } = require('@sequelize/core');

// 1:1 with migrations/20260701100100-create-customers.js (table: Customers).
module.exports = (sequelize, DataTypes) => {
  class Customer extends Model {
    static associate(models) {
      Customer.belongsTo(models.Agent, { foreignKey: 'agentId', as: 'agent' });
      Customer.hasMany(models.Policy, { foreignKey: 'customerId', as: 'policies' });
    }
  }

  Customer.init(
    {
      // Source carrier slug ('placeholder_carrier' | 'forleast_star').
      carrier: { type: DataTypes.STRING, allowNull: false },
      // The carrier's own customer identifier (e.g. 'v1my6wyd'); unique per carrier.
      externalId: { type: DataTypes.STRING, allowNull: false },
      // The agent servicing this customer.
      agentId: { type: DataTypes.INTEGER, allowNull: true },
      name: { type: DataTypes.STRING, allowNull: false },
      address: { type: DataTypes.STRING, allowNull: true },
      email: { type: DataTypes.STRING, allowNull: true },
      ssn: { type: DataTypes.STRING(11), allowNull: true },
      dateOfBirth: { type: DataTypes.DATEONLY, allowNull: true },
      profession: { type: DataTypes.STRING, allowNull: true },
      creditScore: { type: DataTypes.INTEGER, allowNull: true },
    },
    {
      sequelize,
      modelName: 'Customer',
      indexes: [{ unique: true, fields: ['carrier', 'externalId'] }],
    }
  );

  return Customer;
};
