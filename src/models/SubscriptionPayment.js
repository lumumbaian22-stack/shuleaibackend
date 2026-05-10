module.exports = (sequelize, DataTypes) => {
  const SubscriptionPayment = sequelize.define('SubscriptionPayment', {
    subscriptionId: { type: DataTypes.INTEGER, allowNull: true },
    ownerType: { type: DataTypes.ENUM('school', 'child'), allowNull: false },
    schoolId: { type: DataTypes.INTEGER, allowNull: true },
    schoolCode: { type: DataTypes.STRING, allowNull: true },
    parentId: { type: DataTypes.INTEGER, allowNull: true },
    studentId: { type: DataTypes.INTEGER, allowNull: true },
    planId: { type: DataTypes.INTEGER, allowNull: true },
    planCode: { type: DataTypes.STRING, allowNull: false },
    amount: { type: DataTypes.INTEGER, allowNull: false },
    currency: { type: DataTypes.STRING, defaultValue: 'KES' },
    billingCycle: { type: DataTypes.ENUM('monthly', 'termly', 'yearly', 'custom'), defaultValue: 'monthly' },
    paymentMethod: { type: DataTypes.ENUM('mpesa', 'bank', 'card', 'manual'), defaultValue: 'mpesa' },
    checkoutRequestId: { type: DataTypes.STRING, allowNull: true, unique: true },
    merchantRequestId: { type: DataTypes.STRING, allowNull: true },
    mpesaReceiptNumber: { type: DataTypes.STRING, allowNull: true },
    phone: { type: DataTypes.STRING, allowNull: true },
    status: { type: DataTypes.ENUM('pending', 'success', 'failed', 'cancelled'), defaultValue: 'pending' },
    paidAt: { type: DataTypes.DATE, allowNull: true },
    rawCallback: { type: DataTypes.JSONB, defaultValue: {} },
    metadata: { type: DataTypes.JSONB, defaultValue: {} }
  }, { timestamps: true });

  return SubscriptionPayment;
};
