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
    date: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
    isPublished: { type: DataTypes.BOOLEAN, defaultValue: false }
  }, {
    timestamps: true,
    hooks: {
      beforeSave: (record) => {
        const score = record.score;
        if (score >= 80) record.grade = 'A';
        else if (score >= 75) record.grade = 'A-';
        else if (score >= 70) record.grade = 'B+';
        else if (score >= 65) record.grade = 'B';
        else if (score >= 60) record.grade = 'B-';
        else if (score >= 55) record.grade = 'C+';
        else if (score >= 50) record.grade = 'C';
        else if (score >= 45) record.grade = 'C-';
        else if (score >= 40) record.grade = 'D+';
        else record.grade = 'E';
      }
    }
  });

  return AcademicRecord;
};