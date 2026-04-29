module.exports = (sequelize, DataTypes) => {
  const Parent = sequelize.define('Parent', {
    userId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: { model: 'Users', key: 'id' }
    },
    parentId: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true,
      defaultValue: () => {
        const year = new Date().getFullYear();
        const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
        return `PAR-${year}-${random}`;
      }
    },
    occupation: DataTypes.STRING,
    relationship: {
      type: DataTypes.ENUM('father', 'mother', 'guardian', 'other'),
      defaultValue: 'guardian'
    },
    emergencyContact: DataTypes.STRING,
    preferences: {
      type: DataTypes.JSONB,
      defaultValue: {
        notifications: { email: true, sms: false, push: true },
        guidanceTips: true
      }
    }
  }, {
    timestamps: true,
    hooks: {
      beforeCreate: async (parent) => {
        if (!parent.parentId || parent.parentId.startsWith('PAR-') === false) {
          const year = new Date().getFullYear();
          const count = await Parent.count();
          parent.parentId = `PAR-${year}-${(count + 1).toString().padStart(4, '0')}`;
          console.log('Generated parentId:', parent.parentId);
        }
      }
    }
  });

  return Parent;
};
