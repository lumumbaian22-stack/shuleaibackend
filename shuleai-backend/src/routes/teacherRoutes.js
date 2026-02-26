const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middleware/auth');
const teacherController = require('../controllers/teacherController');

// All teacher routes require authentication and teacher role
router.use(protect, authorize('teacher'));

// Student management
router.get('/students', teacherController.getMyStudents);
router.post('/marks', teacherController.enterMarks);
router.post('/attendance', teacherController.takeAttendance);
router.post('/comment', teacherController.addComment);

// CSV upload
router.post('/upload/marks', teacherController.uploadMarksCSV);

// Duty (already covered by dutyRoutes, but can be added here if needed)
// router.get('/duty', teacherController.getMyDuty);

module.exports = router;