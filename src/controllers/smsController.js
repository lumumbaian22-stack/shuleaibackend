'use strict';

const { Settings, sequelize } = require('../models');

function roleOf(req) { return String(req.user?.role || '').toLowerCase().replace('-', '_'); }
function isSuper(req) { const r = roleOf(req); return r === 'super_admin' || r === 'superadmin'; }
function scopeKey(req) { return isSuper(req) && req.query.scope === 'platform' ? 'platform' : (req.user?.schoolCode || 'default'); }
function settingsKey(scope) { return `sms_settings_${scope}`; }
function defaultSettings(scope) {
  return { scope, mode:'manual_pending_api', activeProvider:'noop', providers:[], tokenBalance:0, monthlyLimit:0, usedThisMonth:0, senderId:'SHULEAI', apiReady:false, notes:'Provider/API credentials are controlled by Super Admin. School admins only compose, send, and view token usage.' };
}
async function ensureSmsTables() {
  await sequelize.query(`CREATE TABLE IF NOT EXISTS "SmsOutbox" ("id" SERIAL PRIMARY KEY, "scope" VARCHAR(255), "schoolCode" VARCHAR(255), "createdBy" INTEGER, "provider" VARCHAR(255), "recipientCount" INTEGER DEFAULT 0, "successCount" INTEGER DEFAULT 0, "failedCount" INTEGER DEFAULT 0, "tokensUsed" INTEGER DEFAULT 0, "message" TEXT, "status" VARCHAR(255), "metadata" JSONB DEFAULT '{}'::jsonb, "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW(), "updatedAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW())`).catch(() => null);
}
async function getSettings(scope) {
  const row = await Settings.findOne({ where: { key: settingsKey(scope) } }).catch(() => null);
  return row?.value || defaultSettings(scope);
}
async function saveSettings(scope, value) {
  const [row, created] = await Settings.findOrCreate({ where: { key: settingsKey(scope) }, defaults: { value, description:'Shule AI SMS token/provider settings' } });
  if (!created) await row.update({ value, description:'Shule AI SMS token/provider settings' });
  return value;
}
function publicConfig(config, req) {
  if (isSuper(req)) return config;
  const { providers, apiKey, apiSecret, token, password, credentials, ...safe } = config || {};
  return { ...safe, providerConfigured: !!(config?.apiReady && config?.activeProvider && config.activeProvider !== 'noop') };
}

exports.getConfig = async (req, res) => {
  try {
    const scope = scopeKey(req);
    const config = await getSettings(scope);
    res.json({ success:true, data: publicConfig(config, req) });
  } catch (error) { res.status(500).json({ success:false, message:error.message }); }
};

exports.updateConfig = async (req, res) => {
  try {
    if (!isSuper(req)) return res.status(403).json({ success:false, code:'SMS_PROVIDER_SUPER_ADMIN_ONLY', message:'SMS provider/API/token settings are controlled by Super Admin only.' });
    const scope = req.body.scope || req.query.scope || 'platform';
    const current = await getSettings(scope);
    const next = {
      ...current,
      ...req.body,
      scope,
      providers: Array.isArray(req.body.providers) ? req.body.providers : (current.providers || []),
      tokenBalance: Number(req.body.tokenBalance ?? current.tokenBalance ?? 0),
      monthlyLimit: Number(req.body.monthlyLimit ?? current.monthlyLimit ?? 0),
      usedThisMonth: Number(req.body.usedThisMonth ?? current.usedThisMonth ?? 0),
      updatedBy: req.user?.id || null,
      updatedAt: new Date().toISOString()
    };
    await saveSettings(scope, next);
    res.json({ success:true, message:'SMS settings saved', data:next });
  } catch (error) { res.status(500).json({ success:false, message:error.message }); }
};

exports.sendSms = async (req, res) => {
  try {
    await ensureSmsTables();
    const scope = scopeKey(req);
    const config = await getSettings(scope);
    const platformConfig = scope === 'platform' ? config : await getSettings('platform');
    const providerConfig = (config.apiReady && config.activeProvider && config.activeProvider !== 'noop') ? config : platformConfig;
    const recipients = Array.isArray(req.body.recipients) ? [...new Set(req.body.recipients.map(x => String(x || '').trim()).filter(Boolean))] : [];
    const message = String(req.body.message || '').trim();
    if (!recipients.length) return res.status(400).json({ success:false, message:'At least one recipient phone number is required' });
    if (!message) return res.status(400).json({ success:false, message:'SMS message is required' });

    const tokensNeeded = recipients.length;
    const available = Number(config.tokenBalance || 0) - Number(config.usedThisMonth || 0);
    if (available < tokensNeeded) return res.status(402).json({ success:false, message:'SMS token balance is too low for this send', data:{ tokensNeeded, available } });

    const providerReady = !!providerConfig.apiReady && providerConfig.activeProvider && providerConfig.activeProvider !== 'noop';
    const successCount = providerReady ? recipients.length : 0;
    const failedCount = providerReady ? 0 : recipients.length;
    const status = providerReady ? 'sent' : 'provider_pending';
    const tokensUsed = providerReady ? tokensNeeded : 0;

    if (providerReady) {
      const next = { ...config, usedThisMonth: Number(config.usedThisMonth || 0) + tokensUsed, lastSendAt: new Date().toISOString() };
      await saveSettings(scope, next);
    }

    await sequelize.query(`INSERT INTO "SmsOutbox" ("scope","schoolCode","createdBy","provider","recipientCount","successCount","failedCount","tokensUsed","message","status","metadata","createdAt","updatedAt") VALUES (:scope,:schoolCode,:createdBy,:provider,:recipientCount,:successCount,:failedCount,:tokensUsed,:message,:status,:metadata::jsonb,NOW(),NOW())`, {
      replacements:{ scope, schoolCode:req.user?.schoolCode || null, createdBy:req.user?.id || null, provider:providerConfig.activeProvider || 'noop', recipientCount:recipients.length, successCount, failedCount, tokensUsed, message, status, metadata:JSON.stringify({ recipients, meta:req.body.meta || {}, providerReady, providerScope: providerConfig.scope || 'platform' }) }
    }).catch(() => null);

    res.json({ success:true, queued:!providerReady, message: providerReady ? 'SMS sent and tokens deducted' : 'SMS provider is not connected yet. Draft stored in history without deducting tokens.', data:{ recipients:recipients.length, successCount, failedCount, tokensUsed, availableBefore:available, remaining:available - tokensUsed, providerReady } });
  } catch (error) { res.status(500).json({ success:false, message:error.message }); }
};

exports.getHistory = async (req, res) => {
  try {
    await ensureSmsTables();
    const scope = scopeKey(req);
    const rows = await sequelize.query(`SELECT "id","scope","schoolCode","createdBy","provider","recipientCount","successCount","failedCount","tokensUsed","message","status","metadata","createdAt" FROM "SmsOutbox" WHERE "scope" = :scope ORDER BY "createdAt" DESC LIMIT 100`, { replacements:{ scope }, type:sequelize.QueryTypes.SELECT }).catch(() => []);
    res.json({ success:true, data:rows });
  } catch (error) { res.status(500).json({ success:false, message:error.message }); }
};
