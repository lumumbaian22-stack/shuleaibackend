const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middleware/auth');
const superAdminController = require('../controllers/superAdminController');

router.use(protect, authorize('super_admin'));

router.get('/overview', superAdminController.getOverview);
router.get('/schools', superAdminController.getSchools);
router.post('/schools', superAdminController.createSchool);
router.put('/schools/:id', superAdminController.updateSchool);
router.delete('/schools/:id', superAdminController.deleteSchool);

router.get('/requests', superAdminController.getPendingRequests);
router.post('/requests/:id/approve', superAdminController.approveRequest);
router.post('/requests/:id/reject', superAdminController.rejectRequest);

router.put('/bank-details/:schoolId', superAdminController.updateBankDetails);

module.exports = router;