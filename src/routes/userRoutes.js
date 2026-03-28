// src/routes/userRoutes.js
const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const userController = require('../controllers/userController');

// All user routes require authentication
router.use(protect);

router.get('/stats', userController.getUserStats);
router.put('/profile', userController.updateProfile);
router.get('/preferences', userController.getPreferences);
router.put('/preferences', userController.updatePreferences);
router.get('/export', userController.exportMyData);
router.post('/deactivate', userController.deactivateAccount);

module.exports = router;
