const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middleware/auth');
const ctrl = require('../controllers/paymentController');

router.post('/daraja/callback', ctrl.darajaCallback);
router.post('/mpesa/callback', ctrl.darajaCallback);
router.post('/callback', ctrl.darajaCallback);

router.get('/admin/school-settings', protect, authorize('admin'), ctrl.getAdminPaymentSettings);
router.put('/admin/school-settings', protect, authorize('admin'), ctrl.updateAdminPaymentSettings);
router.post('/admin/test-connection', protect, authorize('admin'), ctrl.testAdminPaymentConnection);
router.get('/admin/manual-queue', protect, authorize('admin'), ctrl.getManualVerificationQueue);
router.get('/admin/records', protect, authorize('admin'), ctrl.getAdminPaymentRecords);
router.post('/admin/manual-queue/:paymentId/approve', protect, authorize('admin'), ctrl.approveManualPayment);
router.post('/admin/manual-queue/:paymentId/reject', protect, authorize('admin'), ctrl.rejectManualPayment);

router.get('/superadmin/platform-settings', protect, authorize('super_admin'), ctrl.getPlatformPaymentSettings);
router.put('/superadmin/platform-settings', protect, authorize('super_admin'), ctrl.updatePlatformPaymentSettings);

router.post('/parent/fee/stk', protect, authorize('parent'), ctrl.parentFeeSTK);
router.post('/parent/fee/manual', protect, authorize('parent'), ctrl.parentFeeManual);
router.post('/parent/subscription/stk', protect, authorize('parent'), ctrl.parentSubscriptionSTK);
router.post('/school/subscription/stk', protect, authorize('admin', 'super_admin'), ctrl.schoolSubscriptionSTK);
router.post('/admin/name-change/stk', protect, authorize('admin'), ctrl.adminNameChangePaymentSTK);
router.post('/platform/stk', protect, ctrl.genericPlatformSTK);
router.get('/stk/:checkoutRequestId/status', protect, ctrl.queryStatus);

module.exports = router;
