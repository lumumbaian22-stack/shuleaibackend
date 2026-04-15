const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middleware/auth');
const { requireConsent, requireParentalConsent } = require('../middleware/consent');
const parentController = require('../controllers/parentController');

router.use(protect);
router.use(authorize('parent'));

// Require basic consent (Terms & Privacy)
router.use(requireConsent);

// Routes that don't need parental consent (child list, payments, etc.)
router.get('/children', parentController.getChildren);
router.get('/payments', parentController.getPayments);
router.get('/plans', parentController.getSubscriptionPlans);
router.post('/pay', parentController.makePayment);
router.post('/upgrade-plan', parentController.upgradePlan);
router.post('/payment-confirm', parentController.confirmPayment);
router.post('/message', parentController.sendMessage);
router.get('/messages/:otherUserId', parentController.getMessages);

// Routes that require parental consent for a specific child
router.get('/child/:studentId/summary', requireParentalConsent, parentController.getChildSummary);
router.get('/child/:studentId/attendance/today', requireParentalConsent, parentController.getChildTodayAttendance);
router.get('/child/:studentId/analytics', requireParentalConsent, parentController.getChildAnalytics);
router.get('/fees/:studentId', requireParentalConsent, parentController.getFees);
router.post('/fees/pay', requireParentalConsent, parentController.addPayment);
router.post('/report-absence', requireParentalConsent, parentController.reportAbsence);

module.exports = router;
