module.exports = (sequelize, DataTypes) => {
  const LegalDocument = sequelize.define('LegalDocument', {
    type: { type: DataTypes.ENUM('terms', 'privacy', 'school_dpa', 'child_data_consent'), allowNull: false },
    version: { type: DataTypes.STRING, allowNull: false },
    title: { type: DataTypes.STRING, allowNull: false },
    content: { type: DataTypes.TEXT, allowNull: false },
    effectiveAt: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
    isActive: { type: DataTypes.BOOLEAN, defaultValue: true }
  }, { timestamps: true, indexes: [{ unique: true, fields: ['type', 'version'] }] });
  return LegalDocument;
};
