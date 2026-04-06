const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middleware/auth');
const teacherController = require('../controllers/teacherController');
const teacherMessageController = require('../controllers/teacherMessageController');
const taskController = require('../controllers/taskController');
const chatController = require('../controllers/chatController');

// All teacher routes require authentication and teacher role
router.use(protect, authorize('teacher'));

// ============ STUDENT MANAGEMENT ============
router.get('/students', teacherController.getMyStudents);
router.post('/students', teacherController.addStudent);
router.delete('/students/:studentId', teacherController.deleteStudent);
router.post('/students/upload', teacherController.uploadStudentsCSV);
router.get('/class-students', teacherController.getClassStudentsForSubject);
router.get('/my-assignments', teacherController.getMyAssignments);

// ============ ACADEMIC MANAGEMENT ============
router.post('/marks', teacherController.enterMarks);
router.post('/marks/bulk', teacherController.saveBulkMarks);
router.post('/attendance', teacherController.takeAttendance);
router.post('/comment', teacherController.addComment);
router.post('/upload/marks', teacherController.uploadMarksCSV);

// ============ DASHBOARD & STATS ============
router.get('/dashboard', teacherController.getDashboard);
router.get('/stats', teacherController.getTeacherStats);
router.get('/my-class', teacherController.getMyClass);
router.get('/my-subjects', teacherController.getMySubjects);
router.get('/classes/:classId/students', teacherController.getClassStudents);

// ============ MESSAGING (Teacher-Parent) ============
router.get('/conversations', teacherMessageController.getConversations);
router.get('/messages/:parentId', teacherMessageController.getMessages);
router.put('/messages/read/:conversationId', teacherMessageController.markMessagesAsRead);
router.post('/reply', teacherMessageController.replyToParent);

// ============ STAFF CHAT (Teacher-Teacher) ============
router.get('/staff-members', chatController.getStaffMembers);
router.post('/group-message', chatController.sendGroupMessage);
router.post('/private-message', chatController.sendPrivateMessage);
router.get('/chat/messages/:otherUserId', chatController.getMessages);
router.get('/chat/conversations', chatController.getConversations);

// ============ TASKS ============
router.get('/tasks', taskController.getTasks);
router.post('/tasks', taskController.createTask);
router.put('/tasks/:taskId', taskController.updateTask);
router.delete('/tasks/:taskId', taskController.deleteTask);

router.get('/performance', teacherController.getPerformanceData);

module.exports = router;
