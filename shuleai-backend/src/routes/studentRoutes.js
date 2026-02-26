const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middleware/auth');
const studentController = require('../controllers/studentController');

router.use(protect, authorize('student'));

router.get('/dashboard', studentController.getDashboard);
router.get('/materials', studentController.getMaterials);
router.get('/grades', studentController.getGrades);
router.get('/attendance', studentController.getAttendance);

// Messaging
router.post('/message', studentController.sendMessage);
router.get('/messages/:otherUserId', studentController.getMessages);

module.exports = router;