const { Alert } = require('../models');

exports.getMyAlerts = async (req, res) => {
  try {
    const alerts = await Alert.findAll({
      where: { userId: req.user.id },
      order: [['createdAt', 'DESC']],
      limit: 50
    });
    res.json({ success: true, data: alerts });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.markAlertAsRead = async (req, res) => {
  try {
    const { id } = req.params;
    await Alert.update({ isRead: true }, { where: { id, userId: req.user.id } });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
