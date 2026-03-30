const { Op } = require('sequelize');
const { User, Teacher, Student, Parent, School, Alert, Class } = require('../models');
const { createAlert } = require('../services/notificationService');

// ============ HELPER: SAFE JSON PARSE ============
function parseSubjectTeachers(data) {
  if (!data) return [];
  if (Array.isArray(data)) return data;
  
  if (typeof data === 'string') {
    try {
      return JSON.parse(data);
    } catch (e) {
      console.warn('⚠️ Failed to parse subjectTeachers:', data);
      return [];
    }
  }
  
  // If it's already an object
  if (data && typeof data === 'object') {
    return Array.isArray(data) ? data : [];
  }
  
  return [];
}

// ============ DASHBOARD ============
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

// ============ TEACHER MANAGEMENT ============
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

exports.updateTeacher = async (req, res) => {
  try {
    const { teacherId } = req.params;
    const { name, email, phone, subjects, department, classTeacher, qualification } = req.body;
    
    const teacher = await Teacher.findByPk(teacherId, { include: [{ model: User }] });
    if (!teacher) return res.status(404).json({ success: false, message: 'Teacher not found' });
    
    if (name || email || phone) await teacher.User.update({ name, email, phone });
    
    await teacher.update({ 
      subjects: subjects ? (Array.isArray(subjects) ? subjects : subjects.split(',').map(s => s.trim())) : teacher.subjects,
      department: department || teacher.department,
      classTeacher: classTeacher || teacher.classTeacher,
      qualification: qualification || teacher.qualification
    });
    
    res.json({ success: true, message: 'Teacher updated successfully', data: teacher });
  } catch (error) {
    console.error('Update teacher error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.deleteTeacher = async (req, res) => {
  try {
    const { teacherId } = req.params;
    const teacher = await Teacher.findByPk(teacherId, { include: [{ model: User }] });
    if (!teacher) return res.status(404).json({ success: false, message: 'Teacher not found' });
    
    const userName = teacher.User.name;
    await teacher.destroy();
    res.json({ success: true, message: `Teacher ${userName} deleted successfully` });
  } catch (error) {
    console.error('Delete teacher error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// ============ STUDENT MANAGEMENT ============
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

exports.getStudentDetails = async (req, res) => {
  try {
    const student = await Student.findByPk(req.params.studentId, {
      include: [{ model: User, attributes: ['id', 'name', 'email', 'phone', 'schoolCode'] }]
    });
    
    if (!student) return res.status(404).json({ success: false, message: 'Student not found' });
    if (student.User.schoolCode !== req.user.schoolCode) {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }
    
    const userData = { ...student.User.toJSON() };
    delete userData.schoolCode;
    
    res.json({ success: true, data: { ...student.toJSON(), User: userData } });
  } catch (error) {
    console.error('Get student details error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.updateStudent = async (req, res) => {
  try {
    const { studentId } = req.params;
    const { name, email, phone, grade, status } = req.body;
    
    const student = await Student.findByPk(studentId, { include: [{ model: User }] });
    if (!student) return res.status(404).json({ success: false, message: 'Student not found' });
    
    if (name || email || phone) await student.User.update({ name, email, phone });
    await student.update({ grade, status });
    
    res.json({ success: true, message: 'Student updated successfully', data: student });
  } catch (error) {
    console.error('Update student error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.deleteStudent = async (req, res) => {
  try {
    const { studentId } = req.params;
    const student = await Student.findByPk(studentId, { include: [{ model: User }] });
    if (!student) return res.status(404).json({ success: false, message: 'Student not found' });
    
    const userName = student.User.name;
    await student.destroy();
    res.json({ success: true, message: `Student ${userName} deleted successfully` });
  } catch (error) {
    console.error('Delete student error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.suspendStudent = async (req, res) => {
  try {
    const { studentId } = req.params;
    const { reason } = req.body;
    if (!reason) return res.status(400).json({ success: false, message: 'Suspension reason is required' });
    
    const student = await Student.findByPk(studentId, { include: [{ model: User }] });
    if (!student) return res.status(404).json({ success: false, message: 'Student not found' });
    
    student.status = 'suspended';
    student.User.isActive = false;
    await student.save();
    await student.User.save();
    
    const parents = await student.getParents({ include: [{ model: User }] });
    for (const parent of parents) {
      await createAlert({
        userId: parent.userId, role: 'parent', type: 'system', severity: 'critical',
        title: 'Student Suspension', message: `Student ${student.User.name} has been suspended. Reason: ${reason}`
      });
    }
    
    const teacher = await Teacher.findOne({ where: { classTeacher: student.grade }, include: [{ model: User }] });
    if (teacher) {
      await createAlert({
        userId: teacher.userId, role: 'teacher', type: 'system', severity: 'critical',
        title: 'Student Suspension', message: `Student ${student.User.name} has been suspended. Reason: ${reason}`
      });
    }
    
    res.json({ success: true, message: 'Student suspended successfully' });
  } catch (error) {
    console.error('Suspend student error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.reactivateStudent = async (req, res) => {
  try {
    const { studentId } = req.params;
    const student = await Student.findByPk(studentId, { include: [{ model: User }] });
    if (!student) return res.status(404).json({ success: false, message: 'Student not found' });
    
    student.status = 'active';
    student.User.isActive = true;
    await student.save();
    await student.User.save();
    
    res.json({ success: true, message: 'Student reactivated successfully' });
  } catch (error) {
    console.error('Reactivate student error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// ============ PARENT MANAGEMENT ============
exports.getAllParents = async (req, res) => {
  try {
    const parents = await Parent.findAll({
      include: [{ model: User, where: { schoolCode: req.user.schoolCode }, attributes: ['id','name','email','phone','createdAt'] }],
      order: [['createdAt', 'DESC']]
    });
    res.json({ success: true, data: parents });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ============ SCHOOL SETTINGS ============
exports.getSchoolSettings = async (req, res) => {
  try {
    const school = await School.findOne({ where: { schoolId: req.user.schoolCode } });
    res.json({ success: true, data: school });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.updateSchoolSettings = async (req, res) => {
  try {
    const school = await School.findOne({ where: { schoolId: req.user.schoolCode } });
    if (!school) return res.status(404).json({ success: false, message: 'School not found' });

    school.settings = { ...school.settings, ...req.body, customSubjects: req.body.customSubjects || [] };
    if (req.body.schoolName) school.name = req.body.schoolName;
    if (req.body.curriculum) school.system = req.body.curriculum;
    await school.save();

    res.json({ success: true, data: { ...school.toJSON(), customSubjects: school.settings.customSubjects } });
  } catch (error) {
    console.error('Update school settings error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// ============ CLASS MANAGEMENT ============
exports.getClasses = async (req, res) => {
  try {
    const classes = await Class.findAll({
      where: { schoolCode: req.user.schoolCode, isActive: true },
      include: [{ model: Teacher, include: [{ model: User, attributes: ['id', 'name', 'email'] }] }],
      order: [['grade', 'ASC'], ['name', 'ASC']]
    });
    
    // Ensure subjectTeachers is parsed
    const classesWithData = classes.map(cls => ({
      ...cls.toJSON(),
      subjectTeachers: parseSubjectTeachers(cls.subjectTeachers)
    }));
    
    res.json({ success: true, data: classesWithData });
  } catch (error) {
    console.error('Get classes error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.createClass = async (req, res) => {
  try {
    const { name, grade, stream, teacherId } = req.body;
    const newClass = await Class.create({
      name, grade, stream,
      schoolCode: req.user.schoolCode,
      teacherId: teacherId || null,
      subjectTeachers: []  // Initialize empty array
    });
    res.status(201).json({ success: true, data: newClass });
  } catch (error) {
    console.error('Create class error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.updateClass = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, grade, stream, teacherId } = req.body;
    
    const classItem = await Class.findOne({ where: { id, schoolCode: req.user.schoolCode } });
    if (!classItem) return res.status(404).json({ success: false, message: 'Class not found' });
    
    await classItem.update({ name, grade, stream, teacherId });
    res.json({ success: true, data: classItem });
  } catch (error) {
    console.error('Update class error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.deleteClass = async (req, res) => {
  try {
    const { id } = req.params;
    const classItem = await Class.findOne({ where: { id, schoolCode: req.user.schoolCode } });
    if (!classItem) return res.status(404).json({ success: false, message: 'Class not found' });
    
    await classItem.update({ isActive: false });
    res.json({ success: true, message: 'Class deleted successfully' });
  } catch (error) {
    console.error('Delete class error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.getAvailableTeachers = async (req, res) => {
  try {
    const teachers = await Teacher.findAll({
      where: { approvalStatus: 'approved' },
      include: [{ model: User, where: { schoolCode: req.user.schoolCode }, attributes: ['id', 'name', 'email'] }]
    });
    res.json({ success: true, data: teachers });
  } catch (error) {
    console.error('Get available teachers error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.assignTeacherToClass = async (req, res) => {
  try {
    const { id } = req.params;
    const { teacherId } = req.body;
    
    const classItem = await Class.findOne({ where: { id, schoolCode: req.user.schoolCode } });
    if (!classItem) return res.status(404).json({ success: false, message: 'Class not found' });
    
    const teacher = await Teacher.findOne({
      where: { id: teacherId },
      include: [{ model: User, where: { schoolCode: req.user.schoolCode } }]
    });
    if (!teacher) return res.status(404).json({ success: false, message: 'Teacher not found' });
    
    await classItem.update({ teacherId });
    await teacher.update({ classTeacher: classItem.name });
    
    res.json({ success: true, message: `Teacher assigned to ${classItem.name} successfully`, data: classItem });
  } catch (error) {
    console.error('Assign teacher error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// ============ SUBJECT ASSIGNMENT ============

exports.getClassSubjectAssignments = async (req, res) => {
  try {
    const { classId } = req.params;

    const classItem = await Class.findOne({
      where: { id: parseInt(classId), schoolCode: req.user.schoolCode }
    });

    if (!classItem) {
      return res.status(404).json({ success: false, message: 'Class not found' });
    }

    const subjectTeachers = parseSubjectTeachers(classItem.subjectTeachers);

    res.json({ success: true, data: subjectTeachers });
  } catch (error) {
    console.error('Get class subject assignments error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.assignTeacherToSubject = async (req, res) => {
  try {
    const { classId, teacherId, subject, isClassTeacher = false } = req.body;

    console.log('📝 Assigning teacher:', { classId, teacherId, subject });

    if (!classId || !teacherId || !subject) {
      return res.status(400).json({
        success: false,
        message: 'Class ID, Teacher ID, and Subject are required'
      });
    }

    // Find class
    const classItem = await Class.findOne({
      where: { id: parseInt(classId), schoolCode: req.user.schoolCode }
    });

    if (!classItem) {
      return res.status(404).json({ success: false, message: 'Class not found' });
    }

    // Get teacher
    const teacher = await Teacher.findOne({
      where: { id: parseInt(teacherId) },
      include: [{ model: User, attributes: ['name'] }]
    });

    if (!teacher) {
      return res.status(404).json({ success: false, message: 'Teacher not found' });
    }

    const teacherName = teacher.User?.name || 'Unknown Teacher';

    // Parse existing subjectTeachers
    let subjectTeachers = parseSubjectTeachers(classItem.subjectTeachers);
    console.log('Existing subjectTeachers:', subjectTeachers);

    // Create new assignment
    const newAssignment = {
      id: Date.now().toString(),
      teacherId: parseInt(teacherId),
      teacherName,
      subject,
      assignedAt: new Date().toISOString(),
      assignedBy: req.user.id,
      isClassTeacher: isClassTeacher
    };

    // Check if subject already exists
    const existingIndex = subjectTeachers.findIndex(st => st.subject === subject);

    if (existingIndex >= 0) {
      subjectTeachers[existingIndex] = { ...subjectTeachers[existingIndex], ...newAssignment };
      console.log('Updating existing assignment');
    } else {
      subjectTeachers.push(newAssignment);
      console.log('Adding new assignment');
    }

    console.log('Saving subjectTeachers:', subjectTeachers);

    // Save as JSON array (don't stringify)
    await classItem.update({ subjectTeachers: subjectTeachers });

    // Verify
    const reloaded = await Class.findOne({
      where: { id: parseInt(classId), schoolCode: req.user.schoolCode }
    });
    console.log('Verified saved data:', reloaded.subjectTeachers);

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

exports.removeSubjectAssignment = async (req, res) => {
  try {
    const { assignmentId } = req.params;

    const classes = await Class.findAll({
      where: { schoolCode: req.user.schoolCode }
    });

    let found = false;

    for (const classItem of classes) {
      let subjectTeachers = parseSubjectTeachers(classItem.subjectTeachers);

      const newSubjectTeachers = subjectTeachers.filter(st => st.id !== assignmentId);

      if (newSubjectTeachers.length !== subjectTeachers.length) {
        await classItem.update({ subjectTeachers: newSubjectTeachers });
        found = true;
        break;
      }
    }

    if (!found) {
      return res.status(404).json({
        success: false,
        message: 'Assignment not found'
      });
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

// ============ ANALYTICS ============
exports.getStudentGrades = async (req, res) => {
  try {
    const { AcademicRecord, Student } = require('../models');
    const grades = await AcademicRecord.findAll({
      where: { schoolCode: req.user.schoolCode },
      include: [{ model: Student, attributes: ['grade'] }]
    });
    
    const gradeStats = {};
    grades.forEach(g => {
      const grade = g.Student?.grade || 'Unknown';
      if (!gradeStats[grade]) gradeStats[grade] = { count: 0, total: 0 };
      gradeStats[grade].count++;
      gradeStats[grade].total += g.score;
    });
    
    const result = Object.entries(gradeStats).map(([grade, stats]) => ({
      grade, average: stats.count ? Math.round(stats.total / stats.count) : 0, count: stats.count
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
    
    const attendanceStats = {};
    attendance.forEach(a => {
      const grade = a.Student?.grade || 'Unknown';
      if (!attendanceStats[grade]) attendanceStats[grade] = { present: 0, absent: 0, total: 0 };
      attendanceStats[grade].total++;
      if (a.status === 'present') attendanceStats[grade].present++;
      else if (a.status === 'absent') attendanceStats[grade].absent++;
    });
    
    const result = Object.entries(attendanceStats).map(([grade, stats]) => ({
      grade, rate: stats.total ? Math.round((stats.present / stats.total) * 100) : 0,
      present: stats.present, absent: stats.absent, total: stats.total
    }));
    
    res.json({ success: true, data: result });
  } catch (error) {
    console.error('Get attendance stats error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};
