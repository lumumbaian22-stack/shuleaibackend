const { Student, AcademicRecord, Attendance, School, Teacher, User } = require('../models');
const CurriculumAnalyticsEngine = require('../services/analytics/curriculumEngine');
const DutyAnalyticsEngine = require('../services/analytics/dutyAnalyticsEngine');
const AttendancePredictor = require('../services/analytics/attendancePredictor');
const BehaviorMonitor = require('../services/analytics/behaviorMonitor');
const DutyAutoBalancer = require('../services/scheduler/dutyAutoBalancer');
const moment = require('moment');
const { Op } = require('sequelize'); // Add this line - it was missing

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

    // FIXED: Changed from 'code' to 'schoolId'
    const school = await School.findOne({ where: { schoolId: student.User.schoolCode } });
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
    const { classId } = req.params;
    const { subject } = req.query;

    // FIXED: Changed from 'schoolCode' to 'schoolId'
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
    // FIXED: Changed from 'code' to 'schoolId'
    const school = await School.findOne({ where: { schoolId: req.user.schoolCode } });
    
    // FIXED: Changed from 'school.code' to 'school.schoolId'
    const students = await Student.findAll({ 
      include: [{ model: User, where: { schoolCode: school.schoolId } }] 
    });
    
    // FIXED: Changed from 'school.code' to 'school.schoolId'
    const teachers = await Teacher.findAll({ 
      include: [{ model: User, where: { schoolCode: school.schoolId } }] 
    });

    // FIXED: Changed from 'school.code' to 'school.schoolId'
    const records = await AcademicRecord.findAll({
      where: { schoolCode: school.schoolId },
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

    // FIXED: Changed from 'school.code' to 'school.schoolId'
    const attendanceCount = await Attendance.count({ 
      where: { schoolCode: school.schoolId } 
    });

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
          attendanceRecords: attendanceCount
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

// @desc    Get duty analytics and recommendations
// @route   GET /api/analytics/duty/overview
// @access  Private/Admin
exports.getDutyAnalytics = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    const start = startDate || moment().subtract(30, 'days').format('YYYY-MM-DD');
    const end = endDate || moment().format('YYYY-MM-DD');

    const engine = new DutyAnalyticsEngine(req.user.schoolCode);
    const analysis = await engine.analyzeCoverage(start, end);
    const recommendations = await engine.autoAdjustSchedules(
      moment().add(1, 'day').format('YYYY-MM-DD'),
      moment().add(7, 'days').format('YYYY-MM-DD')
    );

    res.json({
      success: true,
      data: {
        period: { start, end },
        analysis,
        recommendations
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Get department duty metrics
// @route   GET /api/analytics/duty/department/:deptId
// @access  Private/Admin
exports.getDepartmentMetrics = async (req, res) => {
  try {
    const { deptId } = req.params;
    const { period } = req.query;

    const engine = new DutyAnalyticsEngine(req.user.schoolCode);
    const metrics = await engine.getDepartmentMetrics(deptId, period || 'month');

    res.json({ success: true, data: metrics });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Predict attendance for a student
// @route   GET /api/analytics/attendance/predict/:studentId
// @access  Private
exports.predictAttendance = async (req, res) => {
  try {
    const { studentId } = req.params;
    const { date } = req.query;
    const targetDate = date || moment().add(1, 'day').format('YYYY-MM-DD');

    const predictor = new AttendancePredictor(req.user.schoolCode);
    const prediction = await predictor.predictStudentAttendance(studentId, targetDate);

    res.json({ success: true, data: prediction });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Get school-wide attendance prediction
// @route   GET /api/analytics/attendance/predict-school
// @access  Private/Admin
exports.predictSchoolAttendance = async (req, res) => {
  try {
    const { date } = req.query;
    const targetDate = date || moment().add(1, 'day').format('YYYY-MM-DD');

    const predictor = new AttendancePredictor(req.user.schoolCode);
    const predictions = await predictor.predictSchoolAttendance(targetDate);
    const atRisk = await predictor.identifyAtRiskStudents(7);

    res.json({
      success: true,
      data: {
        predictions,
        atRiskStudents: atRisk
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Get behavior monitoring results
// @route   GET /api/analytics/behavior/overview
// @access  Private/Admin
exports.getBehaviorOverview = async (req, res) => {
  try {
    const monitor = new BehaviorMonitor(req.user.schoolCode);
    
    // Run monitor on all active students
    const results = await monitor.monitorAllStudents();
    
    // Get summary for a specific student if requested
    let studentSummary = null;
    if (req.query.studentId) {
      studentSummary = await monitor.getStudentBehaviorSummary(req.query.studentId);
    }

    res.json({
      success: true,
      data: {
        overview: results,
        studentSummary
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Trigger manual behavior check for a student
// @route   POST /api/analytics/behavior/check-student
// @access  Private/Teacher/Admin
exports.checkStudentBehavior = async (req, res) => {
  try {
    const { studentId } = req.body;

    const monitor = new BehaviorMonitor(req.user.schoolCode);
    const alerts = await monitor.monitorStudent(studentId);

    res.json({
      success: true,
      message: `Generated ${alerts.length} alerts`,
      data: alerts
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
