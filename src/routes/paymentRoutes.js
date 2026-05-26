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
// V75 student-specific finance ledger endpoints
router.get('/parent/school-settings', protect, authorize('parent'), ctrl.getParentSchoolPaymentSettings);
router.get('/parent/students/:studentId/fee-accounts', protect, authorize('parent'), ctrl.getParentStudentFeeAccounts);
router.get('/parent/students/:studentId/history', protect, authorize('parent'), ctrl.getParentStudentPaymentHistory);
router.get('/admin/finance-summary', protect, authorize('admin'), ctrl.getAdminFinanceSummary);
router.get('/admin/students/:studentId/finance', protect, authorize('admin'), ctrl.getAdminStudentFinance);
router.get('/admin/students/:studentId/history', protect, authorize('admin'), ctrl.getAdminStudentHistory);
router.post('/admin/students/:studentId/manual-payment', protect, authorize('admin'), ctrl.recordAdminManualPayment);
router.post('/admin/students/:studentId/bursary', protect, authorize('admin'), ctrl.recordAdminBursary);
router.post('/admin/transactions/:paymentId/approve', protect, authorize('admin'), ctrl.approveManualPayment);
router.post('/admin/transactions/:paymentId/reject', protect, authorize('admin'), ctrl.rejectManualPayment);

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
