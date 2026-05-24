const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middleware/auth');
const analyticsController = require('../controllers/analyticsController');
const { requireFeature } = require('../middleware/subscription');

// All analytics routes require authentication
router.use(protect);

// Student analytics (accessible by student, parent, teacher, admin)
router.get('/student/:studentId', requireFeature('study_analytics', { ownerType: 'child' }), analyticsController.getStudentAnalytics);

// Class analytics (teachers and above)
router.get('/class/:classId', authorize('teacher', 'admin', 'super_admin'), requireFeature('ai_analytics', { ownerType: 'school' }), analyticsController.getClassAnalytics);

// School analytics (admin and above)
router.get('/school', authorize('admin', 'super_admin'), requireFeature('ai_analytics', { ownerType: 'school' }), analyticsController.getSchoolAnalytics);

// Curriculum comparison
router.get('/compare/:studentId', requireFeature('study_analytics', { ownerType: 'child' }), analyticsController.compareCurriculum);

module.exports = router;