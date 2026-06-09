const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middleware/auth');
const ctrl = require('../controllers/paymentController');

router.post('/daraja/callback', ctrl.darajaCallback);
router.post('/mpesa/callback', ctrl.darajaCallback);
router.post('/callback', ctrl.darajaCallback);

router.get('/admin/context', protect, authorize('admin', 'finance_officer'), ctrl.getFinanceContext);
router.get('/admin/school-settings', protect, authorize('admin', 'finance_officer'), ctrl.getAdminPaymentSettings);
router.put('/admin/school-settings', protect, authorize('admin', 'finance_officer'), ctrl.updateAdminPaymentSettings);
router.post('/admin/test-connection', protect, authorize('admin', 'finance_officer'), ctrl.testAdminPaymentConnection);
router.get('/admin/manual-queue', protect, authorize('admin', 'finance_officer'), ctrl.getManualVerificationQueue);
router.get('/admin/records', protect, authorize('admin', 'finance_officer'), ctrl.getAdminPaymentRecords);
// V75 student-specific finance ledger endpoints
router.get('/parent/school-settings', protect, authorize('parent'), ctrl.getParentSchoolPaymentSettings);
router.get('/parent/students/:studentId/fee-accounts', protect, authorize('parent'), ctrl.getParentStudentFeeAccounts);
router.get('/parent/students/:studentId/history', protect, authorize('parent'), ctrl.getParentStudentPaymentHistory);
router.get('/admin/finance-summary', protect, authorize('admin', 'finance_officer'), ctrl.getAdminFinanceSummary);
router.get('/admin/students/:studentId/finance', protect, authorize('admin', 'finance_officer'), ctrl.getAdminStudentFinance);
router.get('/admin/students/:studentId/history', protect, authorize('admin', 'finance_officer'), ctrl.getAdminStudentHistory);
router.post('/admin/students/:studentId/manual-payment', protect, authorize('admin', 'finance_officer'), ctrl.recordAdminManualPayment);
router.post('/admin/students/:studentId/bursary', protect, authorize('admin', 'finance_officer'), ctrl.recordAdminBursary);
router.post('/admin/transactions/:paymentId/approve', protect, authorize('admin', 'finance_officer'), ctrl.approveManualPayment);
router.post('/admin/transactions/:paymentId/reject', protect, authorize('admin', 'finance_officer'), ctrl.rejectManualPayment);

router.post('/admin/manual-queue/:paymentId/approve', protect, authorize('admin', 'finance_officer'), ctrl.approveManualPayment);
router.post('/admin/manual-queue/:paymentId/reject', protect, authorize('admin', 'finance_officer'), ctrl.rejectManualPayment);

router.get('/superadmin/platform-settings', protect, authorize('super_admin'), ctrl.getPlatformPaymentSettings);
router.put('/superadmin/platform-settings', protect, authorize('super_admin'), ctrl.updatePlatformPaymentSettings);
router.get('/superadmin/platform-manual-queue', protect, authorize('super_admin'), ctrl.getPlatformManualQueue);
router.post('/superadmin/platform-manual-queue/:paymentId/review', protect, authorize('super_admin'), ctrl.reviewPlatformManualPayment);

router.post('/parent/fee/stk', protect, authorize('parent'), ctrl.parentFeeSTK);
router.post('/parent/fee/manual', protect, authorize('parent'), ctrl.parentFeeManual);
router.post('/parent/subscription/stk', protect, authorize('parent'), ctrl.parentSubscriptionSTK);
router.post('/parent/subscription/manual', protect, authorize('parent'), ctrl.parentSubscriptionManual);
router.post('/school/subscription/stk', protect, authorize('admin', 'super_admin'), ctrl.schoolSubscriptionSTK);
router.post('/admin/name-change/stk', protect, authorize('admin'), ctrl.adminNameChangePaymentSTK);
router.post('/platform/stk', protect, ctrl.genericPlatformSTK);
router.get('/stk/:checkoutRequestId/status', protect, ctrl.queryStatus);

module.exports = router;
