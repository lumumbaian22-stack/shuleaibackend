const { Alert, User, School, sequelize } = require('../models');
const { generateParentAlertSuggestion } = require('../services/aiProviderService');

exports.getMyAlerts = async (req, res) => {
  try {
    const alerts = await Alert.findAll({
      where: { userId: req.user.id },
      order: [['createdAt', 'DESC']],
      limit: 50
    });
    res.json({ success: true, data: alerts });
  } catch (error) {
    console.error('Get alerts error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.markAlertAsRead = async (req, res) => {
  try {
    const { id } = req.params;
    await Alert.update({ isRead: true }, { where: { id, userId: req.user.id } });
    res.json({ success: true });
  } catch (error) {
    console.error('Mark read error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.markAllAsRead = async (req, res) => {
  try {
    await Alert.update({ isRead: true }, { where: { userId: req.user.id, isRead: false } });
    res.json({ success: true });
  } catch (error) {
    console.error('Mark all read error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};



async function getSchoolAiSuggestionLimit(schoolCode) {
  const row = await sequelize.query(
    `SELECT sp."limits"
       FROM "Subscriptions" s
       LEFT JOIN "SubscriptionPlans" sp ON sp."id" = s."planId"
      WHERE s."ownerType" = 'school'
        AND s."schoolCode" = :schoolCode
        AND s."status" = 'active'
        AND (s."endDate" IS NULL OR s."endDate" > NOW())
      ORDER BY s."endDate" DESC NULLS LAST
      LIMIT 1`,
    { replacements: { schoolCode }, type: sequelize.QueryTypes.SELECT }
  ).catch(() => []);
  const limits = row?.[0]?.limits || {};
  const explicit = Number(limits.aiAlertSuggestionsPerMonth || limits.aiInsightsPerMonth || limits.aiSuggestionsPerMonth);
  if (Number.isFinite(explicit) && explicit > 0) return explicit;
  return Number(process.env.DEFAULT_SCHOOL_AI_ALERT_SUGGESTIONS_PER_MONTH || 100);
}

async function getCurrentAiSuggestionUsage(schoolCode, month) {
  const rows = await sequelize.query(
    `SELECT "usedCount" FROM "AIInsightUsages" WHERE "schoolCode" = :schoolCode AND "usageMonth" = :month LIMIT 1`,
    { replacements: { schoolCode, month }, type: sequelize.QueryTypes.SELECT }
  ).catch(() => []);
  return Number(rows?.[0]?.usedCount || 0);
}

async function incrementAiSuggestionUsage({ schoolCode, month, provider, model }) {
  await sequelize.query(
    `INSERT INTO "AIInsightUsages" ("schoolCode", "usageMonth", "usedCount", "provider", "model", "createdAt", "updatedAt")
     VALUES (:schoolCode, :month, 1, :provider, :model, NOW(), NOW())
     ON CONFLICT ("schoolCode", "usageMonth")
     DO UPDATE SET "usedCount" = "AIInsightUsages"."usedCount" + 1,
                   "provider" = EXCLUDED."provider",
                   "model" = EXCLUDED."model",
                   "updatedAt" = NOW()`,
    { replacements: { schoolCode, month, provider, model } }
  );
}

exports.suggestParentAlert = async (req, res) => {
  try {
    if (!['admin', 'super_admin'].includes(req.user.role)) {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }
    const schoolCode = req.user.schoolCode;
    const month = new Date().toISOString().slice(0, 7);
    const limit = await getSchoolAiSuggestionLimit(schoolCode);
    const used = await getCurrentAiSuggestionUsage(schoolCode, month);
    if (used >= limit) {
      return res.status(403).json({
        success: false,
        message: 'Monthly Shule AI alert suggestion limit reached for this school subscription.',
        data: { used, limit, sourceType: 'ai_generated' }
      });
    }

    const { audience, topic, tone, description, extraContext } = req.body || {};
    if (!String(description || '').trim()) {
      return res.status(400).json({ success: false, message: 'Brief description is required for Shule AI to suggest a parent alert.' });
    }
    const school = schoolCode ? await School.findOne({ where: { schoolId: schoolCode }, skipTenantScope: true }).catch(() => null) : null;
    const suggestion = await generateParentAlertSuggestion({
      audience,
      topic,
      tone,
      description,
      schoolName: school?.name || schoolCode || 'the school',
      extraContext
    });
    await incrementAiSuggestionUsage({ schoolCode, month, provider: suggestion.provider, model: suggestion.model });
    res.json({
      success: true,
      data: {
        ...suggestion,
        sourceType: 'ai_generated',
        aiLabel: 'AI-generated message suggestion',
        usage: { used: used + 1, limit, month }
      }
    });
  } catch (error) {
    console.error('Suggest parent alert error:', error);
    res.status(error.status || 500).json({ success: false, message: error.message || 'Failed to generate alert suggestion' });
  }
};

// Create alerts with severity and audience support
exports.createAlert = async (req, res) => {
  try {
    const {
      userId,
      userIds,
      roles,
      role,
      targetAudience,
      type,
      category,
      severity,
      title,
      message,
      data,
      deliveryMethods,
      scheduledAt
    } = req.body;

    if (!['admin', 'super_admin', 'teacher'].includes(req.user.role)) {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }

    const rawSeverity = String(severity || 'info').toLowerCase();
    const severityMap = {
      low: 'info',
      info: 'info',
      medium: 'warning',
      warning: 'warning',
      high: 'warning',
      critical: 'critical',
      success: 'success'
    };
    const dbSeverity = severityMap[rawSeverity] || 'info';

    let recipients = [];
    if (Array.isArray(userIds) && userIds.length) {
      recipients = await User.findAll({ where: { id: userIds, schoolCode: req.user.schoolCode } });
    } else if (userId) {
      const user = await User.findOne({ where: { id: userId, schoolCode: req.user.schoolCode } });
      if (user) recipients = [user];
    } else {
      const selectedRoles = Array.isArray(roles) && roles.length ? roles : (role ? [role] : (Array.isArray(targetAudience) ? targetAudience : ['student']));
      const cleanRoles = selectedRoles.map(r => String(r).toLowerCase()).filter(r => ['student','parent','teacher','admin'].includes(r));
      recipients = await User.findAll({
        where: {
          role: cleanRoles.length ? cleanRoles : ['student'],
          schoolCode: req.user.schoolCode,
          isActive: true
        }
      });
    }

    if (!recipients.length) {
      return res.status(400).json({ success: false, message: 'No recipients found for this alert audience' });
    }

    const created = [];
    for (const recipient of recipients) {
      const alert = await Alert.create({
        userId: recipient.id,
        role: recipient.role,
        type: type || category || 'system',
        severity: dbSeverity,
        title,
        message,
        data: {
          ...(data || {}),
          severityLevel: rawSeverity,
          deliveryMethods: deliveryMethods || ['in_app'],
          scheduledAt: scheduledAt || null,
          createdBy: req.user.id,
          createdByRole: req.user.role
        }
      });
      created.push(alert);
      if (global.io) global.io.to(`user-${recipient.id}`).emit('alert', alert);
    }

    res.status(201).json({ success: true, data: created, count: created.length });
  } catch (error) {
    console.error('Create alert error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};
