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

// @desc    Get all classes in school
// @route   GET /api/admin/classes
// @access  Private/Admin
exports.getClasses = async (req, res) => {
  try {
    const classes = await Class.findAll({
      where: { schoolCode: req.user.schoolCode },
      include: [{
        model: Teacher,
        include: [{ model: User, attributes: ['id', 'name', 'email'] }]
      }],
      order: [['grade', 'ASC'], ['name', 'ASC']]
    });
    
    res.json({ success: true, data: classes });
  } catch (error) {
    console.error('Get classes error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Create a new class
// @route   POST /api/admin/classes
// @access  Private/Admin
exports.createClass = async (req, res) => {
  try {
    const { name, grade, stream, teacherId } = req.body;
    
    const newClass = await Class.create({
      name,
      grade,
      stream,
      schoolCode: req.user.schoolCode,
      teacherId: teacherId || null
    });
    
    res.status(201).json({ success: true, data: newClass });
  } catch (error) {
    console.error('Create class error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Update a class
// @route   PUT /api/admin/classes/:id
// @access  Private/Admin
exports.updateClass = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, grade, stream, teacherId } = req.body;
    
    const classItem = await Class.findOne({
      where: { id, schoolCode: req.user.schoolCode }
    });
    
    if (!classItem) {
      return res.status(404).json({ success: false, message: 'Class not found' });
    }
    
    await classItem.update({ name, grade, stream, teacherId });
    
    res.json({ success: true, data: classItem });
  } catch (error) {
    console.error('Update class error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Assign teacher to class
// @route   POST /api/admin/classes/:id/assign-teacher
// @access  Private/Admin
exports.assignTeacherToClass = async (req, res) => {
  try {
    const { id } = req.params;
    const { teacherId } = req.body;
    
    const classItem = await Class.findOne({
      where: { id, schoolCode: req.user.schoolCode }
    });
    
    if (!classItem) {
      return res.status(404).json({ success: false, message: 'Class not found' });
    }
    
    // Verify teacher belongs to this school
    const teacher = await Teacher.findOne({
      where: { id: teacherId },
      include: [{ model: User, where: { schoolCode: req.user.schoolCode } }]
    });
    
    if (!teacher) {
      return res.status(404).json({ success: false, message: 'Teacher not found in this school' });
    }
    
    await classItem.update({ teacherId });
    
    // Update teacher's classTeacher field
    await teacher.update({ classTeacher: classItem.name });
    
    res.json({ 
      success: true, 
      message: `Teacher assigned to ${classItem.name} successfully`,
      data: classItem 
    });
  } catch (error) {
    console.error('Assign teacher error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Get available teachers for class assignment
// @route   GET /api/admin/available-teachers
// @access  Private/Admin
exports.getAvailableTeachers = async (req, res) => {
  try {
    const teachers = await Teacher.findAll({
      where: { approvalStatus: 'approved' },
      include: [{
        model: User,
        where: { schoolCode: req.user.schoolCode },
        attributes: ['id', 'name', 'email']
      }]
    });
    
    res.json({ success: true, data: teachers });
  } catch (error) {
    console.error('Get available teachers error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Suspend a student from the school
// @route   POST /api/admin/students/:studentId/suspend
// @access  Private/Admin
exports.suspendStudent = async (req, res) => {
  try {
    const { studentId } = req.params;
    const { reason } = req.body;
    
    if (!reason) {
      return res.status(400).json({ success: false, message: 'Suspension reason is required' });
    }
    
    // Find the student
    const student = await Student.findByPk(studentId, {
      include: [{ model: User }]
    });
    
    if (!student) {
      return res.status(404).json({ success: false, message: 'Student not found' });
    }
    
    // Update student status
    student.status = 'suspended';
    await student.save();
    
    // Deactivate the user account
    student.User.isActive = false;
    await student.User.save();
    
    // Get all stakeholders
    const stakeholders = [];
    
    // Add student
    stakeholders.push({
      userId: student.userId,
      role: 'student'
    });
    
    // Add parents
    const parents = await student.getParents({ include: [{ model: User }] });
    for (const parent of parents) {
      stakeholders.push({
        userId: parent.userId,
        role: 'parent'
      });
    }
    
    // Add teachers (find teacher for this grade)
    const teacher = await Teacher.findOne({ 
      where: { classTeacher: student.grade },
      include: [{ model: User }]
    });
    
    if (teacher) {
      stakeholders.push({
        userId: teacher.userId,
        role: 'teacher'
      });
    }
    
    // Notify all stakeholders
    for (const stakeholder of stakeholders) {
      await createAlert({
        userId: stakeholder.userId,
        role: stakeholder.role,
        type: 'system',
        severity: 'critical',
        title: 'Student Suspension',
        message: `Student ${student.User.name} has been suspended from the school. Reason: ${reason}`,
        data: { studentId, reason }
      });
    }
    
    // Also send email notifications if you have email service
    // await sendSuspensionEmails(student, stakeholders, reason);
    
    res.json({ 
      success: true, 
      message: 'Student suspended successfully',
      data: {
        studentId: student.id,
        name: student.User.name,
        status: student.status,
        notified: stakeholders.length
      }
    });
  } catch (error) {
    console.error('Suspend student error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Reactivate a suspended student
// @route   POST /api/admin/students/:studentId/reactivate
// @access  Private/Admin
exports.reactivateStudent = async (req, res) => {
  try {
    const { studentId } = req.params;
    
    const student = await Student.findByPk(studentId, {
      include: [{ model: User }]
    });
    
    if (!student) {
      return res.status(404).json({ success: false, message: 'Student not found' });
    }
    
    if (student.status !== 'suspended') {
      return res.status(400).json({ success: false, message: 'Student is not suspended' });
    }
    
    student.status = 'active';
    student.User.isActive = true;
    
    await student.save();
    await student.User.save();
    
    // Notify stakeholders
    const parents = await student.getParents({ include: [{ model: User }] });
    
    for (const parent of parents) {
      await createAlert({
        userId: parent.userId,
        role: 'parent',
        type: 'system',
        severity: 'success',
        title: 'Student Reactivated',
        message: `Your child ${student.User.name} has been reactivated`,
        data: { studentId }
      });
    }
    
    const teacher = await Teacher.findOne({ 
      where: { classTeacher: student.grade },
      include: [{ model: User }]
    });
    
    if (teacher) {
      await createAlert({
        userId: teacher.userId,
        role: 'teacher',
        type: 'system',
        severity: 'success',
        title: 'Student Reactivated',
        message: `Student ${student.User.name} has been reactivated`,
        data: { studentId }
      });
    }
    
    await createAlert({
      userId: student.userId,
      role: 'student',
      type: 'system',
      severity: 'success',
      title: 'Account Reactivated',
      message: 'Your account has been reactivated. You can now log in.',
      data: { studentId }
    });
    
    res.json({ 
      success: true, 
      message: 'Student reactivated successfully' 
    });
  } catch (error) {
    console.error('Reactivate student error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};
