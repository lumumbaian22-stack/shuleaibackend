const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middleware/auth');
const studentController = require('../controllers/studentController');
const authController = require('../controllers/authController');

router.post('/set-first-password', authController.setFirstPassword);

router.use(protect, authorize('student'));

// Comment out the problematic line
// router.get('/dashboard', studentController.getDashboard);

// Use a simple route instead
router.get('/dashboard', (req, res) => {
    res.json({ success: true, message: 'Dashboard endpoint', user: req.user });
});

router.get('/materials', studentController.getMaterials);
router.get('/grades', studentController.getGrades);
router.get('/attendance', studentController.getAttendance);
router.post('/message', studentController.sendMessage);
router.get('/messages/:otherUserId', studentController.getMessages);

module.exports = router;
