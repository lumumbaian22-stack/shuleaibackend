module.exports = (sequelize, DataTypes) => {
  const Payment = sequelize.define('Payment', {
    studentId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: { model: 'Students', key: 'id' }
    },
    parentId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: { model: 'Parents', key: 'id' }
    },
    feeId: {
      type: DataTypes.INTEGER,
      references: { model: 'Fees', key: 'id' }
    },
    amount: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    method: {
      type: DataTypes.ENUM('mpesa', 'bank', 'cash', 'card'),
      allowNull: false
    },
    reference: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true
    },
    plan: {
      type: DataTypes.STRING,
      allowNull: true
    },
    status: {
      type: DataTypes.ENUM('pending', 'completed', 'failed', 'refunded'),
      defaultValue: 'pending'
    },
    transactionDate: { 
      type: DataTypes.DATE, 
      defaultValue: DataTypes.NOW 
    },
    verifiedBy: DataTypes.INTEGER,
    verifiedAt: DataTypes.DATE,
    notes: DataTypes.TEXT,
    
    // NEW FIELDS FOR SUBSCRIPTION & PAYMENT TRACKING
    transactionId: {
      type: DataTypes.STRING,
      unique: true,
      allowNull: true
    },
    completedAt: {
      type: DataTypes.DATE,
      allowNull: true
    },
    metadata: {
      type: DataTypes.JSONB,
      defaultValue: {}
    },
    schoolCode: {
      type: DataTypes.STRING,
      allowNull: false
    },
    paymentType: {
      type: DataTypes.ENUM('subscription', 'fee', 'upgrade', 'other'),
      defaultValue: 'subscription'
    },
    currency: {
      type: DataTypes.STRING,
      defaultValue: 'KES'
    },
    paymentGateway: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: 'daraja'
    },
    accountReference: { type: DataTypes.STRING, allowNull: true },
    checkoutRequestId: { type: DataTypes.STRING, allowNull: true },
    merchantRequestId: { type: DataTypes.STRING, allowNull: true },
    mpesaReceiptNumber: { type: DataTypes.STRING, allowNull: true },
    payerPhone: { type: DataTypes.STRING, allowNull: true },
    paidTo: { type: DataTypes.ENUM('school', 'platform'), allowNull: false, defaultValue: 'platform' },
    locked: { type: DataTypes.BOOLEAN, defaultValue: true },
    auditTrail: { type: DataTypes.JSONB, defaultValue: [] },
    gatewayResponse: {
      type: DataTypes.JSONB,
      defaultValue: {}
    },
    
    subscriptionPaymentId: { type: DataTypes.INTEGER, allowNull: true },
    subscriptionId: { type: DataTypes.INTEGER, allowNull: true },
    ownerType: { type: DataTypes.STRING, allowNull: true },
    billingCycle: { type: DataTypes.STRING, allowNull: true },
    planCode: { type: DataTypes.STRING, allowNull: true },
    planName: { type: DataTypes.STRING, allowNull: true },
    refundReason: DataTypes.TEXT,
    idempotencyKey: { type: DataTypes.STRING, allowNull: true },
    callbackAttempts: { type: DataTypes.INTEGER, defaultValue: 0 },
    lastCallbackAt: { type: DataTypes.DATE, allowNull: true },
    lastStatusQueryAt: { type: DataTypes.DATE, allowNull: true },
    refundedAt: DataTypes.DATE,
    refundedBy: DataTypes.INTEGER
  }, {
    timestamps: true,
    hooks: {
      beforeCreate: async (payment) => {
        // Generate unique reference if not provided
        if (!payment.reference) {
          const year = new Date().getFullYear();
          const random = Math.floor(Math.random() * 1000000).toString().padStart(6, '0');
          payment.reference = `PAY-${year}-${random}`;
        }
        
        // Generate transaction ID if not provided
        if (!payment.transactionId) {
          payment.transactionId = `TXN-${Date.now()}-${payment.studentId}`;
        }
      },
      afterUpdate: async (payment) => {
        // If payment is completed, update completedAt
        if (payment.status === 'completed' && !payment.completedAt) {
          payment.completedAt = new Date();
        }
      }
    }
  });

  // Instance methods
  Payment.prototype.markAsCompleted = async function(transactionId = null) {
    this.status = 'completed';
    this.completedAt = new Date();
    if (transactionId) this.transactionId = transactionId;
    await this.save();
    return this;
  };

  Payment.prototype.markAsFailed = async function(reason = null) {
    this.status = 'failed';
    if (reason) this.notes = reason;
    await this.save();
    return this;
  };

  Payment.prototype.refund = async function(reason, userId) {
    this.status = 'refunded';
    this.refundReason = reason;
    this.refundedAt = new Date();
    this.refundedBy = userId;
    await this.save();
    return this;
  };

  return Payment;
};
