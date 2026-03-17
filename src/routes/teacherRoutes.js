const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middleware/auth');
const teacherController = require('../controllers/teacherController');

// All teacher routes require authentication and teacher role
router.use(protect, authorize('teacher'));

// Message routes
router.get('/conversations', teacherController.getConversations);
router.get('/messages/:otherUserId', teacherController.getMessages);
router.put('/messages/read/:conversationId', teacherController.markAsRead);
router.post('/reply', teacherController.replyToParent);

// Student management
router.get('/students', teacherController.getMyStudents);
router.post('/students', teacherController.addStudent); // ADD THIS LINE
router.post('/marks', teacherController.enterMarks);
router.post('/attendance', teacherController.takeAttendance);
router.post('/comment', teacherController.addComment);

// CSV upload
router.post('/upload/marks', teacherController.uploadMarksCSV);

// Dashboard (optional)
router.get('/dashboard', teacherController.getDashboard);

module.exports = router;
