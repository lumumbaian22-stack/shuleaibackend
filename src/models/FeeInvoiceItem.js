module.exports = (sequelize, DataTypes) => {
  const FeeInvoiceItem = sequelize.define('FeeInvoiceItem', {
    invoiceId: { type: DataTypes.INTEGER, allowNull: false },
    schoolCode: { type: DataTypes.STRING, allowNull: false },
    studentId: { type: DataTypes.INTEGER, allowNull: false },
    category: { type: DataTypes.STRING, allowNull: false, defaultValue: 'tuition' },
    description: { type: DataTypes.STRING, allowNull: false },
    quantity: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
    unitAmount: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    amount: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    metadata: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} }
  }, { timestamps: true, indexes: [{ fields: ['invoiceId'] }, { fields: ['schoolCode', 'studentId'] }] });
  return FeeInvoiceItem;
};
