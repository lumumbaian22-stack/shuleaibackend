module.exports = (sequelize, DataTypes) => {
  const PromotionDecision = sequelize.define('PromotionDecision', {
    schoolCode: { type: DataTypes.STRING, allowNull: false },
    batchId: { type: DataTypes.INTEGER, allowNull: false },
    studentId: { type: DataTypes.INTEGER, allowNull: false },
    currentEnrollmentId: { type: DataTypes.INTEGER, allowNull: true },
    fromClassId: { type: DataTypes.INTEGER, allowNull: true },
    toClassId: { type: DataTypes.INTEGER, allowNull: true },
    fromStream: { type: DataTypes.STRING, allowNull: true },
    toStream: { type: DataTypes.STRING, allowNull: true },
    outcome: { type: DataTypes.STRING(40), allowNull: false, defaultValue: 'promote' },
    warnings: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
    status: { type: DataTypes.STRING(30), allowNull: false, defaultValue: 'proposed' },
    appliedEnrollmentId: { type: DataTypes.INTEGER, allowNull: true },
    metadata: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} }
  }, {
    timestamps: true,
    indexes: [
      { unique: true, fields: ['batchId', 'studentId'] },
      { fields: ['schoolCode', 'batchId', 'status'] }
    ]
  });
  return PromotionDecision;
};
