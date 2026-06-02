const { Payment, Fee, Parent, Student, User, School, Settings, SchoolNameRequest, AuditLog, SubscriptionPlan, Subscription, SubscriptionPayment, SchoolPaymentSetting, Class } = require('../models');
const daraja = require('../services/darajaService');
const subscriptionController = require('./subscriptionController');
const realtimeSync = require('../services/realtimeSyncService');
const financeLedger = require('../services/financeLedgerService');

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

function feeBalance(fee){ return Math.max(0, Number(fee?.totalAmount || 0) - Number(fee?.paidAmount || 0)); }
function feeStatus(total, paid){ const t=Number(total||0), p=Number(paid||0); if(p >= t && t > 0) return 'paid'; if(p > 0) return 'partial'; return 'unpaid'; }
function studentSchoolCode(student){ return student?.User?.schoolCode || student?.schoolCode || null; }
function studentElimuId(student){ return student?.elimuid || student?.elimuId || student?.admissionNumber || `STU-${student?.id}`; }
function paymentAccountReference(student, fee, format='elimuid'){
  const f = String(format || 'elimuid').toLowerCase();
  if (f.includes('admission')) return student?.admissionNumber || studentElimuId(student);
  if (f.includes('studentid')) return String(student?.id || studentElimuId(student));
  if (f.includes('term')) return `${studentElimuId(student)}-${fee?.term || ''}`.slice(0,12);
  return String(studentElimuId(student)).slice(0,12);
}

async function getPlatformPaymentConfig() {
  const defaultValue = {
    paymentMode: 'manual',
    manualEnabled: true,
    darajaEnabled: false,
    accountName: 'Shule AI',
    currency: 'KES',
    parentSubscriptionsEnabled: true,
    schoolSubscriptionsEnabled: true,
    parentPlans: [{ code:'child_essential', name:'Essential', amount:100, days:30 }],
    schoolPlans: [{ code:'school_growth', name:'School Growth', amount:100000, days:30 }],
    darajaCredentials: {}
  };
  const [row] = await Settings.findOrCreate({
    where: { key: 'platform_payment_settings' },
    defaults: { category:'payments', description:'Shule AI platform payment settings', value: defaultValue }
  });
  return { row, value: { ...defaultValue, ...(row.value || {}) } };
}
function normalizePlatformPaymentMode(value) {
  const mode = String(value?.paymentMode || value?.mode || value?.darajaMode || '').toLowerCase();
  if (mode === 'daraja' || mode === 'stk') return 'daraja';
  if (mode === 'both' || mode === 'manual+daraja' || mode === 'manual_daraja') return 'both';
  if (value?.darajaEnabled && value?.manualEnabled) return 'both';
  if (value?.darajaEnabled) return 'daraja';
  return 'manual';
}
function normalizePlatformDarajaCredentials(value) {
  const d = value?.darajaCredentials || value?.daraja || {};
  return {
    mode: d.environment || d.env || d.mode || value?.darajaMode || process.env.DARAJA_ENV || 'sandbox',
    consumerKey: d.consumerKey || value?.consumerKey,
    consumerSecret: d.consumerSecret || value?.consumerSecret,
    shortcode: d.shortcode || d.businessShortCode || d.businessShortcode || value?.shortcode || value?.paybill,
    passkey: d.passkey || value?.passkey,
    callbackUrl: d.callbackUrl || value?.callbackUrl,
    transactionType: d.transactionType || value?.transactionType || 'CustomerPayBillOnline'
  };
}
async function requirePlatformStkAllowed(kind) {
  const { value } = await getPlatformPaymentConfig();
  const mode = normalizePlatformPaymentMode(value);
  const enabled = kind === 'school' ? value.schoolSubscriptionsEnabled !== false : value.parentSubscriptionsEnabled !== false;
  if (!enabled) {
    const label = kind === 'school' ? 'School subscriptions' : 'Parent subscriptions';
    const err = new Error(`${label} are disabled in Super Admin Platform Payments.`);
    err.statusCode = 403;
    throw err;
  }
  if (mode === 'manual') {
    const err = new Error('Platform is currently in Manual Verification mode. Submit the M-Pesa code for super admin approval instead of STK.');
    err.statusCode = 400;
    err.data = { paymentMode: mode, paybill: value.paybill || value.shortcode || '', till: value.till || '', instructions: value.manualInstructions || '' };
    throw err;
  }
  const credentials = normalizePlatformDarajaCredentials(value);
  return { settings:value, mode, credentials };
}
function normalizePlanCode(raw, ownerType) {
  const text = String(raw?.code || raw?.id || raw?.name || '').trim().toLowerCase().replace(/\s+/g, '_');
  if (ownerType === 'school') {
    if (!text || text === 'growth' || text === 'school_growth') return 'school_growth';
    if (text.includes('starter')) return 'school_starter';
    if (text.includes('enterprise')) return 'school_enterprise';
    return text.startsWith('school_') ? text : `school_${text}`;
  }
  if (!text || text === 'basic' || text === 'essential' || text === 'child_basic' || text === 'child_essential') return 'child_essential';
  if (text.includes('premium') || text.includes('smart')) return 'child_smart';
  if (text.includes('ultimate') || text.includes('genius')) return 'child_genius';
  return text.startsWith('child_') ? text : `child_${text}`;
}
function normalizePlanName(raw, fallback) {
  return String(raw?.displayName || raw?.name || raw?.title || fallback || 'Plan').trim();
}
function normalizePlanAmount(raw) {
  return Math.max(0, Math.round(Number(raw?.monthlyPriceKes ?? raw?.price_kes ?? raw?.price ?? raw?.amount ?? raw?.monthly ?? 0)) || 0);
}
async function syncPlatformSubscriptionPlans(value) {
  const syncOne = async (raw, ownerType, index) => {
    if (!raw || typeof raw !== 'object') return null;
    const code = normalizePlanCode(raw, ownerType);
    const name = code.replace(/^(school|child)_/, '');
    const displayName = normalizePlanName(raw, name);
    const monthly = normalizePlanAmount(raw);
    const payload = {
      code,
      name,
      displayName,
      ownerType,
      price_kes: monthly,
      monthlyPriceKes: monthly,
      termlyPriceKes: raw.termlyPriceKes ?? raw.termly ?? (ownerType === 'child' && monthly ? monthly * 3 : null),
      yearlyPriceKes: raw.yearlyPriceKes ?? raw.yearly ?? (monthly ? monthly * 12 : null),
      setupFeeMinKes: raw.setupFeeMinKes ?? raw.setupMin ?? null,
      setupFeeMaxKes: raw.setupFeeMaxKes ?? raw.setupMax ?? null,
      features: Array.isArray(raw.features) ? raw.features : [],
      lockedFeatures: Array.isArray(raw.lockedFeatures) ? raw.lockedFeatures : [],
      limits: raw.limits && typeof raw.limits === 'object' ? raw.limits : { days: Number(raw.days || 30) || 30 },
      sortOrder: Number(raw.sortOrder ?? index ?? 0),
      isActive: raw.isActive !== false
    };
    const [plan] = await SubscriptionPlan.findOrCreate({ where: { code }, defaults: payload });
    await plan.update(payload);
    return plan;
  };
  const parentPlans = Array.isArray(value.parentPlans) ? value.parentPlans : [];
  const schoolPlans = Array.isArray(value.schoolPlans) ? value.schoolPlans : [];
  const synced = [];
  for (let i = 0; i < parentPlans.length; i++) synced.push(await syncOne(parentPlans[i], 'child', i + 10));
  for (let i = 0; i < schoolPlans.length; i++) synced.push(await syncOne(schoolPlans[i], 'school', i + 10));
  return synced.filter(Boolean);
}

async function getSchoolPaymentConfig(schoolCodeValue){
  const school = await School.findOne({ where:{ schoolId:schoolCodeValue } });
  const existingSettings = school?.settings?.paymentSettings || {};
  const modelRow = await SchoolPaymentSetting?.findOne({ where:{ schoolCode:schoolCodeValue } }).catch(()=>null);
  const merged = {
    paymentMode: modelRow?.paymentMode || existingSettings.paymentMode || 'manual',
    mpesaType: modelRow?.mpesaType || existingSettings.mpesaType || 'paybill',
    paybillNumber: modelRow?.paybillNumber || existingSettings.paybill || existingSettings.paybillNumber || '',
    tillNumber: modelRow?.tillNumber || existingSettings.till || existingSettings.tillNumber || '',
    businessShortCode: modelRow?.businessShortCode || existingSettings.businessShortcode || existingSettings.businessShortCode || existingSettings.paybill || existingSettings.till || '',
    accountReferenceFormat: modelRow?.accountReferenceFormat || existingSettings.accountReferenceFormat || existingSettings.referenceFormat || 'elimuid',
    darajaEnabled: modelRow?.darajaEnabled === true || existingSettings.darajaEnabled === true || existingSettings.paymentMode === 'daraja',
    darajaConsumerKey: modelRow?.darajaConsumerKey || existingSettings.consumerKey || existingSettings.darajaConsumerKey || '',
    darajaConsumerSecret: modelRow?.darajaConsumerSecret || existingSettings.consumerSecret || existingSettings.darajaConsumerSecret || '',
    darajaPasskey: modelRow?.darajaPasskey || existingSettings.passkey || existingSettings.darajaPasskey || '',
    darajaShortcode: modelRow?.darajaShortcode || existingSettings.shortcode || existingSettings.businessShortcode || existingSettings.businessShortCode || '',
    darajaEnvironment: modelRow?.darajaEnvironment || existingSettings.darajaEnvironment || existingSettings.environment || process.env.DARAJA_ENV || 'sandbox',
    callbackUrl: modelRow?.callbackUrl || existingSettings.callbackUrl || process.env.DARAJA_CALLBACK_URL || process.env.MPESA_CALLBACK_URL || '',
    bankName: modelRow?.bankName || school?.bankDetails?.bankName || existingSettings.bankName || '',
    bankAccountName: modelRow?.bankAccountName || school?.bankDetails?.accountName || existingSettings.accountName || school?.name || '',
    bankAccountNumber: modelRow?.bankAccountNumber || school?.bankDetails?.accountNumber || existingSettings.accountNumber || '',
    bankBranch: modelRow?.bankBranch || school?.bankDetails?.branch || existingSettings.branch || '',
    manualInstructions: modelRow?.metadata?.manualInstructions || existingSettings.manualInstructions || 'Use the displayed account details, then submit your payment reference for verification.',
    offlineInstructions: modelRow?.metadata?.offlineInstructions || existingSettings.offlineInstructions || 'Cash/card payments should be made at the school office and receipt/reference submitted for records.',
    cashEnabled: modelRow?.metadata?.cashEnabled !== false && existingSettings.cashEnabled !== false,
    cardEnabled: modelRow?.metadata?.cardEnabled === true || existingSettings.cardEnabled === true,
    schoolName: school?.name || existingSettings.accountName || 'School',
    isActive: modelRow?.isActive !== false && existingSettings.active !== false
  };
  merged.canUseDaraja = merged.isActive && (merged.paymentMode === 'daraja' || merged.paymentMode === 'mixed' || merged.darajaEnabled) && merged.darajaConsumerKey && merged.darajaConsumerSecret && merged.darajaPasskey && merged.darajaShortcode;
  merged.manualAccount = merged.mpesaType === 'till' ? merged.tillNumber : merged.paybillNumber;
  return { school, row:modelRow, settings:merged, bankDetails: school?.bankDetails || { bankName: merged.bankName, accountName: merged.bankAccountName, accountNumber: merged.bankAccountNumber, branch: merged.bankBranch } };
}
async function applyFeePayment(payment, receipt='manual'){
  if(!payment?.feeId) return null;
  // V75: balances are reconciled from the student-specific ledger so approved
  // M-Pesa, manual, bank, cash, card, bursary and waiver rows all update the
  // same fee account without double-counting.
  return financeLedger.recalculateFeeAccount(payment.feeId);
}

async function createManualPayment(req, { student, parent, fee, amount, mpesaCode, phone, notes }){
  const reference = String(mpesaCode || ref(`MAN-${student.id}`)).trim().toUpperCase();
  const existing = await Payment.findOne({ where:{ reference, schoolCode:studentSchoolCode(student) } });
  if(existing) throw new Error('This M-Pesa code/reference has already been submitted.');
  const payment = await Payment.create({
    studentId:student.id, parentId:parent?.id || null, feeId:fee?.id || null,
    amount, method:'mpesa', reference, status:'pending', transactionId:`MANUAL-${reference}`,
    accountReference:paymentAccountReference(student, fee, 'elimuid'), schoolCode:studentSchoolCode(student), paymentType:'fee', currency:'KES', paymentGateway:'manual_mpesa', paidTo:'school', payerPhone:phone || null, locked:true,
    notes:notes || 'Manual M-Pesa payment awaiting school verification',
    metadata:{ studentElimuid:studentElimuId(student), feeId:fee?.id || null, term:fee?.term, year:fee?.year, submittedBy:'parent', manual:true },
    auditTrail:[auditEntry('manual_payment_submitted', req.user, { reference, amount, elimuId:studentElimuId(student) })]
  });
  await writeAudit(req, { module:'payments', action:'manual_payment_submitted', entityType:'Payment', entityId:String(payment.id), after:payment.toJSON(), metadata:{reference, amount} });
  realtimeSync.emitPaymentUpdate(studentSchoolCode(student), {
    paymentId: payment.id,
    studentId: student.id,
    feeId: fee?.id || null,
    amount,
    status: 'pending',
    action: 'manual_payment_submitted'
  });
  return payment;
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
  const idempotencyKey = payload.idempotencyKey || payload.checkoutRequestId || payload.reference;
  if (idempotencyKey) {
    const existing = await Payment.findOne({ where: { idempotencyKey } }).catch(() => null);
    if (existing) return existing;
  }
  const row = await Payment.create({
    studentId: payload.studentId || null,
    parentId: payload.parentId || null,
    feeId: payload.feeId || null,
    feeStructureId: payload.feeStructureId || payload.metadata?.feeStructureId || null,
    amount: payload.amount,
    method: payload.method || 'mpesa_stk',
    transactionType: payload.transactionType || 'payment',
    source: payload.source || 'parent',
    reference: payload.reference,
    idempotencyKey,
    reconciliationStatus: 'pending',
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
    const { settings } = await getSchoolPaymentConfig(school.schoolId);
    res.json({ success:true, data: {
      schoolName: school.name,
      schoolCode: school.schoolId,
      paymentSettings: {
        paymentMode: settings.paymentMode,
        mpesaType: settings.mpesaType,
        paybill: settings.paybillNumber,
        till: settings.tillNumber,
        businessShortcode: settings.businessShortCode,
        shortcode: settings.darajaShortcode || settings.businessShortCode,
        accountReferenceFormat: settings.accountReferenceFormat || 'elimuid',
        darajaEnabled: !!settings.canUseDaraja,
        darajaEnvironment: settings.darajaEnvironment,
        callbackUrl: settings.callbackUrl,
        active: settings.isActive,
        accountName: settings.schoolName,
        manualAccount: settings.manualAccount,
        currency: 'KES',
        acceptedMethods: ['manual_mpesa','daraja_stk','bank','cash','card'],
        manualInstructions: settings.manualInstructions,
        offlineInstructions: settings.offlineInstructions,
        cashEnabled: settings.cashEnabled,
        cardEnabled: settings.cardEnabled
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
    const paymentMode = incoming.paymentMode || incoming.mode || 'manual';
    const mpesaType = incoming.mpesaType || incoming.type || 'paybill';
    const paybillNumber = incoming.paybillNumber || incoming.paybill || incoming.businessShortcode || '';
    const tillNumber = incoming.tillNumber || incoming.till || '';
    const businessShortCode = incoming.businessShortCode || incoming.businessShortcode || incoming.shortcode || (mpesaType === 'till' ? tillNumber : paybillNumber) || '';
    const accountReferenceFormat = incoming.accountReferenceFormat || incoming.referenceFormat || 'elimuid';
    const rowPayload = {
      schoolId: school.id,
      schoolCode: school.schoolId,
      paymentMode,
      mpesaType,
      tillNumber,
      paybillNumber,
      businessShortCode,
      accountReferenceFormat,
      bankName: incoming.bankName || incoming.bankDetails?.bankName || '',
      bankAccountName: incoming.accountName || incoming.bankDetails?.accountName || school.name,
      bankAccountNumber: incoming.bankAccount || incoming.accountNumber || incoming.bankDetails?.accountNumber || '',
      bankBranch: incoming.branch || incoming.bankDetails?.branch || '',
      darajaEnabled: paymentMode === 'daraja' || incoming.darajaEnabled === true,
      darajaConsumerKey: incoming.consumerKey || incoming.darajaConsumerKey || '',
      darajaConsumerSecret: incoming.consumerSecret || incoming.darajaConsumerSecret || '',
      darajaPasskey: incoming.passkey || incoming.darajaPasskey || '',
      darajaShortcode: incoming.shortcode || incoming.darajaShortcode || businessShortCode,
      darajaEnvironment: incoming.environment || incoming.darajaEnvironment || process.env.DARAJA_ENV || 'sandbox',
      callbackUrl: incoming.callbackUrl || process.env.DARAJA_CALLBACK_URL || process.env.MPESA_CALLBACK_URL || '',
      isActive: incoming.active !== false,
      metadata: {
        ...(incoming.metadata || {}),
        manualInstructions: incoming.manualInstructions || incoming.instructions || '',
        offlineInstructions: incoming.offlineInstructions || '',
        cashEnabled: incoming.cashEnabled !== false,
        cardEnabled: incoming.cardEnabled === true,
        updatedBy:req.user.id,
        updatedAt:new Date().toISOString(),
        auditTrail: [auditEntry('school_payment_settings_saved', req.user, { paymentMode, mpesaType })]
      }
    };
    const [paymentRow] = await SchoolPaymentSetting.findOrCreate({ where:{ schoolCode:school.schoolId }, defaults:rowPayload });
    await paymentRow.update(rowPayload);
    const settings = school.settings || {};
    settings.paymentSettings = {
      ...(settings.paymentSettings || {}),
      paymentMode, mpesaType, paybill:paybillNumber, till:tillNumber, businessShortcode:businessShortCode,
      accountReferenceFormat, referenceFormat:accountReferenceFormat, active:incoming.active !== false,
      darajaEnabled: rowPayload.darajaEnabled,
      shortcode: rowPayload.darajaShortcode,
      callbackUrl: rowPayload.callbackUrl,
      manualInstructions: rowPayload.metadata.manualInstructions,
      offlineInstructions: rowPayload.metadata.offlineInstructions,
      cashEnabled: rowPayload.metadata.cashEnabled,
      cardEnabled: rowPayload.metadata.cardEnabled,
      updatedAt:new Date().toISOString(), updatedBy:req.user.id
    };
    const bankDetails = {
      ...(school.bankDetails || {}),
      bankName: rowPayload.bankName,
      accountName: rowPayload.bankAccountName,
      accountNumber: rowPayload.bankAccountNumber,
      branch: rowPayload.bankBranch
    };
    await school.update({ settings, bankDetails });
    await writeAudit(req, { module:'payments', action:'school_payment_settings_updated', entityType:'SchoolPaymentSetting', entityId:String(paymentRow.id), after:rowPayload });
    res.json({ success:true, message:'School payment settings saved', data: { paymentSettings: settings.paymentSettings, schoolPaymentSetting: paymentRow, bankDetails } });
  } catch(error){ res.status(500).json({ success:false, message:error.message }); }
};

exports.testAdminPaymentConnection = async (req, res) => {
  try {
    const school = await School.findOne({ where: { schoolId: req.user.schoolCode } });
    if (!school) return res.status(404).json({ success:false, message:'School not found' });
    const { settings } = await getSchoolPaymentConfig(school.schoolId);
    if (settings.paymentMode !== 'daraja' && !settings.darajaEnabled) return res.json({ success:true, message:'Manual M-Pesa mode is active. No Daraja test is required.', data:{ paymentMode:'manual', account:settings.manualAccount } });
    const missing = [];
    if(!settings.darajaConsumerKey) missing.push('consumerKey');
    if(!settings.darajaConsumerSecret) missing.push('consumerSecret');
    if(!settings.darajaShortcode) missing.push('shortcode');
    if(!settings.darajaPasskey) missing.push('passkey');
    if(!settings.callbackUrl) missing.push('callbackUrl');
    if (missing.length) return res.status(400).json({ success:false, message:`School Daraja settings missing: ${missing.join(', ')}` });
    await daraja.getAccessToken({ consumerKey:settings.darajaConsumerKey, consumerSecret:settings.darajaConsumerSecret, shortcode:settings.darajaShortcode, passkey:settings.darajaPasskey, callbackUrl:settings.callbackUrl, mode:settings.darajaEnvironment });
    res.json({ success:true, message:'School Daraja connection verified successfully.', data:{ environment:settings.darajaEnvironment, shortcode:settings.darajaShortcode, callbackUrl:settings.callbackUrl } });
  } catch(error) {
    console.error('School Daraja test connection failed:', error.message);
    res.status(400).json({ success:false, message:error.message || 'Daraja connection test failed' });
  }
};


exports.getPlatformPaymentSettings = async (req, res) => {
  try {
    const { row, value } = await getPlatformPaymentConfig();
    const mode = normalizePlatformPaymentMode(value);
    const normalized = {
      ...value,
      paymentMode: mode,
      manualEnabled: mode === 'manual' || mode === 'both',
      darajaEnabled: mode === 'daraja' || mode === 'both',
      darajaCredentials: normalizePlatformDarajaCredentials(value)
    };
    if (JSON.stringify(row.value || {}) !== JSON.stringify(normalized)) await row.update({ value: normalized }).catch(() => null);
    res.json({ success:true, data: normalized });
  } catch(error){ res.status(500).json({ success:false, message:error.message }); }
};

exports.updatePlatformPaymentSettings = async (req, res) => {
  try {
    const { row, value: current } = await getPlatformPaymentConfig();
    const incoming = req.body || {};
    const mode = normalizePlatformPaymentMode(incoming.paymentMode ? incoming : { ...current, ...incoming });
    const next = {
      ...current,
      ...incoming,
      paymentMode: mode,
      manualEnabled: mode === 'manual' || mode === 'both',
      darajaEnabled: mode === 'daraja' || mode === 'both',
      darajaCredentials: normalizePlatformDarajaCredentials({ ...current, ...incoming }),
      updatedAt:new Date().toISOString(),
      updatedBy:req.user.id
    };
    await row.update({ value: next, category:'payments', description:'Shule AI platform payment settings' });
    const syncedPlans = await syncPlatformSubscriptionPlans(next).catch((e) => { console.error('Platform plan sync failed:', e.message); return []; });
    await writeAudit(req, { schoolCode:'platform', module:'payments', action:'platform_payment_settings_updated', entityType:'Settings', entityId:'platform_payment_settings', after:{ ...next, syncedPlanCount:syncedPlans.length } });
    res.json({ success:true, message:'Platform payment settings saved and subscription plans synced', data:{ ...next, syncedPlanCount:syncedPlans.length } });
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
    const realSchoolCode = studentSchoolCode(student) || schoolCode(req);
    const fee = feeId ? await Fee.findOne({ where:{ id:feeId, studentId:student.id, schoolCode:realSchoolCode } }) : await Fee.findOne({ where:{ studentId:student.id, schoolCode:realSchoolCode }, order:[['year','DESC'],['term','DESC']] });
    const payAmount = cleanAmount(amount);
    if(fee && payAmount > feeBalance(fee)) return res.status(400).json({ success:false, message:'Payment amount exceeds outstanding balance' });
    const { settings } = await getSchoolPaymentConfig(realSchoolCode);
    if(!settings.canUseDaraja){
      return res.status(400).json({ success:false, message:'This school is in Manual M-Pesa mode. Submit the M-Pesa code after paying to the displayed school account.', data:{ paymentMode:'manual', paybill:settings.paybillNumber, till:settings.tillNumber, mpesaType:settings.mpesaType, accountReference:paymentAccountReference(student, fee, settings.accountReferenceFormat), elimuId:studentElimuId(student), amount:payAmount } });
    }
    const accountReference = paymentAccountReference(student, fee, settings.accountReferenceFormat);
    const reference = ref(`FEE-${student.id}`);
    const stk = await daraja.initiateSTKPush({
      phone,
      amount: payAmount,
      accountReference,
      transactionDesc:`School fees for ${studentElimuId(student)}`,
      callbackUrl: settings.callbackUrl,
      credentials:{ consumerKey:settings.darajaConsumerKey, consumerSecret:settings.darajaConsumerSecret, shortcode:settings.darajaShortcode, passkey:settings.darajaPasskey, mode:settings.darajaEnvironment, callbackUrl:settings.callbackUrl },
      metadata:{ type:'fee', schoolCode:realSchoolCode, studentId:student.id, feeId:fee?.id || feeId, reference, elimuId:studentElimuId(student), paidTo:'school' }
    });
    const payment = await createPendingPayment(req, { studentId:student.id, parentId:parent.id, feeId:fee?.id || feeId, amount:payAmount, reference, phone, checkoutRequestId:stk.CheckoutRequestID, merchantRequestId:stk.MerchantRequestID, accountReference, schoolCode:realSchoolCode, paymentType:'fee', paidTo:'school', gatewayResponse:stk, metadata:{ studentElimuid:studentElimuId(student), feeId:fee?.id || feeId, paymentMode:'daraja', schoolPaymentMode:settings.paymentMode } });
    res.json({ success:true, message:'M-PESA prompt sent. Fee balance updates after Daraja callback confirmation.', data:{ paymentId:payment.id, reference, accountReference, checkoutRequestId:stk.CheckoutRequestID, merchantRequestId:stk.MerchantRequestID, responseDescription:stk.ResponseDescription, customerMessage:stk.CustomerMessage, environment:stk.environment } });
  } catch(error){ console.error('Parent fee STK error:', error); res.status(500).json({ success:false, message:error.message }); }
};

exports.parentFeeManual = async (req, res) => {
  try {
    const { studentId, feeId, amount, mpesaCode, phone, notes } = req.body || {};
    if(!studentId || !amount || !mpesaCode) return res.status(400).json({ success:false, message:'studentId, amount, and M-Pesa code are required' });
    const student = await findStudentForParent(req, studentId);
    if(!student) return res.status(404).json({ success:false, message:'Student not found or not linked to this parent' });
    const parent = await currentParent(req);
    if(!parent) return res.status(404).json({ success:false, message:'Parent profile not found' });
    const realSchoolCode = studentSchoolCode(student) || schoolCode(req);
    const fee = feeId ? await Fee.findOne({ where:{ id:feeId, studentId:student.id, schoolCode:realSchoolCode } }) : await Fee.findOne({ where:{ studentId:student.id, schoolCode:realSchoolCode }, order:[['year','DESC'],['term','DESC']] });
    const payAmount = cleanAmount(amount);
    if(fee && payAmount > feeBalance(fee)) return res.status(400).json({ success:false, message:'Payment amount exceeds outstanding balance' });
    const payment = await createManualPayment(req, { student, parent, fee, amount:payAmount, mpesaCode, phone, notes });
    res.json({ success:true, message:'Payment submitted for school finance verification. Balance updates after approval.', data:{ paymentId:payment.id, reference:payment.reference, status:payment.status, elimuId:studentElimuId(student), amount:payAmount } });
  } catch(error){ console.error('Manual school fee payment error:', error); res.status(500).json({ success:false, message:error.message }); }
};

exports.getManualVerificationQueue = async (req, res) => {
  try {
    const rows = await Payment.findAll({
      where:{ schoolCode:req.user.schoolCode, paymentType:'fee', paidTo:'school', paymentGateway:'manual_mpesa', status:'pending' },
      include:[{ model:Student, include:[{model:User, attributes:['id','name','schoolCode']}] }, { model:Parent, include:[{model:User, attributes:['id','name','phone','email']}] }],
      order:[['createdAt','DESC']], limit:200
    });
    res.json({ success:true, data:rows });
  } catch(error){ res.status(500).json({ success:false, message:error.message }); }
};


exports.getAdminPaymentRecords = async (req, res) => {
  try {
    const rows = await Payment.findAll({
      where:{ schoolCode:req.user.schoolCode, paymentType:'fee', paidTo:'school' },
      include:[
        { model:Student, include:[{model:User, attributes:['id','name','schoolCode']}] },
        { model:Parent, include:[{model:User, attributes:['id','name','phone','email']}] },
        { model:Fee, required:false }
      ],
      order:[['createdAt','DESC']],
      limit:1000
    });

    const data = rows.map((payment) => {
      const row = payment.toJSON ? payment.toJSON() : payment;
      const fee = row.Fee || null;
      const total = Number(fee?.totalAmount || 0);
      const paid = Number(fee?.paidAmount || 0);
      const balance = Math.max(0, total - paid);
      return {
        ...row,
        studentName: row.Student?.User?.name || row.Student?.name || row.metadata?.studentName || null,
        parentName: row.Parent?.User?.name || row.metadata?.parentName || null,
        className: row.Student?.grade || row.metadata?.className || fee?.className || null,
        feeTerm: fee?.term || row.metadata?.term || null,
        feeYear: fee?.year || row.metadata?.year || null,
        feeTotalAmount: total,
        feePaidAmount: paid,
        feeBalance: balance
      };
    });

    res.json({ success:true, data });
  } catch(error){
    console.error('Admin payment records error:', error);
    res.status(500).json({ success:false, message:error.message });
  }
};

exports.approveManualPayment = async (req, res) => {
  try {
    const payment = await Payment.findOne({ where:{ id:req.params.paymentId, schoolCode:req.user.schoolCode, paymentType:'fee', paidTo:'school' } });
    if(!payment) return res.status(404).json({ success:false, message:'Payment not found' });
    if(payment.status === 'completed') return res.json({ success:true, message:'Payment already approved', data:payment });
    const trail = Array.isArray(payment.auditTrail) ? payment.auditTrail : [];
    trail.push(auditEntry('manual_payment_approved', req.user, { reference:payment.reference, amount:payment.amount }));
    await payment.update({ status:'completed', completedAt:new Date(), verifiedBy:req.user.id, verifiedAt:new Date(), notes:req.body?.notes || payment.notes, auditTrail:trail });
    const fee = await applyFeePayment(payment, payment.reference);
    await writeAudit(req, { module:'payments', action:'manual_payment_approved', entityType:'Payment', entityId:String(payment.id), after:payment.toJSON() });
    realtimeSync.emitPaymentUpdate(payment.schoolCode || req.user.schoolCode, {
      paymentId: payment.id,
      studentId: payment.studentId,
      feeId: payment.feeId,
      amount: payment.amount,
      status: 'completed',
      action: 'manual_payment_approved'
    });
    res.json({ success:true, message:'Payment approved. Student fee balance updated.', data:{ payment, fee } });
  } catch(error){ res.status(500).json({ success:false, message:error.message }); }
};

exports.rejectManualPayment = async (req, res) => {
  try {
    const payment = await Payment.findOne({ where:{ id:req.params.paymentId, schoolCode:req.user.schoolCode, paymentType:'fee', paidTo:'school' } });
    if(!payment) return res.status(404).json({ success:false, message:'Payment not found' });
    const trail = Array.isArray(payment.auditTrail) ? payment.auditTrail : [];
    trail.push(auditEntry('manual_payment_rejected', req.user, { reason:req.body?.reason || 'Rejected by finance/admin' }));
    await payment.update({ status:'failed', verifiedBy:req.user.id, verifiedAt:new Date(), notes:req.body?.reason || 'Rejected by school finance/admin', auditTrail:trail });
    await writeAudit(req, { module:'payments', action:'manual_payment_rejected', entityType:'Payment', entityId:String(payment.id), after:payment.toJSON() });
    realtimeSync.emitPaymentUpdate(payment.schoolCode || req.user.schoolCode, {
      paymentId: payment.id,
      studentId: payment.studentId,
      feeId: payment.feeId,
      amount: payment.amount,
      status: 'failed',
      action: 'manual_payment_rejected'
    });
    res.json({ success:true, message:'Payment rejected. No balance was updated.', data:payment });
  } catch(error){ res.status(500).json({ success:false, message:error.message }); }
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
    const platform = await requirePlatformStkAllowed('child');
    const plan = await subscriptionController.getPlanByCode(planCode, 'child');
    if(!plan) return res.status(404).json({ success:false, message:'Child subscription plan not found' });
    const payAmount = cleanAmount(req.body.amount || subscriptionController.planAmount(plan, billingCycle));
    const subscription = await subscriptionController.findOrCreateChildSubscription(parent, student, plan, billingCycle);
    await subscription.update({ planId:plan.id, planCode:plan.code || plan.name, planName:plan.displayName || plan.name, billingCycle, status:'pending', features:plan.features || [], limits:plan.limits || {} });
    const reference = ref(`SUB-${student.id}`);
    const stk = await daraja.initiateSTKPush({ phone, amount: payAmount, accountReference:reference, transactionDesc:`Shule AI ${plan.displayName || plan.name} subscription`, credentials:platform.credentials, callbackUrl:platform.credentials.callbackUrl, metadata:{ type:'subscription', ownerType:'child', schoolCode:schoolCode(req), studentId:student.id, parentId:parent.id, planCode:plan.code || plan.name, billingCycle, reference, platformPaymentMode:platform.mode } });
    const subscriptionPayment = await SubscriptionPayment.create({ subscriptionId:subscription.id, ownerType:'child', schoolCode:schoolCode(req), parentId:parent.id, studentId:student.id, planId:plan.id, planCode:plan.code || plan.name, planName:plan.displayName || plan.name, billingCycle, amount:payAmount, checkoutRequestId:stk.CheckoutRequestID, merchantRequestId:stk.MerchantRequestID, status:'pending', metadata:{ reference, phone, source:'parent-child-subscription-stk' }, auditTrail:[auditEntry('child_subscription_stk_initiated', req.user, { reference, checkoutRequestId:stk.CheckoutRequestID })] });
    const payment = await createPendingPayment(req, { studentId:student.id, parentId:parent.id, amount:payAmount, reference, phone, checkoutRequestId:stk.CheckoutRequestID, merchantRequestId:stk.MerchantRequestID, accountReference:reference, schoolCode:schoolCode(req), paymentType:'subscription', paidTo:'platform', ownerType:'child', plan:plan.code || plan.name, planCode:plan.code || plan.name, planName:plan.displayName || plan.name, billingCycle, subscriptionPaymentId:subscriptionPayment.id, subscriptionId:subscription.id, gatewayResponse:stk, metadata:{ planCode:plan.code || plan.name, billingCycle, studentId:student.id, parentId:parent.id, ownerType:'child' } });
    res.json({ success:true, message:'M-PESA prompt sent. Subscription activates only after Daraja callback confirmation.', data:{ paymentId:payment.id, subscriptionPaymentId:subscriptionPayment.id, subscriptionId:subscription.id, reference, checkoutRequestId:stk.CheckoutRequestID, merchantRequestId:stk.MerchantRequestID, responseDescription:stk.ResponseDescription, customerMessage:stk.CustomerMessage, environment:stk.environment } });
  } catch(error){ res.status(error.statusCode || 500).json({ success:false, message:error.message, data:error.data || undefined }); }
};


exports.schoolSubscriptionSTK = async (req, res) => {
  try {
    const { phone } = req.body || {};
    const billingCycle = billingCycleFromBody(req.body || {});
    const planCode = normalizePlanInput(req.body?.planCode || req.body?.plan || 'school_growth', 'school');
    if (!phone) return res.status(400).json({ success:false, message:'phone is required' });
    const school = await currentSchool(req);
    if (!school) return res.status(404).json({ success:false, message:'School not found' });
    const platform = await requirePlatformStkAllowed('school');
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
      credentials: platform.credentials,
      callbackUrl: platform.credentials.callbackUrl,
      metadata: { type:'school_subscription', ownerType:'school', schoolId:school.id, schoolCode:school.schoolId, planCode:plan.code || plan.name, billingCycle, reference, platformPaymentMode:platform.mode }
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
    res.status(error.statusCode || 500).json({ success:false, message:error.message, data:error.data || undefined });
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
    const platform = await requirePlatformStkAllowed(metadata?.ownerType === 'school' ? 'school' : 'child');
    const stk = await daraja.initiateSTKPush({ phone, amount: cleanAmount(amount), accountReference, transactionDesc: description, credentials:platform.credentials, callbackUrl:platform.credentials.callbackUrl, metadata:{ ...metadata, userId:req.user.id, role:req.user.role, schoolCode:req.user.schoolCode, platformPaymentMode:platform.mode } });
    await writeAudit(req, { module:'payments', action:'platform_stk_initiated', entityType:'STK', entityId:stk.CheckoutRequestID, after:{ accountReference, amount, description, checkoutRequestId:stk.CheckoutRequestID } });
    res.json({ success:true, message:'M-PESA prompt sent.', data:{ checkoutRequestId:stk.CheckoutRequestID, merchantRequestId:stk.MerchantRequestID, responseDescription:stk.ResponseDescription, customerMessage:stk.CustomerMessage, environment:stk.environment } });
  } catch(error){ res.status(error.statusCode || 500).json({ success:false, message:error.message, data:error.data || undefined }); }
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
      if (success && payment.feeId && before.status !== 'completed') {
        const actualAmount = parsed.amount ? cleanAmount(parsed.amount) : Number(payment.amount || 0);
        if (actualAmount && actualAmount !== Number(payment.amount || 0)) {
          await payment.update({ amount: actualAmount, metadata: { ...(payment.metadata || {}), darajaCallback: parsed, actualDarajaAmount: actualAmount, mpesaReceiptNumber: parsed.mpesaReceiptNumber, phoneNumber: parsed.phoneNumber } });
        }
        await applyFeePayment(payment, parsed.mpesaReceiptNumber || payment.reference);
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
      realtimeSync.emitPaymentUpdate(payment.schoolCode, {
        paymentId: payment.id,
        studentId: payment.studentId,
        feeId: payment.feeId,
        amount: payment.amount,
        status: success ? 'completed' : 'failed',
        action: success ? 'daraja_payment_completed' : 'daraja_payment_failed'
      });
    }
    res.json({ ResultCode: 0, ResultDesc: 'Accepted' });
  } catch(error){ console.error('Daraja callback error:', error); res.json({ ResultCode: 0, ResultDesc:'Accepted with internal logging error' }); }
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
    const summary = await financeLedger.getAdminSummary({ schoolCode: req.user.schoolCode });
    const payments = await Payment.findAll({
      where: { schoolCode: req.user.schoolCode, paymentType: 'fee', paidTo: 'school' },
      include: [
        { model: Student, include: [{ model: User, attributes: ['id', 'name', 'schoolCode'] }, { model: Class, required: false }] },
        { model: Parent, include: [{ model: User, attributes: ['id', 'name', 'phone', 'email'] }], required: false },
        { model: Fee, required: false }
      ],
      order: [['createdAt', 'DESC']],
      limit: 1000
    });
    const data = summary.accounts.map(account => {
      const studentPayments = payments.filter(p => Number(p.studentId) === Number(account.studentId) && (!account.id || Number(p.feeId) === Number(account.id))).map(financeLedger.decoratePayment);
      const last = studentPayments[0] || null;
      return {
        ...account,
        feeId: account.id,
        studentId: account.studentId,
        studentName: account.studentName,
        className: account.className,
        feeTotalAmount: account.totalAmount,
        feeParentPaidAmount: account.parentPaidAmount,
        feeCreditAmount: account.creditAmount,
        feePaidAmount: account.paidAmount,
        feeBalance: account.balance,
        lastPayment: last,
        paymentHistory: studentPayments,
        recordType: 'fee_account'
      };
    });
    res.json({ success: true, data, summary });
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

exports.parentFeeManual = async (req, res) => {
  try {
    const { studentId, feeId, amount, mpesaCode, reference, phone, notes, method = 'manual_mpesa' } = req.body || {};
    if(!studentId || !amount || !(mpesaCode || reference)) return res.status(400).json({ success:false, message:'studentId, amount, and reference/M-Pesa code are required' });
    const { parent, student } = await financeLedger.assertParentOwnsStudent({ parentUserId: req.user.id, studentId, schoolCode: req.user.schoolCode });
    const payment = await financeLedger.recordTransaction({
      user: req.user,
      schoolCode: req.user.schoolCode,
      studentId: student.id,
      parentId: parent.id,
      feeId: Number(feeId),
      amount,
      method,
      transactionType: 'payment',
      status: 'pending',
      reference: mpesaCode || reference,
      source: 'parent',
      notes: notes || `${method} payment awaiting school verification`,
      processedBy: req.user.id,
      paymentDate: new Date(),
      metadata: { phone, submittedBy: 'parent' }
    });
    res.json({ success:true, message:'Payment submitted for school finance verification. Balance updates after approval.', data:{ paymentId:payment.id, reference:payment.reference, status:payment.status, amount:payment.amount } });
  } catch(error){ console.error('Manual school fee payment error:', error); res.status(400).json({ success:false, message:error.message }); }
};


exports.getParentSchoolPaymentSettings = async (req, res) => {
  try {
    const { settings, bankDetails } = await getSchoolPaymentConfig(req.user.schoolCode);
    res.json({ success:true, data:{
      paymentMode: settings.paymentMode || 'manual',
      mpesaType: settings.mpesaType || 'paybill',
      paybill: settings.paybillNumber || settings.paybill || settings.businessShortcode || '',
      till: settings.tillNumber || settings.till || '',
      shortcode: settings.darajaShortcode || settings.businessShortcode || settings.shortcode || '',
      referenceFormat: settings.accountReferenceFormat || 'elimuid',
      bankName: bankDetails?.bankName || settings.bankName || '',
      accountName: bankDetails?.accountName || settings.bankAccountName || settings.accountName || '',
      accountNumber: bankDetails?.accountNumber || settings.bankAccountNumber || settings.bankAccount || settings.accountNumber || '',
      branch: bankDetails?.branch || settings.bankBranch || settings.branch || '',
      manualInstructions: settings.manualInstructions || 'Use the displayed account details, then submit your payment reference for verification.',
      offlineInstructions: settings.offlineInstructions || '',
      supports: { stk: !!settings.canUseDaraja, manualMpesa: ['manual','mixed'].includes(String(settings.paymentMode||'manual')), paybill: !!settings.paybillNumber, till: !!settings.tillNumber, bank: !!(settings.bankAccountNumber || bankDetails?.accountNumber), cash: settings.cashEnabled !== false, card: settings.cardEnabled === true }
    }});
  } catch (error) { res.status(500).json({ success:false, message:error.message }); }
};
