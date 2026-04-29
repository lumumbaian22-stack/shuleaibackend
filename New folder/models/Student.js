module.exports = (sequelize, DataTypes) => {
  const Student = sequelize.define('Student', {
    userId: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'Users', key: 'id' } },
    elimuid: { type: DataTypes.STRING, allowNull: false, unique: true, defaultValue: () => `ELI-${new Date().getFullYear()}-${Math.floor(Math.random()*10000).toString().padStart(4,'0')}` },
    grade: { type: DataTypes.STRING, allowNull: false, defaultValue: 'Not Assigned' },
    dateOfBirth: DataTypes.DATE,
    gender: DataTypes.ENUM('male', 'female', 'other'),
    enrollmentDate: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
    status: { type: DataTypes.ENUM('active', 'inactive', 'graduated', 'transferred'), defaultValue: 'active' },
    academicStatus: { type: DataTypes.ENUM('excelling', 'average', 'struggling', 'critical'), defaultValue: 'average' },
    points: { type: DataTypes.INTEGER, defaultValue: 0 },
    assessmentNumber: { type: DataTypes.STRING, allowNull: true },
    nemisNumber: { type: DataTypes.STRING, allowNull: true },
    location: { type: DataTypes.STRING, allowNull: true },
    parentName: { type: DataTypes.STRING, allowNull: true },
    parentEmail: { type: DataTypes.STRING, allowNull: true },
    parentPhone: { type: DataTypes.STRING, allowNull: true },
    parentRelationship: { type: DataTypes.STRING, allowNull: true, defaultValue: 'guardian' },
    isPrefect: { type: DataTypes.BOOLEAN, defaultValue: false },
    paymentStatus: { type: DataTypes.JSONB, defaultValue: { plan: 'basic', paid: 0, status: 'inactive' } },
    subscriptionPlan: { type: DataTypes.ENUM('basic', 'premium', 'ultimate'), defaultValue: 'basic' },
    subscriptionStatus: { type: DataTypes.ENUM('active', 'inactive', 'expired', 'pending'), defaultValue: 'inactive' },
    subscriptionStartDate: { type: DataTypes.DATE, allowNull: true },
    subscriptionExpiry: { type: DataTypes.DATE, allowNull: true },
    preferences: { type: DataTypes.JSONB, defaultValue: { theme: 'light', notifications: true } },
    approvalStatus: { type: DataTypes.ENUM('pending', 'approved', 'rejected'), defaultValue: 'approved' },
    approvedBy: DataTypes.INTEGER
  }, {
    timestamps: true,
    hooks: {
      beforeCreate: async (student) => {
        if (!student.elimuid || !student.elimuid.startsWith('ELI-')) {
          const count = await Student.count();
          student.elimuid = `ELI-${new Date().getFullYear()}-${(count + 1).toString().padStart(4, '0')}`;
        }
      },
      beforeSave: async (student) => {
        if (student.changed('subscriptionPlan') || student.changed('subscriptionStatus')) {
          student.paymentStatus = { ...student.paymentStatus, plan: student.subscriptionPlan, status: student.subscriptionStatus, startDate: student.subscriptionStartDate, expiryDate: student.subscriptionExpiry };
        }
      }
    }
  });
  Student.prototype.hasActiveSubscription = function() { return this.subscriptionStatus === 'active' && this.subscriptionExpiry && new Date(this.subscriptionExpiry) > new Date(); };
  Student.prototype.getRemainingSubscriptionDays = function() { if (!this.subscriptionExpiry || this.subscriptionStatus !== 'active') return 0; const diff = new Date(this.subscriptionExpiry) - new Date(); return Math.max(0, Math.ceil(diff / 86400000)); };
  Student.prototype.upgradeSubscription = async function(newPlan, paymentAmount) { this.subscriptionPlan = newPlan; this.subscriptionStatus = 'active'; this.subscriptionStartDate = new Date(); this.subscriptionExpiry = new Date(Date.now() + 30*86400000); this.paymentStatus = { ...this.paymentStatus, plan: newPlan, status: 'active', startDate: this.subscriptionStartDate, expiryDate: this.subscriptionExpiry, lastPayment: paymentAmount, lastPaymentDate: new Date() }; await this.save(); return this; };
  return Student;
};
