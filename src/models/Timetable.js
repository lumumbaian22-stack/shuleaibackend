module.exports = (sequelize, DataTypes) => {
  const Timetable = sequelize.define('Timetable', {
    schoolId: { type: DataTypes.STRING, allowNull: false },
    weekStartDate: { type: DataTypes.DATEONLY, allowNull: false },
    slots: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
    isPublished: { type: DataTypes.BOOLEAN, defaultValue: false }
  }, { timestamps: true });
  return Timetable;
};
