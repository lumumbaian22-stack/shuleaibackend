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
      allowNull: false
    },
    severity: {
      type: DataTypes.ENUM('critical', 'warning', 'info', 'success'),
      defaultValue: 'info'
    },
    title: {
      type: DataTypes.STRING,
      allowNull: true
    },
    message: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    data: {
      type: DataTypes.JSONB,
      defaultValue: {}
    },
    isRead: {
      type: DataTypes.BOOLEAN,
      defaultValue: false
    },
    isActioned: {
      type: DataTypes.BOOLEAN,
      defaultValue: false
    },
    actionUrl: {
      type: DataTypes.STRING,
      allowNull: true
    },
    expiresAt: {
      type: DataTypes.DATE,
      allowNull: true
    }
  }, {
    timestamps: true,
    hooks: {
      beforeCreate: (alert) => {
        if (!alert.role) {
          alert.role = 'admin';
        }
        if (!alert.type) {
          alert.type = 'system';
        }
      }
    }
  });

  return Alert;
};
