module.exports = (sequelize, DataTypes) => {
  const Teacher = sequelize.define('Teacher', {
    userId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: { model: 'Users', key: 'id' }
    },
    employeeId: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true
    },
    subjects: DataTypes.ARRAY(DataTypes.STRING),
    classTeacher: DataTypes.STRING,
    qualification: DataTypes.STRING,
    specialization: DataTypes.STRING,
    dateJoined: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
    approvalStatus: {
      type: DataTypes.ENUM('pending', 'approved', 'rejected', 'suspended'),
      defaultValue: 'pending'
    },
    approvedBy: DataTypes.INTEGER,
    approvedAt: DataTypes.DATE,
    rejectionReason: DataTypes.STRING,
    duties: {
      type: DataTypes.JSONB,
      defaultValue: []
    },
    dutyPreferences: {
      type: DataTypes.JSONB,
      defaultValue: {
        preferredDays: [],
        blackoutDates: [],
        maxDutiesPerWeek: 3,
        preferredAreas: []
      }
    },
    timetable: { type: DataTypes.JSONB, defaultValue: [] },
    reminders: { type: DataTypes.JSONB, defaultValue: [] },
    statistics: {
      type: DataTypes.JSONB,
      defaultValue: { dutiesCompleted: 0, dutiesMissed: 0, reliabilityScore: 100 }
    }
  }, {
    timestamps: true,
    hooks: {
      beforeCreate: async (teacher) => {
        if (!teacher.employeeId) {
          const year = new Date().getFullYear();
          const count = await Teacher.count();
          teacher.employeeId = `TCH-${year}-${(count + 1).toString().padStart(4, '0')}`;
        }
      }
    }
  });

  Teacher.prototype.getTodayDuty = function() {
    const today = new Date().setHours(0,0,0,0);
    return (this.duties || []).find(d => {
      const dutyDate = new Date(d.date).setHours(0,0,0,0);
      return dutyDate === today;
    });
  };

  Teacher.prototype.updateReliabilityScore = function() {
    const total = (this.statistics.dutiesCompleted || 0) + (this.statistics.dutiesMissed || 0);
    if (total > 0) {
      this.statistics.reliabilityScore = Math.round((this.statistics.dutiesCompleted / total) * 100);
    }
  };

  return Teacher;
};