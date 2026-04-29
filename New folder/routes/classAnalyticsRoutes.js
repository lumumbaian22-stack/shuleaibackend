const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middleware/auth');
const classAnalyticsController = require('../controllers/classAnalyticsController');

router.get('/', protect, authorize('teacher'), classAnalyticsController.getClassAnalytics);

module.exports = router;
