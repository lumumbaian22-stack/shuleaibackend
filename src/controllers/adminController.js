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

  return [];
}

// ============ HELPER: SAFE SAVE ============
function formatSubjectTeachers(data, model) {
  const type = model.rawAttributes.subjectTeachers?.type?.key;

  // If DB column is JSON → store directly
  if (type === 'JSON') return data;

  // Otherwise stringify (TEXT column)
  return JSON.stringify(data);
}


// ============ SUBJECT ASSIGNMENT ============

exports.getClassSubjectAssignments = async (req, res) => {
  try {
    const { classId } = req.params;

    const classItem = await Class.findOne({
      where: { id: classId, schoolCode: req.user.schoolCode }
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


// ✅ FULLY FIXED FUNCTION
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

    // ✅ Find class safely
    const classItem = await Class.findOne({
      where: { id: parseInt(classId), schoolCode: req.user.schoolCode }
    });

    if (!classItem) {
      return res.status(404).json({ success: false, message: 'Class not found' });
    }

    // ✅ Get teacher safely
    const teacher = await Teacher.findOne({
      where: { id: teacherId },
      include: [{ model: User, attributes: ['name'] }]
    });

    if (!teacher) {
      return res.status(404).json({ success: false, message: 'Teacher not found' });
    }

    const teacherName = teacher.User?.name || 'Unknown Teacher';

    // ✅ FIXED: Safe parsing
    let subjectTeachers = parseSubjectTeachers(classItem.subjectTeachers);

    // ✅ Check existing subject
    const existingIndex = subjectTeachers.findIndex(st => st.subject === subject);

    const newAssignment = {
      id: Date.now().toString(),
      teacherId: parseInt(teacherId),
      teacherName,
      subject,
      assignedAt: new Date().toISOString(),
      assignedBy: req.user.id,
      isClassTeacher
    };

    if (existingIndex >= 0) {
      subjectTeachers[existingIndex] = {
        ...subjectTeachers[existingIndex],
        ...newAssignment
      };
    } else {
      subjectTeachers.push(newAssignment);
    }

    // ✅ FIXED: Safe save
    await classItem.update({
      subjectTeachers: formatSubjectTeachers(subjectTeachers, Class)
    });

    // ✅ Verify correct class (FIXED schoolCode issue)
    const reloaded = await Class.findOne({
      where: { id: classId, schoolCode: req.user.schoolCode }
    });

    console.log('✅ VERIFIED SAVE:', reloaded.subjectTeachers);

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


// ============ REMOVE SUBJECT ASSIGNMENT ============

exports.removeSubjectAssignment = async (req, res) => {
  try {
    const { assignmentId } = req.params;

    const classes = await Class.findAll({
      where: { schoolCode: req.user.schoolCode }
    });

    let found = false;

    for (const classItem of classes) {
      let subjectTeachers = parseSubjectTeachers(classItem.subjectTeachers);

      const newSubjectTeachers = subjectTeachers.filter(
        st => st.id !== assignmentId
      );

      if (newSubjectTeachers.length !== subjectTeachers.length) {
        await classItem.update({
          subjectTeachers: formatSubjectTeachers(newSubjectTeachers, Class)
        });
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
