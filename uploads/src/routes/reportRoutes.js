const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middleware/auth');
const ctrl = require('../controllers/reportController');
router.get('/', protect, ctrl.listReports);
router.get('/:id', protect, ctrl.getReport);
router.post('/generate', protect, authorize('admin','teacher','super_admin'), ctrl.generateReport);
module.exports = router;
