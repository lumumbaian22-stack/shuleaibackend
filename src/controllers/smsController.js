'use strict';

const { Settings, sequelize } = require('../models');

function scopeKey(req) {
  const role = String(req.user?.role || '').toLowerCase();
  return role === 'super_admin' || role === 'superadmin' ? 'platform' : (req.user?.schoolCode || 'default');
}
function settingsKey(scope) { return `sms_settings_${scope}`; }
function defaultSettings(scope) {
  return {
    scope,
    mode: 'manual_pending_api',
    activeProvider: 'noop',
    providers: [],
    tokenBalance: 0,
    monthlyLimit: 0,
    usedThisMonth: 0,
    senderId: 'SHULEAI',
    apiReady: false,
    notes: 'Provider-neutral SMS module is ready. Add Africa\'s Talking, Twilio, Infobip, Celcom, or another provider credentials when available.'
  };
}
async function getSettings(scope) {
  const row = await Settings.findOne({ where: { key: settingsKey(scope) } }).catch(() => null);
  return row?.value || defaultSettings(scope);
}

exports.getConfig = async (req, res) => {
  try {
    const scope = scopeKey(req);
    res.json({ success: true, data: await getSettings(scope) });
  } catch (error) { res.status(500).json({ success:false, message:error.message }); }
};

exports.updateConfig = async (req, res) => {
  try {
    const scope = scopeKey(req);
    const current = await getSettings(scope);
    const next = {
      ...current,
      ...req.body,
      scope,
      providers: Array.isArray(req.body.providers) ? req.body.providers : (current.providers || []),
      tokenBalance: Number(req.body.tokenBalance ?? current.tokenBalance ?? 0),
      monthlyLimit: Number(req.body.monthlyLimit ?? current.monthlyLimit ?? 0),
      usedThisMonth: Number(current.usedThisMonth || 0),
      updatedBy: req.user?.id || null,
      updatedAt: new Date().toISOString()
    };
    const [row] = await Settings.findOrCreate({ where: { key: settingsKey(scope) }, defaults: { value: next, description: 'Shule AI SMS provider/token settings' } });
    if (!row.isNewRecord) await row.update({ value: next, description: 'Shule AI SMS provider/token settings' });
    res.json({ success:true, message:'SMS settings saved', data: next });
  } catch (error) { res.status(500).json({ success:false, message:error.message }); }
};

exports.sendSms = async (req, res) => {
  try {
    const scope = scopeKey(req);
    const config = await getSettings(scope);
    const recipients = Array.isArray(req.body.recipients) ? req.body.recipients.filter(Boolean) : [];
    const message = String(req.body.message || '').trim();
    if (!recipients.length) return res.status(400).json({ success:false, message:'At least one recipient phone number is required' });
    if (!message) return res.status(400).json({ success:false, message:'SMS message is required' });
    const tokensNeeded = recipients.length;
    const available = Number(config.tokenBalance || 0) - Number(config.usedThisMonth || 0);
    if (!config.apiReady || config.activeProvider === 'noop') {
      return res.json({ success:true, queued:false, mode:'provider_pending', message:'SMS API provider is not connected yet. Draft validated and ready for provider integration.', data:{ recipients:recipients.length, tokensNeeded, available } });
    }
    if (available < tokensNeeded) return res.status(402).json({ success:false, message:'SMS token balance is too low for this send', data:{ tokensNeeded, available } });
    const next = { ...config, usedThisMonth: Number(config.usedThisMonth || 0) + tokensNeeded, lastSendAt: new Date().toISOString() };
    const row = await Settings.findOne({ where: { key: settingsKey(scope) } });
    if (row) await row.update({ value: next });
    await sequelize.query(`CREATE TABLE IF NOT EXISTS "SmsOutbox" ("id" SERIAL PRIMARY KEY, "scope" VARCHAR(255), "createdBy" INTEGER, "provider" VARCHAR(255), "recipientCount" INTEGER, "message" TEXT, "status" VARCHAR(255), "metadata" JSONB DEFAULT '{}'::jsonb, "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW(), "updatedAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW())`).catch(() => null);
    await sequelize.query(`INSERT INTO "SmsOutbox" ("scope","createdBy","provider","recipientCount","message","status","metadata","createdAt","updatedAt") VALUES (:scope,:createdBy,:provider,:recipientCount,:message,'queued',:metadata::jsonb,NOW(),NOW())`, { replacements:{ scope, createdBy:req.user?.id || null, provider:config.activeProvider, recipientCount:recipients.length, message, metadata:JSON.stringify({ recipients }) } }).catch(() => null);
    res.json({ success:true, queued:true, message:'SMS queued for provider dispatch', data:{ recipients:recipients.length, tokensUsed:tokensNeeded, remaining:Number(next.tokenBalance || 0)-Number(next.usedThisMonth || 0) } });
  } catch (error) { res.status(500).json({ success:false, message:error.message }); }
};
