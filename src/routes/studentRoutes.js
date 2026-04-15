const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middleware/auth');
const studentController = require('../controllers/studentController');
const authController = require('../controllers/authController');
const { requireConsent } = require('../middleware/consent');


router.use(protect, authorize('student'));
router.use(requireConsent);

router.post('/set-first-password', authController.setFirstPassword);

// Comment out the problematic line
// router.get('/dashboard', studentController.getDashboard);

// Use a simple route instead
router.get('/dashboard', studentController.getDashboard);

router.get('/materials', studentController.getMaterials);
router.get('/grades', studentController.getGrades);
router.get('/attendance', studentController.getAttendance);
router.post('/message', studentController.sendMessage);
router.get('/messages/:otherUserId', studentController.getMessages);

router.post('/group-message', studentController.sendGroupMessage);
router.get('/group-messages', studentController.getGroupMessages);

module.exports = router;
