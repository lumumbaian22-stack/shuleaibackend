const engine = require('../services/paymentProviderEngine');
const { SchoolPaymentSetting, PlatformPaymentSetting } = require('../models');

function schoolCode(req) {
  return req.user?.role === 'super_admin' ? (req.body?.schoolCode || req.query?.schoolCode || req.user?.schoolCode) : req.user?.schoolCode;
}

exports.getAllowedProviders = async (req, res) => {
  res.json({ success: true, data: { providers: engine.PROVIDERS, paymentTypes: [engine.SCHOOL_FEE, engine.PLATFORM], finalRule: 'Frontend success never updates balances. Only verified webhook/reconciliation updates money records.' } });
};

exports.getSchoolProviderSettings = async (req, res) => {
  try {
    const data = await engine.getSettings({ scope: 'school', schoolCode: schoolCode(req) });
    res.json({ success: true, data });
  } catch (error) { res.status(400).json({ success: false, message: error.message }); }
};

exports.saveSchoolProviderSettings = async (req, res) => {
  try {
    const data = await engine.saveSchoolProviderSettings({ user: req.user, schoolCode: schoolCode(req), body: req.body });
    res.json({ success: true, message: 'School payment provider saved. Private credentials are encrypted and never sent to parents.', data });
  } catch (error) { res.status(400).json({ success: false, message: error.message }); }
};

exports.getPlatformProviderSettings = async (req, res) => {
  try {
    const data = await engine.getSettings({ scope: 'platform' });
    res.json({ success: true, data });
  } catch (error) { res.status(400).json({ success: false, message: error.message }); }
};


exports.savePlatformProviderSettings = async (req, res) => {
  try {
    const data = await engine.savePlatformProviderSettings({ user: req.user, body: req.body });
    res.json({ success: true, message: 'Platform payment provider saved. Private credentials are encrypted and never sent to schools/parents.', data });
  } catch (error) { res.status(400).json({ success: false, message: error.message }); }
};

function paymentResponse(payment) {
  const isParentSchoolFee = payment.paymentType === 'fee' && payment.metadata?.parentInternalPaymentFlow === true;
  const data = {
    paymentId: payment.id,
    reference: payment.reference,
    paymentType: payment.paymentType,
    destination: payment.paidTo || payment.paymentDestination,
    provider: payment.paymentGateway,
    status: payment.status,
    promptStatus: payment.promptStatus,
    promptType: payment.promptType,
    checkoutUrl: isParentSchoolFee ? null : payment.checkoutUrl,
    providerAction: isParentSchoolFee ? (payment.gatewayResponse?.providerAction || payment.gatewayResponse?.parentFlow || 'internal_provider_flow') : undefined,
    amount: payment.amount,
    currency: payment.currency,
    message: payment.metadata?.promptMessage || (payment.status === 'pending_provider_error' ? payment.notes : (isParentSchoolFee ? 'Payment request started through the school active provider. Balance updates only after verified confirmation.' : 'Payment created. Complete the provider prompt/checkout; balances update only after provider confirmation.'))
  };
  return data;
}

exports.initiatePayment = async (req, res) => {
  try {
    const payment = await engine.initiatePayment({ user: req.user, body: req.body });
    const data = paymentResponse(payment);
    const code = payment.status === 'pending_provider_error' ? 202 : 200;
    res.status(code).json({ success: true, message: data.message, data });
  } catch (error) { res.status(error.statusCode || 400).json({ success: false, message: error.message, data: error.data || undefined }); }
};

exports.initiateParentFeePayment = async (req, res) => {
  try {
    const payment = await engine.initiateParentStkPayment({ user: req.user, body: req.body });
    const data = paymentResponse(payment);
    const code = payment.status === 'pending_provider_error' ? 202 : 200;
    res.status(code).json({ success: true, message: data.message, data });
  } catch (error) { res.status(error.statusCode || 400).json({ success: false, message: error.message, data: error.data || undefined }); }
};

exports.webhook = async (req, res) => {
  try {
    const payload = { ...(req.query || {}), ...(req.body || {}) };
    const result = await engine.handleWebhook({ provider: req.params.provider, payload, headers: req.headers, rawBody: req.rawBody, sourceIp: req.ip });
    res.json({ success: true, accepted: true, data: result });
  } catch (error) {
    console.error('Locked payment webhook error:', error);
    // Always acknowledge to prevent provider retry storms. Event is logged when possible.
    res.status(200).json({ success: true, accepted: true, warning: 'Webhook accepted; internal processing logged for reconciliation.' });
  }
};

exports.getPaymentStatus = async (req, res) => {
  try { res.json({ success: true, data: await engine.getPaymentStatus({ reference: req.params.reference, user: req.user }) }); }
  catch (error) { res.status(404).json({ success: false, message: error.message }); }
};

exports.reconcilePayment = async (req, res) => {
  try { res.json({ success: true, message: 'Reconciliation checked. Payment remains safe until provider confirmation exists.', data: await engine.reconcilePayment({ reference: req.params.reference, user: req.user }) }); }
  catch (error) { res.status(404).json({ success: false, message: error.message }); }
};


exports.getSchoolProviderSetupInfo = async (req, res) => {
  try {
    const provider = req.params.provider || req.query.provider;
    const data = await engine.getProviderSetupInfo({ scope: 'school', schoolCode: schoolCode(req), provider });
    res.json({ success: true, data });
  } catch (error) { res.status(400).json({ success: false, message: error.message }); }
};

exports.getPlatformProviderSetupInfo = async (req, res) => {
  try {
    const provider = req.params.provider || req.query.provider;
    const data = await engine.getProviderSetupInfo({ scope: 'platform', provider });
    res.json({ success: true, data });
  } catch (error) { res.status(400).json({ success: false, message: error.message }); }
};

exports.testSchoolProviderStk = async (req, res) => {
  try {
    const provider = req.params.provider || req.body?.provider;
    const data = await engine.testProviderStk({ scope: 'school', schoolCode: schoolCode(req), provider, phone: req.body?.phone, amount: req.body?.amount || 1, user: req.user });
    res.json({ success: true, message: data.message || 'STK test started. This test will not update student balances.', data });
  } catch (error) { res.status(400).json({ success: false, message: error.message }); }
};

exports.testPlatformProviderStk = async (req, res) => {
  try {
    const provider = req.params.provider || req.body?.provider;
    const data = await engine.testProviderStk({ scope: 'platform', provider, phone: req.body?.phone, amount: req.body?.amount || 1, user: req.user });
    res.json({ success: true, message: data.message || 'STK test started. This test will not update balances.', data });
  } catch (error) { res.status(400).json({ success: false, message: error.message }); }
};

exports.getSchoolProviderTestStatus = async (req, res) => {
  try {
    const data = await engine.getProviderTestStatus({ scope: 'school', schoolCode: schoolCode(req), provider: req.params.provider, testId: req.params.testId });
    res.json({ success: true, data });
  } catch (error) { res.status(404).json({ success: false, message: error.message }); }
};

exports.initiateParentStkPayment = async (req, res) => {
  try {
    const payment = await engine.initiateParentStkPayment({ user: req.user, body: req.body });
    const data = paymentResponse(payment);
    const code = payment.status === 'pending_provider_error' ? 202 : 200;
    res.status(code).json({ success: true, message: data.message || 'STK Push sent. Check your phone and enter your M-Pesa PIN.', data });
  } catch (error) { res.status(error.statusCode || 400).json({ success: false, message: error.message, data: error.data || undefined }); }
};

exports.setupSchoolProviderNotifications = async (req, res) => {
  try {
    const provider = req.params.provider || req.body?.provider;
    const result = await engine.setupProviderNotifications({ scope: 'school', schoolCode: schoolCode(req), provider, user: req.user });
    res.json({ success: true, message: result.message, data: result });
  } catch (error) { res.status(400).json({ success: false, message: error.message }); }
};

exports.setupPlatformProviderNotifications = async (req, res) => {
  try {
    const provider = req.params.provider || req.body?.provider;
    const result = await engine.setupProviderNotifications({ scope: 'platform', provider, user: req.user });
    res.json({ success: true, message: result.message, data: result });
  } catch (error) { res.status(400).json({ success: false, message: error.message }); }
};

exports.getParentPaymentMethods = async (req, res) => {
  try {
    const data = await engine.getParentAvailableMethods({ user: req.user, studentId: req.query.studentId || req.query.childId || null });
    res.json({ success: true, data });
  } catch (error) { res.status(400).json({ success: false, message: error.message }); }
};
