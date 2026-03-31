const { Op } = require('sequelize');
const { User, Teacher, Student, Parent, School, Alert, Class } = require('../models');
const { createAlert } = require('../services/notificationService');

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
      recentAlerts: await Alert.count({
        where: {
          role: 'admin',
          createdAt: { [Op.gte]: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) }
        }
      })
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
        attributes: ['id', 'name', 'email', 'phone', 'createdAt']
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

    const teacher = await Teacher.findByPk(parseInt(teacherId), { include: [{ model: User }] });
    if (!teacher) return res.status(404).json({ success: false, message: 'Teacher not found' });

    if (name || email || phone) await teacher.User.update({ name, email, phone });

    await teacher.update({
      subjects: subjects
        ? (Array.isArray(subjects) ? subjects : subjects.split(',').map(s => s.trim()))
        : teacher.subjects,
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
    const teacher = await Teacher.findByPk(parseInt(teacherId), { include: [{ model: User }] });
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
        attributes: ['id', 'name', 'email', 'phone', 'createdAt']
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
    const student = await Student.findByPk(parseInt(req.params.studentId), {
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

    const student = await Student.findByPk(parseInt(studentId), { include: [{ model: User }] });
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
    const student = await Student.findByPk(parseInt(studentId), { include: [{ model: User }] });
    if (!student) return res.status(404).json({ success: false, message: 'Student not found' });

    const userName = student.User.name;
    await student.destroy();

    res.json({ success: true, message: `Student ${userName} deleted successfully` });
  } catch (error) {
    console.error('Delete student error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// ============ CLASS MANAGEMENT ============
exports.assignTeacherToClass = async (req, res) => {
  try {
    const { id } = req.params;
    const { teacherId } = req.body;

    const classItem = await Class.findOne({
      where: { id: parseInt(id), schoolCode: req.user.schoolCode }
    });

    if (!classItem) return res.status(404).json({ success: false, message: 'Class not found' });

    const teacher = await Teacher.findOne({
      where: { id: parseInt(teacherId) },
      include: [{ model: User, where: { schoolCode: req.user.schoolCode } }]
    });

    if (!teacher) return res.status(404).json({ success: false, message: 'Teacher not found' });

    await classItem.update({ teacherId });
    await teacher.update({ classTeacher: classItem.name });

    res.json({ success: true, message: `Teacher assigned to ${classItem.name}`, data: classItem });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// ============ SUBJECT ASSIGNMENT (FIXED) ============
exports.assignTeacherToSubject = async (req, res) => {
  try {
    const { classId, teacherId, subject, isClassTeacher = false } = req.body;

    if (!classId || !teacherId || !subject) {
      return res.status(400).json({
        success: false,
        message: 'Class ID, Teacher ID, and Subject are required'
      });
    }

    const classItem = await Class.findOne({
      where: { id: parseInt(classId), schoolCode: req.user.schoolCode }
    });

    if (!classItem) {
      return res.status(404).json({ success: false, message: 'Class not found' });
    }

    const teacher = await Teacher.findOne({
      where: { id: parseInt(teacherId) },
      include: [{ model: User, attributes: ['name'] }]
    });

    const teacherName = teacher?.User?.name || 'Unknown Teacher';

    let existing = classItem.subjectTeachers;
    if (!Array.isArray(existing)) existing = [];

    // prevent duplicates
    const exists = existing.some(
      t => t.subject === subject && t.teacherId === parseInt(teacherId)
    );

    if (exists) {
      return res.status(400).json({
        success: false,
        message: 'Teacher already assigned to this subject'
      });
    }

    const newAssignment = {
      id: Date.now().toString(),
      teacherId: parseInt(teacherId),
      teacherName,
      subject,
      assignedAt: new Date().toISOString(),
      assignedBy: req.user.id,
      isClassTeacher
    };

    existing.push(newAssignment);

    const { sequelize } = require('../models');

    const query = `
      UPDATE "Classes" 
      SET "subjectTeachers" = ?::jsonb 
      WHERE id = ? AND "schoolCode" = ?
    `;

    await sequelize.query(query, {
      replacements: [
        JSON.stringify(existing),
        parseInt(classId),
        req.user.schoolCode
      ],
      type: sequelize.QueryTypes.UPDATE
    });

    res.json({
      success: true,
      message: `Teacher assigned to ${subject} successfully`,
      data: newAssignment
    });

  } catch (error) {
    console.error('ASSIGNMENT ERROR:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.getClassSubjectAssignments = async (req, res) => {
  try {
    const classItem = await Class.findOne({
      where: { id: parseInt(req.params.classId), schoolCode: req.user.schoolCode }
    });

    if (!classItem) {
      return res.status(404).json({ success: false, message: 'Class not found' });
    }

    res.json({ success: true, data: classItem.subjectTeachers || [] });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.removeTeacherFromClass = async (req, res) => {
  try {
    const classItem = await Class.findOne({
      where: { id: parseInt(req.params.id), schoolCode: req.user.schoolCode }
    });

    if (!classItem) {
      return res.status(404).json({ success: false, message: 'Class not found' });
    }

    await classItem.update({ teacherId: null });

    res.json({ success: true, message: 'Teacher removed from class' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
