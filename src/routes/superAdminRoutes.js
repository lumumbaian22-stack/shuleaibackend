const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middleware/auth');
const superAdminController = require('../controllers/superAdminController');
const analyticsController = require('../controllers/analyticsController'); // Add this import

router.use(protect, authorize('super_admin'));

// Dashboard and overview
router.get('/overview', superAdminController.getOverview);
router.get('/live-stats', superAdminController.getLivePlatformStats);

// School management
router.get('/schools', superAdminController.getSchools);
router.get('/pending-schools', superAdminController.getPendingSchools);
router.get('/suspended-schools', superAdminController.getSuspendedSchools);
router.post('/schools', superAdminController.createSchool);
router.post('/schools/:id/approve', superAdminController.approveSchool);
router.post('/schools/:id/reject', superAdminController.rejectSchool);
router.post('/schools/:id/suspend', superAdminController.suspendSchool);
router.post('/schools/:id/reactivate', superAdminController.reactivateSchool);
router.put('/schools/:id', superAdminController.updateSchool);
router.delete('/schools/:id', superAdminController.deleteSchool);

// Name change requests
router.get('/requests', superAdminController.getPendingRequests);
router.post('/requests/:id/approve', superAdminController.approveRequest);
router.post('/requests/:id/reject', superAdminController.rejectRequest);

// Bank details
router.put('/bank-details/:schoolId', superAdminController.updateBankDetails);

// School-specific statistics
router.get('/schools/:schoolId/teachers', superAdminController.getSchoolTeachers);
router.get('/schools/:schoolId/students', superAdminController.getSchoolStudents);
router.get('/schools/:schoolId/parents', superAdminController.getSchoolParents);
router.get('/schools/:schoolId/stats', superAdminController.getSchoolStats);

// System health
router.get('/system/status', superAdminController.getSystemStatus);
router.get('/system/metrics', superAdminController.getSystemMetrics);
router.get('/system/events', superAdminController.getRecentEvents);

// Platform settings
router.get('/platform-settings', superAdminController.getPlatformSettings);
router.put('/platform-settings', superAdminController.updatePlatformSettings);
router.post('/settings/reset', superAdminController.resetPlatformSettings);

// System management
router.post('/backup', superAdminController.runSystemBackup);
router.post('/cache/clear', superAdminController.clearPlatformCache);
router.get('/export', superAdminController.exportPlatformData);

// Growth and distribution data
router.get('/growth-data', superAdminController.getGrowthData);
router.get('/school-distribution', superAdminController.getSchoolDistribution);

// Analytics (NEW)
router.get('/analytics', analyticsController.getSuperAdminAnalytics);

module.exports = router;
