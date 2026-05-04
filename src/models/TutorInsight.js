module.exports = (sequelize, DataTypes) => {
  const TutorInsight = sequelize.define('TutorInsight', {
    studentId: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'Students', key: 'id' } },
    schoolCode: { type: DataTypes.STRING, allowNull: false },
    subject: { type: DataTypes.STRING, allowNull: false },
    gradeLevel: { type: DataTypes.STRING, allowNull: false },
    masteryScore: { type: DataTypes.INTEGER, defaultValue: 0 },
    strengthAreas: { type: DataTypes.JSONB, defaultValue: [] },
    weakAreas: { type: DataTypes.JSONB, defaultValue: [] },
    recommendedMaterials: { type: DataTypes.JSONB, defaultValue: [] },
    recommendedActivities: { type: DataTypes.JSONB, defaultValue: [] },
    lastInteractionAt: { type: DataTypes.DATE, allowNull: true },
    evidence: { type: DataTypes.JSONB, defaultValue: {} }
  }, { timestamps: true });
  return TutorInsight;
};
