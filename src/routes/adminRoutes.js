const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middleware/auth');
const { validate, validationRules } = require('../middleware/validation');
const teacherSignupController = require('../controllers/teacherSignupController');
const dutyController = require('../controllers/dutyController');
const adminController = require('../controllers/adminController');
const classController = require('../controllers/classController');

// ============ PUBLIC / SHARED ROUTES (any authenticated user) ============
// School settings – readable by teacher, parent, admin, super_admin
router.get('/settings', protect, adminController.getSchoolSettings);

// ============ ADMIN / SUPER ADMIN ONLY ROUTES ============
router.use(protect, authorize('admin', 'super_admin'));

// Dashboard
router.get('/dashboard', adminController.getDashboardStats);

// Student Management
router.get('/students', adminController.getAllStudents);
router.get('/students/:studentId', adminController.getStudentDetails);
router.post('/students/:studentId/suspend', adminController.suspendStudent);
router.post('/students/:studentId/reactivate', adminController.reactivateStudent);
router.put('/students/:studentId', adminController.updateStudent);
router.delete('/students/:studentId', adminController.deleteStudent);

// Teacher Management
router.get('/teachers', adminController.getAllTeachers);
router.put('/teachers/:teacherId', adminController.updateTeacher);
router.delete('/teachers/:teacherId', adminController.deleteTeacher);

router.post('/classes/subject-assign-batch', adminController.batchAssignSubjects);

// Parent Management
router.get('/parents', adminController.getAllParents);

// Teacher Approvals
router.get('/approvals/pending', teacherSignupController.getPendingApprovals);
router.post('/teachers/:teacherId/approve', validationRules.approveTeacher, validate, teacherSignupController.approveTeacher);

// Class Management
router.get('/classes', adminController.getClasses);
router.post('/classes', adminController.createClass);
router.put('/classes/:id', adminController.updateClass);
router.delete('/classes/:id', adminController.deleteClass);
router.get('/available-teachers', adminController.getAvailableTeachers);
router.post('/classes/:id/assign-teacher', adminController.assignTeacherToClass);
router.post('/classes/:id/remove-teacher', adminController.removeTeacherFromClass);

// Subject Assignments
router.get('/classes/:classId/subjects', adminController.getClassSubjectAssignments);
router.post('/classes/subject-assign', adminController.assignTeacherToSubject);
router.delete('/classes/subject-assign/:assignmentId', adminController.removeSubjectAssignment);

// Analytics & Stats
router.get('/grades/stats', adminController.getStudentGrades);
router.get('/attendance/stats', adminController.getAttendanceStats);

// Duty Management
router.post('/duty/generate', dutyController.generateDutyRoster);
router.get('/duty/stats', dutyController.getDutyStats);
router.get('/duty/fairness-report', dutyController.getFairnessReport);
router.get('/duty/understaffed', dutyController.getUnderstaffedAreas);
router.get('/duty/teacher-workload', dutyController.getTeacherWorkload);
router.post('/duty/adjust', dutyController.manualAdjustDuty);

// School Settings (write – admin only)
router.put('/settings', adminController.updateSchoolSettings);

module.exports = router;
