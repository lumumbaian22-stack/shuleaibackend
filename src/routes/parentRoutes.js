const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middleware/auth');
const parentController = require('../controllers/parentController');
const feeController = require('../controllers/feeController');

router.use(protect, authorize('parent'));

router.get('/children', parentController.getChildren);
router.get('/child/:studentId/summary', parentController.getChildSummary);
router.post('/report-absence', parentController.reportAbsence);
router.post('/pay', parentController.makePayment);
router.get('/payments', parentController.getPayments);

router.get('/fees/:studentId', parentController.getFees);
router.post('/fees/pay', parentController.addPayment);

router.get('/plans', parentController.getSubscriptionPlans);
router.post('/upgrade-plan', parentController.upgradePlan);
router.post('/payment-confirm', parentController.confirmPayment);
router.post('/message', parentController.sendMessage);
router.get('/messages/:otherUserId', parentController.getMessages);

router.get('/child/:studentId/analytics', parentController.getChildAnalytics);

module.exports = router;
