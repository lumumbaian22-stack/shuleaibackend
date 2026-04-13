module.exports = (sequelize, DataTypes) => {
  const HomeTask = sequelize.define('HomeTask', {
    title: { type: DataTypes.STRING, allowNull: false },
    instructions: { type: DataTypes.TEXT, allowNull: false },
    type: { type: DataTypes.STRING(20), allowNull: false }, // Practice, Application, Project, Reflection
    subject: { type: DataTypes.STRING, allowNull: false },
    competencyId: { type: DataTypes.INTEGER, allowNull: false },
    learningOutcomeId: { type: DataTypes.INTEGER, allowNull: true },
    gradeLevel: { type: DataTypes.STRING, allowNull: false },
    difficulty: { type: DataTypes.STRING(10), allowNull: false },
    estimatedMinutes: { type: DataTypes.INTEGER, defaultValue: 15 },
    materials: { type: DataTypes.TEXT, allowNull: true },
    points: { type: DataTypes.INTEGER, defaultValue: 10 },
    isActive: { type: DataTypes.BOOLEAN, defaultValue: true }
  }, { timestamps: true });
  return HomeTask;
};
