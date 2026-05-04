module.exports = (sequelize, DataTypes) => {
  const TutorMessage = sequelize.define('TutorMessage', {
    sessionId: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'TutorSessions', key: 'id' } },
    studentId: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'Students', key: 'id' } },
    role: { type: DataTypes.ENUM('student', 'tutor', 'system'), allowNull: false },
    subject: { type: DataTypes.STRING, allowNull: false },
    content: { type: DataTypes.TEXT, allowNull: false },
    intent: { type: DataTypes.STRING, allowNull: true },
    confidence: { type: DataTypes.FLOAT, defaultValue: 0 },
    metadata: { type: DataTypes.JSONB, defaultValue: {} }
  }, { timestamps: true });
  return TutorMessage;
};
