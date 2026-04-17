const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middleware/auth');
const parentController = require('../controllers/parentController');

router.use(protect, authorize('parent'));

// Basic routes – NO subscription required
router.get('/children', parentController.getChildren);
router.get('/child/:studentId/summary', parentController.getChildSummary);
router.post('/report-absence', parentController.reportAbsence);
router.get('/fees/:studentId', parentController.getFees);
router.post('/fees/pay', parentController.addPayment);
router.get('/conversations', parentController.getConversations);
router.get('/messages/:otherUserId', parentController.getMessages);
router.post('/message', parentController.sendMessage);
router.get('/child/:studentId/attendance/today', parentController.getChildTodayAttendance);

// Premium features – require subscription (if needed)
// You can uncomment the middleware after ensuring it's implemented correctly
// const { checkParentSubscription } = require('../middleware/subscription');
// router.get('/child/:studentId/analytics', checkParentSubscription('premium'), parentController.getChildAnalytics);
router.get('/child/:studentId/analytics', parentController.getChildAnalytics); // Temporarily open

router.get('/plans', parentController.getSubscriptionPlans);
router.post('/upgrade-plan', parentController.upgradePlan);
router.post('/pay', parentController.makePayment);
router.get('/payments', parentController.getPayments);
router.post('/payment-confirm', parentController.confirmPayment);

module.exports = router;
