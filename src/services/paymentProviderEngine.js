const https = require('https');
const crypto = require('crypto');
const { Op } = require('sequelize');
const { sequelize, Payment, PaymentEvent, Fee, Student, Parent, User, School, SchoolPaymentSetting, PlatformPaymentSetting, SubscriptionPayment, Subscription, SubscriptionPlan } = require('../models');
const financeLedger = require('./financeLedgerService');
const subscriptionController = require('../controllers/subscriptionController');
const daraja = require('./darajaService');
const vault = require('./paymentVaultService');
const realtimeSync = require('./realtimeSyncService');
const financialSystem = require('./financialSystemService');

const PROVIDERS = ['manual','bank','cash','card','mpesa','paystack','flutterwave','pesapal','stripe'];
const PAYMENT_METHODS = ['mobile_money','card','bank','cash','manual'];
const SCHOOL_FEE = 'school_fee';
const PLATFORM = 'platform';
const FINAL_PAID = ['paid','completed','success','successful','approved'];
const FINAL_FAILED = ['failed','cancelled','canceled','expired','abandoned','reversed'];
const SECRET_FIELDS = ['secretKey','apiKey','privateKey','consumerSecret','passkey','clientSecret','webhookSecret','encryptionKey','accessToken'];

function cleanAmount(v) {
  const n = Math.round(Number(v));
  if (!Number.isFinite(n) || n < 1) throw new Error('Payment amount must be at least 1');
  return n;
}

function normalizeProvider(v, options = {}) {
  const allowEmpty = options.allowEmpty === true;
  let p = String(v || '').trim().toLowerCase().replace(/[\s-]+/g, '_');
  if (!p) {
    if (allowEmpty) return '';
    throw new Error('Payment provider is required');
  }
  if (['mpesa','m_pesa','mpesa_stk','stk','safaricom','safaricom_daraja','daraja'].includes(p)) p = 'mpesa';
  if (['manual_mpesa','manual_m_pesa','mpesa_manual','manual_verification'].includes(p)) p = 'manual';
  if (['bank_transfer','bank_deposit'].includes(p)) p = 'bank';
  if (['card_pos','pos'].includes(p)) p = 'card';
  if (!PROVIDERS.includes(p)) throw new Error(`Unsupported payment provider: ${v}`);
  return p;
}

function normalizeProviderIfPossible(v) {
  try { return normalizeProvider(v, { allowEmpty: true }); } catch (_) { return ''; }
}

function normalizePaymentMethod(v, fallback = '') {
  let m = String(v || fallback || '').trim().toLowerCase().replace(/[\s-]+/g, '_');
  if (!m) return '';
  if (['mpesa','m_pesa','mpesa_stk','stk','daraja','mobile','mobile_money','mobile_money_stk'].includes(m)) return 'mobile_money';
  if (['visa','mastercard','card_payment','cards','card_pos','pos','stripe'].includes(m)) return 'card';
  if (['bank_transfer','bank_deposit','paybill_bank'].includes(m)) return 'bank';
  if (['cash_payment','office_cash'].includes(m)) return 'cash';
  if (['manual_mpesa','manual_verification','manual_payment','reference'].includes(m)) return 'manual';
  return PAYMENT_METHODS.includes(m) ? m : '';
}

function normalizePaymentType(v) {
  const t = String(v || '').trim().toLowerCase();
  if (['fee','school_fee','school-fee','fees'].includes(t)) return SCHOOL_FEE;
  if (['platform','subscription','name_change','sms_bundle','ai_package','child_subscription','school_subscription'].includes(t)) return PLATFORM;
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
  if (!schoolCode) throw new Error('School code is required');
  let row = await SchoolPaymentSetting.findOne({ where: { schoolCode } }).catch(() => null);
  if (!row) row = await SchoolPaymentSetting.create({ schoolCode, paymentMode: 'manual', metadata: { paymentProviders: {}, providerLock: 'one_active_provider' }, enabledProviders: [] });
  return row;
}

async function getPlatformRow() {
  let row = await PlatformPaymentSetting.findOne({ order: [['id', 'ASC']] }).catch(() => null);
  if (!row) row = await PlatformPaymentSetting.create({ businessName: 'Shule AI', paymentMode: 'manual', metadata: { paymentProviders: {}, providerLock: 'one_active_provider' }, enabledProviders: [] });
  return row;
}

function providerMap(row) {
  return row?.metadata?.paymentProviders && typeof row.metadata.paymentProviders === 'object' ? row.metadata.paymentProviders : {};
}

function providerConfigFromMap(map = {}, provider = '') {
  return map[provider] || (provider === 'mpesa' ? map.daraja : null) || (provider === 'daraja' ? map.mpesa : null) || {};
}

function rawEnabledProviders(row) {
  const fromColumn = Array.isArray(row?.enabledProviders) ? row.enabledProviders : [];
  const fromMeta = Array.isArray(row?.metadata?.enabledProviders) ? row.metadata.enabledProviders : [];
  const mapEnabled = Object.entries(providerMap(row)).filter(([, cfg]) => cfg?.enabled === true).map(([p]) => p);
  return [...new Set([...fromColumn, ...fromMeta, ...mapEnabled].filter(Boolean).map(v => normalizeProviderIfPossible(v)).filter(Boolean))];
}

function activeProviderFromRow(row) {
  const direct = normalizeProviderIfPossible(row?.defaultProvider || row?.metadata?.defaultProvider || row?.metadata?.activeProvider);
  if (direct) return direct;
  const enabled = rawEnabledProviders(row);
  return enabled[0] || '';
}

function providerDefaultMethods(provider) {
  if (provider === 'mpesa') return ['mobile_money'];
  if (provider === 'stripe') return ['card'];
  if (provider === 'paystack' || provider === 'flutterwave' || provider === 'pesapal') return ['mobile_money', 'card', 'bank'];
  if (provider === 'bank') return ['bank'];
  if (provider === 'cash') return ['cash'];
  if (provider === 'card') return ['card'];
  if (provider === 'manual') return ['mobile_money', 'bank', 'cash', 'card', 'manual'];
  return ['manual'];
}

function sanitizeMethods(methods, provider) {
  const list = Array.isArray(methods) ? methods : (typeof methods === 'string' ? methods.split(',') : []);
  const normalized = list.map(v => normalizePaymentMethod(v)).filter(Boolean);
  const source = normalized.length ? normalized : providerDefaultMethods(provider);
  return [...new Set(source)].filter(m => PAYMENT_METHODS.includes(m));
}

function providerSupportsMethod(provider, method, config = {}) {
  if (!method) return true;
  return sanitizeMethods(config.methods, provider).includes(method);
}

function publicProviders(row) {
  const active = activeProviderFromRow(row);
  const map = providerMap(row);
  return Object.fromEntries(Object.entries(map).map(([k, v]) => {
    const provider = normalizeProviderIfPossible(k) || k;
    return [provider, { ...vault.publicProvider(v), provider, enabled: provider === active }];
  }).filter(Boolean));
}

function providerLabel(p) {
  return ({ manual:'Manual verification', bank:'Bank transfer', cash:'Cash office payment', card:'Card/POS', mpesa:'M-Pesa', paystack:'Paystack', flutterwave:'Flutterwave', pesapal:'PesaPal', stripe:'Stripe' })[p] || p;
}

function methodLabel(m) {
  return ({ mobile_money:'Mobile Money', card:'Card Payments', bank:'Bank Transfer', cash:'Cash at Office', manual:'Manual Reference' })[m] || m;
}

function providerPromptType(p) {
  return ['paystack','flutterwave','pesapal','stripe'].includes(p) ? 'checkout_url' : (p === 'mpesa' ? 'phone_prompt' : 'manual_instructions');
}

function paymentModeForProvider(provider) {
  if (provider === 'mpesa') return 'daraja';
  if (provider === 'bank') return 'bank';
  return 'manual';
}

function serializeSettings(row) {
  const active = activeProviderFromRow(row);
  const map = providerMap(row);
  const activeCfg = active ? providerConfigFromMap(map, active) : {};
  const methods = active ? sanitizeMethods(activeCfg.methods, active).map(method => ({
    method,
    provider: active,
    label: methodLabel(method),
    providerLabel: providerLabel(active),
    prompt: providerPromptType(active),
    description: `${methodLabel(method)} through ${providerLabel(active)}`
  })) : [];
  return {
    id: row.id,
    schoolCode: row.schoolCode || null,
    activeProvider: active || null,
    defaultProvider: active || null,
    enabledProviders: active ? [active] : [],
    disabledProviders: PROVIDERS.filter(p => p !== active),
    paymentMode: row.paymentMode,
    providerSelectionRule: 'one_active_provider_per_scope',
    providers: publicProviders(row),
    publicMethods: methods,
    methods,
    linkingRule: row.metadata?.linkingRule || row.accountReferenceFormat || 'elimuid',
    matchingRules: row.metadata?.matchingRules || { autoMatchElimuId: true, autoMatchInvoiceNumber: true, requireExactAmount: true },
    notifications: row.metadata?.notifications || { parentPaymentReceived: true, financeInvoicePaid: true, paymentFailed: true }
  };
}

function buildIncomingProvider({ provider, body, existingProvider = {}, user }) {
  const incoming = {
    ...(body.config || {}),
    provider,
    enabled: body.enabled === true || body.isDefault === true || body.active === true,
    methods: sanitizeMethods(body.methods || body.config?.methods, provider),
    publicKey: body.publicKey || body.config?.publicKey || undefined,
    shortcode: body.shortcode || body.config?.shortcode || undefined,
    callbackUrl: body.callbackUrl || body.config?.callbackUrl || publicUrl(`/api/payments/webhook/${provider}`),
    updatedBy: user?.id || null,
    updatedAt: new Date().toISOString()
  };
  return vault.mergeEncryptedCredentials(existingProvider || {}, incoming, SECRET_FIELDS);
}

function lockedProviderMap(existing, selectedProvider, selectedConfig, enabled) {
  const next = {};
  for (const provider of PROVIDERS) {
    const current = providerConfigFromMap(existing, provider);
    if (current) next[provider] = { ...current, provider, enabled: false };
  }
  next[selectedProvider] = { ...(next[selectedProvider] || {}), ...(selectedConfig || {}), provider: selectedProvider, enabled: enabled === true };
  if (selectedProvider === 'mpesa') delete next.daraja;
  if (selectedProvider === 'daraja') { next.mpesa = { ...(next.mpesa || {}), ...(next.daraja || {}), provider: 'mpesa', enabled: enabled === true }; delete next.daraja; }
  return next;
}

async function saveSchoolProviderSettings({ user, schoolCode, body }) {
  if (!schoolCode) throw new Error('School code is required');
  const row = await getSchoolRow(schoolCode);
  const provider = normalizeProvider(body.provider || body.defaultProvider || body.activeProvider || 'manual');
  const existing = providerMap(row);
  const enabled = body.enabled === true || body.isDefault === true || body.active === true;
  const merged = buildIncomingProvider({ provider, body: { ...body, enabled }, existingProvider: providerConfigFromMap(existing, provider), user });
  const metadata = {
    ...(row.metadata || {}),
    providerLock: 'one_active_provider',
    activeProvider: enabled ? provider : null,
    defaultProvider: enabled ? provider : null,
    enabledProviders: enabled ? [provider] : [],
    paymentProviders: lockedProviderMap(existing, provider, merged, enabled),
    linkingRule: body.linkingRule || body.studentLinkRule || body.accountReferenceFormat || row.metadata?.linkingRule || row.accountReferenceFormat || 'elimuid',
    matchingRules: body.matchingRules || row.metadata?.matchingRules || { autoMatchElimuId: true, autoMatchInvoiceNumber: true, requireExactAmount: true },
    notifications: body.notifications || row.metadata?.notifications || { parentPaymentReceived: true, financeInvoicePaid: true, paymentFailed: true },
    auditTrail: [...(row.metadata?.auditTrail || []), { action: enabled ? 'provider_activated_exclusive' : 'provider_disabled_exclusive', provider, actorUserId: user?.id || null, at: new Date().toISOString() }]
  };
  await row.update({
    metadata,
    enabledProviders: enabled ? [provider] : [],
    defaultProvider: enabled ? provider : null,
    accountReferenceFormat: metadata.linkingRule,
    paymentMode: enabled ? paymentModeForProvider(provider) : 'manual'
  });
  await financialSystem.auditProviderCredentials({ schoolCode, scope: 'school', provider, action: enabled ? 'provider_activated_exclusive' : 'provider_disabled_exclusive', actorUserId: user?.id || null, changedFields: Object.keys(body.config || body || {}).filter(k => !/secret|key|pass|token/i.test(k)), metadata: { finalLock: 'v200_2_one_active_provider', credentialsEncrypted: true, disabledOtherProviders: true } });
  return serializeSettings(row.reload ? await row.reload() : row);
}

async function savePlatformProviderSettings({ user, body }) {
  const row = await getPlatformRow();
  const provider = normalizeProvider(body.provider || body.defaultProvider || body.activeProvider || 'manual');
  const existing = providerMap(row);
  const enabled = body.enabled === true || body.isDefault === true || body.active === true;
  const merged = buildIncomingProvider({ provider, body: { ...body, enabled }, existingProvider: providerConfigFromMap(existing, provider), user });
  const metadata = {
    ...(row.metadata || {}),
    providerLock: 'one_active_provider',
    activeProvider: enabled ? provider : null,
    defaultProvider: enabled ? provider : null,
    enabledProviders: enabled ? [provider] : [],
    paymentProviders: lockedProviderMap(existing, provider, merged, enabled),
    notifications: body.notifications || row.metadata?.notifications || { platformPaymentReceived: true, paymentFailed: true },
    auditTrail: [...(row.metadata?.auditTrail || []), { action: enabled ? 'platform_provider_activated_exclusive' : 'platform_provider_disabled_exclusive', provider, actorUserId: user?.id || null, at: new Date().toISOString() }]
  };
  await row.update({ metadata, enabledProviders: enabled ? [provider] : [], defaultProvider: enabled ? provider : null, paymentMode: enabled ? paymentModeForProvider(provider) : 'manual' });
  await financialSystem.auditProviderCredentials({ schoolCode: 'platform', scope: 'platform', provider, action: enabled ? 'provider_activated_exclusive' : 'provider_disabled_exclusive', actorUserId: user?.id || null, changedFields: Object.keys(body.config || body || {}).filter(k => !/secret|key|pass|token/i.test(k)), metadata: { finalLock: 'v200_2_one_active_provider', credentialsEncrypted: true, disabledOtherProviders: true } });
  return serializeSettings(row.reload ? await row.reload() : row);
}

async function getSettings({ scope, schoolCode }) {
  return serializeSettings(scope === 'platform' ? await getPlatformRow() : await getSchoolRow(schoolCode));
}

async function rowForPaymentType(paymentType, schoolCode) {
  if (paymentType === PLATFORM) return getPlatformRow();
  return getSchoolRow(schoolCode);
}

async function resolvePaymentProvider({ paymentType, schoolCode, requestedProvider = '', method = '' }) {
  const row = await rowForPaymentType(paymentType, schoolCode);
  const active = activeProviderFromRow(row);
  if (!active) throw new Error(paymentType === PLATFORM ? 'No active platform payment provider has been configured by Super Admin.' : 'No active school payment provider has been configured by Finance Officer.');
  const requested = normalizeProviderIfPossible(requestedProvider);
  if (requested && requested !== active) throw new Error(`${providerLabel(requested)} is disabled for this ${paymentType === PLATFORM ? 'platform' : 'school'} payment. Active provider is ${providerLabel(active)}.`);
  const map = providerMap(row);
  const cfg = providerConfigFromMap(map, active) || {};
  if (cfg.enabled !== true && !rawEnabledProviders(row).includes(active)) throw new Error(`${providerLabel(active)} is configured but not enabled.`);
  const selectedMethod = normalizePaymentMethod(method) || sanitizeMethods(cfg.methods, active)[0] || '';
  if (selectedMethod && !providerSupportsMethod(active, selectedMethod, cfg)) throw new Error(`${methodLabel(selectedMethod)} is not enabled for ${providerLabel(active)}.`);
  return { row, provider: active, method: selectedMethod, linkingRule: row.metadata?.linkingRule || row.accountReferenceFormat || 'elimuid' };
}

async function getProviderConfig({ paymentType, schoolCode, provider }) {
  const row = await rowForPaymentType(paymentType, schoolCode);
  const active = activeProviderFromRow(row);
  provider = normalizeProvider(provider || active);
  if (provider !== active) throw new Error(`${providerLabel(provider)} is disabled. Active provider is ${providerLabel(active)}.`);
  const map = providerMap(row);
  const cfg = decryptProvider(providerConfigFromMap(map, provider) || {});
  if (provider === 'mpesa') {
    return { ...cfg, consumerKey: cfg.consumerKey || row.darajaConsumerKey, consumerSecret: cfg.consumerSecret || row.darajaConsumerSecret, passkey: cfg.passkey || row.darajaPasskey, shortcode: cfg.shortcode || row.darajaShortcode, callbackUrl: cfg.callbackUrl || row.callbackUrl || publicUrl('/api/payments/webhook/mpesa'), mode: cfg.environment || row.darajaEnvironment || process.env.DARAJA_ENV || 'sandbox' };
  }
  return cfg;
}

function manualMessageForMethod(method) {
  if (method === 'bank') return 'Bank payment instructions shown. Balance updates after finance verifies the bank reference.';
  if (method === 'cash') return 'Cash office payment instructions shown. Balance updates after finance verifies the receipt.';
  if (method === 'card') return 'Card/POS instructions shown. Balance updates after finance verifies the receipt.';
  return 'Manual payment instructions shown. Balance updates after finance verification.';
}

async function createProviderPrompt({ provider, payment, phone, email, name, config, method }) {
  const amount = cleanAmount(payment.amount);
  const currency = payment.currency || 'KES';
  const reference = payment.reference;

  if (provider === 'manual' || provider === 'bank' || provider === 'cash' || provider === 'card') {
    return { status: 'prompt_sent', promptType: 'manual_instructions', checkoutUrl: null, providerReference: reference, message: manualMessageForMethod(method || provider) };
  }

  if (provider === 'mpesa') {
    if (!phone) throw new Error('Phone number is required for M-Pesa STK prompt');
    const stk = await daraja.initiateSTKPush({ phone, amount, accountReference: payment.accountReference || reference, transactionDesc: payment.paymentType === SCHOOL_FEE ? 'School fees' : 'ShuleAI platform payment', callbackUrl: config.callbackUrl || publicUrl('/api/payments/mpesa/callback'), credentials: config, metadata: { reference, paymentId: payment.id, paymentType: payment.paymentType, schoolCode: payment.schoolCode } });
    return { status: 'prompt_sent', promptType: 'phone_prompt', checkoutUrl: null, providerReference: stk.CheckoutRequestID, checkoutRequestId: stk.CheckoutRequestID, merchantRequestId: stk.MerchantRequestID, gatewayResponse: stk, message: stk.CustomerMessage || 'M-Pesa prompt sent.' };
  }

  if (provider === 'paystack') {
    if (!config.secretKey) throw new Error('Paystack secret key is not configured for this payment destination');
    const data = await requestJson({ hostname: 'api.paystack.co', path: '/transaction/initialize', headers: { Authorization: `Bearer ${config.secretKey}` }, body: { email: email || config.fallbackEmail || 'payments@shuleai.local', amount: amount * 100, currency, reference, callback_url: config.returnUrl || publicUrl('/payment-return.html'), metadata: { paymentId: payment.id, paymentType: payment.paymentType, schoolCode: payment.schoolCode, method } } });
    if (!data?.data?.authorization_url) throw new Error(data?.message || 'Paystack did not return a checkout URL');
    return { status: 'prompt_sent', promptType: 'checkout_url', checkoutUrl: data.data.authorization_url, providerReference: data?.data?.reference || reference, gatewayResponse: data, message: 'Open Paystack checkout to complete payment.' };
  }

  if (provider === 'flutterwave') {
    if (!config.secretKey) throw new Error('Flutterwave secret key is not configured for this payment destination');
    const data = await requestJson({ hostname: 'api.flutterwave.com', path: '/v3/payments', headers: { Authorization: `Bearer ${config.secretKey}` }, body: { tx_ref: reference, amount, currency, redirect_url: config.returnUrl || publicUrl('/payment-return.html'), customer: { email: email || config.fallbackEmail || 'payments@shuleai.local', phonenumber: phone || '', name: name || 'ShuleAI payer' }, customizations: { title: config.title || 'ShuleAI Payment' }, meta: { paymentId: payment.id, paymentType: payment.paymentType, schoolCode: payment.schoolCode, method } } });
    if (!data?.data?.link) throw new Error(data?.message || 'Flutterwave did not return a checkout URL');
    return { status: 'prompt_sent', promptType: 'checkout_url', checkoutUrl: data.data.link, providerReference: data?.data?.id ? String(data.data.id) : reference, gatewayResponse: data, message: 'Open Flutterwave checkout to complete payment.' };
  }

  if (provider === 'stripe') {
    if (!config.secretKey) throw new Error('Stripe secret key is not configured for this payment destination');
    const body = new URLSearchParams();
    body.set('mode', 'payment');
    body.set('success_url', config.successUrl || publicUrl('/payment-success.html'));
    body.set('cancel_url', config.cancelUrl || publicUrl('/payment-cancelled.html'));
    body.set('client_reference_id', reference);
    body.set('line_items[0][price_data][currency]', String(currency).toLowerCase());
    body.set('line_items[0][price_data][product_data][name]', payment.paymentType === SCHOOL_FEE ? 'School fees' : 'ShuleAI platform payment');
    body.set('line_items[0][price_data][unit_amount]', String(amount * 100));
    body.set('line_items[0][quantity]', '1');
    body.set('metadata[paymentId]', String(payment.id));
    body.set('metadata[reference]', reference);
    body.set('metadata[method]', method || 'card');
    const data = await new Promise((resolve, reject) => {
      const payload = body.toString();
      const req = https.request({ method:'POST', hostname:'api.stripe.com', path:'/v1/checkout/sessions', headers:{ Authorization:`Bearer ${config.secretKey}`, 'Content-Type':'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(payload) } }, res => {
        let raw='';
        res.on('data',c=>raw+=c);
        res.on('end',()=>{ let json={}; try{json=JSON.parse(raw)}catch(_){}; if(res.statusCode>=400) return reject(new Error(json.error?.message || raw)); resolve(json); });
      });
      req.on('error',reject);
      req.write(payload);
      req.end();
    });
    if (!data.url) throw new Error('Stripe did not return a checkout URL');
    return { status: 'prompt_sent', promptType: 'checkout_url', checkoutUrl: data.url, providerReference: data.id, gatewayResponse: data, message: 'Open Stripe checkout to complete payment.' };
  }

  if (provider === 'pesapal') return createPesapalCheckout({ payment, phone, email, name, config });
  throw new Error(`No prompt handler exists for ${providerLabel(provider)}`);
}

function studentReferenceByRule({ student, parent, fee, rule, fallback }) {
  const normalized = String(rule || '').trim().toLowerCase();
  if (normalized === 'elimuid' || normalized === 'elimu_id') return student?.elimuid || student?.elimuId || fallback;
  if (normalized === 'admissionnumber' || normalized === 'admission_number') return student?.admissionNumber || fallback;
  if (normalized === 'assessmentnumber' || normalized === 'assessment_number') return student?.assessmentNumber || student?.assessmentNo || fallback;
  if (normalized === 'studentname' || normalized === 'student_name') return student?.User?.name || student?.name || fallback;
  if (normalized === 'parentphone' || normalized === 'parent_phone') return parent?.phone || parent?.User?.phone || fallback;
  if (normalized === 'invoice' || normalized === 'invoicenumber' || normalized === 'invoice_number') return fee?.invoiceNumber || fallback;
  if (normalized === 'term') return [student?.elimuid || student?.admissionNumber || student?.id, fee?.term, fee?.year].filter(Boolean).join('-') || fallback;
  return student?.elimuid || student?.admissionNumber || fallback;
}


function normalizeBillingCycle(value) {
  const cycle = String(value || 'monthly').trim().toLowerCase();
  return ['monthly', 'termly', 'yearly', 'custom'].includes(cycle) ? cycle : 'monthly';
}

function normalizeOwnerTypeForPlatform(body = {}, user = {}) {
  const explicit = String(body.ownerType || body.subscriptionOwnerType || '').trim().toLowerCase();
  if (['child', 'school'].includes(explicit)) return explicit;
  const purpose = String(body.platformPurpose || body.purpose || body.transactionType || '').toLowerCase();
  if (purpose.includes('child')) return 'child';
  if (purpose.includes('school')) return 'school';
  if (body.studentId) return 'child';
  if (['admin', 'finance_officer', 'super_admin'].includes(String(user?.role || '').toLowerCase())) return 'school';
  return 'child';
}

function subscriptionPaymentMethod(method, provider) {
  if (method === 'mobile_money' || provider === 'mpesa') return 'mpesa';
  if (method === 'card' || provider === 'stripe') return 'card';
  if (method === 'bank') return 'bank';
  return 'manual';
}

async function ensurePlatformSubscriptionContext({ user, body, schoolCode, amount, provider, method, reference, transaction }) {
  const purpose = String(body.platformPurpose || body.purpose || body.transactionType || '').toLowerCase();
  const ownerType = normalizeOwnerTypeForPlatform(body, user);
  const shouldPrepare = purpose.includes('subscription') || !!body.plan || !!body.planCode;
  if (!shouldPrepare) return {};

  const billingCycle = normalizeBillingCycle(body.billingCycle || body.billingPeriod);
  const planCode = body.planCode || body.plan || (ownerType === 'school' ? 'school_growth' : 'child_basic');
  const plan = await subscriptionController.getPlanByCode(planCode, ownerType).catch(() => null);
  if (!plan) throw new Error(ownerType === 'school' ? 'School subscription plan not found' : 'Child subscription plan not found');
  const planName = plan.displayName || plan.name || plan.code || planCode;
  const cleanPlanAmount = cleanAmount(amount || subscriptionController.planAmount(plan, billingCycle));

  if (ownerType === 'child') {
    if (!body.studentId) throw new Error('studentId is required for child subscription payments');
    const resolvedSchoolCode = schoolCode || user?.schoolCode;
    const { parent, student } = await financeLedger.assertParentOwnsStudent({ parentUserId: user?.id, studentId: Number(body.studentId), schoolCode: resolvedSchoolCode, transaction });
    const [subscription] = await Subscription.findOrCreate({
      where: { ownerType: 'child', studentId: student.id },
      defaults: { ownerType: 'child', schoolCode: resolvedSchoolCode, parentId: parent.id, studentId: student.id, planId: plan.id, planCode: plan.code || plan.name, planName, billingCycle, status: 'pending', features: plan.features || [], limits: plan.limits || {} },
      transaction
    });
    await subscription.update({ planId: plan.id, planCode: plan.code || plan.name, planName, billingCycle, status: 'pending', features: plan.features || [], limits: plan.limits || {} }, { transaction });
    const subscriptionPayment = await SubscriptionPayment.create({
      subscriptionId: subscription.id,
      ownerType: 'child',
      schoolCode: resolvedSchoolCode,
      parentId: parent.id,
      studentId: student.id,
      planId: plan.id,
      planCode: plan.code || plan.name,
      planName,
      billingCycle,
      amount: cleanPlanAmount,
      currency: body.currency || 'KES',
      paymentMethod: subscriptionPaymentMethod(method, provider),
      status: 'pending',
      metadata: { reference, provider, method, source: 'locked-platform-provider-engine' },
      auditTrail: [{ action: 'child_subscription_payment_created', provider, method, reference, at: new Date().toISOString(), actorUserId: user?.id || null }]
    }, { transaction });
    return { ownerType, student, parent, subscription, subscriptionPayment, subscriptionId: subscription.id, subscriptionPaymentId: subscriptionPayment.id, planId: plan.id, planCode: plan.code || plan.name, planName, billingCycle };
  }

  const lookup = String(body.schoolCode || schoolCode || user?.schoolCode || '').trim();
  if (!lookup || lookup === 'platform') throw new Error('schoolCode is required for school subscription payments');
  const school = await School.findOne({ where: { [Op.or]: [{ schoolId: lookup }, { shortCode: lookup }] }, transaction }).catch(() => null);
  if (!school) throw new Error('School not found for subscription payment');
  const [subscription] = await Subscription.findOrCreate({
    where: { ownerType: 'school', schoolCode: school.schoolId },
    defaults: { ownerType: 'school', schoolId: school.id, schoolCode: school.schoolId, planId: plan.id, planCode: plan.code || plan.name, planName, billingCycle, status: 'pending', features: plan.features || [], limits: plan.limits || {} },
    transaction
  });
  await subscription.update({ schoolId: school.id, planId: plan.id, planCode: plan.code || plan.name, planName, billingCycle, status: 'pending', features: plan.features || [], limits: plan.limits || {} }, { transaction });
  const subscriptionPayment = await SubscriptionPayment.create({
    subscriptionId: subscription.id,
    ownerType: 'school',
    schoolId: school.id,
    schoolCode: school.schoolId,
    planId: plan.id,
    planCode: plan.code || plan.name,
    planName,
    billingCycle,
    amount: cleanPlanAmount,
    currency: body.currency || 'KES',
    paymentMethod: subscriptionPaymentMethod(method, provider),
    status: 'pending',
    metadata: { reference, provider, method, source: 'locked-platform-provider-engine' },
    auditTrail: [{ action: 'school_subscription_payment_created', provider, method, reference, at: new Date().toISOString(), actorUserId: user?.id || null }]
  }, { transaction });
  return { ownerType, school, subscription, subscriptionPayment, subscriptionId: subscription.id, subscriptionPaymentId: subscriptionPayment.id, planId: plan.id, planCode: plan.code || plan.name, planName, billingCycle, schoolCode: school.schoolId };
}

async function finalizeSubscriptionSideEffects({ payment, status, providerReference, rawPayload, transaction }) {
  const normalized = String(status || '').toLowerCase();
  const paid = normalized === 'paid';
  const failed = normalized === 'failed';
  if (!payment?.subscriptionPaymentId || (!paid && !failed)) return null;
  const subscriptionPayment = await SubscriptionPayment.findByPk(payment.subscriptionPaymentId, { transaction }).catch(() => null);
  if (!subscriptionPayment) return null;
  const trail = Array.isArray(subscriptionPayment.auditTrail) ? subscriptionPayment.auditTrail : [];
  trail.push({ action: paid ? 'provider_confirmed_subscription_paid' : 'provider_confirmed_subscription_failed', provider: payment.paymentGateway, at: new Date().toISOString(), providerReference });
  await subscriptionPayment.update({
    status: paid ? 'success' : 'failed',
    paidAt: paid ? new Date() : subscriptionPayment.paidAt,
    checkoutRequestId: payment.checkoutRequestId || subscriptionPayment.checkoutRequestId,
    merchantRequestId: payment.merchantRequestId || subscriptionPayment.merchantRequestId,
    mpesaReceiptNumber: payment.mpesaReceiptNumber || payment.receiptNumber || subscriptionPayment.mpesaReceiptNumber,
    rawCallback: rawPayload || subscriptionPayment.rawCallback,
    auditTrail: trail
  }, { transaction });
  if (paid) {
    const plan = await SubscriptionPlan.findByPk(subscriptionPayment.planId, { transaction }).catch(() => null) || await subscriptionController.getPlanByCode(subscriptionPayment.planCode, subscriptionPayment.ownerType === 'school' ? 'school' : 'child');
    const subscription = await Subscription.findByPk(subscriptionPayment.subscriptionId, { transaction }).catch(() => null);
    if (plan && subscription) await subscriptionController.renewSubscription(subscription, plan, subscriptionPayment.billingCycle, payment.id);
  }
  return subscriptionPayment;
}

async function initiatePayment({ user, body }) {
  const paymentType = normalizePaymentType(body.paymentType || body.type);
  const requestedProvider = normalizeProviderIfPossible(body.provider || body.paymentProvider || '');
  const paymentMethod = normalizePaymentMethod(body.paymentMethod || body.method || body.channel || body.provider || '');
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

    const resolved = await resolvePaymentProvider({ paymentType, schoolCode, requestedProvider, method: paymentMethod });
    const provider = resolved.provider;
    const method = resolved.method || paymentMethod || provider;
    const reference = String(body.reference || ref(paymentType === SCHOOL_FEE ? 'FEE' : 'PLATFORM')).toUpperCase();
    const duplicate = await Payment.findOne({ where: { reference }, transaction });
    if (duplicate) return duplicate;

    const platformSubscription = paymentType === PLATFORM
      ? await ensurePlatformSubscriptionContext({ user, body, schoolCode, amount, provider, method, reference, transaction })
      : {};
    if (platformSubscription.schoolCode) schoolCode = platformSubscription.schoolCode;
    if (platformSubscription.student) student = platformSubscription.student;
    if (platformSubscription.parent) parent = platformSubscription.parent;

    const accountReference = body.accountReference || (paymentType === SCHOOL_FEE ? studentReferenceByRule({ student, parent, fee, rule: resolved.linkingRule, fallback: reference }) : reference);
    const payment = await Payment.create({
      schoolCode,
      studentId: student?.id || body.studentId || null,
      parentId: parent?.id || body.parentId || null,
      feeId: fee?.id || body.feeId || null,
      amount,
      currency,
      reference,
      method,
      paymentGateway: provider,
      paymentType,
      paymentDestination: paymentType === SCHOOL_FEE ? 'school' : 'platform',
      paidTo: paymentType === SCHOOL_FEE ? 'school' : 'platform',
      accountReference,
      status: 'pending',
      promptStatus: 'created',
      transactionType: paymentType === SCHOOL_FEE ? 'payment' : (body.platformPurpose || body.purpose || 'subscription'),
      source: user?.role || 'system',
      payerPhone: phone || null,
      plan: platformSubscription.planCode || body.plan || body.planCode || null,
      planCode: platformSubscription.planCode || body.planCode || body.plan || null,
      planName: platformSubscription.planName || body.planName || null,
      billingCycle: platformSubscription.billingCycle || body.billingCycle || body.billingPeriod || null,
      ownerType: platformSubscription.ownerType || body.ownerType || (body.studentId ? 'child' : null),
      subscriptionPaymentId: platformSubscription.subscriptionPaymentId || body.subscriptionPaymentId || null,
      subscriptionId: platformSubscription.subscriptionId || body.subscriptionId || null,
      metadata: { purpose: body.purpose || body.platformPurpose || paymentType, studentName: student?.User?.name || null, feeId: fee?.id || null, initiatedBy: user?.id || null, selectedMethod: method, activeProvider: provider, providerSelectionRule: 'one_active_provider_per_scope', linkingRule: resolved.linkingRule, planCode: platformSubscription.planCode || body.planCode || body.plan || null, planName: platformSubscription.planName || body.planName || null, billingCycle: platformSubscription.billingCycle || body.billingCycle || body.billingPeriod || null, ownerType: platformSubscription.ownerType || body.ownerType || null, subscriptionPaymentId: platformSubscription.subscriptionPaymentId || body.subscriptionPaymentId || null, subscriptionId: platformSubscription.subscriptionId || body.subscriptionId || null },
      auditTrail: [{ action: 'payment_created_before_provider_call', actorUserId: user?.id || null, actorRole: user?.role || null, at: new Date().toISOString(), provider, method, paymentType, providerSelectionRule: 'one_active_provider_per_scope' }],
      expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24)
    }, { transaction });

    await financialSystem.mirrorLegacyPayment({ payment, invoiceId: typeof invoice !== 'undefined' ? invoice?.id || null : null, transaction });

    try {
      const config = await getProviderConfig({ paymentType, schoolCode, provider });
      const prompt = await createProviderPrompt({ provider, payment, phone, email: user?.email || body.email, name: user?.name || body.name, config, method });
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

function parseDarajaWebhookPayload(payload = {}) {
  try { return daraja.parseCallback(payload); } catch (_) { return {}; }
}

function normalizeProviderStatus(provider, payload = {}) {
  if (provider === 'mpesa') {
    const parsed = parseDarajaWebhookPayload(payload);
    if (parsed.resultCode !== undefined && parsed.resultCode !== null) return Number(parsed.resultCode) === 0 ? 'paid' : 'failed';
  }
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
  if (provider === 'mpesa') {
    const parsed = parseDarajaWebhookPayload(payload);
    const checkout = parsed.checkoutRequestId || payload.CheckoutRequestID || payload.checkoutRequestId || payload.providerReference;
    return { reference: payload.reference || payload.internalReference || payload.metadata?.reference || '', providerReference: checkout, amount: parsed.amount || payload.amount, currency: payload.currency || 'KES', eventId: checkout || parsed.merchantRequestId || payload.eventId, receiptNumber: parsed.mpesaReceiptNumber, rawParsed: parsed };
  }
  if (provider === 'paystack') return { reference: payload.data?.reference, providerReference: payload.data?.reference, amount: payload.data?.amount ? Math.round(Number(payload.data.amount) / 100) : null, currency: payload.data?.currency, eventId: payload.data?.id ? String(payload.data.id) : payload.event };
  if (provider === 'flutterwave') return { reference: payload.tx_ref || payload.data?.tx_ref, providerReference: payload.transaction_id || payload.data?.id || payload.data?.flw_ref, amount: payload.amount || payload.data?.amount, currency: payload.currency || payload.data?.currency, eventId: payload.id || payload.data?.id || payload.event };
  if (provider === 'stripe') return { reference: payload.data?.object?.client_reference_id || payload.data?.object?.metadata?.reference, providerReference: payload.data?.object?.id, amount: payload.data?.object?.amount_total ? Math.round(Number(payload.data.object.amount_total) / 100) : null, currency: String(payload.data?.object?.currency || '').toUpperCase(), eventId: payload.id };
  if (provider === 'pesapal') return { reference: payload.OrderMerchantReference || payload.order_merchant_reference || payload.merchant_reference || payload.reference, providerReference: payload.OrderTrackingId || payload.order_tracking_id || payload.providerReference, amount: payload.amount || payload.Amount, currency: payload.currency || payload.Currency || 'KES', eventId: payload.OrderTrackingId || payload.order_tracking_id || payload.eventId };
  return { reference: payload.reference || payload.internalReference || payload.CheckoutRequestID, providerReference: payload.providerReference || payload.CheckoutRequestID, amount: payload.amount, currency: payload.currency || 'KES', eventId: payload.id || payload.eventId || payload.CheckoutRequestID };
}

async function processConfirmedPayment({ payment, status, provider, providerReference, amount, currency, rawPayload, event, receiptNumber }) {
  const beforeStatus = payment.status;
  const paid = status === 'paid';
  const failed = status === 'failed';
  if ((paid && FINAL_PAID.includes(String(beforeStatus).toLowerCase())) || (failed && FINAL_FAILED.includes(String(beforeStatus).toLowerCase()))) return payment;

  await sequelize.transaction(async (transaction) => {
    const locked = await Payment.findByPk(payment.id, { transaction, lock: transaction.LOCK.UPDATE });
    if (!locked) throw new Error('Payment disappeared during processing');
    if (normalizeProviderIfPossible(locked.paymentGateway) && normalizeProviderIfPossible(locked.paymentGateway) !== provider) {
      if (event) await event.update({ processingError: `Provider mismatch: payment expects ${locked.paymentGateway}, webhook came from ${provider}`, processed: false, paymentId: locked.id, schoolCode: locked.schoolCode }, { transaction });
      return;
    }
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
      receiptNumber: receiptNumber || providerReference || locked.receiptNumber,
      mpesaReceiptNumber: receiptNumber || locked.mpesaReceiptNumber,
      gatewayResponse: rawPayload || locked.gatewayResponse,
      auditTrail: trail,
      metadata: { ...(locked.metadata || {}), lastProviderPayload: rawPayload || {} }
    }, { transaction });

    await financialSystem.finalizeConfirmedPayment({ legacyPayment: locked, status, provider, providerReference, amount, currency, rawPayload, event, transaction });
    await finalizeSubscriptionSideEffects({ payment: await locked.reload({ transaction }), status, providerReference, rawPayload, transaction }).catch(err => { throw err; });
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
  if (normalizeProviderIfPossible(payment.paymentGateway) && normalizeProviderIfPossible(payment.paymentGateway) !== provider) {
    await event.update({ processingError: `Provider mismatch: payment expects ${payment.paymentGateway}, webhook came from ${provider}`, processed: false, paymentId: payment.id, schoolCode: payment.schoolCode });
    return { accepted: true, ignored: true, reason: 'provider_mismatch' };
  }
  await processConfirmedPayment({ payment, status, provider, providerReference: extracted.providerReference, amount: extracted.amount, currency: extracted.currency, rawPayload: payload, event, receiptNumber: extracted.receiptNumber });
  return { accepted: true, paymentId: payment.id, status };
}

async function getPaymentStatus({ reference, user }) {
  const where = { reference };
  if (user?.role !== 'super_admin') where.schoolCode = user?.schoolCode;
  const payment = await Payment.findOne({ where });
  if (!payment) throw new Error('Payment not found');
  return { reference: payment.reference, status: payment.status, provider: payment.paymentGateway, method: payment.method, paymentType: payment.paymentType, amount: payment.amount, currency: payment.currency, checkoutUrl: payment.checkoutUrl, promptType: payment.promptType, promptStatus: payment.promptStatus, feeId: payment.feeId, studentId: payment.studentId };
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
  await payment.update({ lastStatusQueryAt: new Date(), reconciliationStatus: 'pending', metadata: { ...(payment.metadata || {}), lastReconcileMessage: 'No confirmed provider status yet; payment left pending safely.' } });
  const tx = await financialSystem.mirrorLegacyPayment({ payment });
  await financialSystem.recordReconciliation({ legacyPayment: payment, transactionRow: tx, result: 'pending', message: 'No confirmed provider status yet; payment left pending safely.' });
  return getPaymentStatus({ reference, user });
}

module.exports = {
  PROVIDERS,
  PAYMENT_METHODS,
  SCHOOL_FEE,
  PLATFORM,
  getSettings,
  saveSchoolProviderSettings,
  savePlatformProviderSettings,
  initiatePayment,
  handleWebhook,
  getPaymentStatus,
  reconcilePayment,
  normalizeProvider,
  normalizePaymentType,
  normalizePaymentMethod
};
