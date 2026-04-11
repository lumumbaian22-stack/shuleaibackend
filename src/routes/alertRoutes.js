const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const alertController = require('../controllers/alertController');

router.use(protect);
router.get('/', alertController.getMyAlerts);
router.put('/:id/read', alertController.markAlertAsRead);
router.put('/read-all', alertController.markAllAsRead);

module.exports = router;
