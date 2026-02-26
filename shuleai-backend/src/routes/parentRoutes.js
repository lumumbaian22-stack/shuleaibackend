const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middleware/auth');
const parentController = require('../controllers/parentController');

router.use(protect, authorize('parent'));

router.get('/children', parentController.getChildren);
router.get('/child/:studentId/summary', parentController.getChildSummary);
router.post('/report-absence', parentController.reportAbsence);
router.post('/pay', parentController.makePayment);
router.get('/payments', parentController.getPayments);

module.exports = router;