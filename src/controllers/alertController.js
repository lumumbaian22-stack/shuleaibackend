const { Alert, User, School, Student, Parent, Teacher, TeacherSubjectAssignment, sequelize } = require('../models');
const { generateParentAlertSuggestion } = require('../services/aiProviderService');
const { getAlertsForUser } = require('../services/alertReceiverEngine');

async function userCanViewStudentAlert(req, studentId) {
  if (!studentId) return true;
  const role = String(req.user?.role || '').toLowerCase();
  const sid = Number(studentId);
  if (!Number.isInteger(sid) || sid <= 0) return false;

  if (role === 'student') {
    const rows = await sequelize.query(
      'SELECT 1 FROM "Students" s JOIN "Users" u ON u."id" = s."userId" WHERE s."id" = :sid AND s."userId" = :uid AND u."schoolCode" = :schoolCode LIMIT 1',
      { replacements: { sid, uid: req.user.id, schoolCode: req.user.schoolCode }, type: sequelize.QueryTypes.SELECT }
    ).catch(() => []);
    return rows.length > 0;
  }

  if (role === 'parent') {
    const rows = await sequelize.query(
      'SELECT 1 FROM "StudentParents" sp JOIN "Parents" p ON p."id" = sp."parentId" JOIN "Students" s ON s."id" = sp."studentId" JOIN "Users" su ON su."id" = s."userId" WHERE sp."studentId" = :sid AND p."userId" = :uid AND su."schoolCode" = :schoolCode LIMIT 1',
      { replacements: { sid, uid: req.user.id, schoolCode: req.user.schoolCode }, type: sequelize.QueryTypes.SELECT }
    ).catch(() => []);
    return rows.length > 0;
  }

  if (role === 'teacher') {
    const rows = await sequelize.query(
      `SELECT 1
         FROM "Students" s
         JOIN "Users" su ON su."id" = s."userId"
         JOIN "Teachers" t ON t."userId" = :uid
        WHERE s."id" = :sid
          AND su."schoolCode" = :schoolCode
          AND (t."classId" = s."classId"
            OR EXISTS (SELECT 1 FROM "TeacherSubjectAssignments" tsa WHERE tsa."teacherId" = t."id" AND tsa."classId" = s."classId")
            OR EXISTS (SELECT 1 FROM "Classes" c WHERE c."id" = s."classId" AND c."teacherId" = t."id"))
        LIMIT 1`,
      { replacements: { sid, uid: req.user.id, schoolCode: req.user.schoolCode }, type: sequelize.QueryTypes.SELECT }
    ).catch(() => []);
    return rows.length > 0;
  }

  if (role === 'admin' || role === 'super_admin' || role === 'superadmin') {
    const rows = await sequelize.query(
      'SELECT 1 FROM "Students" s JOIN "Users" u ON u."id" = s."userId" WHERE s."id" = :sid AND (:isSuper = true OR u."schoolCode" = :schoolCode) LIMIT 1',
      { replacements: { sid, schoolCode: req.user.schoolCode, isSuper: role === 'super_admin' || role === 'superadmin' }, type: sequelize.QueryTypes.SELECT }
    ).catch(() => []);
    return rows.length > 0;
  }
  return false;
}

function alertStudentId(alert) {
  return Number(alert?.studentId || alert?.data?.studentId || alert?.data?.student_id || 0) || null;
}

async function filterAlertsForRequester(req, alerts, requestedStudentId) {
  const role = String(req.user?.role || '').toLowerCase();
  const requested = Number(requestedStudentId || 0) || null;

  if (requested) {
    const allowed = await userCanViewStudentAlert(req, requested);
    if (!allowed) {
      const err = new Error('You are not allowed to view alerts for this student.');
      err.status = 403;
      throw err;
    }
  }

  const filtered = [];
  for (const alert of alerts) {
    if (alert?.data?.hiddenByV97) continue;
    const sid = alertStudentId(alert);
    if (requested && sid && sid !== requested) continue;
    if (requested && !sid) { filtered.push(alert); continue; } // general parent/school alert for the same user
    if (!requested && (role === 'parent' || role === 'student' || role === 'teacher') && sid) {
      const allowed = await userCanViewStudentAlert(req, sid);
      if (!allowed) continue;
    }
    filtered.push(alert);
  }
  return filtered;
}

exports.getMyAlerts = async (req, res) => {
  try {
    const requestedStudentId = req.query.studentId || req.query.childId || null;
    const safeAlerts = await getAlertsForUser(req.user, {
      studentId: requestedStudentId,
      limit: Number(req.query.limit || 120),
      calendarOnly: req.query.calendarOnly === 'true',
      upcomingOnly: req.query.upcomingOnly === 'true'
    });
    res.json({ success: true, data: safeAlerts, scope: { role: req.user.role, studentId: requestedStudentId || null } });
  } catch (error) {
    console.error('Get alerts error:', error);
    res.status(error.status || 500).json({ success: false, message: error.message });
  }
};

exports.markAlertAsRead = async (req, res) => {
  try {
    const { id } = req.params;
    await Alert.update({ isRead: true, readAt: new Date() }, { where: { id, userId: req.user.id } });
    res.json({ success: true });
  } catch (error) {
    console.error('Mark read error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.markAllAsRead = async (req, res) => {
  try {
    await Alert.update({ isRead: true, readAt: new Date() }, { where: { userId: req.user.id, isRead: false } });
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


function normalizeAlertDbType(value) {
  const raw = String(value || '').toLowerCase();
  if (/career|profession|path/.test(raw)) return 'career';
  if (/academic|grade|mark|homework|study/.test(raw)) return 'academic';
  if (/attendance|physical|safety|absent|late/.test(raw)) return 'attendance';
  if (/fee|payment|finance|bursary|subscription|cash|bank|mpesa|balance/.test(raw)) return 'fee';
  if (/duty/.test(raw)) return 'duty';
  if (/approval|approve|reject/.test(raw)) return 'approval';
  if (/improvement|insight|ai|recommend/.test(raw)) return 'improvement';
  return 'system';
}

function buildDedupeKey({ req, recipient, type, category, title, data }) {
  const eventId = data?.eventId || data?.paymentId || data?.studentId || data?.announcementId || '';
  return [req.user.schoolCode || '', recipient.id, data?.studentId || '', category || type || 'system', title || '', eventId].join(':').slice(0, 480);
}

async function recipientCanReceiveStudentAlert(req, recipient, studentId, classId) {
  const sid = Number(studentId || 0) || null;
  const role = String(recipient?.role || '').toLowerCase();
  if (!sid) return true;

  if (role === 'student') {
    const rows = await sequelize.query(
      'SELECT 1 FROM "Students" s JOIN "Users" u ON u."id"=s."userId" WHERE s."id"=:sid AND s."userId"=:uid AND u."schoolCode"=:schoolCode LIMIT 1',
      { replacements:{ sid, uid:recipient.id, schoolCode:req.user.schoolCode }, type: sequelize.QueryTypes.SELECT }
    ).catch(()=>[]);
    return rows.length > 0;
  }
  if (role === 'parent') {
    const rows = await sequelize.query(
      'SELECT 1 FROM "StudentParents" sp JOIN "Parents" p ON p."id"=sp."parentId" JOIN "Students" s ON s."id"=sp."studentId" JOIN "Users" su ON su."id"=s."userId" WHERE sp."studentId"=:sid AND p."userId"=:uid AND su."schoolCode"=:schoolCode LIMIT 1',
      { replacements:{ sid, uid:recipient.id, schoolCode:req.user.schoolCode }, type: sequelize.QueryTypes.SELECT }
    ).catch(()=>[]);
    return rows.length > 0;
  }
  if (role === 'teacher') {
    const rows = await sequelize.query(
      `SELECT 1 FROM "Students" s
        JOIN "Users" su ON su."id"=s."userId"
        JOIN "Teachers" t ON t."userId"=:uid
       WHERE s."id"=:sid AND su."schoolCode"=:schoolCode
         AND (t."classId"=s."classId"
           OR EXISTS (SELECT 1 FROM "TeacherSubjectAssignments" tsa WHERE tsa."teacherId"=t."id" AND tsa."classId"=s."classId")
           OR EXISTS (SELECT 1 FROM "Classes" c WHERE c."id"=s."classId" AND c."teacherId"=t."id"))
       LIMIT 1`,
      { replacements:{ sid, uid:recipient.id, schoolCode:req.user.schoolCode }, type: sequelize.QueryTypes.SELECT }
    ).catch(()=>[]);
    return rows.length > 0;
  }
  return true;
}

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
      categoryLabel,
      sourceType,
      sourceLabel,
      priority,
      actionUrl,
      actionLabel,
      studentId,
      classId,
      dedupeKey,
      severity,
      title,
      message,
      data,
      deliveryMethods,
      scheduledAt,
      scope,
      showInCalendar,
      showInUpcomingEvents,
      eventDate,
      targetRoles,
      targetUserIds,
      targetClassIds,
      targetSubjectIds,
      targetStudentIds
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
    const explicitUserIds = Array.isArray(targetUserIds) && targetUserIds.length ? targetUserIds : (Array.isArray(userIds) && userIds.length ? userIds : []);
    if (explicitUserIds.length) {
      recipients = await User.findAll({ where: { id: explicitUserIds, schoolCode: req.user.schoolCode, isActive: true } });
    } else if (userId) {
      const user = await User.findOne({ where: { id: userId, schoolCode: req.user.schoolCode, isActive: true } });
      if (user) recipients = [user];
    } else {
      const selectedRolesRaw = Array.isArray(targetRoles) && targetRoles.length ? targetRoles : (Array.isArray(roles) && roles.length ? roles : (role ? [role] : (Array.isArray(targetAudience) ? targetAudience : (targetAudience ? [targetAudience] : []))));
      const allSchoolRoles = ['student', 'parent', 'teacher', 'admin'];
      const selectedRoles = selectedRolesRaw.some(r => String(r).toLowerCase() === 'all' || String(r).toLowerCase() === 'whole_school') ? allSchoolRoles : selectedRolesRaw;
      const cleanRoles = selectedRoles.map(r => String(r).toLowerCase().replace('-', '_')).filter(r => ['student','parent','teacher','admin','super_admin'].includes(r));
      if (!cleanRoles.length) {
        // No silent broadcast. An alert with no explicit audience belongs to the creator only.
        recipients = [req.user];
      } else {
        recipients = await User.findAll({
          where: {
            role: cleanRoles,
            schoolCode: req.user.schoolCode,
            isActive: true
          }
        });
      }
    }

    if (!recipients.length) {
      return res.status(400).json({ success: false, message: 'No recipients found for this alert audience' });
    }

    const created = [];
    for (const recipient of recipients) {
      const scopedStudentId = studentId || data?.studentId || null;
      const scopedClassId = classId || data?.classId || null;
      const requestedType = normalizeAlertDbType(type || category || categoryLabel || data?.category || 'system');
      const recipientRole = String(recipient.role || '').toLowerCase();
      // V97: student-scoped career path alerts must never be broadcast to admins/super admins.
      // They belong only to the selected student, linked parent(s), and subject teachers for that class/career.
      if (requestedType === 'career' && scopedStudentId && (recipientRole === 'admin' || recipientRole === 'super_admin' || recipientRole === 'superadmin')) continue;
      if (!(await recipientCanReceiveStudentAlert(req, recipient, scopedStudentId, scopedClassId))) continue;
      const finalCategory = categoryLabel || category || type || 'System';
      const finalData = {
        ...(data || {}),
        category: finalCategory,
        sourceType: sourceType || data?.sourceType || 'manual_admin',
        sourceLabel: sourceLabel || data?.aiLabel || 'Admin announcement',
        severityLevel: rawSeverity,
        deliveryMethods: deliveryMethods || ['in_app'],
        scheduledAt: scheduledAt || null,
        createdBy: req.user.id,
        createdByRole: req.user.role,
        studentId: studentId || data?.studentId || null,
        classId: classId || data?.classId || null,
        schoolCode: req.user.schoolCode || data?.schoolCode || null,
        scope: scope || data?.scope || (req.user.role === 'super_admin' ? 'platform' : (targetRoles || roles || role || targetAudience ? 'school' : 'user')),
        targetRoles: targetRoles || roles || (role ? [role] : (Array.isArray(targetAudience) ? targetAudience : (targetAudience ? [targetAudience] : []))),
        targetUserIds: targetUserIds || userIds || (userId ? [userId] : [recipient.id]),
        targetClassIds: targetClassIds || (classId ? [classId] : []),
        targetSubjectIds: targetSubjectIds || [],
        targetStudentIds: targetStudentIds || (studentId ? [studentId] : []),
        showInCalendar: !!(showInCalendar || data?.showInCalendar),
        showInUpcomingEvents: !!(showInUpcomingEvents || data?.showInUpcomingEvents),
        eventDate: eventDate || data?.eventDate || scheduledAt || null
      };
      const finalDedupeKey = dedupeKey || buildDedupeKey({ req, recipient, type, category: finalCategory, title, data: finalData });
      let alert = await Alert.findOne({ where: { userId: recipient.id, dedupeKey: finalDedupeKey } }).catch(() => null);
      const payload = {
        userId: recipient.id,
        role: recipient.role === 'superadmin' ? 'super_admin' : recipient.role,
        type: normalizeAlertDbType(type || category || finalCategory),
        categoryLabel: finalCategory,
        sourceType: finalData.sourceType,
        sourceLabel: finalData.sourceLabel,
        targetRole: recipient.role,
        targetUserId: recipient.id,
        studentId: studentId || data?.studentId || null,
        classId: classId || data?.classId || null,
        priority: priority || rawSeverity,
        dedupeKey: finalDedupeKey,
        actionUrl: actionUrl || data?.actionUrl || null,
        actionLabel: actionLabel || data?.actionLabel || null,
        severity: dbSeverity,
        title,
        message,
        data: finalData
      };
      if (alert) alert = await alert.update({ ...payload, isRead: false, readAt: null });
      else alert = await Alert.create(payload);
      created.push(alert);
      if (global.io) global.io.to(`user-${recipient.id}`).emit('alert', alert);
    }

    if (!created.length) {
      return res.status(400).json({ success: false, message: 'No permitted recipients found for this alert scope.' });
    }
    res.status(201).json({ success: true, data: created, count: created.length });
  } catch (error) {
    console.error('Create alert error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};
