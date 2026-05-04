module.exports = (sequelize, DataTypes) => {
  const TutorSession = sequelize.define('TutorSession', {
    studentId: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'Students', key: 'id' } },
    userId: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'Users', key: 'id' } },
    schoolCode: { type: DataTypes.STRING, allowNull: false },
    subject: { type: DataTypes.STRING, allowNull: false },
    gradeLevel: { type: DataTypes.STRING, allowNull: false },
    title: { type: DataTypes.STRING, allowNull: false },
    status: { type: DataTypes.ENUM('active', 'closed'), defaultValue: 'active' },
    metrics: { type: DataTypes.JSONB, defaultValue: { messages: 0, questionsAsked: 0, confidence: 0 } }
  }, { timestamps: true });
  return TutorSession;
};
