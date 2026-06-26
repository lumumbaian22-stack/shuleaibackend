const https = require('https');
const crypto = require('crypto');
const { Op } = require('sequelize');
const { sequelize, Payment, PaymentEvent, Fee, Student, Parent, User, SchoolPaymentSetting, PlatformPaymentSetting, SubscriptionPayment, Subscription, SubscriptionPlan } = require('../models');
const financeLedger = require('./financeLedgerService');
const daraja = require('./darajaService');
const vault = require('./paymentVaultService');
const realtimeSync = require('./realtimeSyncService');
const financialSystem = require('./financialSystemService');

const PROVIDERS = ['manual','bank','cash','card','daraja','paystack','flutterwave','pesapal','stripe'];
const SCHOOL_FEE = 'school_fee';
const PLATFORM = 'platform';
const FINAL_PAID = ['paid','completed','success','successful','approved'];
const FINAL_FAILED = ['failed','cancelled','canceled','expired','abandoned','reversed'];

function cleanAmount(v) {
  const n = Math.round(Number(v));
  if (!Number.isFinite(n) || n < 1) throw new Error('Payment amount must be at least 1');
  return n;
}

function normalizeProvider(v) {
  const p = String(v || '').trim().toLowerCase().replace(/\s+/g, '_');
  if (!p) return '';
  if (p === 'mpesa' || p === 'mpesa_stk') return 'daraja';
  if (!PROVIDERS.includes(p)) throw new Error(`Unsupported payment provider: ${v}`);
  return p;
}

function normalizePaymentType(v) {
  const t = String(v || '').trim().toLowerCase();
  if (['fee','school_fee','school-fee','fees'].includes(t)) return SCHOOL_FEE;
  if (['platform','subscription','name_change','sms_bundle','ai_package'].includes(t)) return PLATFORM;
  return t || SCHOOL_FEE;
}

function ref(prefix) {
  return `${prefix}-${Date.now()}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
}

function publicUrl(path) {
  const base = process.env.PUBLIC_API_BASE_URL || process.env.BACKEND_PUBLIC_URL || process.env.RENDER_EXTERNAL_URL || '';
  return base ? String(base).replace(/\/$/, '') + path : path;
}

function pesapalEndpoint(config = {}) {
  const explicit = config.apiBaseUrl || config.baseUrl || config.endpoint || '';
  if (explicit) {
    try {
      const u = new URL(String(explicit));
      return { hostname: u.hostname, pathBase: (u.pathname || '').replace(/\/$/, '') || (u.hostname.includes('cybqa') ? '/pesapalv3/api' : '/v3/api') };
    } catch (_) {}
  }
  const env = String(config.environment || config.mode || process.env.PESAPAL_ENV || '').toLowerCase();
  const sandbox = env.includes('sandbox') || env.includes('test') || env.includes('demo');
  return sandbox ? { hostname: 'cybqa.pesapal.com', pathBase: '/pesapalv3/api' } : { hostname: 'pay.pesapal.com', pathBase: '/v3/api' };
}

function pesapalNameParts(name = '') {
  const parts = String(name || 'ShuleAI payer').trim().split(/\s+/).filter(Boolean);
  return { firstName: parts[0] || 'ShuleAI', lastName: parts.slice(1).join(' ') || 'Payer' };
}

async function createPesapalCheckout({ payment, phone, email, name, config }) {
  const consumerKey = config.consumerKey || config.consumer_key || process.env.PESAPAL_CONSUMER_KEY;
  const consumerSecret = config.consumerSecret || config.consumer_secret || process.env.PESAPAL_CONSUMER_SECRET;
  const notificationId = config.ipnId || config.notificationId || config.notification_id || process.env.PESAPAL_IPN_ID;
  if ((!consumerKey || !consumerSecret || !notificationId) && config.checkoutUrl) {
    return { status: 'prompt_sent', promptType: 'checkout_url', checkoutUrl: config.checkoutUrl, providerReference: payment.reference, gatewayResponse: { mode: 'static_checkout_url' }, message: 'Open Pesapal checkout.' };
  }
  if (!consumerKey || !consumerSecret) throw new Error('Pesapal consumer key and consumer secret are required');
  if (!notificationId) throw new Error('Pesapal IPN ID is required');
  const endpoint = pesapalEndpoint(config);
  const tokenData = await requestJson({ hostname: endpoint.hostname, path: endpoint.pathBase + '/Auth/RequestToken', headers: { Accept: 'application/json' }, body: { consumer_key: consumerKey, consumer_secret: consumerSecret } });
  const token = tokenData?.token || tokenData?.data?.token;
  if (!token) throw new Error(tokenData?.error?.message || tokenData?.message || 'Pesapal did not return an access token');
  const payer = pesapalNameParts(name);
  const callbackUrl = config.callbackUrl || config.returnUrl || publicUrl('/payment-return.html');
  const order = {
    id: payment.reference,
    currency: payment.currency || 'KES',
    amount: cleanAmount(payment.amount),
    description: payment.paymentType === SCHOOL_FEE ? 'School fees' : 'ShuleAI platform payment',
    callback_url: callbackUrl,
    notification_id: notificationId,
    billing_address: {
      email_address: email || config.fallbackEmail || 'payments@shuleai.local',
      phone_number: phone || config.fallbackPhone || '',
      country_code: config.countryCode || 'KE',
      first_name: payer.firstName,
      last_name: payer.lastName
    }
  };
  const checkout = await requestJson({ hostname: endpoint.hostname, path: endpoint.pathBase + '/Transactions/SubmitOrderRequest', headers: { Accept: 'application/json', Authorization: 'Bearer ' + token }, body: order });
  const checkoutUrl = checkout?.redirect_url || checkout?.redirectUrl || checkout?.data?.redirect_url;
  const providerReference = checkout?.order_tracking_id || checkout?.OrderTrackingId || checkout?.data?.order_tracking_id || payment.reference;
  if (!checkoutUrl) throw new Error(checkout?.error?.message || checkout?.message || 'Pesapal did not return a checkout URL');
  return { status: 'prompt_sent', promptType: 'checkout_url', checkoutUrl, providerReference, gatewayResponse: checkout, message: 'Open Pesapal checkout to complete payment.' };
}

function requestJson({ method = 'POST', hostname, path, headers = {}, body = {} }) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body || {});
    const req = https.request({ method, hostname, path, headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload), ...headers } }, res => {
      let raw = '';
      res.on('data', chunk => raw += chunk);
      res.on('end', () => {
        let data = raw;
        try { data = raw ? JSON.parse(raw) : {}; } catch (_) {}
        if (res.statusCode >= 400) return reject(new Error(typeof data === 'object' ? (data.message || data.error || JSON.stringify(data)) : raw));
        resolve(data);
      });
    });
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

function decryptProvider(provider = {}) {
  const out = { ...provider };
  Object.keys(out).forEach(k => {
    if (/secret|key|pass|token/i.test(k) && typeof out[k] === 'string') out[k] = vault.decrypt(out[k]);
  });
  return out;
}

async function getSchoolRow(schoolCode) {
  let row = await SchoolPaymentSetting.findOne({ where: { schoolCode } }).catch(() => null);
  if (!row) row = await SchoolPaymentSetting.create({ schoolCode, paymentMode: 'manual', metadata: { paymentProviders: {} }, enabledProviders: ['manual'] });
  return row;
}

async function getPlatformRow() {
  let row = await PlatformPaymentSetting.findOne({ order: [['id', 'ASC']] }).catch(() => null);
  if (!row) row = await PlatformPaymentSetting.create({ businessName: 'Shule AI', paymentMode: 'manual', metadata: { paymentProviders: {} }, enabledProviders: ['manual'] });
  return row;
}

function providerMap(row) {
  return row?.metadata?.paymentProviders || {};
}

function enabledList(row) {
  const fromColumn = Array.isArray(row?.enabledProviders) ? row.enabledProviders : [];
  const fromMeta = Array.isArray(row?.metadata?.enabledProviders) ? row.metadata.enabledProviders : [];
  const mapEnabled = Object.entries(providerMap(row)).filter(([,cfg]) => cfg?.enabled).map(([p]) => p);
  return [...new Set([...fromColumn, ...fromMeta, ...mapEnabled, row?.defaultProvider].filter(Boolean).map(normalizeProvider).filter(Boolean))];
}

function publicProviders(row) {
  const map = providerMap(row);
  return Object.fromEntries(Object.entries(map).map(([k,v]) => [k, vault.publicProvider(v)]));
}

async function saveSchoolProviderSettings({ user, schoolCode, body }) {
  if (!schoolCode) throw new Error('School code is required');
  const row = await getSchoolRow(schoolCode);
  const provider = normalizeProvider(body.provider || body.defaultProvider || 'manual');
  const existing = providerMap(row);
  const secretFields = ['secretKey','apiKey','privateKey','consumerSecret','passkey','clientSecret','webhookSecret','encryptionKey','accessToken'];
  const incoming = { ...(body.config || {}), provider, enabled: body.enabled !== false, methods: body.methods || body.config?.methods || [], publicKey: body.publicKey || body.config?.publicKey || undefined, shortcode: body.shortcode || body.config?.shortcode || undefined, callbackUrl: body.callbackUrl || body.config?.callbackUrl || publicUrl(`/api/payments/webhook/${provider}`), updatedBy: user?.id || null, updatedAt: new Date().toISOString() };
  const merged = vault.mergeEncryptedCredentials(existing[provider] || {}, incoming, secretFields);
  const enabled = body.enabled === false ? enabledList(row).filter(p => p !== provider) : [...new Set([...enabledList(row), provider])];
  const metadata = { ...(row.metadata || {}), paymentProviders: { ...existing, [provider]: merged }, enabledProviders: enabled, auditTrail: [...(row.metadata?.auditTrail || []), { action: 'provider_saved', provider, actorUserId: user?.id || null, at: new Date().toISOString() }] };
  await row.update({ metadata, enabledProviders: enabled, defaultProvider: body.isDefault === false ? row.defaultProvider : provider, paymentMode: enabled.includes('daraja') && enabled.length > 1 ? 'mixed' : (provider === 'daraja' ? 'daraja' : row.paymentMode || 'mixed') });
  await financialSystem.auditProviderCredentials({ schoolCode, scope: 'school', provider, action: body.enabled === false ? 'provider_disabled_or_saved' : 'provider_saved', actorUserId: user?.id || null, changedFields: Object.keys(body.config || body || {}).filter(k => !/secret|key|pass|token/i.test(k)), metadata: { finalLock: 'v200', credentialsEncrypted: true } });
  return serializeSettings(row.reload ? await row.reload() : row);
}


async function savePlatformProviderSettings({ user, body }) {
  const row = await getPlatformRow();
  const provider = normalizeProvider(body.provider || body.defaultProvider || 'manual');
  const existing = providerMap(row);
  const secretFields = ['secretKey','apiKey','privateKey','consumerSecret','passkey','clientSecret','webhookSecret','encryptionKey','accessToken'];
  const incoming = {
    ...(body.config || {}),
    provider,
    enabled: body.enabled !== false,
    methods: body.methods || body.config?.methods || [],
    publicKey: body.publicKey || body.config?.publicKey || undefined,
    shortcode: body.shortcode || body.config?.shortcode || undefined,
    callbackUrl: body.callbackUrl || body.config?.callbackUrl || publicUrl(`/api/payments/webhook/${provider}`),
    updatedBy: user?.id || null,
    updatedAt: new Date().toISOString()
  };
  const merged = vault.mergeEncryptedCredentials(existing[provider] || {}, incoming, secretFields);
  const enabled = body.enabled === false ? enabledList(row).filter(p => p !== provider) : [...new Set([...enabledList(row), provider])];
  const metadata = {
    ...(row.metadata || {}),
    paymentProviders: { ...existing, [provider]: merged },
    enabledProviders: enabled,
    auditTrail: [...(row.metadata?.auditTrail || []), { action: 'platform_provider_saved', provider, actorUserId: user?.id || null, at: new Date().toISOString() }]
  };
  await row.update({
    metadata,
    enabledProviders: enabled,
    defaultProvider: body.isDefault === false ? row.defaultProvider : provider,
    paymentMode: enabled.includes('daraja') && enabled.length > 1 ? 'mixed' : (provider === 'daraja' ? 'daraja' : row.paymentMode || 'mixed')
  });
  await financialSystem.auditProviderCredentials({ schoolCode: 'platform', scope: 'platform', provider, action: body.enabled === false ? 'provider_disabled_or_saved' : 'provider_saved', actorUserId: user?.id || null, changedFields: Object.keys(body.config || body || {}).filter(k => !/secret|key|pass|token/i.test(k)), metadata: { finalLock: 'v200_full', credentialsEncrypted: true } });
  return serializeSettings(row.reload ? await row.reload() : row);
}

async function getSettings({ scope, schoolCode }) {
  return serializeSettings(scope === 'platform' ? await getPlatformRow() : await getSchoolRow(schoolCode));
}

function serializeSettings(row) {
  return { id: row.id, schoolCode: row.schoolCode || null, defaultProvider: row.defaultProvider || row.metadata?.defaultProvider || enabledList(row)[0] || 'manual', enabledProviders: enabledList(row), paymentMode: row.paymentMode, providers: publicProviders(row), publicMethods: enabledList(row).map(p => ({ provider: p, label: providerLabel(p), prompt: providerPromptType(p) })) };
}

function providerLabel(p) {
  return ({ manual:'Manual verification', bank:'Bank transfer', cash:'Cash office payment', card:'Card/POS', daraja:'M-Pesa STK Push', paystack:'Paystack checkout', flutterwave:'Flutterwave checkout', pesapal:'Pesapal checkout', stripe:'Stripe checkout' })[p] || p;
}
function providerPromptType(p) { return ['paystack','flutterwave','pesapal','stripe'].includes(p) ? 'checkout_url' : (p === 'daraja' ? 'phone_prompt' : 'manual_instructions'); }

async function getProviderConfig({ paymentType, schoolCode, provider }) {
  const row = paymentType === PLATFORM ? await getPlatformRow() : await getSchoolRow(schoolCode);
  const map = providerMap(row);
  const cfg = decryptProvider(map[provider] || {});
  if (provider === 'daraja') {
    return { ...cfg, consumerKey: cfg.consumerKey || row.darajaConsumerKey, consumerSecret: cfg.consumerSecret || row.darajaConsumerSecret, passkey: cfg.passkey || row.darajaPasskey, shortcode: cfg.shortcode || row.darajaShortcode, callbackUrl: cfg.callbackUrl || row.callbackUrl || publicUrl('/api/payments/daraja/callback'), mode: cfg.environment || row.darajaEnvironment || process.env.DARAJA_ENV || 'sandbox' };
  }
  return cfg;
}

async function createProviderPrompt({ provider, payment, phone, email, name, config }) {
  const callbackUrl = publicUrl(`/api/payments/webhook/${provider}`);
  const amount = cleanAmount(payment.amount);
  const currency = payment.currency || 'KES';
  const reference = payment.reference;

  if (provider === 'manual' || provider === 'bank' || provider === 'cash' || provider === 'card') {
    return { status: 'prompt_sent', promptType: 'manual_instructions', checkoutUrl: null, providerReference: reference, message: 'Payment instructions shown. Balance updates after school verification.' };
  }

  if (provider === 'daraja') {
    if (!phone) throw new Error('Phone number is required for M-Pesa STK prompt');
    const stk = await daraja.initiateSTKPush({ phone, amount, accountReference: payment.accountReference || reference, transactionDesc: payment.paymentType === SCHOOL_FEE ? 'School fees' : 'Shule AI platform payment', callbackUrl: config.callbackUrl || publicUrl('/api/payments/daraja/callback'), credentials: config, metadata: { reference, paymentId: payment.id, paymentType: payment.paymentType, schoolCode: payment.schoolCode } });
    return { status: 'prompt_sent', promptType: 'phone_prompt', checkoutUrl: null, providerReference: stk.CheckoutRequestID, checkoutRequestId: stk.CheckoutRequestID, merchantRequestId: stk.MerchantRequestID, gatewayResponse: stk, message: stk.CustomerMessage || 'M-Pesa prompt sent.' };
  }

  if (provider === 'paystack') {
    if (!config.secretKey) throw new Error('Paystack secret key is not configured for this payment destination');
    const data = await requestJson({ hostname: 'api.paystack.co', path: '/transaction/initialize', headers: { Authorization: `Bearer ${config.secretKey}` }, body: { email: email || config.fallbackEmail || 'payments@shuleai.local', amount: amount * 100, currency, reference, callback_url: config.returnUrl || publicUrl('/payment-return.html'), metadata: { paymentId: payment.id, paymentType: payment.paymentType, schoolCode: payment.schoolCode } } });
    return { status: 'prompt_sent', promptType: 'checkout_url', checkoutUrl: data?.data?.authorization_url, providerReference: data?.data?.reference || reference, gatewayResponse: data, message: 'Open checkout to complete payment.' };
  }

  if (provider === 'flutterwave') {
    if (!config.secretKey) throw new Error('Flutterwave secret key is not configured for this payment destination');
    const data = await requestJson({ hostname: 'api.flutterwave.com', path: '/v3/payments', headers: { Authorization: `Bearer ${config.secretKey}` }, body: { tx_ref: reference, amount, currency, redirect_url: config.returnUrl || publicUrl('/payment-return.html'), customer: { email: email || config.fallbackEmail || 'payments@shuleai.local', phonenumber: phone || '', name: name || 'ShuleAI payer' }, customizations: { title: config.title || 'ShuleAI Payment' }, meta: { paymentId: payment.id, paymentType: payment.paymentType, schoolCode: payment.schoolCode } } });
    return { status: 'prompt_sent', promptType: 'checkout_url', checkoutUrl: data?.data?.link, providerReference: data?.data?.id ? String(data.data.id) : reference, gatewayResponse: data, message: 'Open checkout to complete payment.' };
  }

  if (provider === 'stripe') {
    if (!config.secretKey) throw new Error('Stripe secret key is not configured for this payment destination');
    const body = new URLSearchParams();
    body.set('mode','payment'); body.set('success_url', config.successUrl || publicUrl('/payment-success.html')); body.set('cancel_url', config.cancelUrl || publicUrl('/payment-cancelled.html'));
    body.set('client_reference_id', reference); body.set('line_items[0][price_data][currency]', String(currency).toLowerCase()); body.set('line_items[0][price_data][product_data][name]', payment.paymentType === SCHOOL_FEE ? 'School fees' : 'ShuleAI platform payment'); body.set('line_items[0][price_data][unit_amount]', String(amount * 100)); body.set('line_items[0][quantity]', '1'); body.set('metadata[paymentId]', String(payment.id)); body.set('metadata[reference]', reference);
    const data = await new Promise((resolve, reject) => {
      const payload = body.toString(); const req = https.request({ method:'POST', hostname:'api.stripe.com', path:'/v1/checkout/sessions', headers:{ Authorization:`Bearer ${config.secretKey}`, 'Content-Type':'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(payload) } }, res => { let raw=''; res.on('data',c=>raw+=c); res.on('end',()=>{ let json={}; try{json=JSON.parse(raw)}catch(_){}; if(res.statusCode>=400) return reject(new Error(json.error?.message || raw)); resolve(json); }); }); req.on('error',reject); req.write(payload); req.end();
    });
    return { status: 'prompt_sent', promptType: 'checkout_url', checkoutUrl: data.url, providerReference: data.id, gatewayResponse: data, message: 'Open checkout to complete payment.' };
  }

  if (provider === 'pesapal') {
    return createPesapalCheckout({ payment, phone, email, name, config });
  }
}

async function initiatePayment({ user, body }) {
  const paymentType = normalizePaymentType(body.paymentType || body.type);
  const provider = normalizeProvider(body.provider || 'manual');
  const amount = cleanAmount(body.amount);
  const currency = body.currency || 'KES';
  const phone = body.phone || body.payerPhone || user?.phone || '';
  let student = null, parent = null, fee = null, schoolCode = body.schoolCode || user?.schoolCode || 'platform';

  return sequelize.transaction(async (transaction) => {
    if (paymentType === SCHOOL_FEE) {
      if (!body.studentId || !body.feeId) throw new Error('studentId and feeId are required for school fee payments');
      schoolCode = user?.schoolCode || body.schoolCode;
      if (user?.role === 'parent') {
        ({ parent, student } = await financeLedger.assertParentOwnsStudent({ parentUserId: user.id, studentId: body.studentId, schoolCode, transaction }));
      } else {
        student = await financeLedger.findStudentInSchool({ schoolCode, studentId: body.studentId, transaction });
      }
      fee = await Fee.findOne({ where: { id: body.feeId, studentId: student.id, schoolCode }, transaction });
      if (!fee) throw new Error('Fee account not found for this student');
      var invoice = await financialSystem.ensureInvoiceForFee({ feeId: fee.id, transaction });
      const balance = invoice ? Number(invoice.balanceAmount || 0) : Math.max(0, Number(fee.totalAmount || 0) - Number((fee.parentPaidAmount ?? fee.paidAmount) || 0) - Number(fee.creditAmount || 0));
      if (amount > balance && body.allowOverpay !== true) throw new Error(`Amount exceeds outstanding balance. Balance is ${balance}`);
    }

    const reference = String(body.reference || ref(paymentType === SCHOOL_FEE ? 'FEE' : 'PLATFORM')).toUpperCase();
    const duplicate = await Payment.findOne({ where: { reference }, transaction });
    if (duplicate) return duplicate;

    const payment = await Payment.create({
      schoolCode, studentId: student?.id || body.studentId || null, parentId: parent?.id || body.parentId || null, feeId: fee?.id || body.feeId || null,
      amount, currency, reference, method: provider, paymentGateway: provider, paymentType, paymentDestination: paymentType === SCHOOL_FEE ? 'school' : 'platform', paidTo: paymentType === SCHOOL_FEE ? 'school' : 'platform',
      accountReference: body.accountReference || student?.elimuid || student?.admissionNumber || reference,
      status: 'pending', promptStatus: 'created', transactionType: paymentType === SCHOOL_FEE ? 'payment' : (body.platformPurpose || 'subscription'), source: user?.role || 'system', payerPhone: phone || null,
      metadata: { purpose: body.purpose || body.platformPurpose || paymentType, studentName: student?.User?.name || null, feeId: fee?.id || null, initiatedBy: user?.id || null },
      auditTrail: [{ action: 'payment_created_before_provider_call', actorUserId: user?.id || null, actorRole: user?.role || null, at: new Date().toISOString(), provider, paymentType }],
      expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24)
    }, { transaction });

    await financialSystem.mirrorLegacyPayment({ payment, invoiceId: typeof invoice !== 'undefined' ? invoice?.id || null : null, transaction });

    try {
      const config = await getProviderConfig({ paymentType, schoolCode, provider });
      const prompt = await createProviderPrompt({ provider, payment, phone, email: user?.email || body.email, name: user?.name || body.name, config });
      await payment.update({ promptStatus: prompt.status, promptType: prompt.promptType, checkoutUrl: prompt.checkoutUrl || null, providerReference: prompt.providerReference || null, transactionId: prompt.checkoutRequestId || prompt.providerReference || payment.transactionId, checkoutRequestId: prompt.checkoutRequestId || payment.checkoutRequestId, merchantRequestId: prompt.merchantRequestId || payment.merchantRequestId, gatewayResponse: prompt.gatewayResponse || {}, metadata: { ...(payment.metadata || {}), promptMessage: prompt.message } }, { transaction });
      await financialSystem.mirrorLegacyPayment({ payment: await payment.reload({ transaction }), invoiceId: typeof invoice !== 'undefined' ? invoice?.id || null : null, transaction });
      return payment.reload({ transaction });
    } catch (error) {
      await payment.update({ status: 'pending_provider_error', promptStatus: 'provider_error', providerStatus: 'provider_error', notes: error.message, metadata: { ...(payment.metadata || {}), providerError: error.message } }, { transaction });
      await financialSystem.mirrorLegacyPayment({ payment: await payment.reload({ transaction }), invoiceId: typeof invoice !== 'undefined' ? invoice?.id || null : null, transaction });
      return payment.reload({ transaction });
    }
  });
}

function normalizeProviderStatus(provider, payload = {}) {
  let status = payload.status || payload.event || payload.data?.status || payload.data?.attributes?.status || '';
  if (provider === 'paystack') status = payload.data?.status || payload.event;
  if (provider === 'flutterwave') status = payload.status || payload.data?.status || payload.event;
  if (provider === 'stripe') status = payload.type === 'checkout.session.completed' ? 'paid' : (payload.data?.object?.payment_status || payload.data?.object?.status);
  status = String(status || '').toLowerCase();
  if (FINAL_PAID.includes(status) || status.includes('charge.success') || status.includes('checkout.session.completed')) return 'paid';
  if (FINAL_FAILED.includes(status)) return 'failed';
  return 'pending';
}

function extractWebhook(provider, payload = {}) {
  if (provider === 'paystack') return { reference: payload.data?.reference, providerReference: payload.data?.reference, amount: payload.data?.amount ? Math.round(Number(payload.data.amount) / 100) : null, currency: payload.data?.currency, eventId: payload.data?.id ? String(payload.data.id) : payload.event };
  if (provider === 'flutterwave') return { reference: payload.tx_ref || payload.data?.tx_ref, providerReference: payload.transaction_id || payload.data?.id || payload.data?.flw_ref, amount: payload.amount || payload.data?.amount, currency: payload.currency || payload.data?.currency, eventId: payload.id || payload.data?.id || payload.event };
  if (provider === 'stripe') return { reference: payload.data?.object?.client_reference_id || payload.data?.object?.metadata?.reference, providerReference: payload.data?.object?.id, amount: payload.data?.object?.amount_total ? Math.round(Number(payload.data.object.amount_total) / 100) : null, currency: String(payload.data?.object?.currency || '').toUpperCase(), eventId: payload.id };
  if (provider === 'pesapal') return { reference: payload.OrderMerchantReference || payload.order_merchant_reference || payload.merchant_reference || payload.reference, providerReference: payload.OrderTrackingId || payload.order_tracking_id || payload.providerReference, amount: payload.amount || payload.Amount, currency: payload.currency || payload.Currency || 'KES', eventId: payload.OrderTrackingId || payload.order_tracking_id || payload.eventId };
  return { reference: payload.reference || payload.internalReference || payload.CheckoutRequestID, providerReference: payload.providerReference || payload.CheckoutRequestID, amount: payload.amount, currency: payload.currency || 'KES', eventId: payload.id || payload.eventId || payload.CheckoutRequestID };
}

async function processConfirmedPayment({ payment, status, provider, providerReference, amount, currency, rawPayload, event }) {
  const beforeStatus = payment.status;
  const paid = status === 'paid';
  const failed = status === 'failed';
  if ((paid && FINAL_PAID.includes(String(beforeStatus).toLowerCase())) || (failed && FINAL_FAILED.includes(String(beforeStatus).toLowerCase()))) return payment;

  await sequelize.transaction(async (transaction) => {
    const locked = await Payment.findByPk(payment.id, { transaction, lock: transaction.LOCK.UPDATE });
    if (!locked) throw new Error('Payment disappeared during processing');
    const trail = Array.isArray(locked.auditTrail) ? locked.auditTrail : [];
    trail.push({ action: paid ? 'provider_confirmed_paid' : (failed ? 'provider_confirmed_failed' : 'provider_pending'), provider, at: new Date().toISOString(), providerReference, amount });
    await locked.update({
      status: paid ? 'completed' : (failed ? 'failed' : 'processing'),
      providerStatus: status,
      providerReference: providerReference || locked.providerReference,
      confirmedAmount: amount ? cleanAmount(amount) : locked.confirmedAmount,
      confirmedCurrency: currency || locked.confirmedCurrency,
      completedAt: paid ? new Date() : locked.completedAt,
      paymentDate: paid ? new Date() : locked.paymentDate,
      failedAt: failed ? new Date() : locked.failedAt,
      reconciledAt: paid || failed ? new Date() : locked.reconciledAt,
      reconciliationStatus: paid || failed ? 'reconciled' : 'pending',
      receiptNumber: providerReference || locked.receiptNumber,
      gatewayResponse: rawPayload || locked.gatewayResponse,
      auditTrail: trail,
      metadata: { ...(locked.metadata || {}), lastProviderPayload: rawPayload || {} }
    }, { transaction });

    await financialSystem.finalizeConfirmedPayment({ legacyPayment: locked, status, provider, providerReference, amount, currency, rawPayload, event, transaction });
    if (paid && locked.paymentType === SCHOOL_FEE && locked.feeId) await financeLedger.recalculateFeeAccount(locked.feeId, { transaction }).catch(() => null);
    if (event) await event.update({ processed: true, paymentId: locked.id, schoolCode: locked.schoolCode }, { transaction });
  });
  realtimeSync.emitPaymentUpdate(payment.schoolCode, { paymentId: payment.id, studentId: payment.studentId, feeId: payment.feeId, status: status === 'paid' ? 'completed' : status, action: 'payment_provider_confirmation', provider });
  return Payment.findByPk(payment.id);
}

async function handleWebhook({ provider, payload, headers = {} }) {
  provider = normalizeProvider(provider);
  const extracted = extractWebhook(provider, payload);
  const status = normalizeProviderStatus(provider, payload);
  const providerEventId = extracted.eventId ? String(extracted.eventId) : `${provider}:${extracted.reference || extracted.providerReference || Date.now()}`;
  let event = await PaymentEvent.findOne({ where: { provider, providerEventId } }).catch(() => null);
  if (event?.processed) return { accepted: true, duplicate: true };
  if (!event) event = await PaymentEvent.create({ provider, providerEventId, eventType: 'webhook', internalReference: extracted.reference, providerReference: extracted.providerReference, verified: true, rawPayload: payload, metadata: { headers } });

  const payment = await Payment.findOne({ where: { [Op.or]: [{ reference: extracted.reference || '' }, { providerReference: extracted.providerReference || '' }, { transactionId: extracted.providerReference || '' }, { checkoutRequestId: extracted.providerReference || '' }] } });
  if (!payment) { await event.update({ processingError: 'Payment not found yet', processed: false }); return { accepted: true, pending: true }; }
  await processConfirmedPayment({ payment, status, provider, providerReference: extracted.providerReference, amount: extracted.amount, currency: extracted.currency, rawPayload: payload, event });
  return { accepted: true, paymentId: payment.id, status };
}

async function getPaymentStatus({ reference, user }) {
  const where = { reference };
  if (user?.role !== 'super_admin') where.schoolCode = user?.schoolCode;
  const payment = await Payment.findOne({ where });
  if (!payment) throw new Error('Payment not found');
  return { reference: payment.reference, status: payment.status, provider: payment.paymentGateway, paymentType: payment.paymentType, amount: payment.amount, currency: payment.currency, checkoutUrl: payment.checkoutUrl, promptType: payment.promptType, promptStatus: payment.promptStatus, feeId: payment.feeId, studentId: payment.studentId };
}

async function reconcilePayment({ reference, user }) {
  const payment = await Payment.findOne({ where: user?.role === 'super_admin' ? { reference } : { reference, schoolCode: user?.schoolCode } });
  if (!payment) throw new Error('Payment not found');
  if (FINAL_PAID.includes(String(payment.status).toLowerCase())) {
    const invoice = payment.feeId ? await financialSystem.ensureInvoiceForFee({ feeId: payment.feeId }) : null;
    const tx = await financialSystem.mirrorLegacyPayment({ payment, invoiceId: invoice?.id || null });
    if (payment.paymentType === SCHOOL_FEE && invoice) await financialSystem.recalculateInvoice(invoice.id);
    if (payment.paymentType === SCHOOL_FEE && payment.feeId) await financeLedger.recalculateFeeAccount(payment.feeId).catch(() => null);
    await financialSystem.recordReconciliation({ legacyPayment: payment, transactionRow: tx, result: 'already_paid', message: 'Payment was already final; balances recalculated.' });
    return getPaymentStatus({ reference, user });
  }
  // Safe fallback: leave pending unless a real provider status endpoint is added/configured.
  await payment.update({ lastStatusQueryAt: new Date(), reconciliationStatus: 'pending', metadata: { ...(payment.metadata || {}), lastReconcileMessage: 'No confirmed provider status yet; payment left pending safely.' } });
  const tx = await financialSystem.mirrorLegacyPayment({ payment });
  await financialSystem.recordReconciliation({ legacyPayment: payment, transactionRow: tx, result: 'pending', message: 'No confirmed provider status yet; payment left pending safely.' });
  return getPaymentStatus({ reference, user });
}

module.exports = { PROVIDERS, SCHOOL_FEE, PLATFORM, getSettings, saveSchoolProviderSettings, savePlatformProviderSettings, initiatePayment, handleWebhook, getPaymentStatus, reconcilePayment, normalizeProvider, normalizePaymentType };
