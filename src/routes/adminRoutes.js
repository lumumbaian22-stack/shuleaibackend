const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middleware/auth');
const { validate, validationRules } = require('../middleware/validation');
const teacherSignupController = require('../controllers/teacherSignupController');
const dutyController = require('../controllers/dutyController');
const adminController = require('../controllers/adminController');
const classController = require('../controllers/classController'); // ADD THIS

router.use(protect, authorize('admin', 'super_admin'));

// Add these lines with your other routes
router.post('/students/:studentId/suspend', adminController.suspendStudent);
router.post('/students/:studentId/reactivate', adminController.reactivateStudent);

// Teacher approvals
router.get('/approvals/pending', teacherSignupController.getPendingApprovals);
router.post('/teachers/:teacherId/approve', validationRules.approveTeacher, validate, teacherSignupController.approveTeacher);

// Teacher management
router.get('/teachers', adminController.getAllTeachers);
router.get('/students', adminController.getAllStudents);
router.get('/parents', adminController.getAllParents);

// Class management routes - ADD THESE
router.get('/classes', classController.getClasses);
router.post('/classes', classController.createClass);
router.put('/classes/:id', classController.updateClass);
router.delete('/classes/:id', classController.deleteClass);
router.get('/available-teachers', classController.getAvailableTeachers);
router.post('/classes/:id/assign-teacher', classController.assignTeacherToClass);
router.post('/classes/:id/remove-teacher', classController.removeTeacherFromClass);

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

// Add these lines
router.post('/assign-teacher-to-subject', adminController.assignTeacherToSubject);
router.get('/subject-assignments', adminController.getSubjectAssignments);
router.delete('/subject-assignments/:id', adminController.removeSubjectAssignment);

module.exports = router;
