const QRCode = require('qrcode');

module.exports = (sequelize, DataTypes) => {
  const School = sequelize.define('School', {
    name: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true
    },
    schoolId: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true
    },
    lookupCodes: {
      type: DataTypes.ARRAY(DataTypes.STRING),
      defaultValue: []
    },
    qrCode: DataTypes.TEXT,
    qrCodeData: DataTypes.JSONB,
    system: {
      type: DataTypes.ENUM('844', 'cbc', 'british', 'american'),
      defaultValue: '844'
    },
    address: DataTypes.JSONB,
    contact: DataTypes.JSONB,
    settings: {
      type: DataTypes.JSONB,
      defaultValue: {
        allowTeacherSignup: true,
        requireApproval: true,
        autoApproveDomains: [],
        dutyManagement: {
          enabled: true,
          reminderHours: 24,
          maxTeachersPerDay: 3,
          checkInWindow: 15
        }
      }
    },
    feeStructure: {
      type: DataTypes.JSONB,
      defaultValue: { term1: 0, term2: 0, term3: 0, registration: 0 }
    },
    bankDetails: {
      type: DataTypes.JSONB,
      defaultValue: {
        bankName: 'Equity Bank',
        accountName: 'ShuleAI Schools',
        accountNumber: '1234567890',
        branch: 'Head Office'
      }
    },
    stats: {
      type: DataTypes.JSONB,
      defaultValue: { students: 0, teachers: 0, parents: 0, classes: 0, pendingApprovals: 0 }
    },
    createdBy: DataTypes.INTEGER,
    isActive: { type: DataTypes.BOOLEAN, defaultValue: true }
  }, {
    timestamps: true,
    hooks: {
      beforeCreate: async (school) => {
        if (!school.schoolId) {
          const year = new Date().getFullYear();
          const count = await School.count();
          const sequential = (count + 1).toString().padStart(5, '0');
          school.schoolId = `SCH-${year}-${sequential}`;

          // Generate QR code
          const qrData = {
            schoolId: school.schoolId,
            name: school.name,
            createdAt: new Date()
          };
          school.qrCode = await QRCode.toDataURL(JSON.stringify(qrData));
          school.qrCodeData = {
            generated: new Date(),
            expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
            active: true
          };
        }
      }
    }
  });

  School.prototype.validateAccessCode = function(code) {
    return code === this.schoolId || 
           (this.lookupCodes && this.lookupCodes.includes(code)) ||
           code === this.qrCode;
  };

  return School;
};