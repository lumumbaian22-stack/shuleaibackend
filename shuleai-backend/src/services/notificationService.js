const { Alert } = require('../models');

const createAlert = async ({ userId, role, type, severity, title, message, data = {} }) => {
  try {
    const alert = await Alert.create({ userId, role, type, severity, title, message, data });
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