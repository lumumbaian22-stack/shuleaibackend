module.exports = (sequelize, DataTypes) => {
  const FeatureLock = sequelize.define('FeatureLock', {
    featureCode: { type: DataTypes.STRING, allowNull: false, unique: true },
    label: { type: DataTypes.STRING, allowNull: false },
    audience: { type: DataTypes.ENUM('school', 'child', 'both'), allowNull: false, defaultValue: 'both' },
    description: { type: DataTypes.TEXT, allowNull: true },
    isActive: { type: DataTypes.BOOLEAN, defaultValue: true },
    metadata: { type: DataTypes.JSONB, defaultValue: {} }
  }, { timestamps: true });

  return FeatureLock;
};
