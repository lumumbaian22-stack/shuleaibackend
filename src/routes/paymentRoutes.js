const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middleware/auth');
const ctrl = require('../controllers/paymentController');

router.post('/daraja/callback', ctrl.darajaCallback);
router.post('/mpesa/callback', ctrl.darajaCallback);
router.post('/callback', ctrl.darajaCallback);

router.get('/admin/school-settings', protect, authorize('admin'), ctrl.getAdminPaymentSettings);
router.put('/admin/school-settings', protect, authorize('admin'), ctrl.updateAdminPaymentSettings);

router.get('/superadmin/platform-settings', protect, authorize('superadmin'), ctrl.getPlatformPaymentSettings);
router.put('/superadmin/platform-settings', protect, authorize('superadmin'), ctrl.updatePlatformPaymentSettings);

router.post('/parent/fee/stk', protect, authorize('parent'), ctrl.parentFeeSTK);
router.post('/parent/subscription/stk', protect, authorize('parent'), ctrl.parentSubscriptionSTK);
router.post('/admin/name-change/stk', protect, authorize('admin'), ctrl.adminNameChangePaymentSTK);
router.post('/platform/stk', protect, ctrl.genericPlatformSTK);
router.get('/stk/:checkoutRequestId/status', protect, ctrl.queryStatus);

module.exports = router;
