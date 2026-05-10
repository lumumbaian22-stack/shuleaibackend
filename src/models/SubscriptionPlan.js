module.exports = (sequelize, DataTypes) => {
  const SubscriptionPlan = sequelize.define('SubscriptionPlan', {
    code: { type: DataTypes.STRING(40), allowNull: true, unique: true },
    name: { type: DataTypes.STRING(60), allowNull: false },
    displayName: { type: DataTypes.STRING(80), allowNull: true },
    audience: { type: DataTypes.ENUM('school', 'child'), allowNull: false, defaultValue: 'child' },
    tier: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
    price_kes: { type: DataTypes.INTEGER, allowNull: false },
    yearlyPriceKes: { type: DataTypes.INTEGER, allowNull: true },
    setupFeeMinKes: { type: DataTypes.INTEGER, allowNull: true },
    setupFeeMaxKes: { type: DataTypes.INTEGER, allowNull: true },
    billingCycles: { type: DataTypes.JSONB, defaultValue: ['monthly'] },
    schoolId: { type: DataTypes.INTEGER, allowNull: true, references: { model: 'Schools', key: 'id' } },
    features: { type: DataTypes.JSONB, defaultValue: [] },
    limits: { type: DataTypes.JSONB, defaultValue: {} },
    locks: { type: DataTypes.JSONB, defaultValue: [] },
    description: { type: DataTypes.TEXT, allowNull: true },
    isActive: { type: DataTypes.BOOLEAN, defaultValue: true }
  }, { timestamps: true });

  return SubscriptionPlan;
};
