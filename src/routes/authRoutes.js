const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const { validate, validationRules } = require('../middleware/validation');
const authController = require('../controllers/authController');

// Public routes
router.post('/super-admin/login', validationRules.superAdminLogin, validate, authController.superAdminLogin);
router.post('/admin/signup', validationRules.adminSignup, validate, authController.adminSignup);
router.post('/teacher/signup', validationRules.teacherSignup, validate, authController.teacherSignup);
router.post('/parent/signup', validationRules.parentSignup, validate, authController.parentSignup);
router.post('/student/login', validationRules.studentLogin, validate, authController.studentLogin);
router.post('/login', validationRules.login, validate, authController.login);
router.post('/verify-school', validationRules.verifySchoolCode, validate, authController.verifySchoolCode);
router.post('/refresh-token', authController.refreshToken);
router.post('/super-admin/diagnostic', authController.superAdminDiagnostic);

// Protected routes
router.use(protect);
router.get('/me', authController.getMe);
router.post('/logout', authController.logout);
router.post('/change-password', authController.changePassword);

module.exports = router;
