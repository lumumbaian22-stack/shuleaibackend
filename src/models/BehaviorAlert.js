module.exports = (sequelize, DataTypes) => {
  const BehaviorAlert = sequelize.define('BehaviorAlert', {
    studentId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: { model: 'Students', key: 'id' }
    },
    schoolId: {
      type: DataTypes.STRING,
      allowNull: false
    },
    type: {
      type: DataTypes.ENUM(
        'attendance_pattern',
        'grade_drop',
        'late_submission',
        'classroom_behavior',
        'disciplinary',
        'wellness_concern'
      ),
      allowNull: false
    },
    severity: {
      type: DataTypes.ENUM('info', 'warning', 'critical'),
      defaultValue: 'info'
    },
    title: DataTypes.STRING,
    description: DataTypes.TEXT,
    data: DataTypes.JSONB, // stores metrics like attendance rate, grade changes etc.
    triggeredBy: DataTypes.STRING, // system or teacher ID
    acknowledgedBy: DataTypes.INTEGER,
    acknowledgedAt: DataTypes.DATE,
    resolvedAt: DataTypes.DATE,
    resolution: DataTypes.TEXT
  }, {
    timestamps: true
  });

  BehaviorAlert.associate = (models) => {
    BehaviorAlert.belongsTo(models.Student, { foreignKey: 'studentId' });
    BehaviorAlert.belongsTo(models.School, { foreignKey: 'schoolId', targetKey: 'schoolId' });
  };

  return BehaviorAlert;
};
