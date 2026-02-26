const { body, validationResult } = require('express-validator');

const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, errors: errors.array() });
  }
  next();
};

const validationRules = {
  teacherSignup: [
    body('name').notEmpty().isLength({ min: 2 }),
    body('email').isEmail(),
    body('password').isLength({ min: 6 }),
    body('schoolId').notEmpty()
  ],
  login: [
    body('email').optional().isEmail(),
    body('elimuid').optional(),
    body('password').notEmpty(),
    body('role').isIn(['admin', 'teacher', 'parent', 'student', 'super_admin'])
  ],
  verifySchool: [
    body('schoolId').notEmpty()
  ],
  approveTeacher: [
    body('action').isIn(['approve', 'reject']),
    body('rejectionReason').if(body('action').equals('reject')).notEmpty()
  ]
};

module.exports = { validate, validationRules };