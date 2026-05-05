module.exports = (sequelize, DataTypes) => {
  const TutorUsage = sequelize.define('TutorUsage', {
    schoolId: { type: DataTypes.STRING, allowNull: false, index: true },
    studentId: { type: DataTypes.INTEGER, allowNull: false },
    usageDate: { type: DataTypes.DATEONLY, allowNull: false },
    totalQuestions: { type: DataTypes.INTEGER, defaultValue: 0 },
    aiCalls: { type: DataTypes.INTEGER, defaultValue: 0 }
  }, {
    timestamps: true,
    indexes: [{ unique: true, fields: ['schoolId', 'studentId', 'usageDate'] }]
  });
  return TutorUsage;
};
