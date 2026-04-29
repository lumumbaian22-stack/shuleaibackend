const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middleware/auth');
const studentController = require('../controllers/studentController');
const authController = require('../controllers/authController');
const analyticsController = require('../controllers/analyticsController'); // Add import

router.post('/set-first-password', authController.setFirstPassword);

router.use(protect, authorize('student'));

router.get('/dashboard', studentController.getDashboard);
router.get('/materials', studentController.getMaterials);
router.get('/grades', studentController.getGrades);
router.get('/attendance', studentController.getAttendance);
router.post('/message', studentController.sendMessage);
router.get('/messages/:otherUserId', studentController.getMessages);

router.post('/group-message', studentController.sendGroupMessage);
router.get('/group-messages', studentController.getGroupMessages);

// Analytics (NEW)
router.get('/analytics', analyticsController.getStudentAnalytics);

router.post('/mood', protect, authorize('student'), async (req, res) => {
    try {
        const { mood, note } = req.body;
        const checkin = await MoodCheckin.create({ userId: req.user.id, mood, note });
        res.json({ success: true, data: checkin });
    } catch (error) { res.status(500).json({ success: false, message: error.message }); }
});

module.exports = router;
