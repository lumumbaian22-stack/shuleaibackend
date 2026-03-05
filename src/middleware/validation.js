const { body, validationResult } = require('express-validator');

// Validation middleware
const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      errors: errors.array()
    });
  }
  next();
};

// Validation rules - Structured to match authRoutes.js expectations
const validationRules = {
  // User validation rules
  user: {
    register: [
      body('name').notEmpty().withMessage('Name is required').isLength({ min: 2, max: 100 }),
      body('email').optional().isEmail().withMessage('Invalid email'),
      body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
      body('role').isIn(['admin', 'teacher', 'parent', 'student']).withMessage('Invalid role'),
      body('phone').optional().isMobilePhone().withMessage('Invalid phone number'),
      body('schoolCode').optional().isString().withMessage('School code must be a string')
    ],
    login: [
      body('email').optional().isEmail(),
      body('elimuid').optional(),
      body('password').notEmpty().withMessage('Password is required'),
      body('role').isIn(['admin', 'teacher', 'parent', 'student', 'super_admin']).withMessage('Invalid role')
    ],
    update: [
      body('name').optional().isLength({ min: 2, max: 100 }),
      body('email').optional().isEmail(),
      body('phone').optional().isMobilePhone()
    ]
  },
  
  // Teacher signup validation
  teacherSignup: [
    body('name').notEmpty().withMessage('Name is required'),
    body('email').isEmail().withMessage('Valid email is required'),
    body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
    body('schoolId').notEmpty().withMessage('School ID is required'),
    body('subjects').optional().isArray(),
    body('qualification').optional().isString()
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
  
  // Duty management
  dutyCheckIn: [
    body('location').optional().isString(),
    body('notes').optional().isString()
  ],
  
  dutyPreferences: [
    body('preferredDays').optional().isArray(),
    body('maxDutiesPerWeek').optional().isInt({ min: 1, max: 7 }),
    body('blackoutDates').optional().isArray()
  ],
  
  // Student validation
  student: {
    create: [
      body('name').notEmpty().withMessage('Name is required'),
      body('grade').notEmpty().withMessage('Grade is required'),
      body('parentEmail').optional().isEmail()
    ]
  },
  
  // Academic record validation
  academic: {
    create: [
      body('studentId').notEmpty().withMessage('Student ID is required'),
      body('subject').notEmpty().withMessage('Subject is required'),
      body('score').isInt({ min: 0, max: 100 }).withMessage('Score must be between 0 and 100'),
      body('term').isIn(['Term 1', 'Term 2', 'Term 3']).withMessage('Invalid term'),
      body('assessmentType').isIn(['test', 'exam', 'assignment', 'project', 'quiz'])
    ]
  },
  
  // Attendance validation
  attendance: {
    create: [
      body('studentId').notEmpty().withMessage('Student ID is required'),
      body('date').isISO8601().withMessage('Invalid date'),
      body('status').isIn(['present', 'absent', 'late', 'holiday', 'sick']).withMessage('Invalid status')
    ]
  },
  
  // Payment validation
  payment: {
    create: [
      body('studentId').notEmpty().withMessage('Student ID is required'),
      body('amount').isInt({ min: 1 }).withMessage('Amount must be greater than 0'),
      body('method').isIn(['mpesa', 'bank', 'cash', 'card']).withMessage('Invalid payment method'),
      body('reference').notEmpty().withMessage('Reference is required'),
      body('plan').isIn(['basic', 'premium', 'ultimate']).withMessage('Invalid plan')
    ]
  },
  
  // School name request
  schoolNameRequest: {
    create: [
      body('newName').notEmpty().withMessage('New school name is required'),
      body('reason').notEmpty().withMessage('Reason is required')
    ]
  },
  
  // Pagination
  pagination: [
    body('page').optional().isInt({ min: 1 }).toInt(),
    body('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
    body('sort').optional().isString()
  ]
};

module.exports = {
  validate,
  validationRules
};
