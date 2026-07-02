'use strict';

const { Model } = require('@sequelize/core');

// 1:1 with migrations/20260701100000-create-agents.js (table: Agents).
module.exports = (sequelize, DataTypes) => {
  class Agent extends Model {
    static associate(models) {
      Agent.hasMany(models.Customer, { foreignKey: 'agentId', as: 'customers' });
    }
  }

  Agent.init(
    {
      // Source carrier slug ('placeholder_carrier' | 'forleast_star').
      carrier: { type: DataTypes.STRING, allowNull: false },
      name: { type: DataTypes.STRING, allowNull: false },
      // The carrier's stable agent identifier; unique per carrier.
      producerCode: { type: DataTypes.STRING, allowNull: false },
      agency: { type: DataTypes.STRING, allowNull: true },
      agencyCode: { type: DataTypes.STRING, allowNull: true },
    },
    {
      sequelize,
      modelName: 'Agent',
      indexes: [{ unique: true, fields: ['carrier', 'producerCode'] }],
    }
  );

  return Agent;
};
