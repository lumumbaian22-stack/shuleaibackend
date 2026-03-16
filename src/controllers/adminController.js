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

        // Update settings
        school.settings = {
            ...school.settings,
            ...req.body,
            customSubjects: req.body.customSubjects || []
        };
        
        // Update other fields
        if (req.body.schoolName) school.name = req.body.schoolName;
        if (req.body.curriculum) school.system = req.body.curriculum;
        
        await school.save();

        res.json({ 
            success: true, 
            data: {
                ...school.toJSON(),
                customSubjects: school.settings.customSubjects
            } 
        });
    } catch (error) {
        console.error('Update school settings error:', error);
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
        console.log('=== Get Student Details ===');
        console.log('Student ID:', req.params.studentId);
        console.log('Admin schoolCode:', req.user.schoolCode);
        
        // Find the student with proper includes
        const student = await Student.findByPk(req.params.studentId, {
            include: [
                { 
                    model: User,
                    as: 'User',  // Make sure to use the correct alias
                    attributes: ['id', 'name', 'email', 'phone', 'schoolCode']
                }
            ]
        });
        
        if (!student) {
            console.log('Student not found');
            return res.status(404).json({ success: false, message: 'Student not found' });
        }
        
        console.log('Student found:', student.id);
        console.log('Student User:', student.User);
        
        // Check if student belongs to admin's school
        if (!student.User) {
            console.log('Student has no associated user');
            return res.status(404).json({ success: false, message: 'Student data incomplete' });
        }
        
        if (student.User.schoolCode !== req.user.schoolCode) {
            console.log('School code mismatch!');
            console.log('Expected:', req.user.schoolCode);
            console.log('Got:', student.User.schoolCode);
            return res.status(403).json({ success: false, message: 'Forbidden' });
        }
        
        console.log('School code check passed');
        
        // Remove the schoolCode from response for security
        const userData = { ...student.User.toJSON() };
        delete userData.schoolCode;
        
        const responseData = {
            ...student.toJSON(),
            User: userData
        };
        
        res.json({ success: true, data: responseData });
    } catch (error) {
        console.error('Get student details error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
};
