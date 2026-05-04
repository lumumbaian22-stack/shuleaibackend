module.exports = (sequelize, DataTypes) => {
  const LearningMaterial = sequelize.define('LearningMaterial', {
    schoolCode: { type: DataTypes.STRING, allowNull: true },
    curriculum: { type: DataTypes.ENUM('cbc', '844', 'british', 'american'), defaultValue: 'cbc' },
    gradeLevel: { type: DataTypes.STRING, allowNull: false },
    subject: { type: DataTypes.STRING, allowNull: false },
    strand: { type: DataTypes.STRING, allowNull: true },
    subStrand: { type: DataTypes.STRING, allowNull: true },
    title: { type: DataTypes.STRING, allowNull: false },
    summary: { type: DataTypes.TEXT, allowNull: false },
    content: { type: DataTypes.TEXT, allowNull: false },
    examples: { type: DataTypes.JSONB, defaultValue: [] },
    activities: { type: DataTypes.JSONB, defaultValue: [] },
    assessment: { type: DataTypes.JSONB, defaultValue: [] },
    difficulty: { type: DataTypes.ENUM('foundation', 'developing', 'proficient', 'advanced'), defaultValue: 'developing' },
    accessLevel: { type: DataTypes.ENUM('basic', 'premium', 'ultimate'), defaultValue: 'basic' },
    sourceType: { type: DataTypes.ENUM('system', 'school', 'teacher'), defaultValue: 'system' },
    resourceUrl: { type: DataTypes.STRING, allowNull: true },
    tags: { type: DataTypes.JSONB, defaultValue: [] },
    isActive: { type: DataTypes.BOOLEAN, defaultValue: true }
  }, { timestamps: true });
  return LearningMaterial;
};
