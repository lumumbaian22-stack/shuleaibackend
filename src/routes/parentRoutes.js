const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middleware/auth');
const { Parent, Student, User, AcademicRecord, Attendance, Fee } = require('../models');
const { Op } = require('sequelize');

// All routes require authentication and parent role
router.use(protect, authorize('parent'));

// @desc    Get parent's children
// @route   GET /api/parent/children
// @access  Private/Parent
router.get('/children', async (req, res) => {
  try {
    const parent = await Parent.findOne({ 
      where: { userId: req.user.id } 
    });

    if (!parent) {
      return res.status(404).json({ 
        success: false, 
        message: 'Parent profile not found' 
      });
    }

    const children = await parent.getStudents({ 
      include: [{ 
        model: User, 
        attributes: ['id', 'name', 'email', 'phone'] 
      }] 
    });

    res.json({
      success: true,
      data: children
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      message: error.message 
    });
  }
});

// @desc    Get child summary
// @route   GET /api/parent/child/:studentId/summary
// @access  Private/Parent
router.get('/child/:studentId/summary', async (req, res) => {
  try {
    const { studentId } = req.params;
    
    const parent = await Parent.findOne({ 
      where: { userId: req.user.id } 
    });

    const student = await Student.findByPk(studentId, { 
      include: [{ model: User }] 
    });

    if (!student || !(await parent.hasStudent(student))) {
      return res.status(403).json({ 
        success: false, 
        message: 'Not your child' 
      });
    }

    const records = await AcademicRecord.findAll({ 
      where: { studentId }, 
      order: [['date', 'DESC']], 
      limit: 10 
    });

    const attendance = await Attendance.findAll({ 
      where: { studentId }, 
      order: [['date', 'DESC']], 
      limit: 20 
    });

    const fees = await Fee.findOne({ 
      where: { 
        studentId, 
        status: { [Op.ne]: 'paid' } 
      } 
    });

    const avg = records.length 
      ? records.reduce((a, b) => a + b.score, 0) / records.length 
      : 0;

    res.json({
      success: true,
      data: {
        student: student.User.getPublicProfile(),
        averageScore: avg,
        recentRecords: records,
        recentAttendance: attendance,
        outstandingFees: fees
      }
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      message: error.message 
    });
  }
});

// @desc    Report child's absence
// @route   POST /api/parent/report-absence
// @access  Private/Parent
router.post('/report-absence', async (req, res) => {
  try {
    const { studentId, date, reason } = req.body;
    
    const parent = await Parent.findOne({ 
      where: { userId: req.user.id } 
    });

    const student = await Student.findByPk(studentId);
    
    if (!student || !(await parent.hasStudent(student))) {
      return res.status(403).json({ 
        success: false, 
        message: 'Not your child' 
      });
    }

    const existing = await Attendance.findOne({ 
      where: { studentId, date } 
    });

    if (existing) {
      return res.status(400).json({ 
        success: false, 
        message: 'Attendance already recorded for that day' 
      });
    }

    const attendance = await Attendance.create({
      studentId,
      date,
      status: 'absent',
      reason,
      reportedBy: req.user.id,
      reportedByParent: true
    });

    res.status(201).json({
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

// @desc    Make a payment
// @route   POST /api/parent/pay
// @access  Private/Parent
router.post('/pay', async (req, res) => {
  try {
    const { studentId, amount, method, reference, plan } = req.body;
    
    const parent = await Parent.findOne({ 
      where: { userId: req.user.id } 
    });

    const student = await Student.findByPk(studentId);
    
    if (!student || !(await parent.hasStudent(student))) {
      return res.status(403).json({ 
        success: false, 
        message: 'Not your child' 
      });
    }

    // Create payment record
    const Payment = require('../models/Payment');
    const payment = await Payment.create({
      studentId,
      parentId: parent.id,
      amount,
      method,
      reference,
      plan: plan || 'basic',
      status: 'completed'
    });

    res.status(201).json({
      success: true,
      data: payment
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      message: error.message 
    });
  }
});

module.exports = router;
