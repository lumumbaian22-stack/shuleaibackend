module.exports = (sequelize, DataTypes) => {
  const Department = sequelize.define('Department', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    schoolCode: { type: DataTypes.STRING, allowNull: false },
    name: { type: DataTypes.STRING, allowNull: false },
    description: { type: DataTypes.TEXT, allowNull: true },
    headTeacherId: { type: DataTypes.INTEGER, allowNull: true },
    isActive: { type: DataTypes.BOOLEAN, defaultValue: true }
  }, { timestamps: true });
  return Department;
};
