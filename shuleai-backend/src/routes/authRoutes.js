const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const { validate, validationRules } = require('../middleware/validation');
const authController = require('../controllers/authController');
const teacherSignupController = require('../controllers/teacherSignupController');

router.post('/login', validationRules.login, validate, authController.login);
router.post('/teacher/signup', validationRules.teacherSignup, validate, teacherSignupController.teacherSignup);
router.post('/verify-school', validationRules.verifySchool, validate, teacherSignupController.verifySchoolId);

router.use(protect);
router.get('/me', authController.getMe);
router.post('/logout', authController.logout);

module.exports = router;