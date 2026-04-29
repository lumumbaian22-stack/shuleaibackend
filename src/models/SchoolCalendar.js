module.exports = (sequelize, DataTypes) => {
  const SchoolCalendar = sequelize.define('SchoolCalendar', {
    schoolId: { type: DataTypes.STRING, allowNull: false },
    eventType: { type: DataTypes.ENUM('term_start', 'term_end', 'holiday', 'exam', 'meeting', 'sports', 'activity', 'other'), allowNull: false },
    eventName: { type: DataTypes.STRING, allowNull: false },
    term: { type: DataTypes.STRING, allowNull: true },
    year: { type: DataTypes.INTEGER, allowNull: true },
    description: { type: DataTypes.TEXT, allowNull: true },
    startDate: { type: DataTypes.DATEONLY, allowNull: false },
    endDate: { type: DataTypes.DATEONLY, allowNull: true },
    isPublic: { type: DataTypes.BOOLEAN, defaultValue: true }
  }, { timestamps: true });
  return SchoolCalendar;
};
