module.exports = (sequelize, DataTypes) => {
  const Department = sequelize.define('Department', {
    name: {
      type: DataTypes.STRING,
      allowNull: false
    },
    schoolId: {
      type: DataTypes.STRING,
      allowNull: false,
      references: { model: 'Schools', key: 'schoolId' }
    },
    headTeacherId: {
      type: DataTypes.INTEGER,
      references: { model: 'Teachers', key: 'id' }
    },
    dutyLoadTarget: {
      type: DataTypes.INTEGER,
      defaultValue: 5 // target duties per week
    },
    currentLoad: {
      type: DataTypes.FLOAT,
      defaultValue: 0
    },
    understaffedThreshold: {
      type: DataTypes.INTEGER,
      defaultValue: 3 // considered understaffed if load < threshold
    },
    settings: {
      type: DataTypes.JSONB,
      defaultValue: {
        autoAssignDuties: true,
        maxDutiesPerTeacher: 3,
        preferredSupervisionDays: []
      }
    }
  }, {
    timestamps: true
  });

  Department.associate = (models) => {
    Department.belongsTo(models.School, { foreignKey: 'schoolId', targetKey: 'schoolId' });
    Department.belongsTo(models.Teacher, { as: 'headTeacher', foreignKey: 'headTeacherId' });
    Department.hasMany(models.Teacher, { as: 'teachers', foreignKey: 'departmentId' });
  };

  return Department;
};
