// models/Alert.js
module.exports = (sequelize, DataTypes) => {
  const Alert = sequelize.define('Alert', {
    userId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 'Users',
        key: 'id',
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE'
      }
    },
    role: {
      type: DataTypes.ENUM('student', 'parent', 'teacher', 'admin'),
      allowNull: false,
      defaultValue: 'admin'
    },
    type: {
      type: DataTypes.ENUM('academic', 'attendance', 'fee', 'system', 'improvement', 'duty', 'approval'),
      allowNull: false,
      defaultValue: 'system'
    },
    severity: {
      type: DataTypes.ENUM('critical', 'warning', 'info', 'success'),
      allowNull: false,
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
