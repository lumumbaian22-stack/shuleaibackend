const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middleware/auth');
const analyticsController = require('../controllers/analyticsController');
const { Op } = require('sequelize');
const { Student, User, Class, AcademicRecord, Attendance } = require('../models');

// All analytics routes require authentication
router.use(protect);

function averageScore(records) {
  if (!records.length) return 0;
  return Math.round(records.reduce((sum, record) => sum + Number(record.score || 0), 0) / records.length);
}

function gradeFromScore(score) {
  if (score >= 80) return 'A';
  if (score >= 70) return 'B';
  if (score >= 60) return 'C';
  if (score >= 50) return 'D';
  return 'E';
}

async function getClassAnalytics(req, res) {
  try {
    const { classId } = req.params;
    const schoolCode = req.user.schoolCode;

    const classItem = await Class.findOne({
      where: {
        id: classId,
        ...(schoolCode ? { schoolCode } : {})
      }
    });

    if (!classItem) {
      return res.status(404).json({ success: false, message: 'Class not found' });
    }

    // This codebase stores student grade, not a direct Student.classId, so class analytics uses class grade + schoolCode.
    const students = await Student.findAll({
      include: [{
        model: User,
        attributes: ['id', 'name', 'schoolCode'],
        where: { ...(schoolCode ? { schoolCode } : {}), role: 'student' }
      }],
      where: { grade: classItem.grade }
    });

    const studentIds = students.map(student => student.id);
    const records = studentIds.length
      ? await AcademicRecord.findAll({ where: { studentId: { [Op.in]: studentIds } } })
      : [];

    const attendance = studentIds.length
      ? await Attendance.findAll({ where: { studentId: { [Op.in]: studentIds } } })
      : [];

    const present = attendance.filter(item => item.status === 'present').length;
    const attendanceRate = attendance.length ? Math.round((present / attendance.length) * 100) : 0;

    const subjectMap = {};
    records.forEach(record => {
      const subject = record.subject || 'General';
      if (!subjectMap[subject]) subjectMap[subject] = [];
      subjectMap[subject].push(record);
    });

    const subjectAverages = Object.entries(subjectMap).map(([subject, subjectRecords]) => ({
      subject,
      average: averageScore(subjectRecords),
      grade: gradeFromScore(averageScore(subjectRecords)),
      assessments: subjectRecords.length
    }));

    const studentPerformance = students.map(student => {
      const studentRecords = records.filter(record => record.studentId === student.id);
      const average = averageScore(studentRecords);
      return {
        id: student.id,
        name: student.User?.name || `Student ${student.id}`,
        average,
        grade: gradeFromScore(average),
        assessments: studentRecords.length
      };
    }).sort((a, b) => b.average - a.average);

    const gradeDistribution = { A: 0, B: 0, C: 0, D: 0, E: 0 };
    studentPerformance.forEach(student => { gradeDistribution[student.grade] += 1; });

    return res.json({
      success: true,
      data: {
        class: {
          id: classItem.id,
          name: classItem.name,
          grade: classItem.grade,
          stream: classItem.stream,
          schoolCode: classItem.schoolCode
        },
        overview: {
          studentCount: students.length,
          assessmentCount: records.length,
          classAverage: averageScore(records),
          attendanceRate
        },
        subjectAverages,
        gradeDistribution: {
          labels: Object.keys(gradeDistribution),
          values: Object.values(gradeDistribution)
        },
        studentPerformance
      }
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
}

async function compareCurriculum(req, res) {
  try {
    const { studentId } = req.params;
    const schoolCode = req.user.schoolCode;

    const student = await Student.findByPk(studentId, {
      include: [{ model: User, attributes: ['id', 'name', 'schoolCode'] }]
    });

    if (!student) {
      return res.status(404).json({ success: false, message: 'Student not found' });
    }

    if (req.user.role !== 'super_admin' && schoolCode && student.User?.schoolCode !== schoolCode) {
      return res.status(403).json({ success: false, message: 'You cannot view analytics for this student' });
    }

    const records = await AcademicRecord.findAll({ where: { studentId: student.id } });
    const subjectMap = {};
    records.forEach(record => {
      const subject = record.subject || 'General';
      if (!subjectMap[subject]) subjectMap[subject] = [];
      subjectMap[subject].push(record);
    });

    const subjects = Object.entries(subjectMap).map(([subject, subjectRecords]) => ({
      subject,
      average: averageScore(subjectRecords),
      grade: gradeFromScore(averageScore(subjectRecords)),
      assessments: subjectRecords.length
    }));

    return res.json({
      success: true,
      data: {
        student: {
          id: student.id,
          name: student.User?.name || `Student ${student.id}`,
          grade: student.grade
        },
        overallAverage: averageScore(records),
        subjects,
        recommendations: subjects
          .filter(item => item.average < 60)
          .map(item => `Prioritize revision and practice tasks in ${item.subject}.`)
      }
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
}

const getSchoolAnalytics = analyticsController.getSchoolAnalytics || analyticsController.getAdminAnalytics;
const getStudentAnalytics = analyticsController.getStudentAnalytics;

// Student analytics (accessible by student, parent, teacher, admin)
router.get('/student/:studentId', getStudentAnalytics);

// Class analytics (teachers and above)
router.get('/class/:classId', authorize('teacher', 'admin', 'super_admin'), analyticsController.getClassAnalytics || getClassAnalytics);

// School analytics (admin and above)
router.get('/school', authorize('admin', 'super_admin'), getSchoolAnalytics);

// Curriculum comparison
router.get('/compare/:studentId', analyticsController.compareCurriculum || compareCurriculum);

module.exports = router;
