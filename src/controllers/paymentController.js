const { Op } = require('sequelize');
const {
  Payment,
  Fee,
  Parent,
  Student,
  User,
  School,
  AuditLog,
  SubscriptionPlan,
  SubscriptionPayment,
  Subscription,
  Class
} = require('../models');
const subscriptionController = require('./subscriptionController');
const financeLedger = require('../services/financeLedgerService');
const paymentEngine = require('../services/paymentProviderEngine');

function getSchoolCode(req) {
  if (req.user?.role === 'super_admin') return req.body?.schoolCode || req.query?.schoolCode || req.user?.schoolCode || null;
  return req.user?.schoolCode || null;
}

function auditEntry(action, actor, extra = {}) {
  return { action, actorUserId: actor?.id || null, actorRole: actor?.role || null, at: new Date().toISOString(), ...extra };
}

async function writeAudit(req, data) {
  try {
    await AuditLog?.create({
      schoolCode: getSchoolCode(req) || data.schoolCode || 'platform',
      actorUserId: req.user?.id,
      actorRole: req.user?.role,
      ipAddress: req.ip,
      userAgent: req.get?.('user-agent'),
      ...data
    });
  } catch (error) {
    console.error('Payment audit failed:', error.message);
  }
}

function errorJson(res, error, fallback = 400) {
  return res.status(error.statusCode || fallback).json({ success: false, message: error.message, data: error.data || undefined });
}

function providerBodyFromLegacyRequest(req, fallbackProvider = 'manual') {
  const body = req.body || {};
  const config = { ...(body.config || {}) };
  for (const key of ['publicKey','secretKey','consumerKey','consumerSecret','passkey','shortcode','businessShortcode','webhookSecret','callbackUrl','returnUrl','successUrl','cancelUrl','environment','ipnId','notificationId','bankName','accountName','accountNumber','branch','manualInstructions']) {
    if (body[key] !== undefined && config[key] === undefined) config[key] = body[key];
  }
  let provider = body.provider || body.activeProvider || body.defaultProvider;
  if (!provider) {
    const mode = String(body.paymentMode || body.mode || '').toLowerCase();
    if (['daraja','mpesa','stk','m-pesa'].includes(mode) || body.darajaEnabled === true) provider = 'mpesa';
    else if (['paystack','flutterwave','pesapal','stripe','bank','cash','card','manual'].includes(mode)) provider = mode;
    else provider = fallbackProvider;
  }
  return {
    ...body,
    provider,
    enabled: body.enabled !== undefined ? body.enabled === true : body.active !== false,
    isDefault: true,
    active: body.active !== false,
    methods: body.methods || body.enabledMethods || body.paymentMethods || body.config?.methods,
    linkingRule: body.linkingRule || body.studentLinkRule || body.accountReferenceFormat || body.referenceFormat,
    config
  };
}

function legacySchoolSettingsPayload(data, school = null) {
  return {
    ...data,
    schoolName: school?.name || data.schoolName || null,
    schoolCode: data.schoolCode || school?.schoolId || null,
    paymentSettings: {
      activeProvider: data.activeProvider,
      defaultProvider: data.defaultProvider,
      enabledProviders: data.enabledProviders,
      disabledProviders: data.disabledProviders,
      providerSelectionRule: data.providerSelectionRule,
      providers: data.providers,
      methods: data.publicMethods || data.methods || [],
      publicMethods: data.publicMethods || data.methods || [],
      linkingRule: data.linkingRule,
      matchingRules: data.matchingRules,
      notifications: data.notifications,
      paymentMode: data.paymentMode,
      accountReferenceFormat: data.linkingRule,
      active: !!data.activeProvider,
      currency: 'KES'
    }
  };
}

exports.getAdminPaymentSettings = async (req, res) => {
  try {
    const code = getSchoolCode(req);
    const [data, school] = await Promise.all([
      paymentEngine.getSettings({ scope: 'school', schoolCode: code }),
      School.findOne({ where: { schoolId: code } }).catch(() => null)
    ]);
    res.json({ success: true, data: legacySchoolSettingsPayload(data, school) });
  } catch (error) { errorJson(res, error); }
};

exports.updateAdminPaymentSettings = async (req, res) => {
  try {
    const data = await paymentEngine.saveSchoolProviderSettings({ user: req.user, schoolCode: getSchoolCode(req), body: providerBodyFromLegacyRequest(req, 'manual') });
    await writeAudit(req, { module: 'payments', action: 'school_payment_provider_saved_exclusive', entityType: 'SchoolPaymentSetting', entityId: String(data.id || 'school-provider'), after: data });
    res.json({ success: true, message: 'School payment provider saved. Only the selected active provider can receive school fees.', data: legacySchoolSettingsPayload(data) });
  } catch (error) { errorJson(res, error); }
};

exports.testAdminPaymentConnection = async (req, res) => {
  try {
    const data = await paymentEngine.getSettings({ scope: 'school', schoolCode: getSchoolCode(req) });
    if (!data.activeProvider) return res.status(400).json({ success: false, message: 'No active school payment provider is configured.' });
    res.json({ success: true, message: `School payment provider lock is active: ${data.activeProvider}. Disabled providers cannot receive school fees.`, data: { activeProvider: data.activeProvider, enabledProviders: data.enabledProviders, methods: data.publicMethods || data.methods || [] } });
  } catch (error) { errorJson(res, error); }
};

exports.getPlatformPaymentSettings = async (req, res) => {
  try {
    const data = await paymentEngine.getSettings({ scope: 'platform' });
    res.json({ success: true, data });
  } catch (error) { errorJson(res, error); }
};

exports.updatePlatformPaymentSettings = async (req, res) => {
  try {
    const data = await paymentEngine.savePlatformProviderSettings({ user: req.user, body: providerBodyFromLegacyRequest(req, 'manual') });
    await writeAudit(req, { schoolCode: 'platform', module: 'payments', action: 'platform_payment_provider_saved_exclusive', entityType: 'PlatformPaymentSetting', entityId: String(data.id || 'platform-provider'), after: data });
    res.json({ success: true, message: 'Platform payment provider saved. Only the selected active provider can receive platform payments.', data });
  } catch (error) { errorJson(res, error); }
};

exports.getParentSchoolPaymentSettings = async (req, res) => {
  try {
    const data = await paymentEngine.getSettings({ scope: 'school', schoolCode: getSchoolCode(req) });
    res.json({ success: true, data: {
      activeProvider: data.activeProvider,
      defaultProvider: data.defaultProvider,
      enabledProviders: data.enabledProviders,
      paymentMode: data.paymentMode,
      referenceFormat: data.linkingRule,
      linkingRule: data.linkingRule,
      matchingRules: data.matchingRules,
      methods: data.publicMethods || data.methods || [],
      publicMethods: data.publicMethods || data.methods || [],
      supports: {
        stk: (data.publicMethods || data.methods || []).some(m => m.prompt === 'phone_prompt'),
        checkout: (data.publicMethods || data.methods || []).some(m => m.prompt === 'checkout_url'),
        manual: (data.publicMethods || data.methods || []).some(m => m.prompt === 'manual_instructions'),
        bank: (data.publicMethods || data.methods || []).some(m => m.method === 'bank'),
        cash: (data.publicMethods || data.methods || []).some(m => m.method === 'cash'),
        card: (data.publicMethods || data.methods || []).some(m => m.method === 'card'),
        mobileMoney: (data.publicMethods || data.methods || []).some(m => m.method === 'mobile_money')
      }
    }});
  } catch (error) { errorJson(res, error); }
};

exports.queryStatus = async (req, res) => {
  try {
    const key = String(req.params.checkoutRequestId || req.query.reference || '').trim();
    if (!key) return res.status(400).json({ success: false, message: 'Payment reference is required' });
    const payment = await Payment.findOne({ where: { [Op.or]: [{ reference: key }, { checkoutRequestId: key }, { transactionId: key }, { providerReference: key }] } });
    if (!payment) return res.status(404).json({ success: false, message: 'Payment not found' });
    res.json({ success: true, data: lockedPaymentPayload(payment) });
  } catch (error) { errorJson(res, error, 500); }
};


// ============================================================================
// V75 FINAL FINANCE LEDGER OVERRIDES
// Student-specific payment history, all payment methods, bursaries/credits,
// admin manual recording, and no mixed sibling/classmate finance records.
// ============================================================================

exports.getParentStudentFeeAccounts = async (req, res) => {
  try {
    const data = await financeLedger.getStudentFinance({
      schoolCode: req.user.schoolCode,
      studentId: req.params.studentId,
      parentUserId: req.user.id
    });
    res.json({ success: true, data });
  } catch (error) {
    res.status(403).json({ success: false, message: error.message });
  }
};

exports.getParentStudentPaymentHistory = async (req, res) => {
  try {
    const data = await financeLedger.getStudentHistory({
      schoolCode: req.user.schoolCode,
      studentId: req.params.studentId,
      parentUserId: req.user.id,
      status: req.query.status || 'all',
      transactionType: req.query.transactionType || req.query.type || 'all',
      method: req.query.method || 'all',
      feeId: req.query.feeId || null
    });
    res.json({ success: true, data });
  } catch (error) {
    res.status(403).json({ success: false, message: error.message });
  }
};

exports.getAdminFinanceSummary = async (req, res) => {
  try {
    const data = await financeLedger.getAdminSummary({ schoolCode: req.user.schoolCode });
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.getAdminStudentFinance = async (req, res) => {
  try {
    const data = await financeLedger.getStudentFinance({ schoolCode: req.user.schoolCode, studentId: req.params.studentId });
    res.json({ success: true, data });
  } catch (error) {
    res.status(404).json({ success: false, message: error.message });
  }
};

exports.getAdminStudentHistory = async (req, res) => {
  try {
    const data = await financeLedger.getStudentHistory({
      schoolCode: req.user.schoolCode,
      studentId: req.params.studentId,
      status: req.query.status || 'all',
      transactionType: req.query.transactionType || req.query.type || 'all',
      method: req.query.method || 'all',
      feeId: req.query.feeId || null
    });
    res.json({ success: true, data });
  } catch (error) {
    res.status(404).json({ success: false, message: error.message });
  }
};

exports.recordAdminManualPayment = async (req, res) => {
  try {
    const studentId = Number(req.params.studentId || req.body.studentId);
    const status = req.body.status || 'completed';
    const payment = await financeLedger.recordTransaction({
      user: req.user,
      schoolCode: req.user.schoolCode,
      studentId,
      feeId: Number(req.body.feeId || req.body.feeAccountId),
      amount: req.body.amount,
      method: req.body.method || 'cash',
      transactionType: req.body.transactionType || 'payment',
      status,
      reference: req.body.reference || req.body.referenceNumber || req.body.receiptNumber,
      source: 'admin',
      parentId: req.body.parentId || null,
      notes: req.body.notes || null,
      processedBy: req.user.id,
      approvedBy: ['completed','approved','successful','success'].includes(String(status).toLowerCase()) ? req.user.id : null,
      paymentDate: req.body.paymentDate || null,
      receiptUrl: req.body.receiptUrl || null,
      metadata: { recordedBy: req.user.id }
    });
    const finance = await financeLedger.getStudentFinance({ schoolCode: req.user.schoolCode, studentId });
    res.json({ success: true, message: 'Payment recorded and student balance updated.', data: { payment, finance } });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

exports.recordAdminBursary = async (req, res) => {
  try {
    const studentId = Number(req.params.studentId || req.body.studentId);
    const status = req.body.status || 'completed';
    const payment = await financeLedger.recordTransaction({
      user: req.user,
      schoolCode: req.user.schoolCode,
      studentId,
      feeId: Number(req.body.feeId || req.body.feeAccountId),
      amount: req.body.amount,
      method: req.body.method || req.body.bursaryType || 'bursary',
      transactionType: req.body.transactionType || 'bursary',
      status,
      reference: req.body.reference || req.body.referenceNumber || `BURSARY-${Date.now()}-${studentId}`,
      source: req.body.source || req.body.sponsor || 'admin',
      parentId: req.body.parentId || null,
      notes: req.body.notes || null,
      processedBy: req.user.id,
      approvedBy: ['completed','approved','successful','success'].includes(String(status).toLowerCase()) ? req.user.id : null,
      paymentDate: req.body.paymentDate || null,
      receiptUrl: req.body.receiptUrl || null,
      metadata: { bursaryType: req.body.bursaryType, sponsor: req.body.sponsor, recordedBy: req.user.id }
    });
    const finance = await financeLedger.getStudentFinance({ schoolCode: req.user.schoolCode, studentId });
    res.json({ success: true, message: 'Bursary/credit recorded and student balance updated after approval.', data: { payment, finance } });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

exports.getAdminPaymentRecords = async (req, res) => {
  try {
    const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
    const limit = Math.min(200, Math.max(20, Number.parseInt(req.query.limit, 10) || 100));
    const offset = (page - 1) * limit;
    const where = { schoolCode: req.user.schoolCode, paymentType: 'fee', paidTo: 'school' };
    const { count, rows } = await Payment.findAndCountAll({
      where,
      attributes: ['id','studentId','parentId','feeId','amount','status','method','paymentGateway','reference','mpesaReceiptNumber','payerPhone','paymentDate','transactionDate','createdAt','notes','metadata'],
      include: [
        { model: Student, required: false, attributes: ['id','grade','classId','elimuid','admissionNumber'], include: [{ model: User, required: false, attributes: ['id','name'] }, { model: Class, required: false, attributes: ['id','name','grade','stream'] }] },
        { model: Parent, required: false, attributes: ['id'], include: [{ model: User, required: false, attributes: ['id','name','phone','email'] }] },
        { model: Fee, required: false, attributes: ['id','term','year','totalAmount','paidAmount','parentPaidAmount','creditAmount'] }
      ],
      order: [['createdAt','DESC']], limit, offset, distinct: true
    });
    const records = rows.map(payment => {
      const row = payment.toJSON ? payment.toJSON() : payment;
      const fee = row.Fee || {};
      const total = Number(fee.totalAmount || 0), parentPaid = Number(fee.parentPaidAmount ?? fee.paidAmount ?? 0), credit = Number(fee.creditAmount || 0);
      return { ...row, studentName: row.Student?.User?.name || row.metadata?.studentName || null, parentName: row.Parent?.User?.name || row.metadata?.parentName || null, className: row.Student?.Class?.name || row.Student?.grade || row.metadata?.className || null, feeTerm: fee.term || row.metadata?.term || null, feeYear: fee.year || row.metadata?.year || null, feeTotalAmount: total, feeParentPaidAmount: parentPaid, feeCreditAmount: credit, feePaidAmount: parentPaid + credit, feeBalance: Math.max(0, total - parentPaid - credit), recordType: 'payment' };
    });
    res.json({ success: true, data: records, records, pagination: { page, limit, total: count, pages: Math.max(1, Math.ceil(count / limit)) } });
  } catch (error) {
    console.error('Admin payment records error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.getManualVerificationQueue = async (req, res) => {
  try {
    const rows = await Payment.findAll({
      where: { schoolCode: req.user.schoolCode, paymentType: 'fee', paidTo: 'school', status: 'pending' },
      include: [
        { model: Student, include: [{ model: User, attributes: ['id','name','schoolCode'] }, { model: Class, required:false }] },
        { model: Parent, include: [{model:User, attributes:['id','name','phone','email']}], required:false },
        { model: Fee, required:false }
      ],
      order: [['createdAt','DESC']],
      limit: 200
    });
    res.json({ success:true, data: rows.map(financeLedger.decoratePayment) });
  } catch(error){ res.status(500).json({ success:false, message:error.message }); }
};

exports.approveManualPayment = async (req, res) => {
  try {
    const data = await financeLedger.updateTransactionStatus({ user: req.user, schoolCode: req.user.schoolCode, paymentId: req.params.paymentId, status: 'completed', notes: req.body?.notes || null });
    res.json({ success:true, message:'Payment approved. Student fee balance updated.', data });
  } catch(error){ res.status(400).json({ success:false, message:error.message }); }
};

exports.rejectManualPayment = async (req, res) => {
  try {
    const data = await financeLedger.updateTransactionStatus({ user: req.user, schoolCode: req.user.schoolCode, paymentId: req.params.paymentId, status: 'rejected', notes: req.body?.reason || req.body?.notes || 'Rejected by finance/admin' });
    res.json({ success:true, message:'Payment rejected. No balance was updated.', data });
  } catch(error){ res.status(400).json({ success:false, message:error.message }); }
};


// Finance Officer/Admin read context used by the dedicated Finance Workspace.
exports.getFinanceContext = async (req, res) => {
  try {
    const code = req.user.schoolCode;
    const [classes, students] = await Promise.all([
      Class.findAll({ where:{ schoolCode:code }, attributes:['id','name','grade','stream'], order:[['name','ASC']] }),
      Student.findAll({ include:[{ model:User, required:true, where:{ schoolCode:code }, attributes:['id','name','profileImage','profilePicture'] }], attributes:['id','userId','classId','grade','elimuid','admissionNumber'], order:[['id','ASC']] })
    ]);
    res.json({ success:true, data:{ classes, students } });
  } catch (error) { res.status(500).json({ success:false, message:error.message }); }
};

// Locked provider payment initiation, callback, and platform manual review.
function lockedPaymentPayload(payment) {
  return {
    paymentId: payment.id,
    subscriptionPaymentId: payment.subscriptionPaymentId || null,
    subscriptionId: payment.subscriptionId || null,
    reference: payment.reference,
    accountReference: payment.accountReference,
    checkoutRequestId: payment.checkoutRequestId,
    merchantRequestId: payment.merchantRequestId,
    providerReference: payment.providerReference,
    provider: payment.paymentGateway,
    paymentMethod: payment.method,
    promptType: payment.promptType,
    promptStatus: payment.promptStatus,
    checkoutUrl: payment.checkoutUrl,
    status: payment.status,
    amount: payment.amount,
    currency: payment.currency,
    environment: payment.gatewayResponse?.environment || null,
    customerMessage: payment.metadata?.promptMessage || null,
    responseDescription: payment.gatewayResponse?.ResponseDescription || payment.metadata?.promptMessage || null
  };
}

async function startLockedPayment(req, res, payload, successMessage) {
  try {
    const payment = await paymentEngine.initiatePayment({ user: req.user, body: payload });
    const data = lockedPaymentPayload(payment);
    res.status(payment.status === 'pending_provider_error' ? 202 : 200).json({
      success: true,
      message: payment.metadata?.promptMessage || successMessage || 'Payment started using the active configured provider.',
      data
    });
  } catch (error) {
    res.status(error.statusCode || 400).json({ success: false, message: error.message, data: error.data || undefined });
  }
}

exports.parentFeeSTK = async (req, res) => startLockedPayment(req, res, {
  ...req.body,
  paymentType: 'school_fee',
  paymentMethod: req.body?.paymentMethod || 'mobile_money',
  purpose: 'school_fee'
}, 'School fee payment started using the active school provider.');

exports.parentSubscriptionSTK = async (req, res) => startLockedPayment(req, res, {
  ...req.body,
  paymentType: 'platform',
  platformPurpose: 'child_subscription',
  purpose: 'child_subscription',
  ownerType: 'child',
  paymentMethod: req.body?.paymentMethod || 'mobile_money',
  billingCycle: req.body?.billingCycle || req.body?.billingPeriod || 'monthly'
}, 'Child subscription payment started using the active platform provider.');

exports.schoolSubscriptionSTK = async (req, res) => startLockedPayment(req, res, {
  ...req.body,
  paymentType: 'platform',
  platformPurpose: 'school_subscription',
  purpose: 'school_subscription',
  ownerType: 'school',
  paymentMethod: req.body?.paymentMethod || 'mobile_money',
  billingCycle: req.body?.billingCycle || req.body?.billingPeriod || 'monthly'
}, 'School subscription payment started using the active platform provider.');

exports.genericPlatformSTK = async (req, res) => startLockedPayment(req, res, {
  ...req.body,
  paymentType: 'platform',
  platformPurpose: req.body?.platformPurpose || req.body?.purpose || req.body?.metadata?.type || 'platform_payment',
  purpose: req.body?.purpose || req.body?.metadata?.type || 'platform_payment',
  ownerType: req.body?.ownerType || req.body?.metadata?.ownerType || (req.user?.role === 'parent' ? 'child' : 'school'),
  paymentMethod: req.body?.paymentMethod || 'mobile_money',
  billingCycle: req.body?.billingCycle || req.body?.billingPeriod || 'monthly'
}, 'Platform payment started using the active platform provider.');

// ============================================================================
// V200.3 FINAL BYPASS SEAL
// These overrides close the remaining legacy manual/M-Pesa alias routes so every
// payment path obeys the same active-provider rule:
// - school fees -> Finance Officer school provider
// - child/school subscriptions, add-ons, name change -> Super Admin platform provider
// - disabled providers cannot initiate or finalize payments
// ============================================================================

function v2003ManualProviderQueueWhere(extra = {}) {
  return {
    ...extra,
    paidTo: 'platform',
    status: 'pending',
    [Op.or]: [
      { promptType: 'manual_instructions' },
      { paymentGateway: { [Op.in]: ['manual', 'bank', 'cash', 'card', 'manual_mpesa'] } }
    ]
  };
}

exports.darajaCallback = async (req, res) => {
  try {
    await paymentEngine.handleWebhook({ provider: 'mpesa', payload: req.body || {}, headers: req.headers || {} });
    res.json({ ResultCode: 0, ResultDesc: 'Accepted' });
  } catch (error) {
    console.error('Locked M-Pesa callback error:', error.message);
    res.json({ ResultCode: 0, ResultDesc: 'Accepted with internal reconciliation logging' });
  }
};

exports.parentFeeManual = async (req, res) => startLockedPayment(req, res, {
  ...req.body,
  paymentType: 'school_fee',
  paymentMethod: req.body?.paymentMethod || req.body?.method || 'manual',
  reference: req.body?.reference || req.body?.mpesaCode || req.body?.transactionCode || undefined,
  purpose: 'school_fee_manual_reference'
}, 'School fee reference submitted using the active school provider rule.');

exports.parentSubscriptionManual = async (req, res) => startLockedPayment(req, res, {
  ...req.body,
  paymentType: 'platform',
  platformPurpose: 'child_subscription',
  purpose: 'child_subscription_manual_reference',
  ownerType: 'child',
  paymentMethod: req.body?.paymentMethod || req.body?.method || 'mobile_money',
  reference: req.body?.reference || req.body?.mpesaCode || req.body?.transactionCode || undefined,
  billingCycle: req.body?.billingCycle || req.body?.billingPeriod || 'monthly'
}, 'Child subscription reference submitted using the active platform provider rule.');

exports.adminNameChangePaymentSTK = async (req, res) => startLockedPayment(req, res, {
  ...req.body,
  paymentType: 'platform',
  platformPurpose: 'name_change',
  purpose: 'school_name_change',
  ownerType: 'school',
  paymentMethod: req.body?.paymentMethod || 'mobile_money',
  accountReference: req.body?.accountReference || req.body?.reference || 'SCHOOL-NAME-CHANGE',
  metadata: { ...(req.body?.metadata || {}), newName: req.body?.newName || null, reason: req.body?.reason || null }
}, 'School name change payment started using the active platform provider.');

exports.getPlatformManualQueue = async (req, res) => {
  try {
    const rows = await Payment.findAll({
      where: v2003ManualProviderQueueWhere({ paymentType: { [Op.in]: ['platform', 'subscription'] } }),
      include: [
        { model: Student, required: false, include: [{ model: User, required: false, attributes: ['id', 'name', 'email', 'schoolCode'] }] },
        { model: Parent, required: false, include: [{ model: User, required: false, attributes: ['id', 'name', 'phone', 'email'] }] }
      ],
      order: [['createdAt', 'DESC']],
      limit: 200
    });
    res.json({ success: true, data: rows });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.reviewPlatformManualPayment = async (req, res) => {
  try {
    const { action, notes } = req.body || {};
    const approve = String(action || '').toLowerCase() !== 'reject';
    const payment = await Payment.findOne({ where: v2003ManualProviderQueueWhere({ id: req.params.paymentId, paymentType: { [Op.in]: ['platform', 'subscription'] } }) });
    if (!payment) return res.status(404).json({ success: false, message: 'Manual/platform payment not found or already reviewed.' });

    const before = payment.toJSON();
    const trail = Array.isArray(payment.auditTrail) ? payment.auditTrail : [];
    trail.push(auditEntry(approve ? 'manual_platform_payment_approved_v2003' : 'manual_platform_payment_rejected_v2003', req.user, { notes, provider: payment.paymentGateway }));
    await payment.update({
      status: approve ? 'completed' : 'rejected',
      providerStatus: approve ? 'manual_approved' : 'manual_rejected',
      completedAt: approve ? new Date() : null,
      paymentDate: approve ? new Date() : payment.paymentDate,
      reconciledAt: new Date(),
      reconciliationStatus: approve ? 'matched' : 'rejected',
      notes: notes || payment.notes,
      auditTrail: trail,
      metadata: { ...(payment.metadata || {}), manualReview: { approve, notes: notes || null, reviewedBy: req.user?.id || null, reviewedAt: new Date().toISOString() } }
    });

    if (payment.subscriptionPaymentId) {
      const subscriptionPayment = await SubscriptionPayment.findByPk(payment.subscriptionPaymentId);
      if (subscriptionPayment) {
        const spTrail = Array.isArray(subscriptionPayment.auditTrail) ? subscriptionPayment.auditTrail : [];
        spTrail.push(auditEntry(approve ? 'manual_provider_confirmed_v2003' : 'manual_provider_rejected_v2003', req.user, { paymentId: payment.id, notes }));
        await subscriptionPayment.update({
          status: approve ? 'success' : 'failed',
          paidAt: approve ? new Date() : subscriptionPayment.paidAt,
          mpesaReceiptNumber: payment.mpesaReceiptNumber || payment.reference || subscriptionPayment.mpesaReceiptNumber,
          auditTrail: spTrail
        });
        if (approve) {
          const subPlan = await SubscriptionPlan.findByPk(subscriptionPayment.planId) || await subscriptionController.getPlanByCode(subscriptionPayment.planCode, subscriptionPayment.ownerType === 'school' ? 'school' : 'child');
          const subscription = await Subscription.findByPk(subscriptionPayment.subscriptionId);
          if (subPlan && subscription) await subscriptionController.renewSubscription(subscription, subPlan, subscriptionPayment.billingCycle, payment.id);
        }
      }
    }

    await writeAudit(req, { schoolCode: 'platform', module: 'payments', action: approve ? 'platform_manual_payment_approved' : 'platform_manual_payment_rejected', entityType: 'Payment', entityId: String(payment.id), before, after: payment.toJSON() });
    res.json({ success: true, message: approve ? 'Platform payment approved and subscription/add-on activated.' : 'Platform payment rejected.', data: payment });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};
