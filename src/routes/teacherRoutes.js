const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middleware/auth');
const { Teacher, Student, AcademicRecord, Attendance, User } = require('../models');
const { Op } = require('sequelize');

// All routes require authentication and teacher role
router.use(protect, authorize('teacher'));

// @desc    Get teacher's students
// @route   GET /api/teacher/students
// @access  Private/Teacher
router.get('/students', async (req, res) => {
  try {
    const teacher = await Teacher.findOne({ 
      where: { userId: req.user.id } 
    });

    if (!teacher) {
      return res.status(404).json({ 
        success: false, 
        message: 'Teacher profile not found' 
      });
    }

    const students = await Student.findAll({
      where: { grade: teacher.classTeacher },
      include: [{ 
        model: User, 
        attributes: ['id', 'name', 'email', 'phone'] 
      }]
    });

    res.json({
      success: true,
      data: students.map(s => ({
        id: s.id,
        name: s.User.name,
        grade: s.grade,
        elimuid: s.elimuid,
        attendance: 95, // You can calculate this
        average: 85 // You can calculate this
      }))
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      message: error.message 
    });
  }
});

// @desc    Add a new student
// @route   POST /api/teacher/students
// @access  Private/Teacher
router.post('/students', async (req, res) => {
  try {
    const { name, grade, parentEmail } = req.body;

    // Generate ELIMUID
    const year = new Date().getFullYear();
    const count = await Student.count();
    const elimuid = `ELIMU-${year}-${(count + 1).toString().padStart(4, '0')}`;

    // Create user
    const UserModel = require('../models/User');
    const user = await UserModel.create({
      name,
      email: parentEmail || `${name.replace(/\s+/g, '.').toLowerCase()}@student.edu`,
      password: 'Student123!',
      role: 'student',
      schoolCode: req.user.schoolCode,
      isActive: true
    });

    // Create student
    const student = await Student.create({
      userId: user.id,
      elimuid,
      grade
    });

    res.status(201).json({
      success: true,
      data: {
        id: student.id,
        name: user.name,
        elimuid: student.elimuid,
        grade: student.grade
      }
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      message: error.message 
    });
  }
});

// @desc    Enter marks
// @route   POST /api/teacher/marks
// @access  Private/Teacher
router.post('/marks', async (req, res) => {
  try {
    const { studentId, subject, score, assessmentType, assessmentName, date, term, year } = req.body;
    
    const teacher = await Teacher.findOne({ 
      where: { userId: req.user.id } 
    });

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

    res.status(201).json({
      success: true,
      data: record
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      message: error.message 
    });
  }
});

// @desc    Take attendance
// @route   POST /api/teacher/attendance
// @access  Private/Teacher
router.post('/attendance', async (req, res) => {
  try {
    const { studentId, date, status, reason } = req.body;
    
    const [attendance, created] = await Attendance.findOrCreate({
      where: { studentId, date },
      defaults: { 
        studentId, 
        date, 
        status, 
        reason, 
        schoolCode: req.user.schoolCode, 
        reportedBy: req.user.id 
      }
    });

    if (!created) {
      attendance.status = status;
      attendance.reason = reason;
      await attendance.save();
    }

    res.json({
      success: true,
      data: attendance
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      message: error.message 
    });
  }
});

module.exports = router;
