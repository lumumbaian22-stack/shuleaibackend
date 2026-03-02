const { body, validationResult } = require('express-validator');

// Validation middleware with logging
const validate = (req, res, next) => {
  console.log('🔍 Running validation on:', req.body);
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    console.log('❌ Validation errors:', JSON.stringify(errors.array(), null, 2));
    return res.status(400).json({ 
      success: false, 
      message: 'Validation failed',
      errors: errors.array() 
    });
  }
  console.log('✅ Validation passed');
  next();
};

// Validation rules
const validationRules = {
  // Teacher signup validation
  teacherSignup: [
    body('name').notEmpty().withMessage('Name is required').isLength({ min: 2 }),
    body('email').isEmail().withMessage('Valid email is required'),
    body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
    body('schoolId').notEmpty().withMessage('School ID is required'),
    body('subjects').optional().isArray(),
    body('qualification').optional().isString()
  ],

  // Login validation
  login: [
    body('email').optional().isEmail().withMessage('Valid email required'),
    body('elimuid').optional().isString().withMessage('Valid ELIMUID required'),
    body('password').notEmpty().withMessage('Password is required'),
    body('role').isIn(['admin', 'teacher', 'parent', 'student', 'super_admin']).withMessage('Invalid role')
  ],

  // School verification
  verifySchool: [
    body('schoolId').notEmpty().withMessage('School ID is required')
  ],

  // Approval actions
  approveTeacher: [
    body('action').isIn(['approve', 'reject']).withMessage('Action must be approve or reject'),
    body('rejectionReason').optional().if(body('action').equals('reject')).notEmpty()
  ],

  // Duty check-in
  dutyCheckIn: [
    body('location').optional().isString(),
    body('notes').optional().isString()
  ],

  dutyPreferences: [
    body('preferredDays').optional().isArray(),
    body('maxDutiesPerWeek').optional().isInt({ min: 1, max: 7 }),
    body('blackoutDates').optional().isArray()
  ],

  // Student creation
  student: {
    create: [
      body('name').notEmpty().withMessage('Name is required'),
      body('grade').notEmpty().withMessage('Grade is required'),
      body('parentEmail').optional().isEmail()
    ]
  },

  // Academic record
  academic: {
    create: [
      body('studentId').notEmpty().withMessage('Student ID is required'),
      body('subject').notEmpty().withMessage('Subject is required'),
      body('score').isInt({ min: 0, max: 100 }).withMessage('Score must be between 0 and 100'),
      body('term').isIn(['Term 1', 'Term 2', 'Term 3']).withMessage('Invalid term'),
      body('assessmentType').isIn(['test', 'exam', 'assignment', 'project', 'quiz'])
    ]
  }
};

module.exports = {
  validate,
  validationRules
};
