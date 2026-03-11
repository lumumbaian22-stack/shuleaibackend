const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middleware/auth');
const analyticsController = require('../controllers/analyticsController');

// All analytics routes require authentication
router.use(protect);

// Student analytics (accessible by student, parent, teacher, admin)
router.get('/student/:studentId', analyticsController.getStudentAnalytics);

// Class analytics (teachers and above)
router.get('/class/:classId', authorize('teacher', 'admin', 'super_admin'), analyticsController.getClassAnalytics);

// School analytics (admin and above)
router.get('/school', authorize('admin', 'super_admin'), analyticsController.getSchoolAnalytics);

// Curriculum comparison
router.get('/compare/:studentId', analyticsController.compareCurriculum);

// NEW: Duty analytics
router.get('/duty/overview', authorize('admin'), analyticsController.getDutyAnalytics);
router.get('/duty/department/:deptId', authorize('admin'), analyticsController.getDepartmentMetrics);

// NEW: Attendance prediction
router.get('/attendance/predict/:studentId', analyticsController.predictAttendance);
router.get('/attendance/predict-school', authorize('admin'), analyticsController.predictSchoolAttendance);

// NEW: Behavior monitoring
router.get('/behavior/overview', authorize('admin', 'teacher'), analyticsController.getBehaviorOverview);
router.post('/behavior/check-student', authorize('teacher', 'admin'), analyticsController.checkStudentBehavior);

module.exports = router;
