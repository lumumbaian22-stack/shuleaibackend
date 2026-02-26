module.exports = (sequelize, DataTypes) => {
  const Admin = sequelize.define('Admin', {
    userId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: { model: 'Users', key: 'id' }
    },
    adminId: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true
    },
    position: DataTypes.STRING,
    permissions: DataTypes.ARRAY(DataTypes.STRING),
    managedSchools: DataTypes.ARRAY(DataTypes.INTEGER)
  }, {
    timestamps: true,
    hooks: {
      beforeCreate: async (admin) => {
        if (!admin.adminId) {
          const year = new Date().getFullYear();
          const count = await Admin.count();
          admin.adminId = `ADM-${year}-${(count + 1).toString().padStart(4, '0')}`;
        }
      }
    }
  });

  return Admin;
};