const { Payment, Fee, Parent, Student, User, School, Settings, SchoolNameRequest, AuditLog, SubscriptionPlan, Subscription, SubscriptionPayment } = require('../models');
const daraja = require('../services/darajaService');
const subscriptionController = require('./subscriptionController');

function ref(prefix){ return `${prefix}-${Date.now()}-${Math.floor(Math.random()*100000).toString().padStart(5,'0')}`; }
function cleanAmount(v){ const n = Math.round(Number(v)); if(!Number.isFinite(n) || n < 1) throw new Error('Payment amount must be at least KES 1'); return n; }
function schoolCode(req){ return req.user?.schoolCode || req.body?.schoolCode || req.query?.schoolCode || null; }
function auditEntry(action, actor, extra={}){ return { action, actorUserId: actor?.id || null, actorRole: actor?.role || null, at: new Date().toISOString(), ...extra }; }
async function writeAudit(req, data){ try { await AuditLog?.create({ schoolCode: schoolCode(req) || data.schoolCode || 'platform', actorUserId:req.user?.id, actorRole:req.user?.role, ipAddress:req.ip, userAgent:req.get?.('user-agent'), ...data }); } catch(e){ console.error('Payment audit failed:', e.message); } }
async function currentParent(req){ return Parent.findOne({ where:{ userId:req.user.id } }); }
async function findStudentForParent(req, studentId){
  const student = await Student.findByPk(studentId, { include:[{model:User, attributes:['id','name','schoolCode']}] });
  if(!student) return null;
  if(req.user.role !== 'parent') return student;
  const parent = await currentParent(req);
  if(parent?.hasStudent){ const ok = await parent.hasStudent(student); if(!ok) return null; }
  return student;
}

async function currentSchool(req){
  return School.findOne({ where:{ schoolId:req.user.schoolCode } });
}

function normalizePlanInput(plan, ownerType){
  const raw = String(plan || '').trim().toLowerCase().replace(/\s+/g, '_');
  if (ownerType === 'school') {
    if (!raw || raw === 'growth' || raw === 'school_growth') return 'school_growth';
    if (raw.includes('enterprise') || raw === 'school_enterprise') return 'school_enterprise';
    if (raw.includes('starter') || raw === 'school_starter') return 'school_starter';
    return raw.startsWith('school_') ? raw : `school_${raw}`;
  }
  if (!raw || raw === 'essential' || raw === 'basic' || raw === 'child_essential' || raw === 'child_basic') return 'child_essential';
  if (raw.includes('genius') || raw.includes('ultimate') || raw === 'child_genius') return 'child_genius';
  if (raw.includes('smart') || raw.includes('premium') || raw === 'child_smart') return 'child_smart';
  return raw.startsWith('child_') ? raw : `child_${raw}`;
}

function billingCycleFromBody(body){
  const value = String(body.billingCycle || body.billingPeriod || 'monthly').toLowerCase();
  return ['monthly','termly','yearly','custom'].includes(value) ? value : 'monthly';
}

async function createPendingPayment(req, payload){
  const row = await Payment.create({
    studentId: payload.studentId || null,
    parentId: payload.parentId || null,
    feeId: payload.feeId || null,
    amount: payload.amount,
    method: 'mpesa',
    reference: payload.reference,
    plan: payload.plan || payload.planCode || null,
    status: 'pending',
    transactionId: payload.checkoutRequestId,
    checkoutRequestId: payload.checkoutRequestId,
    merchantRequestId: payload.merchantRequestId,
    accountReference: payload.accountReference,
    schoolCode: payload.schoolCode,
    paymentType: payload.paymentType,
    subscriptionPaymentId: payload.subscriptionPaymentId || null,
    subscriptionId: payload.subscriptionId || null,
    ownerType: payload.ownerType || null,
    billingCycle: payload.billingCycle || null,
    planCode: payload.planCode || payload.plan || null,
    planName: payload.planName || payload.plan || null,
    currency: 'KES',
    paymentGateway: 'daraja',
    paidTo: payload.paidTo,
    payerPhone: payload.phone,
    locked: true,
    gatewayResponse: payload.gatewayResponse || {},
    metadata: payload.metadata || {},
    auditTrail: [auditEntry('stk_initiated', req.user, { reference: payload.reference, checkoutRequestId: payload.checkoutRequestId })]
  });
  await writeAudit(req, { module:'payments', action:'stk_initiated', entityType:'Payment', entityId:String(row.id), after:row.toJSON(), metadata:{reference:payload.reference} });
  return row;
}

exports.getAdminPaymentSettings = async (req, res) => {
  try {
    const school = await School.findOne({ where: { schoolId: req.user.schoolCode } });
    if (!school) return res.status(404).json({ success:false, message:'School not found' });
    const settings = school.settings || {};
    res.json({ success:true, data: {
      schoolName: school.name,
      schoolCode: school.schoolId,
      paymentSettings: settings.paymentSettings || {
        paybill: '', till: '', accountName: school.name, settlementBank: '', settlementAccount: '', supportPhone: school.contact?.phone || '', currency: 'KES', acceptedMethods: ['mpesa'], feeCategories: ['Tuition Fees','Transport','Lunch','Uniform','Activity Fees'], active: false
      },
      bankDetails: school.bankDetails || {}
    }});
  } catch(error){ res.status(500).json({ success:false, message:error.message }); }
};

exports.updateAdminPaymentSettings = async (req, res) => {
  try {
    const school = await School.findOne({ where: { schoolId: req.user.schoolCode } });
    if (!school) return res.status(404).json({ success:false, message:'School not found' });
    const incoming = req.body || {};
    const settings = school.settings || {};
    const existingPaymentSettings = settings.paymentSettings || {};
    settings.paymentSettings = {
      ...existingPaymentSettings,
      paymentMode: incoming.paymentMode || existingPaymentSettings.paymentMode || 'manual',
      mpesaType: incoming.mpesaType || existingPaymentSettings.mpesaType || 'paybill',
      paybill: incoming.paybill || incoming.businessShortcode || existingPaymentSettings.paybill || '',
      till: incoming.till || incoming.tillNumber || existingPaymentSettings.till || '',
      businessShortcode: incoming.businessShortcode || incoming.paybill || incoming.till || existingPaymentSettings.businessShortcode || '',
      accountReferenceFormat: incoming.referenceFormat || incoming.accountReferenceFormat || existingPaymentSettings.accountReferenceFormat || 'admissionNumber',
      accountName: incoming.accountName || existingPaymentSettings.accountName || school.name,
      settlementBank: incoming.settlementBank || incoming.bankName || existingPaymentSettings.settlementBank || '',
      settlementAccount: incoming.settlementAccount || incoming.bankAccount || incoming.accountNumber || existingPaymentSettings.settlementAccount || '',
      supportPhone: incoming.supportPhone || existingPaymentSettings.supportPhone || '',
      currency: incoming.currency || existingPaymentSettings.currency || 'KES',
      acceptedMethods: incoming.acceptedMethods || existingPaymentSettings.acceptedMethods || ['mpesa'],
      feeCategories: incoming.feeCategories || existingPaymentSettings.feeCategories || [],
      active: incoming.active === true || existingPaymentSettings.active === true,
      updatedAt: new Date().toISOString(),
      updatedBy: req.user.id
    };
    const bankDetails = {
      ...(school.bankDetails || {}),
      ...(incoming.bankDetails || {}),
      bankName: incoming.bankName || incoming.bankDetails?.bankName || school.bankDetails?.bankName || '',
      accountName: incoming.accountName || incoming.bankDetails?.accountName || school.bankDetails?.accountName || school.name,
      accountNumber: incoming.bankAccount || incoming.accountNumber || incoming.bankDetails?.accountNumber || school.bankDetails?.accountNumber || '',
      branch: incoming.branch || incoming.bankDetails?.branch || school.bankDetails?.branch || ''
    };
    await school.update({ settings, bankDetails });
    await writeAudit(req, { module:'payments', action:'school_payment_settings_updated', entityType:'School', entityId:school.schoolId, after:{settings:settings.paymentSettings, bankDetails} });
    res.json({ success:true, message:'School payment settings saved', data: { paymentSettings: settings.paymentSettings, bankDetails } });
  } catch(error){ res.status(500).json({ success:false, message:error.message }); }
};


exports.testAdminPaymentConnection = async (req, res) => {
  try {
    const school = await School.findOne({ where: { schoolId: req.user.schoolCode } });
    if (!school) return res.status(404).json({ success:false, message:'School not found' });
    const cfg = daraja.getEnv();
    const missing = [];
    ['consumerKey','consumerSecret','shortcode','passkey','callbackUrl'].forEach(k => { if (!cfg[k]) missing.push(k); });
    if (missing.length) {
      return res.status(400).json({ success:false, message:`Daraja backend configuration missing: ${missing.join(', ')}` });
    }
    await daraja.getAccessToken();
    res.json({ success:true, message:'Daraja connection verified successfully.', data:{ environment:cfg.mode, shortcode:cfg.shortcode, callbackUrl:cfg.callbackUrl } });
  } catch(error) {
    console.error('Daraja test connection failed:', error.message);
    res.status(400).json({ success:false, message:error.message || 'Daraja connection test failed' });
  }
};

exports.getPlatformPaymentSettings = async (req, res) => {
  try {
    const [row] = await Settings.findOrCreate({
      where: { key: 'platform_payment_settings' },
      defaults: { category:'payments', description:'Shule AI platform payment settings', value: {
        accountName:'Shule AI', paybill:'', till:'', supportPhone:'', currency:'KES', parentPlans:[{id:'basic',name:'Basic',amount:150},{id:'premium',name:'Premium',amount:300},{id:'ultimate',name:'Ultimate',amount:800}], schoolPlans:[{id:'monthly',name:'Monthly',amount:3000},{id:'termly',name:'Termly',amount:8000},{id:'yearly',name:'Yearly',amount:30000}], fees:{ nameChange:500, maintenance:2500, registration:1000 }, darajaMode: process.env.DARAJA_ENV || 'sandbox'
      }}
    });
    res.json({ success:true, data: row.value });
  } catch(error){ res.status(500).json({ success:false, message:error.message }); }
};

exports.updatePlatformPaymentSettings = async (req, res) => {
  try {
    const [row] = await Settings.findOrCreate({ where:{ key:'platform_payment_settings' }, defaults:{ category:'payments', description:'Shule AI platform payment settings', value:{} } });
    const value = { ...(row.value || {}), ...(req.body || {}), updatedAt:new Date().toISOString(), updatedBy:req.user.id };
    await row.update({ value });
    await writeAudit(req, { schoolCode:'platform', module:'payments', action:'platform_payment_settings_updated', entityType:'Settings', entityId:'platform_payment_settings', after:value });
    res.json({ success:true, message:'Platform payment settings saved', data:value });
  } catch(error){ res.status(500).json({ success:false, message:error.message }); }
};

exports.parentFeeSTK = async (req, res) => {
  try {
    const { studentId, feeId, phone, amount } = req.body;
    if(!studentId || !phone || !amount) return res.status(400).json({ success:false, message:'studentId, phone, and amount are required' });
    const student = await findStudentForParent(req, studentId);
    if(!student) return res.status(404).json({ success:false, message:'Student not found or not linked to this parent' });
    const parent = await currentParent(req);
    if(!parent) return res.status(404).json({ success:false, message:'Parent profile not found' });
    const fee = feeId ? await Fee.findOne({ where:{ id:feeId, studentId:student.id, schoolCode:schoolCode(req) } }) : null;
    const payAmount = cleanAmount(amount);
    if(fee && payAmount > Math.max(0, Number(fee.totalAmount||0)-Number(fee.paidAmount||0))) return res.status(400).json({ success:false, message:'Payment amount exceeds outstanding balance' });
    const reference = ref(`FEE-${student.id}`);
    const stk = await daraja.initiateSTKPush({ phone, amount: payAmount, accountReference: reference, transactionDesc:`School fees for ${student.elimuid || student.id}`, metadata:{ type:'fee', schoolCode:schoolCode(req), studentId:student.id, feeId, reference } });
    const payment = await createPendingPayment(req, { studentId:student.id, parentId:parent.id, feeId, amount:payAmount, reference, phone, checkoutRequestId:stk.CheckoutRequestID, merchantRequestId:stk.MerchantRequestID, accountReference:reference, schoolCode:schoolCode(req), paymentType:'fee', paidTo:'school', gatewayResponse:stk, metadata:{ studentElimuid:student.elimuid, feeId } });
    res.json({ success:true, message:'M-PESA prompt sent. Payment will be marked paid only after Daraja callback confirmation.', data:{ paymentId:payment.id, reference, checkoutRequestId:stk.CheckoutRequestID, merchantRequestId:stk.MerchantRequestID, responseDescription:stk.ResponseDescription, customerMessage:stk.CustomerMessage, environment:stk.environment } });
  } catch(error){ console.error('Parent fee STK error:', error); res.status(500).json({ success:false, message:error.message }); }
};

exports.parentSubscriptionSTK = async (req, res) => {
  try {
    const { studentId, phone } = req.body || {};
    const billingCycle = billingCycleFromBody(req.body || {});
    const planCode = normalizePlanInput(req.body?.planCode || req.body?.plan || 'child_essential', 'child');
    if(!studentId || !phone) return res.status(400).json({ success:false, message:'studentId and phone are required' });
    const student = await findStudentForParent(req, studentId);
    if(!student) return res.status(404).json({ success:false, message:'Student not found or not linked to this parent' });
    const parent = await currentParent(req);
    if(!parent) return res.status(404).json({ success:false, message:'Parent profile not found' });
    const plan = await subscriptionController.getPlanByCode(planCode, 'child');
    if(!plan) return res.status(404).json({ success:false, message:'Child subscription plan not found' });
    const payAmount = cleanAmount(req.body.amount || subscriptionController.planAmount(plan, billingCycle));
    const subscription = await subscriptionController.findOrCreateChildSubscription(parent, student, plan, billingCycle);
    await subscription.update({ planId:plan.id, planCode:plan.code || plan.name, planName:plan.displayName || plan.name, billingCycle, status:'pending', features:plan.features || [], limits:plan.limits || {} });
    const reference = ref(`SUB-${student.id}`);
    const stk = await daraja.initiateSTKPush({ phone, amount: payAmount, accountReference:reference, transactionDesc:`Shule AI ${plan.displayName || plan.name} subscription`, metadata:{ type:'subscription', ownerType:'child', schoolCode:schoolCode(req), studentId:student.id, parentId:parent.id, planCode:plan.code || plan.name, billingCycle, reference } });
    const subscriptionPayment = await SubscriptionPayment.create({ subscriptionId:subscription.id, ownerType:'child', schoolCode:schoolCode(req), parentId:parent.id, studentId:student.id, planId:plan.id, planCode:plan.code || plan.name, planName:plan.displayName || plan.name, billingCycle, amount:payAmount, checkoutRequestId:stk.CheckoutRequestID, merchantRequestId:stk.MerchantRequestID, status:'pending', metadata:{ reference, phone, source:'parent-child-subscription-stk' }, auditTrail:[auditEntry('child_subscription_stk_initiated', req.user, { reference, checkoutRequestId:stk.CheckoutRequestID })] });
    const payment = await createPendingPayment(req, { studentId:student.id, parentId:parent.id, amount:payAmount, reference, phone, checkoutRequestId:stk.CheckoutRequestID, merchantRequestId:stk.MerchantRequestID, accountReference:reference, schoolCode:schoolCode(req), paymentType:'subscription', paidTo:'platform', ownerType:'child', plan:plan.code || plan.name, planCode:plan.code || plan.name, planName:plan.displayName || plan.name, billingCycle, subscriptionPaymentId:subscriptionPayment.id, subscriptionId:subscription.id, gatewayResponse:stk, metadata:{ planCode:plan.code || plan.name, billingCycle, studentId:student.id, parentId:parent.id, ownerType:'child' } });
    res.json({ success:true, message:'M-PESA prompt sent. Subscription activates only after Daraja callback confirmation.', data:{ paymentId:payment.id, subscriptionPaymentId:subscriptionPayment.id, subscriptionId:subscription.id, reference, checkoutRequestId:stk.CheckoutRequestID, merchantRequestId:stk.MerchantRequestID, responseDescription:stk.ResponseDescription, customerMessage:stk.CustomerMessage, environment:stk.environment } });
  } catch(error){ res.status(500).json({ success:false, message:error.message }); }
};


exports.schoolSubscriptionSTK = async (req, res) => {
  try {
    const { phone } = req.body || {};
    const billingCycle = billingCycleFromBody(req.body || {});
    const planCode = normalizePlanInput(req.body?.planCode || req.body?.plan || 'school_growth', 'school');
    if (!phone) return res.status(400).json({ success:false, message:'phone is required' });
    const school = await currentSchool(req);
    if (!school) return res.status(404).json({ success:false, message:'School not found' });
    const plan = await subscriptionController.getPlanByCode(planCode, 'school');
    if (!plan) return res.status(404).json({ success:false, message:'School subscription plan not found' });
    const amount = cleanAmount(req.body.amount || subscriptionController.planAmount(plan, billingCycle));
    const subscription = await subscriptionController.findOrCreateSchoolSubscription(school, plan, billingCycle);
    await subscription.update({ planId:plan.id, planCode:plan.code || plan.name, planName:plan.displayName || plan.name, billingCycle, status:'pending', features:plan.features || [], limits:plan.limits || {} });
    const reference = ref(`SCH-SUB-${school.id}`);
    const stk = await daraja.initiateSTKPush({
      phone,
      amount,
      accountReference: reference,
      transactionDesc: `Shule AI ${plan.displayName || plan.name} school subscription`,
      metadata: { type:'school_subscription', ownerType:'school', schoolId:school.id, schoolCode:school.schoolId, planCode:plan.code || plan.name, billingCycle, reference }
    });
    const subscriptionPayment = await SubscriptionPayment.create({
      subscriptionId: subscription.id,
      ownerType: 'school',
      schoolId: school.id,
      schoolCode: school.schoolId,
      planId: plan.id,
      planCode: plan.code || plan.name,
      planName: plan.displayName || plan.name,
      billingCycle,
      amount,
      checkoutRequestId: stk.CheckoutRequestID,
      merchantRequestId: stk.MerchantRequestID,
      status: 'pending',
      metadata: { reference, phone, source:'school-subscription-stk' },
      auditTrail: [auditEntry('school_subscription_stk_initiated', req.user, { reference, checkoutRequestId:stk.CheckoutRequestID })]
    });
    const payment = await createPendingPayment(req, {
      amount,
      reference,
      phone,
      checkoutRequestId: stk.CheckoutRequestID,
      merchantRequestId: stk.MerchantRequestID,
      accountReference: reference,
      schoolCode: school.schoolId,
      paymentType: 'subscription',
      paidTo: 'platform',
      ownerType: 'school',
      plan: plan.code || plan.name,
      planCode: plan.code || plan.name,
      planName: plan.displayName || plan.name,
      billingCycle,
      subscriptionPaymentId: subscriptionPayment.id,
      subscriptionId: subscription.id,
      gatewayResponse: stk,
      metadata: { planCode:plan.code || plan.name, billingCycle, schoolId:school.id, ownerType:'school' }
    });
    res.json({ success:true, message:'M-PESA prompt sent. School subscription renews after Daraja callback confirmation.', data:{ paymentId:payment.id, subscriptionPaymentId:subscriptionPayment.id, subscriptionId:subscription.id, reference, checkoutRequestId:stk.CheckoutRequestID, merchantRequestId:stk.MerchantRequestID, responseDescription:stk.ResponseDescription, customerMessage:stk.CustomerMessage, environment:stk.environment } });
  } catch(error) {
    console.error('School subscription STK error:', error);
    res.status(500).json({ success:false, message:error.message });
  }
};

exports.adminNameChangePaymentSTK = async (req, res) => {
  try {
    const { phone, amount, newName, reason } = req.body;
    if(!phone || !amount || !newName) return res.status(400).json({ success:false, message:'phone, amount, and newName are required' });
    const school = await School.findOne({ where:{ schoolId:req.user.schoolCode } });
    if (!school) return res.status(404).json({ success:false, message:'School not found' });
    const reference = ref('NAME');
    const payAmount = cleanAmount(amount);
    const stk = await daraja.initiateSTKPush({ phone, amount: payAmount, accountReference:reference, transactionDesc:`School name change - ${school.name}`, metadata:{ type:'name_change', schoolCode:req.user.schoolCode, newName, reason, reference } });
    res.json({ success:true, message:'M-PESA prompt sent. The request remains pending until callback confirmation.', data:{ reference, schoolCode:req.user.schoolCode, currentName:school.name, newName, amount:payAmount, checkoutRequestId:stk.CheckoutRequestID, merchantRequestId:stk.MerchantRequestID, responseDescription:stk.ResponseDescription, customerMessage:stk.CustomerMessage, environment:stk.environment } });
  } catch(error){ console.error('Name change payment error:', error); res.status(500).json({ success:false, message:error.message }); }
};

exports.genericPlatformSTK = async (req, res) => {
  try {
    const { phone, amount, accountReference='SHULEAI', description='Shule AI payment', metadata={} } = req.body;
    if(!phone || !amount) return res.status(400).json({ success:false, message:'phone and amount are required' });
    const stk = await daraja.initiateSTKPush({ phone, amount: cleanAmount(amount), accountReference, transactionDesc: description, metadata:{ ...metadata, userId:req.user.id, role:req.user.role, schoolCode:req.user.schoolCode } });
    await writeAudit(req, { module:'payments', action:'platform_stk_initiated', entityType:'STK', entityId:stk.CheckoutRequestID, after:{ accountReference, amount, description, checkoutRequestId:stk.CheckoutRequestID } });
    res.json({ success:true, message:'M-PESA prompt sent.', data:{ checkoutRequestId:stk.CheckoutRequestID, merchantRequestId:stk.MerchantRequestID, responseDescription:stk.ResponseDescription, customerMessage:stk.CustomerMessage, environment:stk.environment } });
  } catch(error){ res.status(500).json({ success:false, message:error.message }); }
};

exports.queryStatus = async (req, res) => { try { const data = await daraja.querySTKStatus(req.params.checkoutRequestId); res.json({ success:true, data }); } catch(error){ res.status(500).json({ success:false, message:error.message }); } };

exports.darajaCallback = async (req, res) => {
  try {
    const parsed = daraja.parseCallback(req.body);
    const payment = parsed.checkoutRequestId ? await Payment.findOne({ where: { transactionId: parsed.checkoutRequestId } }) : null;
    if (payment) {
      const success = Number(parsed.resultCode) === 0;
      const before = payment.toJSON();
      const trail = Array.isArray(payment.auditTrail) ? payment.auditTrail : [];
      trail.push({ action: success ? 'daraja_confirmed' : 'daraja_failed', at:new Date().toISOString(), resultCode:parsed.resultCode, resultDesc:parsed.resultDesc, receipt:parsed.mpesaReceiptNumber });
      await payment.update({
        status: success ? 'completed' : 'failed',
        completedAt: success ? new Date() : payment.completedAt,
        mpesaReceiptNumber: parsed.mpesaReceiptNumber || payment.mpesaReceiptNumber,
        payerPhone: parsed.phoneNumber || payment.payerPhone,
        gatewayResponse: parsed.raw,
        notes: parsed.resultDesc || payment.notes,
        auditTrail: trail,
        metadata: { ...(payment.metadata || {}), darajaCallback: parsed, mpesaReceiptNumber: parsed.mpesaReceiptNumber, phoneNumber: parsed.phoneNumber }
      });
      if (success && payment.feeId) {
        const fee = await Fee.findByPk(payment.feeId);
        if (fee) {
          const paidAmount = Number(fee.paidAmount || 0) + Number(payment.amount || 0);
          const status = paidAmount >= Number(fee.totalAmount || 0) ? 'paid' : 'partial';
          const payments = Array.isArray(fee.payments) ? fee.payments : [];
          payments.push({ paymentId:payment.id, amount:payment.amount, reference:payment.reference, receipt:parsed.mpesaReceiptNumber, paidAt:new Date().toISOString(), gateway:'daraja' });
          const feeTrail = Array.isArray(fee.auditTrail) ? fee.auditTrail : [];
          feeTrail.push({ action:'payment_applied', at:new Date().toISOString(), paymentId:payment.id, amount:payment.amount, receipt:parsed.mpesaReceiptNumber });
          await fee.update({ paidAmount, status, payments, auditTrail: feeTrail, lastReconciledAt:new Date() });
        }
      }
      if (payment.paymentType === 'subscription' && payment.subscriptionPaymentId) {
        const subscriptionPayment = await SubscriptionPayment.findByPk(payment.subscriptionPaymentId);
        if (subscriptionPayment) {
          const spTrail = Array.isArray(subscriptionPayment.auditTrail) ? subscriptionPayment.auditTrail : [];
          spTrail.push({ action: success ? 'daraja_confirmed' : 'daraja_failed', at:new Date().toISOString(), resultCode:parsed.resultCode, resultDesc:parsed.resultDesc, receipt:parsed.mpesaReceiptNumber });
          await subscriptionPayment.update({
            status: success ? 'success' : 'failed',
            paidAt: success ? new Date() : subscriptionPayment.paidAt,
            mpesaReceiptNumber: parsed.mpesaReceiptNumber || subscriptionPayment.mpesaReceiptNumber,
            rawCallback: parsed.raw || parsed,
            auditTrail: spTrail
          });
          if (success) {
            const plan = await SubscriptionPlan.findByPk(subscriptionPayment.planId) || await subscriptionController.getPlanByCode(subscriptionPayment.planCode, subscriptionPayment.ownerType === 'school' ? 'school' : 'child');
            const subscription = await Subscription.findByPk(subscriptionPayment.subscriptionId);
            if (plan && subscription) await subscriptionController.renewSubscription(subscription, plan, subscriptionPayment.billingCycle, payment.id);
          }
        }
      } else if (success && payment.paymentType === 'subscription' && payment.studentId) {
        const student = await Student.findByPk(payment.studentId);
        if (student) await student.upgradeSubscription(payment.plan || 'basic', payment.amount);
      }
      await AuditLog?.create({ schoolCode:payment.schoolCode, module:'payments', action:success?'payment_completed':'payment_failed', entityType:'Payment', entityId:String(payment.id), before, after:payment.toJSON(), metadata:{ parsed } });
    }
    res.json({ ResultCode: 0, ResultDesc: 'Accepted' });
  } catch(error){ console.error('Daraja callback error:', error); res.json({ ResultCode: 0, ResultDesc:'Accepted with internal logging error' }); }
};
