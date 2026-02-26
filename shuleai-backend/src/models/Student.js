module.exports = (sequelize, DataTypes) => {
  const Student = sequelize.define('Student', {
    userId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: { model: 'Users', key: 'id' }
    },
    elimuid: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true
    },
    grade: {
      type: DataTypes.STRING,
      allowNull: false
    },
    dateOfBirth: DataTypes.DATE,
    gender: DataTypes.ENUM('male', 'female', 'other'),
    enrollmentDate: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
    status: {
      type: DataTypes.ENUM('active', 'inactive', 'graduated', 'transferred'),
      defaultValue: 'active'
    },
    academicStatus: {
      type: DataTypes.ENUM('excelling', 'average', 'struggling', 'critical'),
      defaultValue: 'average'
    },
    paymentStatus: {
      type: DataTypes.JSONB,
      defaultValue: { plan: 'basic', paid: 0, status: 'locked' }
    },
    preferences: {
      type: DataTypes.JSONB,
      defaultValue: { theme: 'light', notifications: true }
    },
    approvalStatus: {
      type: DataTypes.ENUM('pending', 'approved', 'rejected'),
      defaultValue: 'approved'
    },
    approvedBy: DataTypes.INTEGER
  }, {
    timestamps: true,
    hooks: {
      beforeCreate: async (student) => {
        if (!student.elimuid) {
          const year = new Date().getFullYear();
          const count = await Student.count();
          student.elimuid = `ELIMU-${year}-${(count + 1).toString().padStart(4, '0')}`;
        }
      }
    }
  });

  return Student;
};