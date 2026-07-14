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
const webhookVerifier = require('./webhookVerificationService');

const PROVIDERS = ['manual','bank','cash','card','mpesa','paystack','flutterwave','pesapal','stripe'];
const PAYMENT_METHODS = ['mobile_money','card','bank','cash','manual'];
// Use the existing DB/ledger value for student fee payments. Incoming 'school_fee' is normalized to this value.
const SCHOOL_FEE = 'fee';
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
  if (!base) {
    if (process.env.NODE_ENV === 'production' && /^\/api\/payments\//i.test(String(path || ''))) {
      throw new Error('PUBLIC_API_BASE_URL or BACKEND_PUBLIC_URL is required for public payment callback URLs.');
    }
    return path;
  }
  const full = String(base).replace(/\/$/, '') + path;
  if (process.env.NODE_ENV === 'production' && /^\/api\/payments\//i.test(String(path || '')) && !/^https:\/\//i.test(full)) {
    throw new Error('Payment callback URLs must be public HTTPS URLs in production.');
  }
  return full;
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


async function getPesapalToken(config = {}) {
  const consumerKey = config.consumerKey || config.consumer_key || process.env.PESAPAL_CONSUMER_KEY;
  const consumerSecret = config.consumerSecret || config.consumer_secret || process.env.PESAPAL_CONSUMER_SECRET;
  if (!consumerKey || !consumerSecret) throw new Error('Pesapal consumer key and consumer secret are required');
  const endpoint = pesapalEndpoint(config);
  const tokenData = await requestJson({ hostname: endpoint.hostname, path: endpoint.pathBase + '/Auth/RequestToken', headers: { Accept: 'application/json' }, body: { consumer_key: consumerKey, consumer_secret: consumerSecret } });
  const token = tokenData?.token || tokenData?.data?.token;
  if (!token) throw new Error(tokenData?.error?.message || tokenData?.message || 'Pesapal did not return an access token');
  return { token, endpoint, tokenData };
}

async function registerPesapalIpn(config = {}) {
  const { token, endpoint } = await getPesapalToken(config);
  const ipnUrl = config.ipnUrl || config.notificationUrl || config.webhookUrl || config.callbackUrl || process.env.PESAPAL_IPN_URL || publicUrl('/api/payments/webhook/pesapal');
  if (!ipnUrl || !/^https:\/\//i.test(String(ipnUrl))) throw new Error('Pesapal IPN URL must be a public HTTPS URL');
  const registerPayload = {
    url: ipnUrl,
    ipn_notification_type: config.ipnNotificationType || config.notificationType || 'GET'
  };
  const data = await requestJson({ hostname: endpoint.hostname, path: endpoint.pathBase + '/URLSetup/RegisterIPN', headers: { Accept: 'application/json', Authorization: 'Bearer ' + token }, body: registerPayload });
  const notificationId = data?.ipn_id || data?.notification_id || data?.id || data?.data?.ipn_id || data?.data?.notification_id;
  if (!notificationId) throw new Error(data?.error?.message || data?.message || 'Pesapal registered/replied but did not return an IPN ID');
  return { notificationId, ipnUrl, gatewayResponse: data };
}

async function createPesapalCheckout({ payment, phone, email, name, config }) {
  const consumerKey = config.consumerKey || config.consumer_key || process.env.PESAPAL_CONSUMER_KEY;
  const consumerSecret = config.consumerSecret || config.consumer_secret || process.env.PESAPAL_CONSUMER_SECRET;
  const notificationId = config.ipnId || config.notificationId || config.notification_id || process.env.PESAPAL_IPN_ID;
  if ((!consumerKey || !consumerSecret || !notificationId) && config.checkoutUrl) {
    return { status: 'prompt_sent', promptType: 'checkout_url', checkoutUrl: config.checkoutUrl, providerReference: payment.reference, gatewayResponse: { mode: 'static_checkout_url' }, message: 'Open Pesapal checkout.' };
  }
  if (!consumerKey || !consumerSecret) throw new Error('Pesapal consumer key and consumer secret are required');
  let finalNotificationId = notificationId;
  let endpoint, token;
  if (!finalNotificationId) {
    const registered = await registerPesapalIpn(config);
    finalNotificationId = registered.notificationId;
    config.ipnId = finalNotificationId;
  }
  ({ token, endpoint } = await getPesapalToken(config));
  const payer = pesapalNameParts(name);
  const callbackUrl = config.callbackUrl || config.returnUrl || publicUrl('/payment-return.html');
  const order = {
    id: payment.reference,
    currency: payment.currency || 'KES',
    amount: cleanAmount(payment.amount),
    description: payment.paymentType === SCHOOL_FEE ? 'School fees' : 'ShuleAI platform payment',
    callback_url: callbackUrl,
    notification_id: finalNotificationId,
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

async function queryPesapalTransactionStatus({ trackingId, merchantReference, config = {} }) {
  const lookup = trackingId || merchantReference;
  if (!lookup) throw new Error('Pesapal tracking ID or merchant reference is required for status check');
  const { token, endpoint } = await getPesapalToken(config);
  const path = endpoint.pathBase + '/Transactions/GetTransactionStatus?' + new URLSearchParams({ orderTrackingId: lookup }).toString();
  const data = await requestJson({ method: 'GET', hostname: endpoint.hostname, path, headers: { Accept: 'application/json', Authorization: 'Bearer ' + token } });
  const rawStatus = String(
    data?.payment_status_description ||
    data?.payment_status ||
    data?.status ||
    data?.status_code ||
    data?.data?.payment_status_description ||
    data?.data?.payment_status ||
    ''
  ).toLowerCase();
  let status = 'pending';
  if (['completed', 'complete', 'paid', 'success', 'successful', '1'].includes(rawStatus) || rawStatus.includes('completed')) status = 'paid';
  if (['failed', 'invalid', 'reversed', 'cancelled', 'canceled', 'expired', '2', '3'].includes(rawStatus) || rawStatus.includes('failed') || rawStatus.includes('cancel')) status = 'failed';
  return {
    status,
    providerReference: data?.order_tracking_id || data?.OrderTrackingId || trackingId,
    merchantReference: data?.merchant_reference || data?.order_merchant_reference || merchantReference,
    amount: data?.amount || data?.data?.amount,
    currency: data?.currency || data?.data?.currency || 'KES',
    receiptNumber: data?.confirmation_code || data?.payment_account || data?.data?.confirmation_code,
    gatewayResponse: data
  };
}

function requestJson({ method = 'POST', hostname, path, headers = {}, body = {} }) {
  return new Promise((resolve, reject) => {
    const hasBody = method !== 'GET' && method !== 'HEAD';
    const payload = hasBody ? JSON.stringify(body || {}) : '';
    const requestHeaders = hasBody ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload), ...headers } : { ...headers };
    const req = https.request({ method, hostname, path, headers: requestHeaders }, res => {
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
    if (hasBody) req.write(payload);
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
  // Verification/offline methods are always valid because they do not call disabled providers.
  if (['manual','bank','cash'].includes(method)) return true;
  if (method === 'card' && ['manual','bank','cash','card','mpesa'].includes(provider)) return true;
  return sanitizeMethods(config.methods, provider).includes(method);
}


function hasAny(config = {}, fields = []) {
  return fields.some(field => config[field] || config[field.replace(/[A-Z]/g, m => '_' + m.toLowerCase())]);
}

function providerReadiness(provider, config = {}, active = '') {
  const enabled = provider === active && config?.enabled !== false;
  if (!enabled) return { status: 'disabled', ready: false, visibleToParent: false, message: 'Provider is not active for this scope.' };
  if (['manual','bank','cash','card'].includes(provider)) return { status: 'ready', ready: true, visibleToParent: true, message: `${providerLabel(provider)} is ready for finance verification.` };
  if (provider === 'mpesa') {
    const missing = [];
    if (!hasAny(config, ['consumerKey'])) missing.push('consumerKey');
    if (!hasAny(config, ['consumerSecret'])) missing.push('consumerSecret');
    if (!hasAny(config, ['shortcode','businessShortCode'])) missing.push('shortcode');
    if (!hasAny(config, ['passkey'])) missing.push('passkey');
    return missing.length ? { status: 'not_configured', ready: false, visibleToParent: false, message: `Missing M-Pesa ${missing.join(', ')}.` } : { status: 'ready', ready: true, visibleToParent: true, message: 'M-Pesa credentials are present. Confirm callback/webhook with a test transaction.' };
  }
  if (provider === 'pesapal') {
    const missing = [];
    if (!hasAny(config, ['consumerKey'])) missing.push('consumerKey');
    if (!hasAny(config, ['consumerSecret'])) missing.push('consumerSecret');
    if (!hasAny(config, ['ipnId','notificationId']) && !config.checkoutUrl) missing.push('ipnId/notificationId');
    return missing.length ? { status: 'not_configured', ready: false, visibleToParent: false, message: `Missing PesaPal ${missing.join(', ')}.` } : { status: 'ready', ready: true, visibleToParent: true, message: 'PesaPal settings are present.' };
  }
  if (provider === 'paystack') return hasAny(config, ['secretKey']) ? { status: 'ready', ready: true, visibleToParent: true, message: 'Paystack secret key is present.' } : { status: 'not_configured', ready: false, visibleToParent: false, message: 'Missing Paystack secret key.' };
  if (provider === 'flutterwave') return hasAny(config, ['secretKey']) ? { status: 'ready', ready: true, visibleToParent: true, message: 'Flutterwave secret key is present.' } : { status: 'not_configured', ready: false, visibleToParent: false, message: 'Missing Flutterwave secret key.' };
  if (provider === 'stripe') return hasAny(config, ['secretKey']) ? { status: 'ready', ready: true, visibleToParent: true, message: 'Stripe secret key is present.' } : { status: 'not_configured', ready: false, visibleToParent: false, message: 'Missing Stripe secret key.' };
  return { status: enabled ? 'ready' : 'disabled', ready: enabled, visibleToParent: enabled, message: enabled ? `${providerLabel(provider)} is ready.` : `${providerLabel(provider)} is disabled.` };
}

function publicProviders(row) {
  const active = activeProviderFromRow(row);
  const map = providerMap(row);
  const providers = [...new Set([...PROVIDERS, ...Object.keys(map).map(k => normalizeProviderIfPossible(k) || k)])];
  return Object.fromEntries(providers.map((provider) => {
    const cfg = providerConfigFromMap(map, provider) || {};
    const readiness = providerReadiness(provider, cfg, active);
    return [provider, { ...vault.publicProvider(cfg), provider, enabled: provider === active, readiness: readiness.status, ready: readiness.ready, visibleToParent: readiness.visibleToParent, statusMessage: readiness.message }];
  }));
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
    providerStatuses: Object.values(publicProviders(row)).map(p => ({ provider:p.provider, label:providerLabel(p.provider), status:p.readiness, ready:p.ready, enabled:p.enabled, message:p.statusMessage, visibleToParent:p.visibleToParent })),
    readyProviders: Object.values(publicProviders(row)).filter(p => p.ready && p.enabled).map(p => p.provider),
    publicMethods: methods.filter(m => (publicProviders(row)[m.provider] || {}).ready !== false),
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

  // Bank transfer, cash, manual M-Pesa/reference, and offline card/POS must always work.
  // They create a pending verification record instead of trying to call an online provider.
  if (['manual','bank','cash'].includes(method) || provider === 'manual' || provider === 'bank' || provider === 'cash' || (method === 'card' && ['mpesa','manual','bank','cash','card'].includes(provider))) {
    return { status: 'prompt_sent', promptType: 'manual_instructions', checkoutUrl: null, providerReference: reference, message: manualMessageForMethod(method || provider) };
  }

  if (provider === 'mpesa') {
    if (method && method !== 'mobile_money') return { status: 'prompt_sent', promptType: 'manual_instructions', checkoutUrl: null, providerReference: reference, message: manualMessageForMethod(method) };
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
    if (duplicate) {
      const err = new Error('This payment reference/code has already been submitted. Use a unique M-Pesa code, bank reference, or provider reference.');
      err.statusCode = 409;
      throw err;
    }

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
      const nextStatus = prompt.promptType === 'manual_instructions'
        ? 'pending_verification'
        : (prompt.promptType === 'checkout_url' ? 'pending_customer_action' : 'pending_provider_confirmation');
      await payment.update({ status: nextStatus, promptStatus: prompt.status, promptType: prompt.promptType, checkoutUrl: prompt.checkoutUrl || null, providerReference: prompt.providerReference || null, transactionId: prompt.checkoutRequestId || prompt.providerReference || payment.transactionId, checkoutRequestId: prompt.checkoutRequestId || payment.checkoutRequestId, merchantRequestId: prompt.merchantRequestId || payment.merchantRequestId, gatewayResponse: prompt.gatewayResponse || {}, metadata: { ...(payment.metadata || {}), promptMessage: prompt.message, backendExecution: 'provider_prompt_created_server_side', backendFinalizationRule: 'ui_never_marks_paid_provider_or_admin_must_confirm' } }, { transaction });
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


function currencyMatches(expected, actual) {
  const e = String(expected || 'KES').toUpperCase();
  const a = String(actual || e).toUpperCase();
  return e === a;
}

function nullableCleanAmount(value) {
  if (value === undefined || value === null || value === '') return null;
  return cleanAmount(value);
}

async function holdPaymentForManualReview({ locked, event, reason, provider, providerReference, amount, currency, rawPayload, transaction }) {
  const trail = Array.isArray(locked.auditTrail) ? locked.auditTrail : [];
  trail.push({ action: 'provider_confirmation_held_for_manual_review', provider, at: new Date().toISOString(), providerReference, amount, currency, reason });
  let confirmedAmount = null;
  try { confirmedAmount = nullableCleanAmount(amount); } catch (_) { confirmedAmount = null; }
  await locked.update({
    status: 'pending_manual_review',
    providerStatus: 'verification_hold',
    providerReference: providerReference || locked.providerReference,
    confirmedAmount: confirmedAmount || locked.confirmedAmount,
    confirmedCurrency: currency || locked.confirmedCurrency,
    reconciliationStatus: 'manual_review_required',
    gatewayResponse: rawPayload || locked.gatewayResponse,
    auditTrail: trail,
    metadata: { ...(locked.metadata || {}), paymentHold: { reason, provider, providerReference, amount, currency, at: new Date().toISOString() }, lastProviderPayload: rawPayload || {} }
  }, { transaction });
  if (event) await event.update({ processed: true, paymentId: locked.id, schoolCode: locked.schoolCode, processingError: reason }, { transaction });
}

async function createPaymentEventSafely({ provider, providerEventId, eventType = 'webhook', extracted, payload, headers, sourceIp }) {
  try {
    return await PaymentEvent.create({
      provider,
      providerEventId,
      eventType,
      internalReference: extracted.reference || null,
      providerReference: extracted.providerReference || null,
      verified: false,
      rawPayload: payload || {},
      sourceIp: sourceIp || null,
      metadata: { headers: webhookVerifier.sanitizeHeaders(headers), sourceIp: sourceIp || null, verification: { status: 'not_checked' } }
    });
  } catch (error) {
    if (error && (error.name === 'SequelizeUniqueConstraintError' || error.name === 'SequelizeDatabaseError')) {
      const existing = await PaymentEvent.findOne({ where: { provider, providerEventId } }).catch(() => null);
      if (existing) { existing._shuleDuplicateWebhookEvent = true; return existing; }
    }
    throw error;
  }
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

    if ((paid && FINAL_PAID.includes(String(locked.status).toLowerCase())) || (failed && FINAL_FAILED.includes(String(locked.status).toLowerCase()))) {
      if (event) await event.update({ processed: true, paymentId: locked.id, schoolCode: locked.schoolCode, processingError: null }, { transaction });
      return;
    }

    const confirmedAmount = nullableCleanAmount(amount);
    if (paid) {
      const expectedAmount = cleanAmount(locked.amount);
      if (!confirmedAmount) {
        await holdPaymentForManualReview({ locked, event, reason: 'Provider reported success without a confirmed amount.', provider, providerReference, amount, currency, rawPayload, transaction });
        return;
      }
      if (confirmedAmount < expectedAmount) {
        await holdPaymentForManualReview({ locked, event, reason: `Confirmed amount ${confirmedAmount} is lower than expected amount ${expectedAmount}.`, provider, providerReference, amount, currency, rawPayload, transaction });
        return;
      }
      if (!currencyMatches(locked.currency, currency)) {
        await holdPaymentForManualReview({ locked, event, reason: `Currency mismatch. Expected ${locked.currency || 'KES'}, got ${currency || 'missing'}.`, provider, providerReference, amount, currency, rawPayload, transaction });
        return;
      }
    }

    const trail = Array.isArray(locked.auditTrail) ? locked.auditTrail : [];
    trail.push({ action: paid ? 'provider_confirmed_paid' : (failed ? 'provider_confirmed_failed' : 'provider_pending'), provider, at: new Date().toISOString(), providerReference, amount: confirmedAmount || amount, currency });
    await locked.update({
      status: paid ? 'completed' : (failed ? 'failed' : 'processing'),
      providerStatus: status,
      providerReference: providerReference || locked.providerReference,
      confirmedAmount: confirmedAmount || locked.confirmedAmount,
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

    await financialSystem.finalizeConfirmedPayment({ legacyPayment: locked, status, provider, providerReference, amount: confirmedAmount || amount, currency, rawPayload, event, transaction });
    await finalizeSubscriptionSideEffects({ payment: await locked.reload({ transaction }), status, providerReference, rawPayload, transaction }).catch(err => { throw err; });
    if (paid && locked.paymentType === SCHOOL_FEE && locked.feeId) await financeLedger.recalculateFeeAccount(locked.feeId, { transaction }).catch(() => null);
    if (event) await event.update({ processed: true, paymentId: locked.id, schoolCode: locked.schoolCode, processingError: null }, { transaction });
  });
  realtimeSync.emitPaymentUpdate(payment.schoolCode, { paymentId: payment.id, studentId: payment.studentId, feeId: payment.feeId, status: status === 'paid' ? 'completed' : status, action: 'payment_provider_confirmation', provider });
  return Payment.findByPk(payment.id);
}

async function handleWebhook({ provider, payload, headers = {}, rawBody = null, sourceIp = '' }) {
  provider = normalizeProvider(provider);
  const extracted = extractWebhook(provider, payload);
  const status = normalizeProviderStatus(provider, payload);
  const providerEventId = extracted.eventId ? String(extracted.eventId) : `${provider}:${extracted.reference || extracted.providerReference || crypto.createHash('sha256').update(JSON.stringify(payload || {})).digest('hex')}`;
  const eventSourceIp = webhookVerifier.sourceIp(headers, sourceIp);
  const event = await createPaymentEventSafely({ provider, providerEventId, extracted, payload, headers, sourceIp: eventSourceIp });
  if (event?.processed) return { accepted: true, duplicate: true };
  if (event?._shuleDuplicateWebhookEvent) return { accepted: true, duplicateInProgress: true };

  const payment = await Payment.findOne({
    where: {
      [Op.or]: [
        { reference: extracted.reference || '' },
        { providerReference: extracted.providerReference || '' },
        { transactionId: extracted.providerReference || '' },
        { checkoutRequestId: extracted.providerReference || '' },
        { merchantRequestId: extracted.rawParsed?.merchantRequestId || extracted.providerReference || '' }
      ]
    }
  });

  if (!payment) {
    await event.update({ processingError: 'Payment not found yet; no money record changed.', processed: false, metadata: { ...(event.metadata || {}), verification: { status: 'not_checked_no_matching_payment' } } });
    return { accepted: true, pending: true };
  }

  if (normalizeProviderIfPossible(payment.paymentGateway) && normalizeProviderIfPossible(payment.paymentGateway) !== provider) {
    await event.update({ processingError: `Provider mismatch: payment expects ${payment.paymentGateway}, webhook came from ${provider}`, processed: false, paymentId: payment.id, schoolCode: payment.schoolCode });
    return { accepted: true, ignored: true, reason: 'provider_mismatch' };
  }

  let config = {};
  try {
    config = await getProviderConfig({ paymentType: payment.paymentType, schoolCode: payment.schoolCode, provider });
  } catch (err) {
    await event.update({ processingError: 'Provider config unavailable: ' + err.message, processed: false, paymentId: payment.id, schoolCode: payment.schoolCode });
    return { accepted: true, ignored: true, reason: 'provider_config_unavailable' };
  }

  const verification = webhookVerifier.verifyWebhook({ provider, rawBody, payload, headers, config, sourceIp: eventSourceIp });
  if (!verification.verified) {
    await event.update({
      verified: false,
      verificationMethod: verification.method || null,
      sourceIp: eventSourceIp || null,
      processed: true,
      paymentId: payment.id,
      schoolCode: payment.schoolCode,
      processingError: verification.reason || 'webhook_verification_failed',
      metadata: { ...(event.metadata || {}), verification }
    });
    return { accepted: true, rejected: true, reason: verification.reason || 'webhook_verification_failed' };
  }

  await event.update({
    verified: true,
    verificationMethod: verification.method || null,
    sourceIp: eventSourceIp || null,
    paymentId: payment.id,
    schoolCode: payment.schoolCode,
    metadata: { ...(event.metadata || {}), verification, headers: webhookVerifier.sanitizeHeaders(headers), sourceIp: eventSourceIp }
  });

  let finalStatus = status;
  let finalProviderReference = extracted.providerReference;
  let finalAmount = extracted.amount;
  let finalCurrency = extracted.currency;
  let finalReceiptNumber = extracted.receiptNumber;
  let finalPayload = payload;

  // M-Pesa callbacks are not finalized just because ResultCode is 0. When possible,
  // query Daraja using the original CheckoutRequestID and merge the verified status.
  if (provider === 'mpesa' && status === 'paid' && extracted.providerReference) {
    try {
      const checked = await daraja.querySTKStatus(extracted.providerReference, config);
      finalPayload = { notificationPayload: payload, statusCheck: checked };
      if (checked?.ResultCode !== undefined && checked?.ResultCode !== null) {
        finalStatus = Number(checked.ResultCode) === 0 ? 'paid' : 'failed';
      } else {
        await event.update({ processingError: 'M-Pesa callback accepted, but Daraja status query did not return a final ResultCode.', processed: false, paymentId: payment.id, schoolCode: payment.schoolCode });
        return { accepted: true, paymentId: payment.id, status: 'pending_status_check', warning: 'Daraja status query did not return a final ResultCode' };
      }
    } catch (err) {
      await event.update({ processingError: 'M-Pesa callback accepted, but Daraja status query failed: ' + err.message, processed: false, paymentId: payment.id, schoolCode: payment.schoolCode });
      return { accepted: true, paymentId: payment.id, status: 'pending_status_check', warning: err.message };
    }
  }

  // PesaPal IPN/callback payloads are treated only as a notification.
  // The backend must query PesaPal for the real transaction status before marking anything paid.
  if (provider === 'pesapal' && (extracted.providerReference || extracted.reference)) {
    try {
      const checked = await queryPesapalTransactionStatus({ trackingId: extracted.providerReference, merchantReference: extracted.reference || payment.reference, config });
      finalStatus = checked.status;
      finalProviderReference = checked.providerReference || finalProviderReference;
      finalAmount = checked.amount || finalAmount;
      finalCurrency = checked.currency || finalCurrency;
      finalReceiptNumber = checked.receiptNumber || finalReceiptNumber;
      finalPayload = { notificationPayload: payload, statusCheck: checked.gatewayResponse };
    } catch (err) {
      await event.update({ processingError: 'Pesapal notification accepted, but status check failed: ' + err.message, processed: false, paymentId: payment.id, schoolCode: payment.schoolCode });
      return { accepted: true, paymentId: payment.id, status: 'pending_status_check', warning: err.message };
    }
  }

  await processConfirmedPayment({ payment, status: finalStatus, provider, providerReference: finalProviderReference, amount: finalAmount, currency: finalCurrency, rawPayload: finalPayload, event, receiptNumber: finalReceiptNumber });
  return { accepted: true, paymentId: payment.id, status: finalStatus };
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

async function persistProviderConfig({ scope, schoolCode, provider, patch = {} }) {
  const row = scope === 'platform' ? await getPlatformRow() : await getSchoolRow(schoolCode);
  provider = normalizeProvider(provider || activeProviderFromRow(row));
  const existing = providerMap(row);
  const current = providerConfigFromMap(existing, provider) || {};
  const merged = vault.mergeEncryptedCredentials(current, { ...patch, provider, enabled: true, updatedAt: new Date().toISOString() }, SECRET_FIELDS);
  const metadata = { ...(row.metadata || {}), paymentProviders: lockedProviderMap(existing, provider, merged, true), activeProvider: provider, defaultProvider: provider, enabledProviders: [provider], providerLock: 'one_active_provider' };
  await row.update({ metadata, enabledProviders: [provider], defaultProvider: provider, paymentMode: paymentModeForProvider(provider) });
  return serializeSettings(await row.reload());
}

async function testProviderConnection({ scope = 'school', schoolCode, user }) {
  const row = scope === 'platform' ? await getPlatformRow() : await getSchoolRow(schoolCode);
  const provider = activeProviderFromRow(row);
  if (!provider) throw new Error(scope === 'platform' ? 'No active platform provider configured.' : 'No active school provider configured.');
  const config = await getProviderConfig({ paymentType: scope === 'platform' ? PLATFORM : SCHOOL_FEE, schoolCode: schoolCode || row.schoolCode, provider });
  if (provider === 'mpesa') {
    const token = await daraja.getAccessToken(config);
    return { provider, ok: true, message: 'M-Pesa/Daraja credentials are valid. STK Push can be initiated.', details: { tokenReceived: !!token, mode: config.mode || config.environment || 'sandbox', callbackUrl: config.callbackUrl || publicUrl('/api/payments/mpesa/callback') } };
  }
  if (provider === 'pesapal') {
    let notificationId = config.ipnId || config.notificationId || config.notification_id || process.env.PESAPAL_IPN_ID;
    let registered = null;
    if (!notificationId) {
      registered = await registerPesapalIpn({ ...config, ipnUrl: config.ipnUrl || config.webhookUrl || publicUrl('/api/payments/webhook/pesapal') });
      notificationId = registered.notificationId;
      await persistProviderConfig({ scope, schoolCode, provider, patch: { ipnId: notificationId, notificationId, ipnUrl: registered.ipnUrl, webhookUrl: registered.ipnUrl } });
    } else {
      await getPesapalToken(config);
    }
    return { provider, ok: true, message: registered ? 'PesaPal connected. IPN was registered and saved automatically.' : 'PesaPal connected. Consumer credentials and IPN ID are present.', details: { ipnId: notificationId, ipnUrl: registered?.ipnUrl || config.ipnUrl || config.webhookUrl || publicUrl('/api/payments/webhook/pesapal') } };
  }
  if (provider === 'paystack') {
    if (!config.secretKey) throw new Error('Paystack secret key is missing.');
    return { provider, ok: true, message: 'Paystack credentials are present. Live checkout will be tested when a payment is started.' };
  }
  if (provider === 'flutterwave') {
    if (!config.secretKey) throw new Error('Flutterwave secret key is missing.');
    return { provider, ok: true, message: 'Flutterwave credentials are present. Live checkout will be tested when a payment is started.' };
  }
  if (provider === 'stripe') {
    if (!config.secretKey) throw new Error('Stripe secret key is missing.');
    return { provider, ok: true, message: 'Stripe credentials are present. Live checkout will be tested when a payment is started.' };
  }
  if (['manual','bank','cash','card'].includes(provider)) {
    return { provider, ok: true, message: `${providerLabel(provider)} is enabled. Payments will enter the verification queue.` };
  }
  return { provider, ok: true, message: `${providerLabel(provider)} is configured.` };
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
  testProviderConnection,
  queryPesapalTransactionStatus,
  normalizeProvider,
  normalizePaymentType,
  normalizePaymentMethod,
  providerReadiness
};
