module.exports = (sequelize, DataTypes) => {
  const Attendance = sequelize.define('Attendance', {
    studentId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: { model: 'Students', key: 'id' }
    },
    schoolCode: {
      type: DataTypes.STRING,
      allowNull: false
    },
    date: {
      type: DataTypes.DATEONLY,
      allowNull: false
    },
    status: {
      type: DataTypes.ENUM('present', 'absent', 'late', 'holiday', 'sick'),
      allowNull: false
    },
    reason: DataTypes.TEXT,
    reportedBy: DataTypes.INTEGER,
    reportedByParent: { type: DataTypes.BOOLEAN, defaultValue: false },
    timeIn: DataTypes.STRING,
    timeOut: DataTypes.STRING
  }, {
    timestamps: true,
    indexes: [
      { unique: true, fields: ['studentId', 'date'] }
    ]
  });

  return Attendance;
};