const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middleware/auth');
const teacherController = require('../controllers/teacherController');
const teacherMessageController = require('../controllers/teacherMessageController');
const taskController = require('../controllers/taskController');
const chatController = require('../controllers/chatController');

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

// Add these lines
router.get('/my-assignments', teacherController.getMyAssignments);
router.get('/class-students', teacherController.getClassStudentsForSubject);

router.get('/staff-members', chatController.getStaffMembers);
router.post('/group-message', chatController.sendGroupMessage);
router.post('/private-message', chatController.sendPrivateMessage);
router.get('/messages/:otherUserId', chatController.getMessages);
router.get('/conversations', chatController.getConversations);

router.get('/tasks', taskController.getTasks);
router.post('/tasks', taskController.createTask);
router.put('/tasks/:taskId', taskController.updateTask);
router.delete('/tasks/:taskId', taskController.deleteTask);

module.exports = router;
