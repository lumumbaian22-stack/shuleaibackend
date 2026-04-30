const QRCode = require('qrcode');

module.exports = (sequelize, DataTypes) => {
  const School = sequelize.define('School', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    schoolId: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true,
      defaultValue: () => {
        const year = new Date().getFullYear();
        const random = Math.floor(Math.random() * 10000).toString().padStart(5, '0');
        return `SCH-${year}-${random}`;
      }
    },
    shortCode: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true,
      defaultValue: () => {
        const prefix = 'SHL';
        const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
        let randomPart = '';
        for (let i = 0; i < 5; i++) {
          randomPart += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return `${prefix}-${randomPart}`;
      }
    },
    // Internal/original school name. Public UI should use displayName returned by API.
    name: {
      type: DataTypes.STRING,
      allowNull: false
    },
    platformDisplayName: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: 'ShuleAI School'
    },
    requestedName: {
      type: DataTypes.STRING,
      allowNull: true
    },
    approvedName: {
      type: DataTypes.STRING,
      allowNull: true
    },
    nameApprovalStatus: {
      type: DataTypes.ENUM('platform', 'pending', 'approved', 'rejected'),
      defaultValue: 'platform'
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
    status: {
      type: DataTypes.ENUM('pending', 'active', 'suspended', 'rejected'),
      defaultValue: 'pending'
    },
    approvedBy: DataTypes.INTEGER,
    approvedAt: DataTypes.DATE,
    rejectionReason: DataTypes.TEXT,
    
    // Suspension fields
    suspendedAt: {
      type: DataTypes.DATE,
      allowNull: true
    },
    suspendedBy: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: { model: 'Users', key: 'id' }
    },
    suspensionReason: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    reactivatedAt: {
      type: DataTypes.DATE,
      allowNull: true
    },
    reactivatedBy: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: { model: 'Users', key: 'id' }
    },
    reactivationReason: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    
    settings: {
      type: DataTypes.JSONB,
      defaultValue: {
        allowTeacherSignup: true,
        requireApproval: true,
        autoApproveDomains: [],
        schoolLevel: 'secondary',
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
    isActive: {
      type: DataTypes.BOOLEAN,
      defaultValue: false
    }
  }, {
    timestamps: true,
    hooks: {
      beforeCreate: async (school) => {
        try {
          // Generate QR code
          const qrData = {
            schoolId: school.schoolId,
            shortCode: school.shortCode,
            name: school.name,
            createdAt: new Date()
          };
          school.qrCode = await QRCode.toDataURL(JSON.stringify(qrData));
          school.qrCodeData = {
            generated: new Date(),
            expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
            active: true
          };
          console.log('QR code generated for school:', school.schoolId);
        } catch (error) {
          console.error('Error generating QR code:', error);
        }
      }
    }
  });

  return School;
};
