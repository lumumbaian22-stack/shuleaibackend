module.exports = (sequelize, DataTypes) => {
  const Payment = sequelize.define('Payment', {
    studentId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: { model: 'Students', key: 'id' }
    },
    parentId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: { model: 'Parents', key: 'id' }
    },
    feeId: {
      type: DataTypes.INTEGER,
      references: { model: 'Fees', key: 'id' }
    },
    amount: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    method: {
      type: DataTypes.ENUM('mpesa', 'bank', 'cash', 'card'),
      allowNull: false
    },
    reference: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true
    },
    plan: {
      type: DataTypes.ENUM('basic', 'premium', 'ultimate'),
      allowNull: false
    },
    status: {
      type: DataTypes.ENUM('pending', 'completed', 'failed', 'refunded'),
      defaultValue: 'pending'
    },
    transactionDate: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
    verifiedBy: DataTypes.INTEGER,
    verifiedAt: DataTypes.DATE,
    notes: DataTypes.TEXT
  }, {
    timestamps: true
  });

  return Payment;
};