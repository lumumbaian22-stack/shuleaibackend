module.exports = (sequelize, DataTypes) => {
  const PaymentRefund = sequelize.define('PaymentRefund', {
    paymentTransactionId: { type: DataTypes.INTEGER, allowNull: true },
    legacyPaymentId: { type: DataTypes.INTEGER, allowNull: true },
    schoolCode: { type: DataTypes.STRING, allowNull: true },
    provider: { type: DataTypes.STRING, allowNull: false },
    amount: { type: DataTypes.INTEGER, allowNull: false },
    currency: { type: DataTypes.STRING, allowNull: false, defaultValue: 'KES' },
    reason: { type: DataTypes.TEXT, allowNull: true },
    status: { type: DataTypes.STRING, allowNull: false, defaultValue: 'requested' },
    requestedBy: { type: DataTypes.INTEGER, allowNull: true },
    approvedBy: { type: DataTypes.INTEGER, allowNull: true },
    providerRefundReference: { type: DataTypes.STRING, allowNull: true },
    rawPayload: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} }
  }, { timestamps: true, indexes: [{ fields: ['schoolCode', 'status'] }] });
  return PaymentRefund;
};
