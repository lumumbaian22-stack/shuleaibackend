module.exports = (sequelize, DataTypes) => {
  const SubscriptionPlan = sequelize.define('SubscriptionPlan', {
    name: {
      type: DataTypes.STRING(20),
      allowNull: false
    },
    price_kes: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    schoolId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: { model: 'Schools', key: 'id' }
    },
    features: {
      type: DataTypes.JSONB,
      defaultValue: []
    },
    isActive: {
      type: DataTypes.BOOLEAN,
      defaultValue: true
    }
  }, { timestamps: true });
  return SubscriptionPlan;
};
