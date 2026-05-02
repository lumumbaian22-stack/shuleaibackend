const { Payment, Fee, Parent, Student, User, School, Settings, SchoolNameRequest } = require('../models');
const daraja = require('../services/darajaService');

function ref(prefix){ return `${prefix}-${Date.now()}-${Math.floor(Math.random()*10000)}`; }
function cleanAmount(v, fallback=1){ const n = Math.round(Number(v || fallback)); return Math.max(1, n); }
function publicPayment(payment){ return payment ? { id: payment.id, reference: payment.reference, amount: payment.amount, status: payment.status, paymentType: payment.paymentType, transactionId: payment.transactionId, metadata: payment.metadata } : null; }
async function getSchool(){ return School.findOne({ where: { schoolId: this?.schoolCode } }); }

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
      }
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
      currency: incoming.currency || 'KES', acceptedMethods: incoming.acceptedMethods || ['mpesa'], feeCategories: incoming.feeCategories || [], active: incoming.active !== false,
      updatedAt: new Date().toISOString(), updatedBy: req.user.id
    };
    await school.update({ settings });
    res.json({ success:true, message:'School payment settings saved', data: settings.paymentSettings });
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
    res.json({ success:true, message:'Platform payment settings saved', data:value });
  } catch(error){ res.status(500).json({ success:false, message:error.message }); }
};

exports.parentFeeSTK = async (req, res) => {
  try {
    const { studentId, amount, phone, feeId, category='School Fees', term, year } = req.body;
    const parent = await Parent.findOne({ where: { userId:req.user.id } });
    if (!parent) return res.status(404).json({ success:false, message:'Parent profile not found' });
    const student = await Student.findByPk(studentId, { include:[{ model:User, attributes:['id','name'] }] });
    if (!student || !(await parent.hasStudent(student))) return res.status(403).json({ success:false, message:'Not your child' });
    const payment = await Payment.create({
      studentId: student.id, parentId: parent.id, feeId: feeId || null, amount: cleanAmount(amount), method:'mpesa', reference: ref('FEE'), plan: student.subscriptionPlan || 'basic', status:'pending', schoolCode:req.user.schoolCode, paymentType:'fee', currency:'KES', paymentGateway:'daraja', metadata:{ category, term, year, studentName:student.User?.name, destinationType:'SCHOOL', phone }
    });
    const stk = await daraja.initiateSTKPush({ phone, amount: payment.amount, accountReference: `FEE${student.id}`, transactionDesc: `${category} - ${student.User?.name || 'Student'}`, metadata:{ paymentId: payment.id, reference: payment.reference } });
    await payment.update({ transactionId: stk.CheckoutRequestID || payment.transactionId, gatewayResponse: stk, metadata:{ ...payment.metadata, merchantRequestId: stk.MerchantRequestID, checkoutRequestId: stk.CheckoutRequestID } });
    res.json({ success:true, message:'M-PESA prompt sent. Complete payment on the phone.', data:{ payment:publicPayment(payment), stk:{ MerchantRequestID:stk.MerchantRequestID, CheckoutRequestID:stk.CheckoutRequestID, ResponseCode:stk.ResponseCode, ResponseDescription:stk.ResponseDescription, CustomerMessage:stk.CustomerMessage, environment:stk.environment } } });
  } catch(error){ console.error('Parent fee STK error:', error); res.status(500).json({ success:false, message:error.message }); }
};

exports.parentSubscriptionSTK = async (req, res) => {
  try {
    const { studentId, plan='basic', amount, phone } = req.body;
    const prices = { basic:150, premium:300, ultimate:800 };
    const parent = await Parent.findOne({ where: { userId:req.user.id } });
    if (!parent) return res.status(404).json({ success:false, message:'Parent profile not found' });
    const student = await Student.findByPk(studentId, { include:[{ model:User, attributes:['id','name'] }] });
    if (!student || !(await parent.hasStudent(student))) return res.status(403).json({ success:false, message:'Not your child' });
    const payAmount = cleanAmount(amount || prices[plan] || prices.basic);
    const payment = await Payment.create({ studentId:student.id, parentId:parent.id, amount:payAmount, method:'mpesa', reference:ref('SUB'), plan:['basic','premium','ultimate'].includes(plan)?plan:'basic', status:'pending', schoolCode:req.user.schoolCode, paymentType:'subscription', currency:'KES', paymentGateway:'daraja', metadata:{ plan, destinationType:'PLATFORM', studentName:student.User?.name, phone } });
    const stk = await daraja.initiateSTKPush({ phone, amount:payment.amount, accountReference:`SUB${student.id}`, transactionDesc:`Shule AI ${plan} subscription`, metadata:{ paymentId:payment.id, reference:payment.reference } });
    await payment.update({ transactionId: stk.CheckoutRequestID || payment.transactionId, gatewayResponse: stk, metadata:{ ...payment.metadata, merchantRequestId: stk.MerchantRequestID, checkoutRequestId: stk.CheckoutRequestID } });
    res.json({ success:true, message:'M-PESA subscription prompt sent.', data:{ payment:publicPayment(payment), stk:{ MerchantRequestID:stk.MerchantRequestID, CheckoutRequestID:stk.CheckoutRequestID, ResponseCode:stk.ResponseCode, ResponseDescription:stk.ResponseDescription, CustomerMessage:stk.CustomerMessage, environment:stk.environment } } });
  } catch(error){ console.error('Parent subscription STK error:', error); res.status(500).json({ success:false, message:error.message }); }
};

exports.adminNameChangePaymentSTK = async (req, res) => {
  try {
    const { newName, reason, phone, amount=500 } = req.body;
    if (!newName) return res.status(400).json({ success:false, message:'New school name is required' });
    const school = await School.findOne({ where: { schoolId:req.user.schoolCode } });
    if (!school) return res.status(404).json({ success:false, message:'School not found' });
    const payAmount = cleanAmount(amount, 500);
    const reference = ref('NAME');
    const stk = await daraja.initiateSTKPush({ phone, amount: payAmount, accountReference:'NAMECHANGE', transactionDesc:`School name change - ${school.name}`, metadata:{ schoolCode:req.user.schoolCode, newName, reason, reference } });
    res.json({ success:true, message:'M-PESA prompt sent. Submit the request after payment is completed.', data:{ reference, schoolCode:req.user.schoolCode, currentName:school.name, newName, amount:payAmount, checkoutRequestId:stk.CheckoutRequestID, merchantRequestId:stk.MerchantRequestID, responseDescription:stk.ResponseDescription, customerMessage:stk.CustomerMessage, environment:stk.environment } });
  } catch(error){ console.error('Name change payment error:', error); res.status(500).json({ success:false, message:error.message }); }
};

exports.genericPlatformSTK = async (req, res) => {
  try {
    const { phone, amount, accountReference='SHULEAI', description='Shule AI payment', metadata={} } = req.body;
    const stk = await daraja.initiateSTKPush({ phone, amount: cleanAmount(amount), accountReference, transactionDesc: description, metadata:{ ...metadata, userId:req.user.id, role:req.user.role, schoolCode:req.user.schoolCode } });
    res.json({ success:true, message:'M-PESA prompt sent.', data:{ checkoutRequestId:stk.CheckoutRequestID, merchantRequestId:stk.MerchantRequestID, responseDescription:stk.ResponseDescription, customerMessage:stk.CustomerMessage, environment:stk.environment } });
  } catch(error){ res.status(500).json({ success:false, message:error.message }); }
};

exports.queryStatus = async (req, res) => {
  try { const data = await daraja.querySTKStatus(req.params.checkoutRequestId); res.json({ success:true, data }); }
  catch(error){ res.status(500).json({ success:false, message:error.message }); }
};

exports.darajaCallback = async (req, res) => {
  try {
    const parsed = daraja.parseCallback(req.body);
    const payment = parsed.checkoutRequestId ? await Payment.findOne({ where: { transactionId: parsed.checkoutRequestId } }) : null;
    if (payment) {
      const success = Number(parsed.resultCode) === 0;
      await payment.update({
        status: success ? 'completed' : 'failed',
        completedAt: success ? new Date() : payment.completedAt,
        gatewayResponse: parsed.raw,
        notes: parsed.resultDesc || payment.notes,
        metadata: { ...(payment.metadata || {}), darajaCallback: parsed, mpesaReceiptNumber: parsed.mpesaReceiptNumber, phoneNumber: parsed.phoneNumber }
      });
      if (success && payment.feeId) {
        const fee = await Fee.findByPk(payment.feeId);
        if (fee) {
          const paidAmount = Number(fee.paidAmount || 0) + Number(payment.amount || 0);
          const status = paidAmount >= Number(fee.totalAmount || 0) ? 'paid' : 'partial';
          const payments = Array.isArray(fee.payments) ? fee.payments : [];
          payments.push({ paymentId:payment.id, amount:payment.amount, reference:payment.reference, receipt:parsed.mpesaReceiptNumber, paidAt:new Date().toISOString() });
          await fee.update({ paidAmount, status, payments });
        }
      }
      if (success && payment.paymentType === 'subscription') {
        const student = await Student.findByPk(payment.studentId);
        if (student) await student.upgradeSubscription(payment.plan, payment.amount);
      }
    }
    res.json({ ResultCode: 0, ResultDesc: 'Accepted' });
  } catch(error){ console.error('Daraja callback error:', error); res.json({ ResultCode: 0, ResultDesc:'Accepted with internal logging error' }); }
};
