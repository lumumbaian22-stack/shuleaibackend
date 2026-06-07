module.exports = (sequelize, DataTypes) => {
  const StudentEnrollment = sequelize.define('StudentEnrollment', {
    schoolCode: { type: DataTypes.STRING, allowNull: false },
    studentId: { type: DataTypes.INTEGER, allowNull: false },
    classId: { type: DataTypes.INTEGER, allowNull: true },
    stream: { type: DataTypes.STRING, allowNull: true },
    academicYear: { type: DataTypes.INTEGER, allowNull: false },
    status: { type: DataTypes.STRING(30), allowNull: false, defaultValue: 'active' },
    effectiveFrom: { type: DataTypes.DATEONLY, allowNull: false },
    effectiveTo: { type: DataTypes.DATEONLY, allowNull: true },
    endedReason: { type: DataTypes.STRING(80), allowNull: true },
    createdBy: { type: DataTypes.INTEGER, allowNull: true },
    closedBy: { type: DataTypes.INTEGER, allowNull: true },
    version: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
    metadata: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} }
  }, {
    timestamps: true,
    indexes: [
      { fields: ['schoolCode', 'studentId', 'academicYear'] },
      { fields: ['schoolCode', 'classId', 'status'] }
    ]
  });
  return StudentEnrollment;
};
