const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middleware/auth');
const subscriptionController = require('../controllers/subscriptionController');

// Authenticated because plan availability can be school-specific.
router.get('/plans', protect, subscriptionController.getPlans);
router.get('/my-status', protect, authorize('parent', 'student', 'admin', 'super_admin'), subscriptionController.getMyStatus);
router.post('/upgrade', protect, authorize('parent'), subscriptionController.upgrade);
router.post('/initiate-payment', protect, authorize('parent'), subscriptionController.upgrade);

module.exports = router;
