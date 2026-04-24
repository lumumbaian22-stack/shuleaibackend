const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middleware/auth');
const { createAssignment, getStudentAssignments, submitAssignment } = require('../controllers/homeworkController');

router.post('/assign', protect, authorize('teacher'), createAssignment);
router.get('/student', protect, authorize('student'), getStudentAssignments);
router.post('/submit/:assignmentId', protect, authorize('student'), submitAssignment);

module.exports = router;
