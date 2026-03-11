const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middleware/auth');
const dutyController = require('../controllers/dutyController');

router.use(protect);

// Original routes - make sure these exist in dutyController
router.get('/today', dutyController.getTodayDuty);
router.get('/week', dutyController.getWeeklyDuty);
router.post('/check-in', authorize('teacher'), dutyController.checkInDuty);
router.post('/check-out', authorize('teacher'), dutyController.checkOutDuty);
router.put('/preferences', authorize('teacher'), dutyController.updateDutyPreferences);
router.post('/request-swap', authorize('teacher'), dutyController.requestDutySwap);

// New routes - comment out until fully implemented
// router.get('/fairness-report', authorize('admin'), dutyController.getFairnessReport);
// router.post('/adjust', authorize('admin'), dutyController.manualAdjustDuty);
// router.get('/understaffed', authorize('admin'), dutyController.getUnderstaffedAreas);
// router.get('/teacher-workload', authorize('admin'), dutyController.getTeacherWorkload);

module.exports = router;
