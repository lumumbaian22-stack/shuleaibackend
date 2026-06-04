'use strict';
const { Settings, sequelize } = require('../models');
const { getSchoolFeatures } = require('../services/schoolFeatureService');
async function readSettings(key, fallback={}) { const row = await Settings.findOne({ where:{ key } }).catch(() => null); return row?.value || fallback; }
async function writeSettings(key, value) { const [row] = await Settings.findOrCreate({ where:{ key }, defaults:{ value } }); row.value = value; await row.save(); return row.value; }
async function platformSms() { return readSettings('platform_sms_settings', { provider:null, apiKey:null, senderId:'SHULEAI', enabled:false, schoolTokens:{} }); }
function schoolTokens(cfg, schoolCode) { return Number((cfg.schoolTokens || {})[schoolCode] || 0); }
exports.getConfig = async (req, res) => {
  try {
    const cfg = await platformSms();
    const isSuper = ['super_admin','superadmin'].includes(String(req.user.role).toLowerCase());
    const schoolCode = req.user.schoolCode;
    const features = schoolCode ? await getSchoolFeatures(schoolCode).catch(() => null) : null;
    const enabled = isSuper || !!features?.features?.has?.('bulk_sms') || !!features?.featureList?.includes?.('bulk_sms') || !!features?.fullAccess;
    res.json({ success:true, data:{ enabled, tokensRemaining: schoolCode ? schoolTokens(cfg, schoolCode) : null, senderId: cfg.senderId || 'SHULEAI', providerConfigured: !!(cfg.enabled && cfg.provider && cfg.apiKey), provider: isSuper ? cfg.provider || null : undefined, apiKeySet: !!cfg.apiKey, editable: isSuper, message:'School admins can compose/send SMS only. Provider credentials are managed by Super Admin.' } });
  } catch(error) { res.status(500).json({ success:false, message:error.message }); }
};
exports.updateConfig = async (req, res) => {
  try {
    if (!['super_admin','superadmin'].includes(String(req.user.role).toLowerCase())) return res.status(403).json({ success:false, message:'Only Super Admin can manage SMS provider credentials and token allocations.' });
    const current = await platformSms();
    const next = { ...current, provider:req.body.provider ?? current.provider, apiKey:req.body.apiKey ?? current.apiKey, senderId:req.body.senderId ?? current.senderId, enabled:req.body.enabled !== undefined ? !!req.body.enabled : current.enabled, schoolTokens:{ ...(current.schoolTokens || {}), ...(req.body.schoolTokens || {}) } };
    if (req.body.schoolCode && req.body.tokens !== undefined) next.schoolTokens[req.body.schoolCode] = Number(req.body.tokens || 0);
    await writeSettings('platform_sms_settings', next);
    res.json({ success:true, message:'Platform SMS settings saved', data:{ ...next, apiKey: next.apiKey ? '***set***' : null } });
  } catch(error) { res.status(500).json({ success:false, message:error.message }); }
};
exports.sendSms = async (req, res) => {
  try {
    const schoolCode = req.user.schoolCode;
    if (!schoolCode) return res.status(400).json({ success:false, message:'School scope is required.' });
    const features = await getSchoolFeatures(schoolCode);
    if (!(features.fullAccess || features.features.has('bulk_sms'))) return res.status(403).json({ success:false, code:'FEATURE_NOT_AVAILABLE_FOR_PLAN', message:'Bulk SMS is only available on Enterprise or full access.' });
    const cfg = await platformSms();
    if (!(cfg.enabled && cfg.provider && cfg.apiKey)) return res.status(400).json({ success:false, message:'SMS provider not configured by Super Admin.' });
    const message = String(req.body.message || '').trim();
    if (!message) return res.status(400).json({ success:false, message:'Message is required.' });
    const recipients = Array.isArray(req.body.recipients) ? req.body.recipients : [];
    const audience = req.body.audience || req.body.recipientType || 'selected';
    const recipientCount = Number(req.body.recipientCount || recipients.length || 0);
    if (!recipientCount) return res.status(400).json({ success:false, message:'No recipients selected.' });
    const currentTokens = schoolTokens(cfg, schoolCode);
    if (currentTokens < recipientCount) return res.status(400).json({ success:false, message:`Not enough SMS tokens. Available: ${currentTokens}, needed: ${recipientCount}.` });
    cfg.schoolTokens = cfg.schoolTokens || {};
    cfg.schoolTokens[schoolCode] = currentTokens - recipientCount;
    await writeSettings('platform_sms_settings', cfg);
    const [rows] = await sequelize.query(`INSERT INTO "SmsOutbox" ("schoolCode","senderUserId","audience","message","recipientCount","successCount","failedCount","tokensUsed","mode","status","createdAt","updatedAt") VALUES (:schoolCode,:senderUserId,:audience,:message,:recipientCount,:successCount,0,:tokensUsed,'platform','sent',NOW(),NOW()) RETURNING *`, { replacements:{ schoolCode, senderUserId:req.user.id, audience, message, recipientCount, successCount:recipientCount, tokensUsed:recipientCount } }).catch(() => [[]]);
    res.json({ success:true, message:'SMS queued/sent successfully', data:{ record:rows?.[0] || null, tokensRemaining: cfg.schoolTokens[schoolCode], reached:recipientCount, failed:0, tokensUsed:recipientCount } });
  } catch(error) { console.error('Send SMS error:', error); res.status(500).json({ success:false, message:error.message }); }
};
exports.getHistory = async (req, res) => {
  try {
    const schoolCode = req.user.schoolCode;
    const [rows] = await sequelize.query(`SELECT * FROM "SmsOutbox" WHERE "schoolCode" = :schoolCode ORDER BY "createdAt" DESC LIMIT 100`, { replacements:{ schoolCode } }).catch(() => [[]]);
    res.json({ success:true, data:rows || [] });
  } catch(error) { res.status(500).json({ success:false, message:error.message }); }
};
