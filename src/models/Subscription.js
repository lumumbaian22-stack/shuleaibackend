module.exports = (sequelize, DataTypes) => {
  const Subscription = sequelize.define('Subscription', {
    ownerType: { type: DataTypes.ENUM('school', 'child'), allowNull: false },
    schoolId: { type: DataTypes.INTEGER, allowNull: true },
    schoolCode: { type: DataTypes.STRING, allowNull: true },
    parentId: { type: DataTypes.INTEGER, allowNull: true },
    studentId: { type: DataTypes.INTEGER, allowNull: true },
    planId: { type: DataTypes.INTEGER, allowNull: true },
    planCode: { type: DataTypes.STRING, allowNull: false },
    planName: { type: DataTypes.STRING, allowNull: false },
    billingCycle: { type: DataTypes.ENUM('monthly', 'termly', 'yearly', 'custom'), allowNull: false, defaultValue: 'monthly' },
    status: { type: DataTypes.ENUM('active', 'expired', 'cancelled', 'pending', 'paused'), defaultValue: 'pending' },
    startDate: { type: DataTypes.DATE, allowNull: true },
    endDate: { type: DataTypes.DATE, allowNull: true },
    autoRenew: { type: DataTypes.BOOLEAN, defaultValue: false },
    lastPaymentId: { type: DataTypes.INTEGER, allowNull: true },
    featuresSnapshot: { type: DataTypes.JSONB, defaultValue: [] },
    limitsSnapshot: { type: DataTypes.JSONB, defaultValue: {} },
    metadata: { type: DataTypes.JSONB, defaultValue: {} }
  }, { timestamps: true });

  Subscription.prototype.isActiveNow = function () {
    return this.status === 'active' && this.endDate && new Date(this.endDate) > new Date();
  };

  Subscription.prototype.remainingDays = function () {
    if (!this.endDate || this.status !== 'active') return 0;
    return Math.max(0, Math.ceil((new Date(this.endDate) - new Date()) / 86400000));
  };

  return Subscription;
};
