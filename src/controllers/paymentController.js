const { Payment, Fee, Parent, Student, User, School, Settings, SchoolNameRequest, AuditLog } = require('../models');
const daraja = require('../services/darajaService');

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
async function createPendingPayment(req, payload){
  const row = await Payment.create({
    studentId: payload.studentId,
    parentId: payload.parentId,
    feeId: payload.feeId || null,
    amount: payload.amount,
    method: 'mpesa',
    reference: payload.reference,
    plan: payload.plan || null,
    status: 'pending',
    transactionId: payload.checkoutRequestId,
    checkoutRequestId: payload.checkoutRequestId,
    merchantRequestId: payload.merchantRequestId,
    accountReference: payload.accountReference,
    schoolCode: payload.schoolCode,
    paymentType: payload.paymentType,
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
    settings.paymentSettings = {
      paybill: incoming.paybill || '', till: incoming.till || '', accountName: incoming.accountName || school.name,
      settlementBank: incoming.settlementBank || '', settlementAccount: incoming.settlementAccount || '', supportPhone: incoming.supportPhone || '',
      currency: incoming.currency || 'KES', acceptedMethods: incoming.acceptedMethods || ['mpesa'], feeCategories: incoming.feeCategories || [], active: incoming.active === true,
      updatedAt: new Date().toISOString(), updatedBy: req.user.id
    };
    const bankDetails = { ...(school.bankDetails || {}), ...(incoming.bankDetails || {}) };
    await school.update({ settings, bankDetails });
    await writeAudit(req, { module:'payments', action:'school_payment_settings_updated', entityType:'School', entityId:school.schoolId, after:{settings:settings.paymentSettings, bankDetails} });
    res.json({ success:true, message:'School payment settings saved', data: { paymentSettings: settings.paymentSettings, bankDetails } });
  } catch(error){ res.status(500).json({ success:false, message:error.message }); }
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
    const { studentId, phone, amount, plan='basic' } = req.body;
    if(!studentId || !phone || !amount) return res.status(400).json({ success:false, message:'studentId, phone, and amount are required' });
    const student = await findStudentForParent(req, studentId);
    if(!student) return res.status(404).json({ success:false, message:'Student not found or not linked to this parent' });
    const parent = await currentParent(req);
    if(!parent) return res.status(404).json({ success:false, message:'Parent profile not found' });
    const reference = ref(`SUB-${student.id}`);
    const payAmount = cleanAmount(amount);
    const stk = await daraja.initiateSTKPush({ phone, amount: payAmount, accountReference:reference, transactionDesc:`Shule AI ${plan} subscription`, metadata:{ type:'subscription', schoolCode:schoolCode(req), studentId:student.id, plan, reference } });
    const payment = await createPendingPayment(req, { studentId:student.id, parentId:parent.id, amount:payAmount, reference, phone, checkoutRequestId:stk.CheckoutRequestID, merchantRequestId:stk.MerchantRequestID, accountReference:reference, schoolCode:schoolCode(req), paymentType:'subscription', paidTo:'platform', plan, gatewayResponse:stk, metadata:{ plan } });
    res.json({ success:true, message:'M-PESA prompt sent. Subscription activates only after Daraja callback confirmation.', data:{ paymentId:payment.id, reference, checkoutRequestId:stk.CheckoutRequestID, merchantRequestId:stk.MerchantRequestID, responseDescription:stk.ResponseDescription, customerMessage:stk.CustomerMessage, environment:stk.environment } });
  } catch(error){ res.status(500).json({ success:false, message:error.message }); }
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
      if (success && payment.paymentType === 'subscription') {
        const student = await Student.findByPk(payment.studentId);
        if (student) await student.upgradeSubscription(payment.plan || 'basic', payment.amount);
      }
      await AuditLog?.create({ schoolCode:payment.schoolCode, module:'payments', action:success?'payment_completed':'payment_failed', entityType:'Payment', entityId:String(payment.id), before, after:payment.toJSON(), metadata:{ parsed } });
    }
    res.json({ ResultCode: 0, ResultDesc: 'Accepted' });
  } catch(error){ console.error('Daraja callback error:', error); res.json({ ResultCode: 0, ResultDesc:'Accepted with internal logging error' }); }
};
