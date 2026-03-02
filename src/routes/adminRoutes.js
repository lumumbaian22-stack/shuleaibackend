const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middleware/auth');
const { validate, validationRules } = require('../middleware/validation');
const teacherSignupController = require('../controllers/teacherSignupController');
const dutyController = require('../controllers/dutyController');

router.use(protect, authorize('admin', 'super_admin'));

router.get('/approvals/pending', teacherSignupController.getPendingApprovals);
router.post('/teachers/:teacherId/approve', validationRules.approveTeacher, validate, teacherSignupController.approveTeacher);
router.post('/duty/generate', dutyController.generateDutyRoster);
router.get('/duty/stats', dutyController.getDutyStats); // need to implement if needed

module.exports = router;