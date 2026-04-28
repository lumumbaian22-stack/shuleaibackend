const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middleware/auth');
const timetableCtrl = require('../controllers/timetableController');

// NEW – fetch timetable for a specific week (admin view)
router.get('/', protect, authorize('admin'), timetableCtrl.getByWeek);

// existing routes
router.post('/generate', protect, authorize('admin'), timetableCtrl.generate);
router.put('/:id', protect, authorize('admin'), timetableCtrl.manualUpdate);
router.post('/:id/publish', protect, authorize('admin'), timetableCtrl.publish);
router.get('/class/:classId', protect, timetableCtrl.getForClass);
router.get('/teacher/:teacherId', protect, timetableCtrl.getForTeacher);

module.exports = router;
