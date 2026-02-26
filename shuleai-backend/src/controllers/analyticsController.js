const { Student, AcademicRecord, Attendance, School, Teacher } = require('../models');
const CurriculumAnalyticsEngine = require('../services/analytics/curriculumEngine');
const moment = require('moment');

// Helper to get date range
const getDateRange = (period) => {
  const now = new Date();
  let start;
  if (period === 'week') start = moment(now).subtract(7, 'days').toDate();
  else if (period === 'month') start = moment(now).subtract(30, 'days').toDate();
  else if (period === 'term') start = moment(now).subtract(3, 'months').toDate();
  else if (period === 'year') start = moment(now).subtract(1, 'year').toDate();
  else return {};
  return { date: { [Op.gte]: start } };
};

// @desc    Get student analytics
// @route   GET /api/analytics/student/:studentId
// @access  Private (Student, Parent, Teacher, Admin)
exports.getStudentAnalytics = async (req, res) => {
  try {
    const { studentId } = req.params;
    const { curriculum, period = 'term' } = req.query;

    const student = await Student.findByPk(studentId, { include: [{ model: User }] });
    if (!student) return res.status(404).json({ success: false, message: 'Student not found' });

    const school = await School.findOne({ where: { code: student.User.schoolCode } });
    const system = curriculum || school?.system || '844';
    const engine = new CurriculumAnalyticsEngine(system);

    const records = await AcademicRecord.findAll({
      where: { studentId, ...getDateRange(period) },
      order: [['date', 'DESC']]
    });

    const attendance = await Attendance.findAll({
      where: { studentId, ...getDateRange(period) }
    });

    // Build performance metrics
    const subjects = {};
    records.forEach(r => {
      if (!subjects[r.subject]) subjects[r.subject] = [];
      subjects[r.subject].push(r.score);
    });

    const subjectAverages = Object.entries(subjects).map(([subject, scores]) => ({
      subject,
      average: scores.reduce((a,b) => a+b, 0) / scores.length,
      count: scores.length
    }));

    const overallAvg = records.length ? records.reduce((s,r) => s + r.score, 0) / records.length : 0;

    const predictions = engine.generatePredictions(records.map(r => r.score));

    res.json({
      success: true,
      data: {
        student: student.User.getPublicProfile(),
        system,
        overallAverage: overallAvg,
        grade: engine.calculateGrade(overallAvg).grade,
        subjectAverages,
        records: records.slice(0, 10),
        attendance: {
          rate: attendance.length ? (attendance.filter(a => a.status === 'present').length / attendance.length) * 100 : 0,
          total: attendance.length,
          present: attendance.filter(a => a.status === 'present').length,
          absent: attendance.filter(a => a.status === 'absent').length,
          late: attendance.filter(a => a.status === 'late').length
        },
        predictions
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Get class analytics
// @route   GET /api/analytics/class/:classId
// @access  Private/Teacher/Admin
exports.getClassAnalytics = async (req, res) => {
  try {
    const { classId } = req.params; // classId could be grade name
    const { subject } = req.query;

    const students = await Student.findAll({
      where: { grade: classId },
      include: [{ model: User, where: { schoolCode: req.user.schoolCode } }]
    });

    const studentIds = students.map(s => s.id);
    const records = await AcademicRecord.findAll({
      where: { studentId: studentIds, ...(subject && { subject }) }
    });

    // Aggregate by student
    const studentStats = students.map(s => {
      const studentRecords = records.filter(r => r.studentId === s.id);
      const avg = studentRecords.length ? studentRecords.reduce((a,b) => a + b.score, 0) / studentRecords.length : 0;
      return { name: s.User.name, average: avg };
    });

    const overallAvg = studentStats.reduce((a,b) => a + b.average, 0) / studentStats.length || 0;

    res.json({
      success: true,
      data: {
        class: classId,
        studentCount: students.length,
        overallAverage: overallAvg,
        studentStats: studentStats.sort((a,b) => b.average - a.average)
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Get school analytics
// @route   GET /api/analytics/school
// @access  Private/Admin
exports.getSchoolAnalytics = async (req, res) => {
  try {
    const school = await School.findOne({ where: { code: req.user.schoolCode } });
    const students = await Student.findAll({ include: [{ model: User, where: { schoolCode: school.code } }] });
    const teachers = await Teacher.findAll({ include: [{ model: User, where: { schoolCode: school.code } }] });

    const records = await AcademicRecord.findAll({
      where: { schoolCode: school.code },
      include: [{ model: Student }]
    });

    // Aggregate by grade
    const gradeStats = {};
    students.forEach(s => {
      if (!gradeStats[s.grade]) gradeStats[s.grade] = { count: 0, totalScore: 0 };
      gradeStats[s.grade].count++;
    });

    records.forEach(r => {
      if (gradeStats[r.Student?.grade]) {
        gradeStats[r.Student.grade].totalScore += r.score;
      }
    });

    const gradeAverages = Object.entries(gradeStats).map(([grade, stat]) => ({
      grade,
      studentCount: stat.count,
      averageScore: stat.count ? stat.totalScore / stat.count : 0
    }));

    const overallAvg = records.length ? records.reduce((a,b) => a + b.score, 0) / records.length : 0;

    res.json({
      success: true,
      data: {
        school: school.name,
        totalStudents: students.length,
        totalTeachers: teachers.length,
        overallAverage: overallAvg,
        gradeAverages,
        recentActivity: {
          academicRecords: records.length,
          attendanceRecords: await Attendance.count({ where: { schoolCode: school.code } })
        }
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Compare curricula for a student
// @route   GET /api/analytics/compare/:studentId
// @access  Private
exports.compareCurriculum = async (req, res) => {
  try {
    const { studentId } = req.params;
    const student = await Student.findByPk(studentId, { include: [{ model: User }] });
    if (!student) return res.status(404).json({ success: false, message: 'Student not found' });

    const records = await AcademicRecord.findAll({ where: { studentId } });
    const scores = records.map(r => r.score);
    const avg = scores.length ? scores.reduce((a,b) => a+b, 0) / scores.length : 0;

    const comparisons = {};
    const systems = ['844', 'cbc', 'british', 'american'];
    systems.forEach(sys => {
      const engine = new CurriculumAnalyticsEngine(sys);
      comparisons[sys] = {
        system: sys,
        grade: engine.calculateGrade(avg).grade,
        points: engine.calculateGrade(avg).points || null
      };
    });

    res.json({ success: true, data: comparisons });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};