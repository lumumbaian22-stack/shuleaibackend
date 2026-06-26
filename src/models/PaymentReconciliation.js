module.exports = (sequelize, DataTypes) => {
  const PaymentReconciliation = sequelize.define('PaymentReconciliation', {
    paymentTransactionId: { type: DataTypes.INTEGER, allowNull: true },
    legacyPaymentId: { type: DataTypes.INTEGER, allowNull: true },
    schoolCode: { type: DataTypes.STRING, allowNull: true },
    provider: { type: DataTypes.STRING, allowNull: false },
    internalReference: { type: DataTypes.STRING, allowNull: true },
    providerReference: { type: DataTypes.STRING, allowNull: true },
    statusBefore: { type: DataTypes.STRING, allowNull: true },
    statusAfter: { type: DataTypes.STRING, allowNull: true },
    result: { type: DataTypes.STRING, allowNull: false, defaultValue: 'pending' },
    message: { type: DataTypes.TEXT, allowNull: true },
    checkedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    rawResponse: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} }
  }, { timestamps: true, indexes: [{ fields: ['internalReference'] }, { fields: ['schoolCode', 'result'] }] });
  return PaymentReconciliation;
};
