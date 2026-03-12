const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middleware/auth');
const { validate, validationRules } = require('../middleware/validation');
const teacherSignupController = require('../controllers/teacherSignupController');
const dutyController = require('../controllers/dutyController');
const adminController = require('../controllers/adminController'); // Make sure this exists

router.use(protect, authorize('admin', 'super_admin'));

// Teacher approvals
router.get('/approvals/pending', teacherSignupController.getPendingApprovals);
router.post('/teachers/:teacherId/approve', validationRules.approveTeacher, validate, teacherSignupController.approveTeacher);

// Teacher management
router.get('/teachers', adminController.getAllTeachers); // Add this endpoint
router.get('/students', adminController.getAllStudents); // Add this endpoint
router.get('/parents', adminController.getAllParents);   // Add this endpoint

// Duty management
router.post('/duty/generate', dutyController.generateDutyRoster);
router.get('/duty/stats', dutyController.getDutyStats);
router.get('/duty/fairness-report', dutyController.getFairnessReport);
router.get('/duty/understaffed', dutyController.getUnderstaffedAreas);
router.get('/duty/teacher-workload', dutyController.getTeacherWorkload);
router.post('/duty/adjust', dutyController.manualAdjustDuty);

// School settings
router.get('/settings', adminController.getSchoolSettings);
router.put('/settings', adminController.updateSchoolSettings);

// Classes
router.post('/classes', adminController.createClass);
router.get('/classes', adminController.getClasses);

module.exports = router;
