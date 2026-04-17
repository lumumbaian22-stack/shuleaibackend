const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middleware/auth');
const teacherController = require('../controllers/teacherController');
const teacherMessageController = require('../controllers/teacherMessageController');
const taskController = require('../controllers/taskController');
const chatController = require('../controllers/chatController');

router.use(protect);
router.use(authorize('teacher'));

// Students
router.get('/students', teacherController.getMyStudents);
router.post('/students', teacherController.addStudent);
router.delete('/students/:studentId', teacherController.deleteStudent);
router.post('/students/upload', teacherController.uploadStudentsCSV);
router.get('/class-students', teacherController.getClassStudentsForSubject);
router.get('/my-assignments', teacherController.getMyAssignments);

// Marks
router.put('/marks/:recordId', teacherController.updateMark);
router.delete('/marks/:recordId', teacherController.deleteMark);
router.get('/marks-template', teacherController.downloadMarksTemplate);
router.post('/marks', teacherController.enterMarks);
router.post('/marks/bulk', teacherController.saveBulkMarks);
router.post('/upload/marks', teacherController.uploadMarksCSV);

// Attendance & Comments
router.post('/attendance', teacherController.takeAttendance);
router.post('/comment', teacherController.addComment);

// Dashboard & Stats
router.get('/dashboard', teacherController.getDashboard);
router.get('/stats', teacherController.getTeacherStats);
router.get('/my-class', teacherController.getMyClass);
router.get('/my-subjects', teacherController.getMySubjects);
router.get('/classes/:classId/students', teacherController.getClassStudents);
router.get('/gradebook', teacherController.getClassGradebook);
router.get('/performance', teacherController.getPerformanceData);

// Messaging (Parent)
router.get('/parent-conversations', chatController.getParentConversations);
router.get('/conversations', teacherMessageController.getConversations);
router.get('/messages/:parentId', teacherMessageController.getMessages);
router.put('/messages/read/:conversationId', teacherMessageController.markMessagesAsRead);
router.post('/reply', teacherMessageController.replyToParent);
router.delete('/messages/:messageId', teacherController.deleteMessage); // NEW

// Staff Chat
router.get('/staff-members', chatController.getStaffMembers);
router.post('/group-message', chatController.sendGroupMessage);
router.post('/private-message', chatController.sendPrivateMessage);
router.get('/group-messages', chatController.getGroupMessages);
router.get('/private-messages/:otherUserId', chatController.getPrivateMessages);

// Tasks
router.get('/tasks', taskController.getTasks);
router.post('/tasks', taskController.createTask);
router.put('/tasks/:taskId', taskController.updateTask);
router.delete('/tasks/:taskId', taskController.deleteTask);

module.exports = router;
