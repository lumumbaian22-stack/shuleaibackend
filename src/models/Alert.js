// models/Alert.js
module.exports = (sequelize, DataTypes) => {
  const Alert = sequelize.define('Alert', {
    userId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 'Users',
        key: 'id'
      },
      onDelete: 'CASCADE',  // ADD THIS
      onUpdate: 'CASCADE'   // ADD THIS
    },
    // ... rest of your fields
  }, {
    timestamps: true
  });

  return Alert;
};
