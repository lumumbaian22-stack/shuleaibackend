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

// @desc    Assign teacher to subject/class
// @route   POST /api/admin/assign-teacher-to-subject
// @access  Private/Admin
exports.assignTeacherToSubject = async (req, res) => {
  try {
    const { teacherId, classId, subject, isClassTeacher } = req.body;
    const { TeacherSubjectAssignment, Teacher, Class } = require('../models');

    // Validate teacher exists and belongs to this school
    const teacher = await Teacher.findByPk(teacherId, {
      include: [{ model: User, where: { schoolCode: req.user.schoolCode } }]
    });
    
    if (!teacher) {
      return res.status(404).json({ success: false, message: 'Teacher not found' });
    }

    // Validate class exists and belongs to this school
    const classItem = await Class.findOne({
      where: { id: classId, schoolCode: req.user.schoolCode }
    });
    
    if (!classItem) {
      return res.status(404).json({ success: false, message: 'Class not found' });
    }

    // Check if assignment already exists
    const existing = await TeacherSubjectAssignment.findOne({
      where: {
        teacherId,
        classId,
        subject,
        academicYear: new Date().getFullYear().toString()
      }
    });

    if (existing) {
      // Update existing assignment
      await existing.update({ isClassTeacher: isClassTeacher || false });
      return res.json({ 
        success: true, 
        message: 'Assignment updated successfully',
        data: existing 
      });
    }

    // Create new assignment
    const assignment = await TeacherSubjectAssignment.create({
      teacherId,
      classId,
      subject,
      isClassTeacher: isClassTeacher || false,
      academicYear: new Date().getFullYear().toString()
    });

    // If this is a class teacher assignment, update the teacher's classTeacher field
    if (isClassTeacher) {
      await teacher.update({ classTeacher: classItem.name });
    }

    res.status(201).json({
      success: true,
      message: `${teacher.User.name} assigned to teach ${subject} in ${classItem.name}`,
      data: assignment
    });
  } catch (error) {
    console.error('Assign teacher error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Get all subject assignments for school
// @route   GET /api/admin/subject-assignments
// @access  Private/Admin
exports.getSubjectAssignments = async (req, res) => {
  try {
    const { TeacherSubjectAssignment, Teacher, Class, User } = require('../models');
    
    const assignments = await TeacherSubjectAssignment.findAll({
      where: { academicYear: new Date().getFullYear().toString() },
      include: [
        {
          model: Teacher,
          include: [{ model: User, attributes: ['id', 'name', 'email'] }]
        },
        {
          model: Class,
          where: { schoolCode: req.user.schoolCode }
        }
      ],
      order: [['createdAt', 'DESC']]
    });

    const formattedAssignments = assignments.map(a => ({
      id: a.id,
      teacherId: a.teacherId,
      teacherName: a.Teacher?.User?.name || 'Unknown',
      classId: a.classId,
      className: a.Class?.name || 'Unknown',
      classGrade: a.Class?.grade || 'N/A',
      subject: a.subject,
      isClassTeacher: a.isClassTeacher,
      academicYear: a.academicYear
    }));

    res.json({ success: true, data: formattedAssignments });
  } catch (error) {
    console.error('Get assignments error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Remove subject assignment
// @route   DELETE /api/admin/subject-assignments/:id
// @access  Private/Admin
exports.removeSubjectAssignment = async (req, res) => {
  try {
    const { id } = req.params;
    const { TeacherSubjectAssignment, Teacher } = require('../models');
    
    const assignment = await TeacherSubjectAssignment.findByPk(id, {
      include: [{ model: Teacher }]
    });
    
    if (!assignment) {
      return res.status(404).json({ success: false, message: 'Assignment not found' });
    }

    const wasClassTeacher = assignment.isClassTeacher;
    const teacherId = assignment.teacherId;
    
    await assignment.destroy();

    // If this was a class teacher assignment, check if teacher has any other class teacher assignments
    if (wasClassTeacher) {
      const otherClassTeacherAssignments = await TeacherSubjectAssignment.findOne({
        where: {
          teacherId,
          isClassTeacher: true,
          academicYear: new Date().getFullYear().toString()
        }
      });

      if (!otherClassTeacherAssignments) {
        await Teacher.update(
          { classTeacher: null },
          { where: { id: teacherId } }
        );
      }
    }

    res.json({ success: true, message: 'Assignment removed successfully' });
  } catch (error) {
    console.error('Remove assignment error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// Add to adminController.js
exports.getStudentGrades = async (req, res) => {
  try {
    const { AcademicRecord, Student } = require('../models');
    
    const grades = await AcademicRecord.findAll({
      where: { schoolCode: req.user.schoolCode },
      include: [{ model: Student, attributes: ['grade'] }]
    });
    
    // Group by grade
    const gradeStats = {};
    grades.forEach(g => {
      const grade = g.Student?.grade || 'Unknown';
      if (!gradeStats[grade]) gradeStats[grade] = { count: 0, total: 0 };
      gradeStats[grade].count++;
      gradeStats[grade].total += g.score;
    });
    
    const result = Object.entries(gradeStats).map(([grade, stats]) => ({
      grade,
      average: stats.count ? Math.round(stats.total / stats.count) : 0,
      count: stats.count
    }));
    
    res.json({ success: true, data: result });
  } catch (error) {
    console.error('Get student grades error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.getAttendanceStats = async (req, res) => {
  try {
    const { Attendance, Student } = require('../models');
    
    const attendance = await Attendance.findAll({
      where: { schoolCode: req.user.schoolCode },
      include: [{ model: Student, attributes: ['grade'] }]
    });
    
    // Group by grade
    const attendanceStats = {};
    attendance.forEach(a => {
      const grade = a.Student?.grade || 'Unknown';
      if (!attendanceStats[grade]) attendanceStats[grade] = { present: 0, absent: 0, total: 0 };
      attendanceStats[grade].total++;
      if (a.status === 'present') attendanceStats[grade].present++;
      else if (a.status === 'absent') attendanceStats[grade].absent++;
    });
    
    const result = Object.entries(attendanceStats).map(([grade, stats]) => ({
      grade,
      rate: stats.total ? Math.round((stats.present / stats.total) * 100) : 0,
      present: stats.present,
      absent: stats.absent,
      total: stats.total
    }));
    
    res.json({ success: true, data: result });
  } catch (error) {
    console.error('Get attendance stats error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// ============ SUBJECT ASSIGNMENT FUNCTIONS ============

// @desc    Get subject assignments for a class
// @route   GET /api/admin/classes/:classId/subjects
// @access  Private/Admin
exports.getClassSubjectAssignments = async (req, res) => {
  try {
    const { classId } = req.params;
    
    const classItem = await Class.findOne({
      where: { id: classId, schoolCode: req.user.schoolCode },
      include: [{ model: Teacher, include: [{ model: User }] }]
    });
    
    if (!classItem) {
      return res.status(404).json({ success: false, message: 'Class not found' });
    }
    
    // Get subject assignments from class's subjectTeachers array
    const subjectTeachers = classItem.subjectTeachers || [];
    
    // Format the response
    const assignments = subjectTeachers.map(st => ({
      id: st.id || `${st.teacherId}-${st.subject}`,
      classId: classItem.id,
      className: classItem.name,
      subject: st.subject,
      teacherId: st.teacherId,
      teacherName: st.teacherName || 'Unknown',
      assignedAt: st.assignedAt || new Date(),
      isClassTeacher: st.isClassTeacher || false
    }));
    
    res.json({ success: true, data: assignments });
  } catch (error) {
    console.error('Get class subject assignments error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Assign teacher to subject for a class
// @route   POST /api/admin/classes/subject-assign
// @access  Private/Admin
exports.assignTeacherToSubject = async (req, res) => {
  try {
    const { classId, teacherId, subject, isClassTeacher = false } = req.body;
    
    if (!classId || !teacherId || !subject) {
      return res.status(400).json({ 
        success: false, 
        message: 'Class ID, Teacher ID, and Subject are required' 
      });
    }
    
    // Find the class
    const classItem = await Class.findOne({
      where: { id: classId, schoolCode: req.user.schoolCode }
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
    
    // Get current subject assignments
    let subjectTeachers = classItem.subjectTeachers || [];
    
    // Check if assignment already exists
    const existingIndex = subjectTeachers.findIndex(st => st.subject === subject);
    
    const newAssignment = {
      id: Date.now().toString(),
      teacherId: teacher.id,
      teacherName: teacher.User?.name || 'Unknown',
      subject: subject,
      assignedAt: new Date(),
      assignedBy: req.user.id,
      isClassTeacher: isClassTeacher
    };
    
    if (existingIndex >= 0) {
      // Update existing assignment
      subjectTeachers[existingIndex] = { ...subjectTeachers[existingIndex], ...newAssignment };
    } else {
      // Add new assignment
      subjectTeachers.push(newAssignment);
    }
    
    // Save back to class
    await classItem.update({ subjectTeachers });
    
    // Also update teacher's subjects array if needed
    const currentSubjects = teacher.subjects || [];
    if (!currentSubjects.includes(subject)) {
      await teacher.update({ subjects: [...currentSubjects, subject] });
    }
    
    // Create alert for teacher
    await createAlert({
      userId: teacher.userId,
      role: 'teacher',
      type: 'system',
      severity: 'info',
      title: 'New Subject Assignment',
      message: `You have been assigned to teach ${subject} in ${classItem.name}`,
      data: { classId, subject, class: classItem.name }
    });
    
    res.json({ 
      success: true, 
      message: `Teacher assigned to ${subject} successfully`,
      data: newAssignment 
    });
  } catch (error) {
    console.error('Assign teacher to subject error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Remove teacher from subject assignment
// @route   DELETE /api/admin/classes/subject-assign/:assignmentId
// @access  Private/Admin
exports.removeSubjectAssignment = async (req, res) => {
  try {
    const { assignmentId } = req.params;
    
    // Find all classes that have this assignment
    const classes = await Class.findAll({
      where: { schoolCode: req.user.schoolCode }
    });
    
    let found = false;
    let updatedClass = null;
    
    for (const classItem of classes) {
      const subjectTeachers = classItem.subjectTeachers || [];
      const newSubjectTeachers = subjectTeachers.filter(st => st.id !== assignmentId);
      
      if (newSubjectTeachers.length !== subjectTeachers.length) {
        await classItem.update({ subjectTeachers: newSubjectTeachers });
        found = true;
        updatedClass = classItem;
        break;
      }
    }
    
    if (!found) {
      return res.status(404).json({ success: false, message: 'Assignment not found' });
    }
    
    res.json({ 
      success: true, 
      message: 'Teacher removed from subject successfully' 
    });
  } catch (error) {
    console.error('Remove subject assignment error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// ============ ANALYTICS FUNCTIONS ============

// @desc    Get student grade statistics for charts
// @route   GET /api/admin/grades/stats
// @access  Private/Admin
exports.getStudentGrades = async (req, res) => {
  try {
    const { AcademicRecord, Student } = require('../models');
    
    const grades = await AcademicRecord.findAll({
      where: { schoolCode: req.user.schoolCode },
      include: [{ model: Student, attributes: ['grade'] }]
    });
    
    // Group by grade
    const gradeStats = {};
    grades.forEach(g => {
      const grade = g.Student?.grade || 'Unknown';
      if (!gradeStats[grade]) gradeStats[grade] = { count: 0, total: 0 };
      gradeStats[grade].count++;
      gradeStats[grade].total += g.score;
    });
    
    const result = Object.entries(gradeStats).map(([grade, stats]) => ({
      grade,
      average: stats.count ? Math.round(stats.total / stats.count) : 0,
      count: stats.count
    }));
    
    res.json({ success: true, data: result });
  } catch (error) {
    console.error('Get student grades error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Get attendance statistics for charts
// @route   GET /api/admin/attendance/stats
// @access  Private/Admin
exports.getAttendanceStats = async (req, res) => {
  try {
    const { Attendance, Student } = require('../models');
    
    const attendance = await Attendance.findAll({
      where: { schoolCode: req.user.schoolCode },
      include: [{ model: Student, attributes: ['grade'] }]
    });
    
    // Group by grade
    const attendanceStats = {};
    attendance.forEach(a => {
      const grade = a.Student?.grade || 'Unknown';
      if (!attendanceStats[grade]) attendanceStats[grade] = { present: 0, absent: 0, total: 0 };
      attendanceStats[grade].total++;
      if (a.status === 'present') attendanceStats[grade].present++;
      else if (a.status === 'absent') attendanceStats[grade].absent++;
    });
    
    const result = Object.entries(attendanceStats).map(([grade, stats]) => ({
      grade,
      rate: stats.total ? Math.round((stats.present / stats.total) * 100) : 0,
      present: stats.present,
      absent: stats.absent,
      total: stats.total
    }));
    
    res.json({ success: true, data: result });
  } catch (error) {
    console.error('Get attendance stats error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Update student
// @route   PUT /api/admin/students/:studentId
// @access  Private/Admin
exports.updateStudent = async (req, res) => {
  try {
    const { studentId } = req.params;
    const { name, email, phone, grade, status } = req.body;
    
    const student = await Student.findByPk(studentId, {
      include: [{ model: User }]
    });
    
    if (!student) {
      return res.status(404).json({ success: false, message: 'Student not found' });
    }
    
    // Update User
    if (name || email || phone) {
      await student.User.update({ name, email, phone });
    }
    
    // Update Student
    await student.update({ grade, status });
    
    res.json({ 
      success: true, 
      message: 'Student updated successfully',
      data: student 
    });
  } catch (error) {
    console.error('Update student error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Delete student
// @route   DELETE /api/admin/students/:studentId
// @access  Private/Admin
exports.deleteStudent = async (req, res) => {
  try {
    const { studentId } = req.params;
    
    const student = await Student.findByPk(studentId, {
      include: [{ model: User }]
    });
    
    if (!student) {
      return res.status(404).json({ success: false, message: 'Student not found' });
    }
    
    const userName = student.User.name;
    
    // Delete the student (cascade will handle User)
    await student.destroy();
    
    res.json({ 
      success: true, 
      message: `Student ${userName} deleted successfully` 
    });
  } catch (error) {
    console.error('Delete student error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Update teacher
// @route   PUT /api/admin/teachers/:teacherId
// @access  Private/Admin
exports.updateTeacher = async (req, res) => {
  try {
    const { teacherId } = req.params;
    const { name, email, phone, subjects, department, classTeacher, qualification } = req.body;
    
    const teacher = await Teacher.findByPk(teacherId, {
      include: [{ model: User }]
    });
    
    if (!teacher) {
      return res.status(404).json({ success: false, message: 'Teacher not found' });
    }
    
    // Update User
    if (name || email || phone) {
      await teacher.User.update({ name, email, phone });
    }
    
    // Update Teacher
    await teacher.update({ 
      subjects: subjects ? (Array.isArray(subjects) ? subjects : subjects.split(',').map(s => s.trim())) : teacher.subjects,
      department: department || teacher.department,
      classTeacher: classTeacher || teacher.classTeacher,
      qualification: qualification || teacher.qualification
    });
    
    res.json({ 
      success: true, 
      message: 'Teacher updated successfully',
      data: teacher 
    });
  } catch (error) {
    console.error('Update teacher error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Delete teacher
// @route   DELETE /api/admin/teachers/:teacherId
// @access  Private/Admin
exports.deleteTeacher = async (req, res) => {
  try {
    const { teacherId } = req.params;
    
    const teacher = await Teacher.findByPk(teacherId, {
      include: [{ model: User }]
    });
    
    if (!teacher) {
      return res.status(404).json({ success: false, message: 'Teacher not found' });
    }
    
    const userName = teacher.User.name;
    
    await teacher.destroy();
    
    res.json({ 
      success: true, 
      message: `Teacher ${userName} deleted successfully` 
    });
  } catch (error) {
    console.error('Delete teacher error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};
