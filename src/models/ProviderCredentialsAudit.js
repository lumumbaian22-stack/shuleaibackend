module.exports = (sequelize, DataTypes) => {
  const ProviderCredentialsAudit = sequelize.define('ProviderCredentialsAudit', {
    schoolCode: { type: DataTypes.STRING, allowNull: true },
    scope: { type: DataTypes.STRING, allowNull: false, defaultValue: 'school' },
    provider: { type: DataTypes.STRING, allowNull: false },
    action: { type: DataTypes.STRING, allowNull: false },
    actorUserId: { type: DataTypes.INTEGER, allowNull: true },
    changedFields: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
    metadata: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} }
  }, { timestamps: true, indexes: [{ fields: ['schoolCode', 'provider'] }] });
  return ProviderCredentialsAudit;
};
