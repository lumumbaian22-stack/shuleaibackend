const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middleware/auth');
const teacherController = require('../controllers/teacherController');
const teacherMessageController = require('../controllers/teacherMessageController');

// All teacher routes require authentication and teacher role
router.use(protect, authorize('teacher'));

// Add this line with your other routes
router.delete('/students/:studentId', teacherController.deleteStudent);

// Student management
router.get('/students', teacherController.getMyStudents);
router.post('/students', teacherController.addStudent);
router.post('/marks', teacherController.enterMarks);
router.post('/attendance', teacherController.takeAttendance);
router.post('/comment', teacherController.addComment);

// CSV upload
router.post('/upload/marks', teacherController.uploadMarksCSV);

// Dashboard
router.get('/dashboard', teacherController.getDashboard);

// Message routes - Make sure these functions exist in teacherController
router.get('/conversations', teacherController.getConversations);
router.get('/messages/:otherUserId', teacherController.getMessages);
router.put('/messages/read/:conversationId', teacherController.markMessagesAsRead);
router.post('/reply', teacherController.replyToParent);

// Message routes
router.get('/conversations', teacherMessageController.getConversations);
router.get('/messages/:parentId', teacherMessageController.getMessages);
router.post('/reply', teacherMessageController.replyToParent);

module.exports = router;
