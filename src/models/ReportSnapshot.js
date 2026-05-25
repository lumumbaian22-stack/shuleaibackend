module.exports = (sequelize, DataTypes) => {
  const ReportSnapshot = sequelize.define('ReportSnapshot', {
    schoolCode: { type: DataTypes.STRING, allowNull: false },
    studentId: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'Students', key: 'id' } },
    classId: { type: DataTypes.INTEGER, allowNull: true },
    term: { type: DataTypes.STRING, allowNull: false },
    year: { type: DataTypes.INTEGER, allowNull: false },
    curriculum: { type: DataTypes.STRING, allowNull: true },
    reportType: { type: DataTypes.STRING, allowNull: false, defaultValue: 'academic' },
    status: { type: DataTypes.ENUM('draft', 'published', 'archived'), defaultValue: 'draft' },
    generatedBy: { type: DataTypes.INTEGER, allowNull: true },
    publishedBy: { type: DataTypes.INTEGER, allowNull: true },
    publishedAt: { type: DataTypes.DATE, allowNull: true },
    snapshot: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
    sourceRecordIds: { type: DataTypes.ARRAY(DataTypes.INTEGER), defaultValue: [] },
    checksum: { type: DataTypes.STRING, allowNull: true },
    metadata: { type: DataTypes.JSONB, defaultValue: {} }
  }, {
    defaultScope: { attributes: { exclude: ['classId'] } },
    timestamps: true,
    indexes: [
      { unique: true, fields: ['schoolCode', 'studentId', 'term', 'year', 'reportType'] },
      { fields: ['schoolCode', 'term', 'year'] },
      { fields: ['studentId'] }
    ]
  });
  return ReportSnapshot;
};
