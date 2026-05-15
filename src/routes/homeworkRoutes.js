const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middleware/auth');
const homeworkCtrl = require('../controllers/homeworkController');

router.use(protect);
router.post('/assign', authorize('teacher'), homeworkCtrl.createAssignment);
router.get('/teacher', authorize('teacher'), homeworkCtrl.getTeacherAssignments);
router.get('/student', authorize('student'), homeworkCtrl.getStudentAssignments);
router.post('/submit/:assignmentId', authorize('student'), homeworkCtrl.submitAssignment);

module.exports = router;
