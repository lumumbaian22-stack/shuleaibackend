module.exports = (sequelize, DataTypes) => {
  const Class = sequelize.define('Class', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    name: {
      type: DataTypes.STRING,
      allowNull: false
    },
    grade: {
      type: DataTypes.STRING,
      allowNull: false
    },
    stream: {
      type: DataTypes.STRING,
      allowNull: true
    },
    schoolCode: {
      type: DataTypes.STRING,
      allowNull: false,
      references: {
        model: 'Schools',
        key: 'schoolId'
      }
    },
    teacherId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: {
        model: 'Teachers',
        key: 'id'
      }
    },
    academicYear: {
      type: DataTypes.STRING,
      defaultValue: new Date().getFullYear().toString()
    },
    isActive: {
      type: DataTypes.BOOLEAN,
      defaultValue: true
    },
    settings: {
      type: DataTypes.JSONB,
      defaultValue: {}
    }
  }, {
    timestamps: true
  });

  return Class;
};
