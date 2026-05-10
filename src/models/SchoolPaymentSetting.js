module.exports = (sequelize, DataTypes) => {
  const SchoolPaymentSetting = sequelize.define('SchoolPaymentSetting', {
    schoolId: { type: DataTypes.INTEGER, allowNull: false, unique: true },
    schoolCode: { type: DataTypes.STRING, allowNull: false, unique: true },
    paymentMode: { type: DataTypes.ENUM('manual', 'daraja', 'bank', 'mixed'), allowNull: false, defaultValue: 'manual' },
    mpesaType: { type: DataTypes.ENUM('till', 'paybill', 'none'), allowNull: false, defaultValue: 'none' },
    tillNumber: { type: DataTypes.STRING, allowNull: true },
    paybillNumber: { type: DataTypes.STRING, allowNull: true },
    businessShortCode: { type: DataTypes.STRING, allowNull: true },
    accountReferenceFormat: { type: DataTypes.ENUM('admissionNumber', 'studentId', 'nemisNumber', 'custom'), defaultValue: 'admissionNumber' },
    accountReferencePrefix: { type: DataTypes.STRING, allowNull: true },
    bankName: { type: DataTypes.STRING, allowNull: true },
    bankAccountName: { type: DataTypes.STRING, allowNull: true },
    bankAccountNumber: { type: DataTypes.STRING, allowNull: true },
    bankBranch: { type: DataTypes.STRING, allowNull: true },
    darajaEnabled: { type: DataTypes.BOOLEAN, defaultValue: false },
    darajaConsumerKey: { type: DataTypes.TEXT, allowNull: true },
    darajaConsumerSecret: { type: DataTypes.TEXT, allowNull: true },
    darajaPasskey: { type: DataTypes.TEXT, allowNull: true },
    darajaShortcode: { type: DataTypes.STRING, allowNull: true },
    darajaEnvironment: { type: DataTypes.ENUM('sandbox', 'production'), defaultValue: 'sandbox' },
    callbackUrl: { type: DataTypes.TEXT, allowNull: true },
    acceptedMethods: { type: DataTypes.JSONB, defaultValue: ['mpesa', 'bank'] },
    instructions: { type: DataTypes.TEXT, allowNull: true },
    isActive: { type: DataTypes.BOOLEAN, defaultValue: true },
    metadata: { type: DataTypes.JSONB, defaultValue: {} }
  }, { timestamps: true });

  return SchoolPaymentSetting;
};
