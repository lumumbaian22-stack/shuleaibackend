const { Alert } = require('../models');

const createAlert = async ({ userId, role, type, severity, title, message, data = {} }) => {
  try {
    const alert = await Alert.create({
      userId, role, type, severity, title, message, data
    });

    // Real-time via WebSocket
    if (global.io) {
      global.io.to(`user-${userId}`).emit('notification', {
        id: alert.id,
        type,
        severity,
        title,
        message,
        timestamp: new Date()
      });
    }

    return alert;
  } catch (error) {
    console.error('Alert creation error:', error);
    return null;
  }
};

const createBulkAlerts = async (alerts) => {
  const results = await Alert.bulkCreate(alerts);
  // Emit each via WebSocket
  if (global.io) {
    results.forEach(alert => {
      global.io.to(`user-${alert.userId}`).emit('notification', {
        id: alert.id,
        type: alert.type,
        severity: alert.severity,
        title: alert.title,
        message: alert.message,
        timestamp: alert.createdAt
      });
    });
  }
  return { success: true, count: results.length };
};

module.exports = { createAlert, createBulkAlerts };
