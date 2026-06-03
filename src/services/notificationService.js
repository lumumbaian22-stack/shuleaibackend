const { Alert } = require('../models');

function inferAlertSource({ role, type, data = {}, sourceType, sourceLabel }) {
  if (sourceLabel || data.sourceLabel) return sourceLabel || data.sourceLabel;
  const src = String(sourceType || data.sourceType || type || '').toLowerCase();
  const actor = String(data.actorRole || data.fromRole || role || '').toLowerCase();
  if (src.includes('finance') || src.includes('fee') || src.includes('payment') || type === 'fee') return 'Finance Office';
  if (src.includes('subscription')) return 'Subscription Billing';
  if (src.includes('homework')) return 'Homework';
  if (src.includes('calendar') || src.includes('event')) return data.personal ? 'Personal Calendar' : 'School Calendar';
  if (src.includes('subject_selection')) return 'Grade 10–12 Subject Choices';
  if (src.includes('ai')) return 'Shule AI Insight';
  if (actor === 'teacher' || src.includes('teacher')) return data.teacherType === 'subject' ? 'Subject Teacher' : 'Class Teacher';
  if (actor === 'super_admin' || actor === 'superadmin') return 'Super Admin';
  if (actor === 'admin' || src.includes('admin')) return 'School Admin';
  if (actor === 'parent') return 'Parent';
  if (actor === 'student') return 'Student';
  return 'System';
}

function inferAlertTarget({ role, data = {}, targetLabel }) {
  if (targetLabel || data.targetLabel) return targetLabel || data.targetLabel;
  if (data.studentName) return `Child: ${data.studentName}`;
  if (data.className) return `Class: ${data.className}`;
  if (data.scope === 'school') return 'Whole school';
  if (data.scope === 'personal') return 'Personal';
  if (role) return String(role).replace(/_/g, ' ');
  return 'User';
}

const createAlert = async ({ userId, role, type, severity, title, message, data = {}, sourceType = null, sourceLabel = null, categoryLabel = null, targetLabel = null, actionUrl = null, actionLabel = null, priority = null, studentId = null, classId = null }) => {
  try {
    const finalSourceType = sourceType || data?.sourceType || type || 'system';
    const finalData = {
      ...(data || {}),
      sourceType: finalSourceType,
      sourceLabel: inferAlertSource({ role, type, data, sourceType: finalSourceType, sourceLabel }),
      targetLabel: inferAlertTarget({ role, data, targetLabel }),
      scope: data?.scope || 'user',
      targetUserIds: Array.isArray(data?.targetUserIds) ? data.targetUserIds : [userId],
      targetRoles: Array.isArray(data?.targetRoles) ? data.targetRoles : (role ? [role] : [])
    };
    const alert = await Alert.create({
      userId,
      role,
      type,
      severity,
      title,
      message,
      targetUserId: userId,
      targetRole: role,
      data: finalData,
      sourceType: finalSourceType,
      sourceLabel: finalData.sourceLabel,
      categoryLabel: categoryLabel || data?.categoryLabel || type,
      targetLabel: finalData.targetLabel,
      actionUrl: actionUrl || data?.actionUrl || null,
      actionLabel: actionLabel || data?.actionLabel || null,
      priority: priority || data?.priority || severity,
      studentId: studentId || data?.studentId || null,
      classId: classId || data?.classId || null
    });
    if (global.io) global.io.to(`user-${userId}`).emit('alert', alert);
    return alert;
  } catch (error) {
    console.error('Alert creation error:', error);
    return null;
  }
};

const createBulkAlerts = async (alerts) => {
  const normalized = (alerts || []).map((a) => {
    const data = a.data || {};
    const sourceType = a.sourceType || data.sourceType || a.type || 'system';
    const sourceLabel = a.sourceLabel || data.sourceLabel || inferAlertSource({ role:a.role, type:a.type, data, sourceType });
    const targetLabel = a.targetLabel || data.targetLabel || inferAlertTarget({ role:a.role, data });
    return { ...a, sourceType, sourceLabel, targetLabel, data: { ...data, sourceType, sourceLabel, targetLabel } };
  });
  const results = await Alert.bulkCreate(normalized);
  return { success: true, count: results.length };
};

module.exports = { createAlert, createBulkAlerts, inferAlertSource, inferAlertTarget };
