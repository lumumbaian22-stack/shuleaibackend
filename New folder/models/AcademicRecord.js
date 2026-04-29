module.exports = (sequelize, DataTypes) => {
  const AcademicRecord = sequelize.define('AcademicRecord', {
    studentId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: { model: 'Students', key: 'id' }
    },
    schoolCode: {
      type: DataTypes.STRING,
      allowNull: false
    },
    term: {
      type: DataTypes.ENUM('Term 1', 'Term 2', 'Term 3'),
      allowNull: false
    },
    year: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    subject: {
      type: DataTypes.STRING,
      allowNull: false
    },
    assessmentType: {
      type: DataTypes.ENUM('test', 'exam', 'assignment', 'project', 'quiz'),
      allowNull: false
    },
    assessmentName: DataTypes.STRING,
    score: {
      type: DataTypes.INTEGER,
      validate: { min: 0, max: 100 }
    },
    grade: DataTypes.STRING,
    remarks: DataTypes.TEXT,
    teacherId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: { model: 'Teachers', key: 'id' }
    },
    gradingScale: {
      type: DataTypes.JSONB,
      defaultValue: null
    },
    date: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
    isPublished: { type: DataTypes.BOOLEAN, defaultValue: false }
  }, {
    timestamps: true
    // The beforeSave hook has been removed – grading is now handled in the controller
  });

  return AcademicRecord;
};
