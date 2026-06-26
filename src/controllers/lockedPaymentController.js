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

exports.initiatePayment = async (req, res) => {
  try {
    const payment = await engine.initiatePayment({ user: req.user, body: req.body });
    const data = {
      paymentId: payment.id,
      reference: payment.reference,
      paymentType: payment.paymentType,
      destination: payment.paidTo || payment.paymentDestination,
      provider: payment.paymentGateway,
      status: payment.status,
      promptStatus: payment.promptStatus,
      promptType: payment.promptType,
      checkoutUrl: payment.checkoutUrl,
      amount: payment.amount,
      currency: payment.currency,
      message: payment.metadata?.promptMessage || (payment.status === 'pending_provider_error' ? payment.notes : 'Payment created. Complete the prompt/checkout; balances update only after provider confirmation.')
    };
    const code = payment.status === 'pending_provider_error' ? 202 : 200;
    res.status(code).json({ success: true, message: data.message, data });
  } catch (error) { res.status(400).json({ success: false, message: error.message }); }
};

exports.webhook = async (req, res) => {
  try {
    const payload = { ...(req.query || {}), ...(req.body || {}) };
    const result = await engine.handleWebhook({ provider: req.params.provider, payload, headers: req.headers });
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

exports.getParentPaymentMethods = async (req, res) => {
  try {
    const data = await engine.getSettings({ scope: 'school', schoolCode: req.user.schoolCode });
    res.json({ success: true, data: { defaultProvider: data.defaultProvider, enabledProviders: data.enabledProviders, methods: data.publicMethods } });
  } catch (error) { res.status(400).json({ success: false, message: error.message }); }
};
