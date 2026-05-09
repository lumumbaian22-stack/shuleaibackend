module.exports = (sequelize, DataTypes) => {
  const TutorMessage = sequelize.define('TutorMessage', {
    schoolId: { type: DataTypes.STRING, allowNull: false, index: true },
    schoolCode: { type: DataTypes.STRING, allowNull: true },
    sessionId: { type: DataTypes.INTEGER, allowNull: true },
    studentId: { type: DataTypes.INTEGER, allowNull: false },
    userId: { type: DataTypes.INTEGER, allowNull: true },
    role: { type: DataTypes.STRING, allowNull: false },
    message: { type: DataTypes.TEXT, allowNull: false },
    subject: { type: DataTypes.STRING, allowNull: true },
    topic: { type: DataTypes.STRING, allowNull: true },
    command: { type: DataTypes.STRING, allowNull: true },
    source: { type: DataTypes.STRING, allowNull: true },
    metadata: { type: DataTypes.JSONB, defaultValue: {} }
  }, { timestamps: true });
  return TutorMessage;
};
