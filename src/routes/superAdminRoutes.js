const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middleware/auth');
const superAdminController = require('../controllers/superAdminController');

router.use(protect, authorize('super_admin'));

// Dashboard and overview
router.get('/overview', superAdminController.getOverview);

// School management
router.get('/schools', superAdminController.getSchools);
router.get('/pending-schools', superAdminController.getPendingSchools);
router.post('/schools', superAdminController.createSchool);
router.post('/schools/:id/approve', superAdminController.approveSchool);
router.post('/schools/:id/reject', superAdminController.rejectSchool);
router.put('/schools/:id', superAdminController.updateSchool);
router.delete('/schools/:id', superAdminController.deleteSchool);

// Suspension management
router.post('/schools/:id/suspend', superAdminController.suspendSchool);
router.post('/schools/:id/reactivate', superAdminController.reactivateSchool);
router.get('/suspended-schools', superAdminController.getSuspendedSchools);

// Name change requests
router.get('/requests', superAdminController.getPendingRequests);
router.post('/requests/:id/approve', superAdminController.approveRequest);
router.post('/requests/:id/reject', superAdminController.rejectRequest);

// Bank details
router.put('/bank-details/:schoolId', superAdminController.updateBankDetails);

module.exports = router;

