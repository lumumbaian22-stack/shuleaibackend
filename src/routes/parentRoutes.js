const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middleware/auth');
const parentController = require('../controllers/parentController');
const parentMessageController = require('../controllers/parentMessageController');
const analyticsController = require('../controllers/analyticsController'); // Add import

router.use(protect, authorize('parent'));

// Basic routes – no subscription required
router.get('/children', parentController.getChildren);
router.post('/children/link', parentController.linkChildByElimuId);
router.get('/child/:studentId/summary', parentController.getChildSummary);
router.post('/report-absence', parentController.reportAbsence);
router.get('/fees/:studentId', parentController.getFees);
router.post('/fees/pay', parentController.addPayment);
router.get('/conversations', parentMessageController.getConversations);
router.get('/messages/:otherUserId', parentMessageController.getMessages);
router.post('/message', parentMessageController.sendMessage);
router.get('/child/:studentId/attendance/today', parentController.getChildTodayAttendance);
router.get('/child/:studentId/analytics', parentController.getChildAnalytics);

// Payment/Subscription routes
router.get('/plans', parentController.getSubscriptionPlans);
router.post('/upgrade-plan', parentController.upgradePlan);
router.post('/pay', parentController.makePayment);
router.get('/payments', parentController.getPayments);
router.post('/payment-confirm', parentController.confirmPayment);

// Analytics (NEW)
router.get('/analytics', analyticsController.getParentAnalytics);

module.exports = router;
