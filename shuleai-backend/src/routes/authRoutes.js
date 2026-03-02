const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const { validate, validationRules } = require('../middleware/validation');
const authController = require('../controllers/authController');
const teacherSignupController = require('../controllers/teacherSignupController');

// Debug middleware for all auth routes
router.use((req, res, next) => {
  console.log('📨 Auth Route Hit:', {
    timestamp: new Date().toISOString(),
    method: req.method,
    path: req.path,
    originalUrl: req.originalUrl,
    body: req.body,
    headers: {
      'content-type': req.headers['content-type'],
      'origin': req.headers.origin,
      'user-agent': req.headers['user-agent']
    }
  });
  next();
});

// Test endpoint (bypasses everything)
router.post('/test', (req, res) => {
  console.log('✅ Test endpoint reached');
  res.json({ 
    success: true, 
    message: 'Test endpoint working',
    receivedBody: req.body 
  });
});

// Login route with step-by-step logging
router.post('/login', 
  (req, res, next) => {
    console.log('➡️ Step 1: Login route handler started');
    next();
  },
  (req, res, next) => {
    console.log('➡️ Step 2: About to run validation');
    next();
  },
  validationRules.login,
  (req, res, next) => {
    console.log('➡️ Step 3: Validation rules prepared');
    next();
  },
  validate,
  (req, res, next) => {
    console.log('✅ Step 4: Validation passed, calling controller');
    next();
  },
  authController.login
);

// Teacher signup
router.post('/teacher/signup', 
  (req, res, next) => {
    console.log('👨‍🏫 Teacher signup route hit');
    next();
  },
  validationRules.teacherSignup, 
  validate, 
  teacherSignupController.teacherSignup
);

// Verify school
router.post('/verify-school', 
  (req, res, next) => {
    console.log('🏫 Verify school route hit');
    next();
  },
  validationRules.verifySchool, 
  validate, 
  teacherSignupController.verifySchoolId
);

// Protected routes (require authentication)
router.use(protect);

router.get('/me', (req, res, next) => {
  console.log('👤 Get me route hit for user:', req.user?.id);
  next();
}, authController.getMe);

router.post('/logout', (req, res, next) => {
  console.log('🚪 Logout route hit');
  next();
}, authController.logout);

module.exports = router;
