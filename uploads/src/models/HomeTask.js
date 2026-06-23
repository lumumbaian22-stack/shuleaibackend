module.exports = (sequelize, DataTypes) => {
  const HomeTask = sequelize.define('HomeTask', {
    title: { type: DataTypes.STRING, allowNull: false },
    instructions: { type: DataTypes.TEXT, allowNull: false },
    type: { type: DataTypes.STRING(20), allowNull: false }, // Practice, Application, Project, Reflection
    subject: { type: DataTypes.STRING, allowNull: false },
    competencyId: { type: DataTypes.INTEGER, allowNull: true },
    learningOutcomeId: { type: DataTypes.INTEGER, allowNull: true },
    gradeLevel: { type: DataTypes.STRING, allowNull: false },
    difficulty: { type: DataTypes.STRING(10), allowNull: false },
    estimatedMinutes: { type: DataTypes.INTEGER, defaultValue: 15 },
    materials: { type: DataTypes.TEXT, allowNull: true },
    points: { type: DataTypes.INTEGER, defaultValue: 10 },
    isActive: { type: DataTypes.BOOLEAN, defaultValue: true },
    schoolCode: { type: DataTypes.STRING, allowNull: true },
    createdBy: { type: DataTypes.INTEGER, allowNull: true },
    createdByUserId: { type: DataTypes.INTEGER, allowNull: true },
    classId: { type: DataTypes.INTEGER, allowNull: true },
    className: { type: DataTypes.STRING, allowNull: true },
    dueDate: { type: DataTypes.DATE, allowNull: true },
    attachments: { type: DataTypes.JSONB, defaultValue: [] },
    teacherNote: { type: DataTypes.TEXT, allowNull: true },
    studyDiscussionEnabled: { type: DataTypes.BOOLEAN, defaultValue: false },
    studyThreadId: { type: DataTypes.INTEGER, allowNull: true },
    studyDiscussionTitle: { type: DataTypes.STRING, allowNull: true },
    studyDiscussionSettings: { type: DataTypes.JSONB, defaultValue: {} }
  }, { timestamps: true });
  return HomeTask;
};
