const { Teacher, Student, AcademicRecord, Attendance, User, Class } = require('../models');
const { createAlert } = require('../services/notificationService');
const { Op } = require('sequelize');
const csv = require('csv-parser');
const fs = require('fs');

// @desc    Get teacher's classes/students
// @route   GET /api/teacher/students
// @access  Private/Teacher
exports.getMyStudents = async (req, res) => {
  try {
    const teacher = await Teacher.findOne({ where: { userId: req.user.id } });
    if (!teacher) return res.status(404).json({ success: false, message: 'Teacher profile not found' });

    // Assuming teacher has a classTeacher field
    const students = await Student.findAll({
      where: { grade: teacher.classTeacher },
      include: [{ model: User, attributes: ['id','name','email','phone'] }]
    });

    res.json({ success: true, data: students });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Enter marks for a student
// @route   POST /api/teacher/marks
// @access  Private/Teacher
exports.enterMarks = async (req, res) => {
  try {
    const { studentId, subject, score, assessmentType, assessmentName, date, term, year } = req.body;
    const teacher = await Teacher.findOne({ where: { userId: req.user.id } });

    const record = await AcademicRecord.create({
      studentId,
      schoolCode: req.user.schoolCode,
      term: term || 'Term 1',
      year: year || new Date().getFullYear(),
      subject,
      assessmentType,
      assessmentName,
      score,
      teacherId: teacher.id,
      date: date || new Date(),
      isPublished: true
    });

    // Check for performance alerts (using curriculumEngine later)
    // For now, create a simple alert if score < 50
    if (score < 50) {
      const student = await Student.findByPk(studentId, { include: [{ model: User }] });
      await createAlert({
        userId: student.userId,
        role: 'student',
        type: 'academic',
        severity: 'warning',
        title: 'Low Score Alert',
        message: `You scored ${score}% in ${subject}. Please review.`
      });

      // Also alert parents
      const parents = await student.getParents({ include: [{ model: User }] });
      for (const p of parents) {
        await createAlert({
          userId: p.userId,
          role: 'parent',
          type: 'academic',
          severity: 'warning',
          title: `Low Score: ${student.User.name}`,
          message: `${student.User.name} scored ${score}% in ${subject}.`
        });
      }
    }

    res.status(201).json({ success: true, data: record });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Take attendance
// @route   POST /api/teacher/attendance
// @access  Private/Teacher
exports.takeAttendance = async (req, res) => {
  try {
    const { studentId, date, status, reason } = req.body;
    const [attendance, created] = await Attendance.findOrCreate({
      where: { studentId, date },
      defaults: { studentId, date, status, reason, schoolCode: req.user.schoolCode, reportedBy: req.user.id }
    });

    if (!created) {
      attendance.status = status;
      attendance.reason = reason;
      await attendance.save();
    }

    // Alert if absent
    if (status === 'absent') {
      const student = await Student.findByPk(studentId, { include: [{ model: User }] });
      await createAlert({
        userId: student.userId,
        role: 'student',
        type: 'attendance',
        severity: 'info',
        title: 'Absence Recorded',
        message: `You were marked absent on ${date}.`
      });
    }

    res.json({ success: true, data: attendance });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Add a comment about a student
// @route   POST /api/teacher/comment
// @access  Private/Teacher
exports.addComment = async (req, res) => {
  try {
    const { studentId, comment } = req.body;
    // This could be stored in a separate Comments table
    // For now, just create an alert for parent
    const student = await Student.findByPk(studentId, { include: [{ model: User }] });
    const parents = await student.getParents({ include: [{ model: User }] });
    for (const p of parents) {
      await createAlert({
        userId: p.userId,
        role: 'parent',
        type: 'system',
        severity: 'info',
        title: `Teacher Comment: ${student.User.name}`,
        message: comment
      });
    }

    res.json({ success: true, message: 'Comment sent to parents' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Upload CSV of marks
// @route   POST /api/teacher/upload/marks
// @access  Private/Teacher
exports.uploadMarksCSV = async (req, res) => {
  if (!req.files || !req.files.file) {
    return res.status(400).json({ success: false, message: 'No file uploaded' });
  }

  const file = req.files.file;
  const filePath = `/tmp/${Date.now()}-${file.name}`;
  await file.mv(filePath);

  const results = [];
  const errors = [];

  fs.createReadStream(filePath)
    .pipe(csv())
    .on('data', (data) => results.push(data))
    .on('end', async () => {
      fs.unlinkSync(filePath);

      const teacher = await Teacher.findOne({ where: { userId: req.user.id } });
      for (const row of results) {
        try {
          // Expecting columns: studentId or elimuid, subject, score, date, assessmentType
          const student = await Student.findOne({
            where: {
              [Op.or]: [
                { id: row.studentId },
                { elimuid: row.elimuid }
              ]
            }
          });
          if (!student) {
            errors.push({ row, error: 'Student not found' });
            continue;
          }

          await AcademicRecord.create({
            studentId: student.id,
            schoolCode: req.user.schoolCode,
            term: row.term || 'Term 1',
            year: row.year || new Date().getFullYear(),
            subject: row.subject,
            assessmentType: row.assessmentType || 'test',
            assessmentName: row.assessmentName,
            score: parseInt(row.score),
            teacherId: teacher.id,
            date: row.date || new Date(),
            isPublished: true
          });
        } catch (err) {
          errors.push({ row, error: err.message });
        }
      }

      res.json({
        success: true,
        message: `Processed ${results.length} records with ${errors.length} errors`,
        errors
      });
    });
};