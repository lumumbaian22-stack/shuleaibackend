const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middleware/auth');
const { Student, AcademicRecord, Attendance, User } = require('../models');
const { Op } = require('sequelize');

// All routes require authentication and student role
router.use(protect, authorize('student'));

// @desc    Get student dashboard data
// @route   GET /api/student/dashboard
// @access  Private/Student
router.get('/dashboard', async (req, res) => {
  try {
    const student = await Student.findOne({ 
      where: { userId: req.user.id },
      include: [{ model: User, attributes: ['name', 'email'] }]
    });

    if (!student) {
      return res.status(404).json({ 
        success: false, 
        message: 'Student profile not found' 
      });
    }

    // Get recent academic records
    const records = await AcademicRecord.findAll({
      where: { studentId: student.id },
      order: [['date', 'DESC']],
      limit: 10
    });

    // Get attendance records
    const attendance = await Attendance.findAll({
      where: { studentId: student.id },
      order: [['date', 'DESC']],
      limit: 20
    });

    // Calculate averages
    const avgScore = records.length 
      ? records.reduce((sum, r) => sum + r.score, 0) / records.length 
      : 0;

    const presentCount = attendance.filter(a => a.status === 'present').length;
    const attendanceRate = attendance.length 
      ? (presentCount / attendance.length) * 100 
      : 0;

    res.json({
      success: true,
      data: {
        student: {
          id: student.id,
          name: req.user.name,
          email: req.user.email,
          elimuid: student.elimuid,
          grade: student.grade
        },
        stats: {
          averageScore: Math.round(avgScore),
          attendanceRate: Math.round(attendanceRate),
          totalRecords: records.length,
          totalAttendance: attendance.length
        },
        recentGrades: records.map(r => ({
          subject: r.subject,
          score: r.score,
          grade: r.grade,
          date: r.date
        })),
        recentAttendance: attendance.map(a => ({
          date: a.date,
          status: a.status,
          reason: a.reason
        }))
      }
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      message: error.message 
    });
  }
});

// @desc    Get student grades
// @route   GET /api/student/grades
// @access  Private/Student
router.get('/grades', async (req, res) => {
  try {
    const student = await Student.findOne({ 
      where: { userId: req.user.id } 
    });

    const records = await AcademicRecord.findAll({
      where: { studentId: student.id },
      order: [['date', 'DESC']]
    });

    res.json({
      success: true,
      data: records
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      message: error.message 
    });
  }
});

// @desc    Get student attendance
// @route   GET /api/student/attendance
// @access  Private/Student
router.get('/attendance', async (req, res) => {
  try {
    const student = await Student.findOne({ 
      where: { userId: req.user.id } 
    });

    const attendance = await Attendance.findAll({
      where: { studentId: student.id },
      order: [['date', 'DESC']]
    });

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

// @desc    Send a message
// @route   POST /api/student/message
// @access  Private/Student
router.post('/message', async (req, res) => {
  try {
    const { receiverId, content } = req.body;
    
    const Message = require('../models/Message');
    const message = await Message.create({
      senderId: req.user.id,
      receiverId,
      content
    });

    // Emit via WebSocket
    if (global.io) {
      global.io.to(`user-${receiverId}`).emit('private-message', {
        from: req.user.id,
        message: content,
        timestamp: new Date()
      });
    }

    res.status(201).json({
      success: true,
      data: message
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      message: error.message 
    });
  }
});

// @desc    Get messages
// @route   GET /api/student/messages/:otherUserId
// @access  Private/Student
router.get('/messages/:otherUserId', async (req, res) => {
  try {
    const { otherUserId } = req.params;
    
    const Message = require('../models/Message');
    const messages = await Message.findAll({
      where: {
        [Op.or]: [
          { senderId: req.user.id, receiverId: otherUserId },
          { senderId: otherUserId, receiverId: req.user.id }
        ]
      },
      order: [['createdAt', 'ASC']]
    });

    res.json({
      success: true,
      data: messages
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      message: error.message 
    });
  }
});

module.exports = router;
