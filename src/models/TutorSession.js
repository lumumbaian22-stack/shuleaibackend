module.exports = (sequelize, DataTypes) => {
  const TutorSession = sequelize.define('TutorSession', {
    schoolId: { type: DataTypes.STRING, allowNull: false, index: true },
    schoolCode: { type: DataTypes.STRING, allowNull: true },
    studentId: { type: DataTypes.INTEGER, allowNull: false },
    userId: { type: DataTypes.INTEGER, allowNull: true },
    grade: { type: DataTypes.STRING, allowNull: true },
    gradeLevel: { type: DataTypes.STRING, allowNull: true },
    level: { type: DataTypes.STRING, allowNull: true },
    subject: { type: DataTypes.STRING, allowNull: true },
    mode: { type: DataTypes.STRING, allowNull: false, defaultValue: 'learn' },
    lastCommand: { type: DataTypes.STRING, allowNull: true },
    metadata: { type: DataTypes.JSONB, defaultValue: {} }
  }, { timestamps: true });
  return TutorSession;
};
