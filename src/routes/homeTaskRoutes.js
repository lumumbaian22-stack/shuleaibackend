const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middleware/auth');
const homeTaskController = require('../controllers/homeTaskController');
//const { checkParentSubscription } = require('../middleware/subscription');

//router.get('/today', protect, authorize('parent'), checkParentSubscription('premium'), homeTaskController.getTodayTasks);
router.post('/:id/complete', protect, authorize('parent'), homeTaskController.completeTask);

module.exports = router;
