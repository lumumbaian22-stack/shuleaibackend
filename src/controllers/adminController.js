const { Op } = require('sequelize');
const { User, Teacher, Student, Parent, School, Alert, Class } = require('../models');
const { createAlert } = require('../services/notificationService');

// Helper for curriculum names
const getCurriculumName = (curriculum) => {
  const names = { cbc: 'CBC', '844': '8-4-4', british: 'British', american: 'American' };
  return names[curriculum] || curriculum;
};

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
    const {
      name, email, phone, subjects, department, classTeacher, qualification,
      employeeId, specialization, approvalStatus, classId, dateJoined,
      gender, dateOfBirth, location, notes, tscNumber, roles
    } = req.body;
    
    const teacher = await Teacher.findByPk(teacherId, { include: [{ model: User }] });
    if (!teacher) return res.status(404).json({ success: false, message: 'Teacher not found' });
    
    if (name || email || phone) await teacher.User.update({ name, email, phone });
    
    const teacherFields = {
      subjects: subjects ? (Array.isArray(subjects) ? subjects : String(subjects).split(',').map(s => s.trim()).filter(Boolean)) : teacher.subjects,
      department: department !== undefined ? department : teacher.department,
      classTeacher: classTeacher !== undefined ? classTeacher : teacher.classTeacher,
      qualification: qualification !== undefined ? qualification : teacher.qualification,
      specialization: specialization !== undefined ? specialization : teacher.specialization,
      approvalStatus: approvalStatus !== undefined ? approvalStatus : teacher.approvalStatus,
      classId: classId !== undefined && classId !== '' ? classId : teacher.classId,
      dateJoined: dateJoined !== undefined && dateJoined !== '' ? dateJoined : teacher.dateJoined
    };
    if (employeeId !== undefined && employeeId !== '') teacherFields.employeeId = employeeId;
    const existingDuties = teacher.duties && typeof teacher.duties === 'object' ? teacher.duties : {};
    teacherFields.duties = {
      ...(Array.isArray(existingDuties) ? { list: existingDuties } : existingDuties),
      profile: {
        gender: gender || existingDuties?.profile?.gender || null,
        dateOfBirth: dateOfBirth || existingDuties?.profile?.dateOfBirth || null,
        location: location || existingDuties?.profile?.location || null,
        notes: notes || existingDuties?.profile?.notes || null,
        tscNumber: tscNumber || existingDuties?.profile?.tscNumber || null,
        roles: roles || existingDuties?.profile?.roles || []
      }
    };
    await teacher.update(teacherFields);
    
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
    const {
      name, email, phone, grade, status, isPrefect,
      assessmentNumber, nemisNumber, location,
      parentName, parentEmail, parentPhone, parentRelationship,
      dateOfBirth, gender, academicStatus, house, transport, stream,
      medicalNotes, disciplineNotes, clubs, schoolType
    } = req.body;

    const student = await Student.findByPk(studentId, { include: [{ model: User }] });
    if (!student) return res.status(404).json({ success: false, message: 'Student not found' });

    // Update User fields – only if provided
    if (name !== undefined || email !== undefined || phone !== undefined) {
      const userFields = {};
      if (name !== undefined) userFields.name = name;
      if (email !== undefined) userFields.email = email?.trim() || null;   // empty string → null
      if (phone !== undefined) userFields.phone = phone?.trim() || null;
      await student.User.update(userFields);
    }

    // Update Student fields
    const studentFields = {};
    if (grade !== undefined) studentFields.grade = grade;
    if (status !== undefined) studentFields.status = status;
    if (isPrefect !== undefined) studentFields.isPrefect = isPrefect;
    if (assessmentNumber !== undefined) studentFields.assessmentNumber = assessmentNumber;
    if (nemisNumber !== undefined) studentFields.nemisNumber = nemisNumber;
    if (location !== undefined) studentFields.location = location;
    if (parentName !== undefined) studentFields.parentName = parentName;
    if (parentEmail !== undefined) studentFields.parentEmail = parentEmail;
    if (parentPhone !== undefined) studentFields.parentPhone = parentPhone;
    if (parentRelationship !== undefined) studentFields.parentRelationship = parentRelationship;
    if (dateOfBirth !== undefined && dateOfBirth !== '') studentFields.dateOfBirth = dateOfBirth;
    if (gender !== undefined && gender !== '') studentFields.gender = gender;
    if (academicStatus !== undefined && academicStatus !== '') studentFields.academicStatus = academicStatus;
    const existingPreferences = student.preferences && typeof student.preferences === 'object' ? student.preferences : {};
    studentFields.preferences = {
      ...existingPreferences,
      schoolType: schoolType || existingPreferences.schoolType || null,
      house: house || existingPreferences.house || null,
      transport: transport || existingPreferences.transport || null,
      stream: stream || existingPreferences.stream || null,
      medicalNotes: medicalNotes || existingPreferences.medicalNotes || null,
      disciplineNotes: disciplineNotes || existingPreferences.disciplineNotes || null,
      clubs: Array.isArray(clubs) ? clubs : (clubs ? String(clubs).split(',').map(c => c.trim()).filter(Boolean) : existingPreferences.clubs || [])
    };

    if (Object.keys(studentFields).length > 0) {
      await student.update(studentFields);
    }

    await student.reload({ include: [{ model: User }] });
    res.json({ success: true, message: 'Student updated successfully', data: student });
  } catch (error) {
    console.error('Update student error:', error);
    const statusCode = error.name === 'SequelizeValidationError' ? 400 : 500;
    const message = error.name === 'SequelizeValidationError'
      ? error.errors?.map(e => e.message).join(', ') || 'Validation failed'
      : error.message;
    res.status(statusCode).json({ success: false, message });
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
    if (!school) return res.status(404).json({ success: false, message: 'School not found' });
    
    // Add curriculum alias for frontend compatibility
    const schoolData = school.toJSON();
    schoolData.curriculum = school.system;
    
    res.json({ success: true, data: schoolData });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.updateSchoolSettings = async (req, res) => {
  try {
    const school = await School.findOne({ where: { schoolId: req.user.schoolCode } });
    if (!school) return res.status(404).json({ success: false, message: 'School not found' });

    // Update curriculum and broadcast change
    const oldCurriculum = school.system;
    if (req.body.curriculum && req.body.curriculum !== oldCurriculum) {
      school.system = req.body.curriculum;
      if (global.io) {
        global.io.to(`school-${school.schoolId}`).emit('curriculum-updated', {
          curriculum: school.system,
          curriculumName: getCurriculumName(school.system),
          timestamp: new Date()
        });
      }
    }

    school.settings = { ...school.settings, ...req.body, customSubjects: req.body.customSubjects || [] };
    if (req.body.schoolName) school.name = req.body.schoolName;
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
    res.json({ success: true, data: classes });
  } catch (error) {
    console.error('Get classes error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};


exports.getClassDetails = async (req, res) => {
  try {
    const { id } = req.params;
    const classItem = await Class.findOne({
      where: { id, schoolCode: req.user.schoolCode, isActive: true },
      include: [{ model: Teacher, include: [{ model: User, attributes: ['id', 'name', 'email'] }] }]
    });

    if (!classItem) {
      return res.status(404).json({ success: false, message: 'Class not found' });
    }

    res.json({ success: true, data: classItem });
  } catch (error) {
    console.error('Get class details error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};


exports.createClass = async (req, res) => {
  try {
    const { name, grade, stream, teacherId } = req.body;
    const newClass = await Class.create({
      name, grade, stream,
      schoolCode: req.user.schoolCode,
      teacherId: teacherId || null
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
      include: [
        { model: User, where: { schoolCode: req.user.schoolCode }, attributes: ['id', 'name', 'email'] },
        { model: Class, attributes: ['id', 'name'] } // include assigned class
      ]
    });
    res.json({ success: true, data: teachers });
  } catch (error) {
    console.error('Get available teachers error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// In adminController.js
// Replace the existing assignTeacherToClass with:
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

    // Remove previous class teacher
    if (classItem.teacherId) {
      const oldTeacher = await Teacher.findByPk(classItem.teacherId);
      if (oldTeacher) {
        oldTeacher.classId = null;
        oldTeacher.classTeacher = null;
        await oldTeacher.save();
      }
    }
    // If teacher was already class teacher of another class, remove that
    if (teacher.classId && teacher.classId !== classItem.id) {
      const oldClass = await Class.findByPk(teacher.classId);
      if (oldClass) {
        oldClass.teacherId = null;
        await oldClass.save();
      }
    }
    await classItem.update({ teacherId: teacher.id });
    await teacher.update({ classId: classItem.id, classTeacher: classItem.name });
    res.json({ success: true, message: `Teacher assigned to ${classItem.name} successfully` });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// Add batch subject assignment
exports.batchAssignSubjects = async (req, res) => {
  try {
    const { classId, assignments } = req.body; // assignments: [{ teacherId, subject }]
    const classItem = await Class.findOne({ where: { id: classId, schoolCode: req.user.schoolCode } });
    if (!classItem) return res.status(404).json({ success: false, message: 'Class not found' });
    let subjectTeachers = classItem.subjectTeachers || [];
    for (const ass of assignments) {
      const teacher = await Teacher.findByPk(ass.teacherId);
      if (!teacher) continue;
      const teacherName = teacher.User?.name || 'Unknown';
      // Remove existing assignment for this subject
      subjectTeachers = subjectTeachers.filter(st => st.subject !== ass.subject);
      subjectTeachers.push({
        id: Date.now().toString() + Math.random(),
        teacherId: ass.teacherId,
        teacherName,
        subject: ass.subject,
        assignedAt: new Date(),
        assignedBy: req.user.id
      });
    }
    await classItem.update({ subjectTeachers });
    res.json({ success: true, message: 'Subjects assigned successfully' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.removeTeacherFromClass = async (req, res) => {
  try {
    const { id } = req.params;
    const classItem = await Class.findOne({ where: { id, schoolCode: req.user.schoolCode } });
    if (!classItem) return res.status(404).json({ success: false, message: 'Class not found' });
    const teacherId = classItem.teacherId;
    if (teacherId) {
      const teacher = await Teacher.findByPk(teacherId);
      if (teacher) {
        teacher.classId = null;
        teacher.classTeacher = null;
        await teacher.save();
      }
      // Remove this teacher from all subjectTeachers arrays in this school
      const allClasses = await Class.findAll({ where: { schoolCode: req.user.schoolCode } });
      for (const cls of allClasses) {
        if (cls.subjectTeachers && cls.subjectTeachers.some(st => st.teacherId === teacherId)) {
          const newSubjectTeachers = cls.subjectTeachers.filter(st => st.teacherId !== teacherId);
          await cls.update({ subjectTeachers: newSubjectTeachers });
        }
      }
    }
    await classItem.update({ teacherId: null });
    res.json({ success: true, message: `Teacher removed from ${classItem.name}` });
  } catch (error) {
    console.error('Remove teacher from class error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// ============ SUBJECT ASSIGNMENT ============
exports.assignTeacherToSubject = async (req, res) => {
  try {
    const { classId, teacherId, subject, isClassTeacher = false } = req.body;

    if (!classId || !teacherId || !subject) {
      return res.status(400).json({ success: false, message: 'Class ID, Teacher ID, and Subject are required' });
    }

    const classItem = await Class.findOne({
      where: { id: parseInt(classId), schoolCode: req.user.schoolCode }
    });
    if (!classItem) return res.status(404).json({ success: false, message: 'Class not found' });

    const teacher = await Teacher.findOne({
      where: { id: parseInt(teacherId) },
      include: [{ model: User, attributes: ['name'] }]
    });
    const teacherName = teacher?.User?.name || 'Unknown Teacher';

    let existing = classItem.subjectTeachers || [];
    const alreadyExists = existing.some(t => t.subject === subject && t.teacherId === parseInt(teacherId));
    if (alreadyExists) {
      return res.status(400).json({ success: false, message: 'Teacher already assigned to this subject' });
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
    await classItem.update({ subjectTeachers: existing });

    res.json({ success: true, message: `Teacher assigned to ${subject} successfully`, data: newAssignment });
  } catch (error) {
    console.error('ASSIGNMENT ERROR:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.removeSubjectAssignment = async (req, res) => {
  try {
    const { assignmentId } = req.params;
    const classes = await Class.findAll({ where: { schoolCode: req.user.schoolCode } });
    
    let found = false;
    for (const classItem of classes) {
      const subjectTeachers = classItem.subjectTeachers || [];
      const newSubjectTeachers = subjectTeachers.filter(st => st.id !== assignmentId);
      if (newSubjectTeachers.length !== subjectTeachers.length) {
        await classItem.update({ subjectTeachers: newSubjectTeachers });
        found = true;
        break;
      }
    }
    
    if (!found) return res.status(404).json({ success: false, message: 'Assignment not found' });
    res.json({ success: true, message: 'Teacher removed from subject successfully' });
  } catch (error) {
    console.error('Remove subject assignment error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.getClassSubjectAssignments = async (req, res) => {
  try {
    const { classId } = req.params;
    const classItem = await Class.findOne({ where: { id: parseInt(classId), schoolCode: req.user.schoolCode } });
    if (!classItem) return res.status(404).json({ success: false, message: 'Class not found' });
    res.json({ success: true, data: classItem.subjectTeachers || [] });
  } catch (error) {
    console.error('Get subject assignments error:', error);
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

exports.batchAssignSubjects = async (req, res) => {
  try {
    const { classId, assignments } = req.body; // assignments: [{ teacherId, subject }]
    const classItem = await Class.findOne({ where: { id: classId, schoolCode: req.user.schoolCode } });
    if (!classItem) return res.status(404).json({ success: false, message: 'Class not found' });
    let subjectTeachers = classItem.subjectTeachers || [];
    for (const ass of assignments) {
      const teacher = await Teacher.findByPk(ass.teacherId);
      if (!teacher) continue;
      const teacherName = teacher.User?.name || 'Unknown';
      // Remove existing assignment for this subject (if any)
      subjectTeachers = subjectTeachers.filter(st => st.subject !== ass.subject);
      // Add new
      subjectTeachers.push({
        id: Date.now().toString() + Math.random(),
        teacherId: ass.teacherId,
        teacherName,
        subject: ass.subject,
        assignedAt: new Date(),
        assignedBy: req.user.id
      });
    }
    await classItem.update({ subjectTeachers });
    res.json({ success: true, message: 'Subjects assigned successfully' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ============ V3 OVERRIDES: class teacher, subject teacher, extended student fields ============
async function v3SchoolTeacher(teacherId, schoolCode) {
  return Teacher.findOne({ where: { id: parseInt(teacherId,10) }, include: [{ model: User, where: { schoolCode }, attributes: ['id','name','email','phone'] }] });
}
async function v3Class(classId, schoolCode) { return Class.findOne({ where: { id: parseInt(classId,10), schoolCode, isActive: true } }); }
async function v3SaveSubjectAssignment({ classItem, teacher, subject, isClassTeacher, adminId }) {
  let list = Array.isArray(classItem.subjectTeachers) ? classItem.subjectTeachers : [];
  list = list.filter(a => String(a.subject).toLowerCase() !== String(subject).toLowerCase());
  const row = { id: `${classItem.id}-${teacher.id}-${String(subject).toLowerCase().replace(/\s+/g,'-')}`, teacherId: teacher.id, teacherName: teacher.User?.name || 'Unknown', subject, isClassTeacher: !!isClassTeacher, assignedAt: new Date().toISOString(), assignedBy: adminId };
  list.push(row);
  await classItem.update({ subjectTeachers: list });
  if (typeof TeacherSubjectAssignment !== 'undefined') {
    await TeacherSubjectAssignment.destroy({ where: { classId: classItem.id, subject } }).catch(() => null);
    await TeacherSubjectAssignment.create({ teacherId: teacher.id, classId: classItem.id, subject, isClassTeacher: !!isClassTeacher, academicYear: classItem.academicYear || String(new Date().getFullYear()) }).catch(() => null);
  }
  await teacher.update({ subjects: Array.from(new Set([...(teacher.subjects || []), subject])) });
  return row;
}
exports.assignTeacherToClass = async (req, res) => {
  try {
    const classItem = await v3Class(req.params.id, req.user.schoolCode); if (!classItem) return res.status(404).json({ success:false, message:'Class not found' });
    const teacher = await v3SchoolTeacher(req.body.teacherId, req.user.schoolCode); if (!teacher) return res.status(404).json({ success:false, message:'Teacher not found in this school' });
    if (classItem.teacherId && Number(classItem.teacherId) !== Number(teacher.id)) { const old = await Teacher.findByPk(classItem.teacherId); if (old) await old.update({ classId:null, classTeacher:null }); }
    const previous = await Class.findOne({ where: { teacherId: teacher.id, schoolCode: req.user.schoolCode, isActive: true } });
    if (previous && previous.id !== classItem.id) await previous.update({ teacherId: null });
    await classItem.update({ teacherId: teacher.id });
    await teacher.update({ classId: classItem.id, classTeacher: classItem.name });
    res.json({ success:true, message:`${teacher.User.name} is now class teacher for ${classItem.name}`, data:{ class:classItem, teacher } });
  } catch(error) { console.error('V3 assign class teacher error:', error); res.status(500).json({ success:false, message:error.message }); }
};
exports.assignTeacherToSubject = async (req, res) => {
  try {
    const { classId, teacherId, subject, isClassTeacher=false } = req.body;
    if (!classId || !teacherId || !subject) return res.status(400).json({ success:false, message:'classId, teacherId and subject are required' });
    const classItem = await v3Class(classId, req.user.schoolCode); if (!classItem) return res.status(404).json({ success:false, message:'Class not found' });
    const teacher = await v3SchoolTeacher(teacherId, req.user.schoolCode); if (!teacher) return res.status(404).json({ success:false, message:'Teacher not found in this school' });
    const row = await v3SaveSubjectAssignment({ classItem, teacher, subject, isClassTeacher, adminId:req.user.id });
    if (isClassTeacher) { await classItem.update({ teacherId: teacher.id }); await teacher.update({ classId: classItem.id, classTeacher: classItem.name }); }
    res.json({ success:true, message:`${teacher.User.name} assigned to ${subject} in ${classItem.name}`, data:row });
  } catch(error) { console.error('V3 assign subject error:', error); res.status(500).json({ success:false, message:error.message }); }
};
exports.batchAssignSubjects = async (req, res) => {
  try {
    const classItem = await v3Class(req.body.classId, req.user.schoolCode); if (!classItem) return res.status(404).json({ success:false, message:'Class not found' });
    const saved=[];
    for (const item of (req.body.assignments || [])) { if (!item.teacherId || !item.subject) continue; const teacher = await v3SchoolTeacher(item.teacherId, req.user.schoolCode); if (!teacher) continue; saved.push(await v3SaveSubjectAssignment({ classItem, teacher, subject:item.subject, isClassTeacher:item.isClassTeacher, adminId:req.user.id })); if (item.isClassTeacher) { await classItem.update({ teacherId: teacher.id }); await teacher.update({ classId: classItem.id, classTeacher: classItem.name }); } }
    res.json({ success:true, message:`${saved.length} assignment(s) saved`, data:saved });
  } catch(error) { console.error('V3 batch subject error:', error); res.status(500).json({ success:false, message:error.message }); }
};
exports.updateStudent = async (req, res) => {
  try {
    const student = await Student.findByPk(req.params.studentId, { include: [{ model: User }] });
    if (!student) return res.status(404).json({ success:false, message:'Student not found' });
    if (student.User.schoolCode !== req.user.schoolCode) return res.status(403).json({ success:false, message:'Forbidden' });
    const userFields={}; ['name','email','phone'].forEach(k => { if (req.body[k] !== undefined) userFields[k] = req.body[k] || null; });
    if (Object.keys(userFields).length) await student.User.update(userFields);
    const allowed=['grade','status','isPrefect','assessmentNumber','nemisNumber','location','parentName','parentEmail','parentPhone','parentRelationship','dateOfBirth','gender'];
    const studentFields={}; allowed.forEach(k => { if (req.body[k] !== undefined) studentFields[k] = typeof req.body[k] === 'string' ? req.body[k].trim() : req.body[k]; });
    if (Object.keys(studentFields).length) await student.update(studentFields);
    await student.reload({ include: [{ model: User }] });
    res.json({ success:true, message:'Student updated successfully', data:student });
  } catch(error) { console.error('V3 update student error:', error); res.status(500).json({ success:false, message:error.message }); }
};
