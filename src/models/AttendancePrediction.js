module.exports = (sequelize, DataTypes) => {
  const AttendancePrediction = sequelize.define('AttendancePrediction', {
    studentId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: { model: 'Students', key: 'id' }
    },
    schoolId: {
      type: DataTypes.STRING,
      allowNull: false
    },
    predictedDate: {
      type: DataTypes.DATEONLY,
      allowNull: false
    },
    probability: {
      type: DataTypes.FLOAT, // 0-1 probability of attendance
      allowNull: false
    },
    confidence: {
      type: DataTypes.FLOAT, // 0-1 confidence in prediction
      allowNull: false
    },
    factors: DataTypes.JSONB, // factors influencing the prediction
    actualAttendance: {
      type: DataTypes.ENUM('present', 'absent', 'late'),
      allowNull: true
    },
    modelVersion: DataTypes.STRING
  }, {
    timestamps: true,
    indexes: [
      { fields: ['studentId', 'predictedDate'], unique: true }
    ]
  });

  AttendancePrediction.associate = (models) => {
    AttendancePrediction.belongsTo(models.Student, { foreignKey: 'studentId' });
    AttendancePrediction.belongsTo(models.School, { foreignKey: 'schoolId', targetKey: 'schoolId' });
  };

  return AttendancePrediction;
};
