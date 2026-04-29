module.exports = (sequelize, DataTypes) => {
  const ConductLog = sequelize.define('ConductLog', {
    studentId: { type: DataTypes.INTEGER, allowNull: false },
    teacherId: { type: DataTypes.INTEGER, allowNull: false },
    type: { type: DataTypes.STRING(50), allowNull: false },
    description: DataTypes.TEXT,
    date: { type: DataTypes.DATEONLY, allowNull: false, defaultValue: DataTypes.NOW }
  }, { timestamps: true });
  return ConductLog;
};
