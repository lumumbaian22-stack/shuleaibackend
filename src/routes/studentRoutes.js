const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middleware/auth');
const studentController = require('../controllers/studentController');

router.use(protect, authorize('student'));

router.get('/dashboard', studentController.getDashboard);
router.get('/materials', studentController.getMaterials);
router.get('/grades', studentController.getGrades);
router.get('/attendance', studentController.getAttendance);

// Add this line with your other student routes
router.post('/set-first-password', studentController.setFirstPassword);

// Messaging
router.post('/message', studentController.sendMessage);
router.get('/messages/:otherUserId', studentController.getMessages);

module.exports = router;
