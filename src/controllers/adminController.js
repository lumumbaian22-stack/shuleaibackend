const { Op } = require('sequelize');
const { User, Teacher, Student, Parent, School, Alert, Class } = require('../models');
const { createAlert } = require('../services/notificationService');

// @desc    Get admin dashboard statistics
// @route   GET /api/admin/dashboard
// @access  Private/Admin
exports.getDashboardStats = async (req, res) => {
  try {
    const schoolCode = req.user.schoolCode;

    const stats = {
      teachers: await Teacher.count({ include: [{ model: User, where: { schoolCode, role: 'teacher' } }] }),
      students: await Student.count({ include: [{ model: User, where: { schoolCode, role: 'student' } }] }),
      parents: await Parent.count({ include: [{ model: User, where: { schoolCode, role: 'parent' } }] }),
      pendingApprovals: await Teacher.count({
        include: [{ model: User, where: { schoolCode, role: 'teacher' } }],
        where: { approvalStatus: 'pending' }
      }),
      recentAlerts: await Alert.count({ where: { role: 'admin', createdAt: { [Op.gte]: new Date(Date.now() - 7*24*60*60*1000) } } })
    };

    res.json({ success: true, data: stats });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Get all teachers in the school
// @route   GET /api/admin/teachers
// @access  Private/Admin
exports.getAllTeachers = async (req, res) => {
  try {
    const teachers = await Teacher.findAll({
      include: [{ 
        model: User, 
        where: { schoolCode: req.user.schoolCode }, 
        attributes: ['id','name','email','phone','createdAt'] 
      }],
      order: [['createdAt', 'DESC']]
    });
    res.json({ success: true, data: teachers });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Get all students in the school
// @route   GET /api/admin/students
// @access  Private/Admin
exports.getAllStudents = async (req, res) => {
  try {
    const students = await Student.findAll({
      include: [{ 
        model: User, 
        where: { schoolCode: req.user.schoolCode }, 
        attributes: ['id','name','email','phone','createdAt'] 
      }],
      order: [['createdAt', 'DESC']]
    });
    res.json({ success: true, data: students });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Get all parents in the school
// @route   GET /api/admin/parents
// @access  Private/Admin
exports.getAllParents = async (req, res) => {
  try {
    const parents = await Parent.findAll({
      include: [{ 
        model: User, 
        where: { schoolCode: req.user.schoolCode }, 
        attributes: ['id','name','email','phone','createdAt'] 
      }],
      order: [['createdAt', 'DESC']]
    });
    res.json({ success: true, data: parents });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Get school settings
// @route   GET /api/admin/settings
// @access  Private/Admin
exports.getSchoolSettings = async (req, res) => {
  try {
    const school = await School.findOne({ where: { schoolId: req.user.schoolCode } });
    res.json({ success: true, data: school });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Update school settings
// @route   PUT /api/admin/settings
// @access  Private/Admin
exports.updateSchoolSettings = async (req, res) => {
  try {
    const school = await School.findOne({ where: { schoolId: req.user.schoolCode } });
    if (!school) return res.status(404).json({ success: false, message: 'School not found' });

    const allowedFields = ['name', 'system', 'address', 'contact', 'settings', 'feeStructure', 'bankDetails'];
    allowedFields.forEach(field => {
      if (req.body[field] !== undefined) school[field] = req.body[field];
    });

    await school.save();

    // Notify super admin if school name changed (optional)
    if (req.body.name && req.body.name !== school.name) {
      const superAdmins = await User.findAll({ where: { role: 'super_admin' } });
      for (const sa of superAdmins) {
        await createAlert({
          userId: sa.id,
          role: 'super_admin',
          type: 'system',
          severity: 'info',
          title: 'School Name Change',
          message: `School ${school.schoolId} changed name to ${req.body.name}`,
          data: { schoolCode: school.schoolId }
        });
      }
    }

    res.json({ success: true, data: school });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Create a new class (grade)
// @route   POST /api/admin/classes
// @access  Private/Admin
exports.createClass = async (req, res) => {
  try {
    const { name, teacherId } = req.body;
    const newClass = await Class.create({
      name,
      schoolCode: req.user.schoolCode,
      teacherId
    });
    res.status(201).json({ success: true, data: newClass });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Get all classes
// @route   GET /api/admin/classes
// @access  Private/Admin
exports.getClasses = async (req, res) => {
  try {
    const classes = await Class.findAll({ where: { schoolCode: req.user.schoolCode } });
    res.json({ success: true, data: classes });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Get single student details
// @route   GET /api/admin/students/:studentId
// @access  Private/Admin
exports.getStudentDetails = async (req, res) => {
    try {
        const student = await Student.findByPk(req.params.studentId, {
            include: [
                { model: User, attributes: ['id', 'name', 'email', 'phone'] },
                { model: Parent, include: [{ model: User, attributes: ['name', 'email'] }] }
            ]
        });
        
        if (!student) {
            return res.status(404).json({ success: false, message: 'Student not found' });
        }
        
        // Verify the student belongs to the admin's school
        if (student.User.schoolCode !== req.user.schoolCode) {
            return res.status(403).json({ success: false, message: 'Forbidden' });
        }
        
        res.json({ success: true, data: student });
    } catch (error) {
        console.error('Get student details error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
};

