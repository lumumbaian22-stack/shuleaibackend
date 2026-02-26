module.exports = (sequelize, DataTypes) => {
  const Fee = sequelize.define('Fee', {
    studentId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: { model: 'Students', key: 'id' }
    },
    schoolCode: {
      type: DataTypes.STRING,
      allowNull: false
    },
    term: {
      type: DataTypes.ENUM('Term 1', 'Term 2', 'Term 3'),
      allowNull: false
    },
    year: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    totalAmount: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    paidAmount: {
      type: DataTypes.INTEGER,
      defaultValue: 0
    },
    balance: {
      type: DataTypes.VIRTUAL,
      get() { return this.totalAmount - this.paidAmount; }
    },
    dueDate: DataTypes.DATE,
    status: {
      type: DataTypes.ENUM('paid', 'partial', 'unpaid', 'overdue'),
      defaultValue: 'unpaid'
    },
    paymentPlan: {
      type: DataTypes.ENUM('basic', 'premium', 'ultimate'),
      defaultValue: 'basic'
    },
    payments: { type: DataTypes.JSONB, defaultValue: [] }
  }, {
    timestamps: true
  });

  return Fee;
};