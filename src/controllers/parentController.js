const { Student, User, AcademicRecord, Attendance, Fee, Payment, Alert, Parent, Teacher } = require('../models');
const { createAlert } = require('../services/notificationService');
const { Op } = require('sequelize');

// @desc    Get parent's children
// @route   GET /api/parent/children
// @access  Private/Parent
exports.getChildren = async (req, res) => {
  try {
    const parent = await Parent.findOne({ where: { userId: req.user.id } });
    if (!parent) return res.status(404).json({ success: false, message: 'Parent profile not found' });

    const children = await parent.getStudents({ include: [{ model: User, attributes: ['id','name','email','phone'] }] });
    res.json({ success: true, data: children });
  } catch (error) {
    console.error('Get children error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Get a child's academic summary
// @route   GET /api/parent/child/:studentId/summary
// @access  Private/Parent
exports.getChildSummary = async (req, res) => {
  try {
    const { studentId } = req.params;
    const parent = await Parent.findOne({ where: { userId: req.user.id } });
    if (!parent) return res.status(404).json({ success: false, message: 'Parent not found' });

    const student = await Student.findByPk(studentId, { include: [{ model: User }] });
    if (!student || !(await parent.hasStudent(student))) {
      return res.status(403).json({ success: false, message: 'Not your child' });
    }

    const records = await AcademicRecord.findAll({ where: { studentId }, order: [['date', 'DESC']], limit: 10 });
    const attendance = await Attendance.findAll({ where: { studentId }, order: [['date', 'DESC']], limit: 20 });
    const fees = await Fee.findOne({ where: { studentId, status: { [Op.ne]: 'paid' } } });

    const avg = records.length ? records.reduce((a,b) => a + b.score, 0) / records.length : 0;

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
    console.error('Get child summary error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Report child's absence
// @route   POST /api/parent/report-absence
// @access  Private/Parent
exports.reportAbsence = async (req, res) => {
  try {
    const { studentId, date, reason } = req.body;
    const parent = await Parent.findOne({ where: { userId: req.user.id } });
    const student = await Student.findByPk(studentId, { include: [{ model: User }] });
    
    if (!student || !(await parent.hasStudent(student))) {
      return res.status(403).json({ success: false, message: 'Not your child' });
    }

    const existing = await Attendance.findOne({ where: { studentId, date } });
    if (existing) {
      return res.status(400).json({ success: false, message: 'Attendance already recorded for that day' });
    }

    const attendance = await Attendance.create({
      studentId,
      date,
      status: 'absent',
      reason,
      reportedBy: req.user.id,
      reportedByParent: true
    });

    // Notify teachers/admins
    const teachers = await Teacher.findAll({
      include: [{ model: User, where: { schoolCode: req.user.schoolCode } }]
    });
    
    for (const t of teachers) {
      await createAlert({
        userId: t.userId,
        role: 'teacher',
        type: 'attendance',
        severity: 'info',
        title: 'Absence Reported',
        message: `${student.User.name} reported absent on ${date} by parent. Reason: ${reason}`
      });
    }

    res.status(201).json({ success: true, data: attendance });
  } catch (error) {
    console.error('Report absence error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Make a payment
// @route   POST /api/parent/pay
// @access  Private/Parent
exports.makePayment = async (req, res) => {
  try {
    const { studentId, amount, method, reference, plan } = req.body;
    const parent = await Parent.findOne({ where: { userId: req.user.id } });
    const student = await Student.findByPk(studentId);
    
    if (!student || !(await parent.hasStudent(student))) {
      return res.status(403).json({ success: false, message: 'Not your child' });
    }

    // Find or create fee record
    let fee = await Fee.findOne({ where: { studentId, status: { [Op.ne]: 'paid' } } });
    if (!fee) {
      fee = await Fee.create({
        studentId,
        schoolCode: req.user.schoolCode,
        term: 'Term 1',
        year: new Date().getFullYear(),
        totalAmount: 5000,
        paidAmount: 0,
        paymentPlan: plan || 'basic'
      });
    }

    const payment = await Payment.create({
      studentId,
      parentId: parent.id,
      feeId: fee.id,
      amount,
      method,
      reference,
      plan: plan || fee.paymentPlan,
      status: 'completed'
    });

    // Update fee
    fee.paidAmount = (fee.paidAmount || 0) + amount;
    await fee.save();

    // Update student payment status if fully paid
    if (fee.balance <= 0) {
      student.paymentStatus = { plan: fee.paymentPlan, paid: fee.paidAmount, status: 'unlocked' };
      await student.save();
    }

    res.status(201).json({ success: true, data: payment });
  } catch (error) {
    console.error('Make payment error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Get payment history
// @route   GET /api/parent/payments
// @access  Private/Parent
exports.getPayments = async (req, res) => {
  try {
    const parent = await Parent.findOne({ where: { userId: req.user.id } });
    const payments = await Payment.findAll({
      where: { parentId: parent.id },
      include: [{ model: Student, include: [{ model: User, attributes: ['name'] }] }],
      order: [['createdAt', 'DESC']]
    });
    res.json({ success: true, data: payments });
  } catch (error) {
    console.error('Get payments error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};
