const { Alert } = require('../models');

const createAlert = async ({ userId, role, type, severity, title, message, data = {}, targetRole, targetUserId, studentId, classId, sourceType, sourceLabel, categoryLabel, actionUrl, actionLabel, dedupeKey }) => {
  try {
    const allowedTypes = new Set(['academic', 'attendance', 'fee', 'system', 'improvement', 'duty', 'approval']);
    const allowedSeverities = new Set(['critical', 'warning', 'info', 'success']);
    const normalizedType = allowedTypes.has(String(type || '').toLowerCase()) ? String(type).toLowerCase() : 'system';
    const normalizedSeverity = allowedSeverities.has(String(severity || '').toLowerCase()) ? String(severity).toLowerCase() : 'info';
    const normalizedRole = String(role || '').toLowerCase() === 'superadmin' ? 'super_admin' : (role || 'admin');
    const payload = { userId, role: normalizedRole, type: normalizedType, severity: normalizedSeverity, title, message, data, targetRole, targetUserId: targetUserId || userId, studentId, classId, sourceType, sourceLabel, categoryLabel, actionUrl, actionLabel, dedupeKey };
    Object.keys(payload).forEach(k => payload[k] === undefined && delete payload[k]);
    const alert = await Alert.create(payload);
    if (global.io) {
      global.io.to(`user-${userId}`).emit('alert', alert);
    }
    return alert;
  } catch (error) {
    console.error('Alert creation error:', error);
    return null;
  }
};

const createBulkAlerts = async (alerts) => {
  const results = await Alert.bulkCreate(alerts);
  return { success: true, count: results.length };
};

module.exports = { createAlert, createBulkAlerts };