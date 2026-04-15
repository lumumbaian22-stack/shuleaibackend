const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middleware/auth');
const { validate, validationRules } = require('../middleware/validation');
const { requireConsent, requireDPA } = require('../middleware/consent');
const teacherSignupController = require('../controllers/teacherSignupController');
const dutyController = require('../controllers/dutyController');
const adminController = require('../controllers/adminController');
const classController = require('../controllers/classController');

// All admin routes require authentication and admin/super_admin role
router.use(protect);
router.use(authorize('admin', 'super_admin'));

// Require basic consent (Terms & Privacy) for all authenticated users
//router.use(requireConsent);

// Require DPA for admin actions involving student data
router.use(requireDPA);

// ============ DASHBOARD ============
router.get('/dashboard', adminController.getDashboardStats);

// ============ STUDENT MANAGEMENT ============
router.get('/students', adminController.getAllStudents);
router.get('/students/:studentId', adminController.getStudentDetails);
router.post('/students/:studentId/suspend', adminController.suspendStudent);
router.post('/students/:studentId/reactivate', adminController.reactivateStudent);
router.put('/students/:studentId', adminController.updateStudent);
router.delete('/students/:studentId', adminController.deleteStudent);

// ============ TEACHER MANAGEMENT ============
router.get('/teachers', adminController.getAllTeachers);
router.put('/teachers/:teacherId', adminController.updateTeacher);
router.delete('/teachers/:teacherId', adminController.deleteTeacher);

router.post('/classes/subject-assign-batch', adminController.batchAssignSubjects);

// ============ PARENT MANAGEMENT ============
router.get('/parents', adminController.getAllParents);

// ============ TEACHER APPROVALS ============
router.get('/approvals/pending', teacherSignupController.getPendingApprovals);
router.post('/teachers/:teacherId/approve', validationRules.approveTeacher, validate, teacherSignupController.approveTeacher);

// ============ CLASS MANAGEMENT ============
router.get('/classes', adminController.getClasses);
router.post('/classes', adminController.createClass);
router.put('/classes/:id', adminController.updateClass);
router.delete('/classes/:id', adminController.deleteClass);
router.get('/available-teachers', adminController.getAvailableTeachers);
router.post('/classes/:id/assign-teacher', adminController.assignTeacherToClass);
router.post('/classes/:id/remove-teacher', adminController.removeTeacherFromClass);

// ============ SUBJECT ASSIGNMENTS ============
router.get('/classes/:classId/subjects', adminController.getClassSubjectAssignments);
router.post('/classes/subject-assign', adminController.assignTeacherToSubject);
router.delete('/classes/subject-assign/:assignmentId', adminController.removeSubjectAssignment);

// ============ ANALYTICS & STATS ============
router.get('/grades/stats', adminController.getStudentGrades);
router.get('/attendance/stats', adminController.getAttendanceStats);

// ============ DUTY MANAGEMENT ============
router.post('/duty/generate', dutyController.generateDutyRoster);
router.get('/duty/stats', dutyController.getDutyStats);
router.get('/duty/fairness-report', dutyController.getFairnessReport);
router.get('/duty/understaffed', dutyController.getUnderstaffedAreas);
router.get('/duty/teacher-workload', dutyController.getTeacherWorkload);
router.post('/duty/adjust', dutyController.manualAdjustDuty);

// ============ SCHOOL SETTINGS ============
router.get('/settings', adminController.getSchoolSettings);
router.put('/settings', adminController.updateSchoolSettings);

module.exports = router;
