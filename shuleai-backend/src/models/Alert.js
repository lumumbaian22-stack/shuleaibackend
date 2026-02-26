module.exports = (sequelize, DataTypes) => {
  const Alert = sequelize.define('Alert', {
    userId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: { model: 'Users', key: 'id' }
    },
    role: {
      type: DataTypes.ENUM('student', 'parent', 'teacher', 'admin'),
      allowNull: false
    },
    type: {
      type: DataTypes.ENUM('academic', 'attendance', 'fee', 'system', 'improvement', 'duty', 'approval'),
      allowNull: false
    },
    severity: {
      type: DataTypes.ENUM('critical', 'warning', 'info', 'success'),
      defaultValue: 'info'
    },
    title: DataTypes.STRING,
    message: DataTypes.TEXT,
    data: DataTypes.JSONB,
    isRead: { type: DataTypes.BOOLEAN, defaultValue: false },
    isActioned: { type: DataTypes.BOOLEAN, defaultValue: false },
    actionUrl: DataTypes.STRING,
    expiresAt: DataTypes.DATE
  }, {
    timestamps: true
  });

  return Alert;
};