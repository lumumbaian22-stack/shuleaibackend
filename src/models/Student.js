module.exports = (sequelize, DataTypes) => {
  const Student = sequelize.define('Student', {
    userId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: { model: 'Users', key: 'id' }
    },
    elimuid: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true,
      defaultValue: () => {
        const year = new Date().getFullYear();
        const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
        return `ELI-${year}-${random}`;
      }
    },
    grade: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: 'Not Assigned'
    },
    dateOfBirth: DataTypes.DATE,
    gender: DataTypes.ENUM('male', 'female', 'other'),
    enrollmentDate: { 
      type: DataTypes.DATE, 
      defaultValue: DataTypes.NOW 
    },
    status: {
      type: DataTypes.ENUM('active', 'inactive', 'graduated', 'transferred'),
      defaultValue: 'active'
    },
    academicStatus: {
      type: DataTypes.ENUM('excelling', 'average', 'struggling', 'critical'),
      defaultValue: 'average'
    },
     points: {
      type: DataTypes.INTEGER,
      defaultValue: 0
    },
    // Updated payment/subscription fields
    paymentStatus: {
      type: DataTypes.JSONB,
      defaultValue: { 
        plan: 'basic', 
        paid: 0, 
        status: 'inactive' 
      }
    },
    // New subscription fields
    subscriptionPlan: {
      type: DataTypes.ENUM('basic', 'premium', 'ultimate'),
      defaultValue: 'basic'
    },
    subscriptionStatus: {
      type: DataTypes.ENUM('active', 'inactive', 'expired', 'pending'),
      defaultValue: 'inactive'
    },
    subscriptionStartDate: {
      type: DataTypes.DATE,
      allowNull: true
    },
    subscriptionExpiry: {
      type: DataTypes.DATE,
      allowNull: true
    },
    // Keep existing fields
    preferences: {
      type: DataTypes.JSONB,
      defaultValue: { theme: 'light', notifications: true }
    },
    approvalStatus: {
      type: DataTypes.ENUM('pending', 'approved', 'rejected'),
      defaultValue: 'approved'
    },
    approvedBy: DataTypes.INTEGER
  }, {
    timestamps: true,
    hooks: {
      beforeCreate: async (student) => {
        if (!student.elimuid || student.elimuid.startsWith('ELI-') === false) {
          const year = new Date().getFullYear();
          const count = await Student.count();
          student.elimuid = `ELI-${year}-${(count + 1).toString().padStart(4, '0')}`;
          console.log('Generated elimuid:', student.elimuid);
        }
      },
      // Add hook to keep paymentStatus in sync with subscription fields
      beforeSave: async (student) => {
        if (student.changed('subscriptionPlan') || student.changed('subscriptionStatus')) {
          student.paymentStatus = {
            ...student.paymentStatus,
            plan: student.subscriptionPlan,
            status: student.subscriptionStatus,
            startDate: student.subscriptionStartDate,
            expiryDate: student.subscriptionExpiry
          };
        }
      }
    }
  });

  // Instance method to check if student has active subscription
  Student.prototype.hasActiveSubscription = function() {
    return this.subscriptionStatus === 'active' && 
           this.subscriptionExpiry && 
           new Date(this.subscriptionExpiry) > new Date();
  };

  // Instance method to get remaining days in subscription
  Student.prototype.getRemainingSubscriptionDays = function() {
    if (!this.subscriptionExpiry || this.subscriptionStatus !== 'active') return 0;
    const now = new Date();
    const expiry = new Date(this.subscriptionExpiry);
    const diffTime = expiry - now;
    return Math.max(0, Math.ceil(diffTime / (1000 * 60 * 60 * 24)));
  };

  // Instance method to upgrade subscription
  Student.prototype.upgradeSubscription = async function(newPlan, paymentAmount) {
    const plans = { basic: 3, premium: 10, ultimate: 20 };
    
    this.subscriptionPlan = newPlan;
    this.subscriptionStatus = 'active';
    this.subscriptionStartDate = new Date();
    this.subscriptionExpiry = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days
    
    // Update paymentStatus
    this.paymentStatus = {
      ...this.paymentStatus,
      plan: newPlan,
      status: 'active',
      startDate: this.subscriptionStartDate,
      expiryDate: this.subscriptionExpiry,
      lastPayment: paymentAmount,
      lastPaymentDate: new Date()
    };
    
    await this.save();
    return this;
  };

  return Student;
};
