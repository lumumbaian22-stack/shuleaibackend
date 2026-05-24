const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middleware/auth');
const tutor = require('../controllers/tutorController');
const { requireFeature } = require('../middleware/subscription');

router.get('/config', protect, tutor.getTutorConfig);
router.post('/ask', protect, requireFeature('ai_tutor', { ownerType: 'child' }), tutor.askTutor);
router.get('/progress/:studentId?', protect, requireFeature('study_analytics', { ownerType: 'child' }), tutor.getProgress);
router.get('/session/:studentId?', protect, requireFeature('ai_tutor', { ownerType: 'child' }), tutor.getSessionHistory);
router.post('/practice/answer', protect, requireFeature('ai_tutor', { ownerType: 'child' }), tutor.submitPracticeAnswer);
router.get('/reports/parent/:parentId?', protect, authorize('admin', 'parent'), tutor.getParentReport);
router.get('/reports/teacher/:classId?', protect, authorize('admin', 'teacher'), tutor.getTeacherReport);

module.exports = router;
