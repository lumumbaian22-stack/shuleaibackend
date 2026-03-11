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
      unique: true
    },
    // Short, easy-to-type code for teachers (e.g., SHL-A7K29)
    shortCode: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true
    },
    name: {
      type: DataTypes.STRING,
      allowNull: false
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
        // Generate schoolId (SCH-2024-00001 format)
        if (!school.schoolId) {
          const year = new Date().getFullYear();
          const count = await School.count();
          const sequential = (count + 1).toString().padStart(5, '0');
          school.schoolId = `SCH-${year}-${sequential}`;
        }
        
        // Generate short, easy-to-type code for teachers
        if (!school.shortCode) {
          school.shortCode = generateShortCode();
        }

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
      }
    }
  });

  // Generate short, memorable code (e.g., SHL-A7K29)
  function generateShortCode() {
    const prefix = 'SHL';
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Removed confusing chars (0,1,I,O)
    let randomPart = '';
    for (let i = 0; i < 5; i++) {
      randomPart += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return `${prefix}-${randomPart}`;
  }

  School.prototype.validateAccessCode = function(code) {
    return code === this.schoolId || 
           code === this.shortCode ||
           (this.lookupCodes && this.lookupCodes.includes(code)) ||
           code === this.qrCode;
  };

  return School;
};
