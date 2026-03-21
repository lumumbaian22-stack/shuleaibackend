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
      defaultValue: 'admin' // Add a default value to prevent null issues
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
    timestamps: true,
    hooks: {
      beforeCreate: (alert) => {
        // Ensure role is set if somehow missing
        if (!alert.role) {
          alert.role = 'admin';
        }
      }
    }
  });

  return Alert;
};
