const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middleware/auth');
const studentController = require('../controllers/studentController');
const authController = require('../controllers/authController');
const analyticsController = require('../controllers/analyticsController');
const subjectSelectionController = require('../controllers/subjectSelectionController');
const { MoodCheckin } = require('../models');

router.post('/set-first-password', authController.setFirstPassword);

router.use(protect, authorize('student'));

router.get('/dashboard', studentController.getDashboard);
router.get('/materials', studentController.getMaterials);
router.get('/grades', studentController.getGrades);
router.get('/recommendations', studentController.getGradeRecommendations);
router.get('/careers', studentController.getCareerOptions);
router.get('/career/interests', studentController.getCareerInterests);
router.put('/career/interests', studentController.saveCareerInterests);
router.post('/career/insights', studentController.generateCareerInsights);
router.get('/attendance', studentController.getAttendance);
router.post('/message', studentController.sendMessage);
router.get('/messages/:otherUserId', studentController.getMessages);

router.post('/group-message', studentController.sendGroupMessage);
router.get('/group-messages', studentController.getGroupMessages);

// Analytics (NEW)
router.get('/analytics', analyticsController.getStudentAnalytics);
router.get('/subject-selection', subjectSelectionController.getStudentOwnSelection);
router.put('/subject-selection', subjectSelectionController.saveStudentOwnSelection);

router.post('/mood', protect, authorize('student'), async (req, res) => {
    try {
        const { mood, note } = req.body;
        const checkin = await MoodCheckin.create({ userId: req.user.id, mood, note });
        res.json({ success: true, data: checkin });
    } catch (error) { res.status(500).json({ success: false, message: error.message }); }
});

module.exports = router;
