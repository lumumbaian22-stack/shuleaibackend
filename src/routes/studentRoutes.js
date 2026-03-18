const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middleware/auth');
const studentController = require('../controllers/studentController');
const authController = require('../controllers/authController');

// First password set (doesn't require authentication since it's first login)
router.post('/set-first-password', authController.setFirstPassword);

// Protected routes
router.use(protect, authorize('student'));

router.get('/dashboard', studentController.getDashboard);
router.get('/profile', studentController.getProfile);
router.get('/materials', studentController.getMaterials);
router.get('/grades', studentController.getGrades);
router.get('/attendance', studentController.getAttendance);
router.get('/schedule', studentController.getSchedule);

// Study groups
router.get('/study-groups', studentController.getStudyGroups);
router.get('/study-groups/:groupId', studentController.getStudyGroup);
router.post('/study-groups/:groupId/message', studentController.sendGroupMessage);

// Messaging
router.post('/message', studentController.sendMessage);
router.get('/messages/:otherUserId', studentController.getMessages);

module.exports = router;
