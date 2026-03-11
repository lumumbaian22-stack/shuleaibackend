module.exports = (sequelize, DataTypes) => {
  const ExamSupervision = sequelize.define('ExamSupervision', {
    schoolId: {
      type: DataTypes.STRING,
      allowNull: false
    },
    examName: {
      type: DataTypes.STRING,
      allowNull: false
    },
    date: {
      type: DataTypes.DATEONLY,
      allowNull: false
    },
    startTime: DataTypes.STRING,
    endTime: DataTypes.STRING,
    venue: DataTypes.STRING,
    studentCount: DataTypes.INTEGER,
    requiredSupervisors: {
      type: DataTypes.INTEGER,
      defaultValue: 2
    },
    assignedSupervisors: {
      type: DataTypes.ARRAY(DataTypes.INTEGER),
      defaultValue: []
    },
    status: {
      type: DataTypes.ENUM('scheduled', 'assigned', 'completed', 'conflict'),
      defaultValue: 'scheduled'
    },
    conflictNotes: DataTypes.TEXT,
    createdBy: DataTypes.INTEGER
  }, {
    timestamps: true
  });

  ExamSupervision.associate = (models) => {
    ExamSupervision.belongsTo(models.School, { foreignKey: 'schoolId', targetKey: 'schoolId' });
    ExamSupervision.belongsToMany(models.Teacher, { 
      through: 'ExamSupervisors',
      foreignKey: 'examId',
      otherKey: 'teacherId'
    });
  };

  return ExamSupervision;
};
