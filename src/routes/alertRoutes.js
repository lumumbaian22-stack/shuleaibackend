const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middleware/auth');
const alertController = require('../controllers/alertController');

// All routes require authentication
router.use(protect);

// Get user's own alerts
router.get('/', alertController.getMyAlerts);

// Mark single alert as read
router.put('/:id/read', alertController.markAlertAsRead);

// Mark all alerts as read
router.put('/read-all', alertController.markAllAsRead);

// Create alert (admin/super_admin only) - FOR ANNOUNCEMENTS
router.post('/', authorize('admin', 'super_admin'), alertController.createAlert);

module.exports = router;
