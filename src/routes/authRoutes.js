const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const { validate, validationRules } = require('../middleware/validation');
const authController = require('../controllers/authController');
const teacherSignupController = require('../controllers/teacherSignupController');

// =====================================================
// PUBLIC ROUTES - No authentication required
// These must come BEFORE the protect middleware
// =====================================================

// User registration - COMPLETELY PUBLIC
router.post(
  '/register',
  validationRules.user.register,
  validate,
  authController.register
);

// User login - PUBLIC
router.post(
  '/login',
  validationRules.user.login,
  validate,
  authController.login
);

// Teacher signup with school ID - PUBLIC
router.post(
  '/teacher/signup',
  validationRules.teacherSignup,
  validate,
  teacherSignupController.teacherSignup
);

// Verify school ID - PUBLIC
router.post(
  '/verify-school',
  validationRules.verifySchool,
  validate,
  teacherSignupController.verifySchoolId
);

// Password reset requests - PUBLIC
router.post('/forgot-password', authController.forgotPassword);
router.post('/reset-password', authController.resetPassword);

// =====================================================
// PROTECTED ROUTES - Require valid JWT token
// All routes after this middleware require authentication
// =====================================================
router.use(protect);

// Get current user profile
router.get('/me', authController.getMe);

// Logout
router.post('/logout', authController.logout);

// Change password (requires current password)
router.post('/change-password', authController.changePassword);

module.exports = router;
