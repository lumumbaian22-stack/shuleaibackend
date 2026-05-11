const { Alert, User } = require('../models');

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
