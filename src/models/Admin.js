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
      unique: true,
      defaultValue: () => {
        const year = new Date().getFullYear();
        const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
        return `ADM-${year}-${random}`;
      }
    },
    position: {
      type: DataTypes.STRING,
      defaultValue: 'School Administrator'
    },
    permissions: {
      type: DataTypes.ARRAY(DataTypes.STRING),
      defaultValue: ['manage_teachers', 'manage_students', 'view_reports']
    },
    managedSchools: {
      type: DataTypes.ARRAY(DataTypes.INTEGER),
      defaultValue: []
    }
  }, {
    timestamps: true,
    hooks: {
      beforeCreate: async (admin) => {
        if (!admin.adminId || admin.adminId.startsWith('ADM-') === false) {
          const year = new Date().getFullYear();
          const count = await Admin.count();
          admin.adminId = `ADM-${year}-${(count + 1).toString().padStart(4, '0')}`;
          console.log('Generated adminId:', admin.adminId);
        }
      }
    }
  });

  return Admin;
};
