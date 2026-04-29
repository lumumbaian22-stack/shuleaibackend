module.exports = (sequelize, DataTypes) => {
  const MoodCheckin = sequelize.define('MoodCheckin', {
    userId: { type: DataTypes.INTEGER, allowNull: false },
    mood: { type: DataTypes.STRING(20), allowNull: false },
    note: DataTypes.TEXT
  }, { timestamps: true });
  return MoodCheckin;
};
