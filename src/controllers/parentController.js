const { Student, User, AcademicRecord, Attendance, Fee, Payment, Alert, Parent, Teacher, School } = require('../models');
const { createAlert } = require('../services/notificationService');
const { Op } = require('sequelize');

// @desc    Get parent's children
// @route   GET /api/parent/children
// @access  Private/Parent
exports.getChildren = async (req, res) => {
  try {
    const parent = await Parent.findOne({ where: { userId: req.user.id } });
    if (!parent) {
      return res.status(404).json({ success: false, message: 'Parent profile not found' });
    }

    const children = await parent.getStudents({ 
      include: [{ model: User, attributes: ['id', 'name', 'email', 'phone'] }] 
    });
    
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

    const student = await Student.findByPk(studentId, { 
      include: [
        { model: User },
        { model: Fee, where: { status: { [Op.ne]: 'paid' } }, required: false }
      ] 
    });
    
    if (!student || !(await parent.hasStudent(student))) {
      return res.status(403).json({ success: false, message: 'Not your child' });
    }

    // Get child's class teacher
    const classTeacher = await Teacher.findOne({
      where: { classTeacher: student.grade },
      include: [{ model: User, attributes: ['id', 'name', 'email', 'phone'] }]
    });

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
    
    const outstandingFees = await Fee.findOne({ 
      where: { studentId, status: { [Op.ne]: 'paid' } } 
    });

    const avg = records.length ? records.reduce((a,b) => a + b.score, 0) / records.length : 0;

    // Get school info for payments
    const school = await School.findOne({ 
      where: { schoolId: req.user.schoolCode },
      attributes: ['name', 'bankDetails', 'contact', 'schoolId']
    });

    res.json({
      success: true,
      data: {
        student: student.User.getPublicProfile(),
        classTeacher: classTeacher ? {
          id: classTeacher.id,
          name: classTeacher.User.name,
          email: classTeacher.User.email,
          phone: classTeacher.User.phone
        } : null,
        averageScore: avg,
        recentRecords: records,
        recentAttendance: attendance,
        outstandingFees: outstandingFees,
        school: school
      }
    });
  } catch (error) {
    console.error('Get child summary error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Report child's absence with notification to class teacher
// @route   POST /api/parent/report-absence
// @access  Private/Parent
exports.reportAbsence = async (req, res) => {
  try {
    const { studentId, date, reason, startDate, endDate } = req.body;
    
    // Handle single date or date range
    const dates = [];
    if (startDate && endDate) {
      const start = new Date(startDate);
      const end = new Date(endDate);
      for (let d = start; d <= end; d.setDate(d.getDate() + 1)) {
        dates.push(new Date(d).toISOString().split('T')[0]);
      }
    } else if (date) {
      dates.push(date);
    } else {
      return res.status(400).json({ success: false, message: 'Please provide date(s) for absence' });
    }

    const parent = await Parent.findOne({ where: { userId: req.user.id } });
    const student = await Student.findByPk(studentId, { 
      include: [{ model: User, attributes: ['id', 'name'] }] 
    });
    
    if (!student || !(await parent.hasStudent(student))) {
      return res.status(403).json({ success: false, message: 'Not your child' });
    }

    // Get child's class teacher
    const classTeacher = await Teacher.findOne({
      where: { classTeacher: student.grade },
      include: [{ model: User, attributes: ['id', 'name', 'email'] }]
    });

    const createdRecords = [];
    
    for (const absenceDate of dates) {
      const [attendance, created] = await Attendance.findOrCreate({
        where: { studentId, date: absenceDate },
        defaults: {
          studentId,
          date: absenceDate,
          status: 'absent',
          reason,
          reportedBy: req.user.id,
          reportedByParent: true,
          schoolCode: req.user.schoolCode
        }
      });

      if (!created) {
        attendance.status = 'absent';
        attendance.reason = reason;
        attendance.reportedByParent = true;
        await attendance.save();
      }

      createdRecords.push(attendance);
    }

    // Send notification to class teacher
    if (classTeacher) {
      const dateRangeText = dates.length > 1 
        ? `${dates[0]} to ${dates[dates.length-1]} (${dates.length} days)` 
        : dates[0];
      
      await createAlert({
        userId: classTeacher.User.id,
        role: 'teacher',
        type: 'attendance',
        severity: 'info',
        title: '🚨 Student Absence Reported',
        message: `${student.User.name} will be absent on ${dateRangeText}. Reason: ${reason}`,
        data: {
          studentId: student.id,
          studentName: student.User.name,
          dates: dates,
          reason: reason,
          reportedBy: parent.id
        }
      });

      // Notify school admin as well
      const admins = await User.findAll({ 
        where: { role: 'admin', schoolCode: req.user.schoolCode } 
      });

      for (const admin of admins) {
        await createAlert({
          userId: admin.id,
          role: 'admin',
          type: 'attendance',
          severity: 'info',
          title: '📋 Parent Reported Absence',
          message: `${student.User.name} reported absent by parent. Reason: ${reason}`,
          data: { studentId: student.id, studentName: student.User.name, dates, reason }
        });
      }
    }

    res.status(201).json({ 
      success: true, 
      message: `Absence reported for ${dates.length} day(s) and class teacher notified`,
      data: createdRecords 
    });
  } catch (error) {
    console.error('Report absence error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Get available subscription plans
// @route   GET /api/parent/plans
// @access  Private/Parent
exports.getSubscriptionPlans = async (req, res) => {
  try {
    const plans = [
      { id: 'basic', name: 'Basic', price: 150, currency: 'KES', interval: 'month', features: ['View attendance records', 'View basic grades', 'Report absence', 'Email notifications'] },
      { id: 'premium', name: 'Premium', price: 300, currency: 'KES', interval: 'month', features: ['Everything in Basic', 'Detailed academic progress', 'Teacher comments and feedback', 'Payment history', 'SMS notifications'] },
      { id: 'ultimate', name: 'Ultimate', price: 800, currency: 'KES', interval: 'month', features: ['Everything in Premium', 'Live chat with teachers', 'Video conference access', 'Priority support', 'Downloadable reports', 'Multi-child discount'] }
    ];

    res.json({ success: true, data: plans });
  } catch (error) {
    console.error('Get plans error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Make a payment with school details
// @route   POST /api/parent/pay
// @access  Private/Parent
exports.makePayment = async (req, res) => {
  try {
    const { studentId, amount, method, reference, plan } = req.body;
    
    const parent = await Parent.findOne({ where: { userId: req.user.id } });
    const student = await Student.findByPk(studentId, { 
      include: [{ model: User, attributes: ['name'] }] 
    });
    
    if (!student || !(await parent.hasStudent(student))) {
      return res.status(403).json({ success: false, message: 'Not your child' });
    }

    // Get school payment details
    const school = await School.findOne({ 
      where: { schoolId: req.user.schoolCode },
      attributes: ['name', 'bankDetails', 'contact', 'schoolId']
    });

    // Create payment record
    const payment = await Payment.create({
      studentId,
      parentId: parent.id,
      amount,
      method,
      reference: reference || `PAY-${Date.now()}-${studentId}`,
      plan,
      status: 'pending',
      schoolCode: req.user.schoolCode,
      metadata: {
        schoolName: school.name,
        studentName: student.User.name,
        paymentDate: new Date()
      }
    });

    res.status(201).json({ 
      success: true, 
      message: 'Payment initiated successfully',
      data: {
        payment: payment,
        school: {
          name: school.name,
          bankDetails: school.bankDetails,
          contact: school.contact
        },
        instructions: 'Please complete payment using the school bank details below'
      }
    });
  } catch (error) {
    console.error('Make payment error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Confirm payment (webhook or callback)
// @route   POST /api/parent/payment-confirm
// @access  Private/Parent
exports.confirmPayment = async (req, res) => {
  try {
    const { paymentId, transactionId } = req.body;
    
    const payment = await Payment.findByPk(paymentId, {
      include: [{ model: Student }]
    });

    if (!payment) {
      return res.status(404).json({ success: false, message: 'Payment not found' });
    }

    payment.status = 'completed';
    payment.transactionId = transactionId;
    payment.completedAt = new Date();
    await payment.save();

    // Update student's subscription plan
    const student = payment.Student;
    student.subscriptionPlan = payment.plan;
    student.subscriptionStatus = 'active';
    student.subscriptionExpiry = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days
    await student.save();

    // Notify parent
    await createAlert({
      userId: req.user.id,
      role: 'parent',
      type: 'payment',
      severity: 'success',
      title: '✅ Payment Successful',
      message: `Your payment of $${payment.amount} for ${payment.plan} plan has been confirmed.`,
      data: { paymentId: payment.id }
    });

    res.json({ 
      success: true, 
      message: 'Payment confirmed successfully',
      data: payment
    });
  } catch (error) {
    console.error('Confirm payment error:', error);
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
      include: [
        { 
          model: Student, 
          include: [{ model: User, attributes: ['name'] }] 
        }
      ],
      order: [['createdAt', 'DESC']]
    });

    // Get school details for each payment
    const school = await School.findOne({ 
      where: { schoolId: req.user.schoolCode },
      attributes: ['name', 'bankDetails']
    });

    res.json({ 
      success: true, 
      data: {
        payments,
        school: school
      } 
    });
  } catch (error) {
    console.error('Get payments error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Upgrade subscription plan
// @route   POST /api/parent/upgrade-plan
// @access  Private/Parent
exports.upgradePlan = async (req, res) => {
  try {
    const { studentId, newPlan } = req.body;
    
    const validPlans = ['basic', 'premium', 'ultimate'];
    if (!validPlans.includes(newPlan)) {
      return res.status(400).json({ success: false, message: 'Invalid plan' });
    }

    const parent = await Parent.findOne({ where: { userId: req.user.id } });
    const student = await Student.findByPk(studentId);
    
    if (!student || !(await parent.hasStudent(student))) {
      return res.status(403).json({ success: false, message: 'Not your child' });
    }

    // Get pricing
    const prices = { basic: 3, premium: 10, ultimate: 20 };
    const amount = prices[newPlan];

    // Get school payment details
    const school = await School.findOne({ 
      where: { schoolId: req.user.schoolCode },
      attributes: ['name', 'bankDetails', 'contact']
    });

    // Create payment for upgrade
    const payment = await Payment.create({
      studentId,
      parentId: parent.id,
      amount,
      method: 'pending',
      reference: `UPGRADE-${Date.now()}-${studentId}`,
      plan: newPlan,
      status: 'pending',
      schoolCode: req.user.schoolCode,
      metadata: {
        type: 'upgrade',
        previousPlan: student.paymentStatus?.plan || 'none',
        newPlan: newPlan,
        schoolName: school.name
      }
    });

    res.json({
      success: true,
      message: `Upgrade to ${newPlan} plan initiated`,
      data: {
        payment,
        school,
        amount,
        instructions: 'Please complete payment to activate the new plan'
      }
    });
  } catch (error) {
    console.error('Upgrade plan error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Send message to class teacher or admin only
// @route   POST /api/parent/message
// @access  Private/Parent
exports.sendMessage = async (req, res) => {
  try {
    const { studentId, message, recipientType } = req.body;
    
    const parent = await Parent.findOne({ where: { userId: req.user.id } });
    const student = await Student.findByPk(studentId, { 
      include: [{ model: User, attributes: ['id', 'name'] }] 
    });
    
    if (!student || !(await parent.hasStudent(student))) {
      return res.status(403).json({ success: false, message: 'Not your child' });
    }

    let recipientId = null;
    let recipientName = '';

    if (recipientType === 'teacher') {
      const classTeacher = await Teacher.findOne({
        where: { classTeacher: student.grade },
        include: [{ model: User, attributes: ['id', 'name'] }]
      });

      if (!classTeacher) {
        return res.status(404).json({ success: false, message: 'Class teacher not found' });
      }

      recipientId = classTeacher.User.id;
      recipientName = classTeacher.User.name;
    } else if (recipientType === 'admin') {
      const admin = await User.findOne({
        where: { role: 'admin', schoolCode: req.user.schoolCode }
      });

      if (!admin) {
        return res.status(404).json({ success: false, message: 'School admin not found' });
      }

      recipientId = admin.id;
      recipientName = admin.name;
    } else {
      return res.status(400).json({ success: false, message: 'Invalid recipient type' });
    }

    const { Message } = require('../models');
    const newMessage = await Message.create({
      senderId: req.user.id,
      receiverId: recipientId,
      content: message,
      metadata: {
        studentId: student.id,
        studentName: student.User.name,
        parentName: req.user.name
      }
    });

    if (global.io) {
      global.io.to(`user-${recipientId}`).emit('new-message', {
        from: req.user.id,
        fromName: req.user.name,
        message: message,
        studentName: student.User.name,
        timestamp: new Date()
      });
    }

    await createAlert({
      userId: recipientId,
      role: recipientType === 'teacher' ? 'teacher' : 'admin',
      type: 'message',
      severity: 'info',
      title: `📬 New message from parent of ${student.User.name}`,
      message: message.substring(0, 100) + (message.length > 100 ? '...' : ''),
      data: {
        studentId: student.id,
        studentName: student.User.name,
        parentId: parent.id,
        parentName: req.user.name
      }
    });

    res.status(201).json({
      success: true,
      message: 'Message sent successfully',
      data: {
        message: newMessage,
        recipient: recipientName,
        recipientType: recipientType
      }
    });
  } catch (error) {
    console.error('Send message error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Get messages with teacher or admin
// @route   GET /api/parent/messages/:otherUserId
// @access  Private/Parent
exports.getMessages = async (req, res) => {
  try {
    const { otherUserId } = req.params;
    const { Message } = require('../models');

    const messages = await Message.findAll({
      where: {
        [Op.or]: [
          { senderId: req.user.id, receiverId: otherUserId },
          { senderId: otherUserId, receiverId: req.user.id }
        ]
      },
      order: [['createdAt', 'ASC']],
      include: [
        { model: User, as: 'Sender', attributes: ['id', 'name', 'role'] },
        { model: User, as: 'Receiver', attributes: ['id', 'name', 'role'] }
      ]
    });

    res.json({ success: true, data: messages });
  } catch (error) {
    console.error('Get messages error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Get child analytics
// @route   GET /api/parent/child/:studentId/analytics
// @access  Private/Parent
exports.getChildAnalytics = async (req, res) => {
  try {
    const { studentId } = req.params;
    const parent = await Parent.findOne({ where: { userId: req.user.id } });
    const student = await Student.findByPk(studentId);
    if (!student || !(await parent.hasStudent(student))) return res.status(403).json({ success: false });

    // Performance distribution
    const records = await AcademicRecord.findAll({ where: { studentId } });
    const gradeCount = { A:0, B:0, C:0, D:0, E:0 };
    records.forEach(r => {
      const grade = r.grade?.[0] || 'C';
      if (gradeCount[grade] !== undefined) gradeCount[grade]++;
      else gradeCount['C']++;
    });

    // Attendance over last 6 months
    const sixMonthsAgo = new Date(); sixMonthsAgo.setMonth(sixMonthsAgo.getMonth()-6);
    const attendance = await Attendance.findAll({
      where: { studentId, date: { [Op.gte]: sixMonthsAgo } },
      order: [['date', 'ASC']]
    });
    const attendanceByMonth = {};
    attendance.forEach(a => {
      const month = a.date.toISOString().slice(0,7);
      if (!attendanceByMonth[month]) attendanceByMonth[month] = { present:0, total:0 };
      attendanceByMonth[month].total++;
      if (a.status === 'present') attendanceByMonth[month].present++;
    });
    const attendanceTrend = Object.entries(attendanceByMonth).map(([month, data]) => ({
      month,
      rate: (data.present/data.total)*100
    }));

    // Progress over time (scores per subject)
    const subjectProgress = {};
    records.forEach(r => {
      if (!subjectProgress[r.subject]) subjectProgress[r.subject] = [];
      subjectProgress[r.subject].push({ date: r.date, score: r.score });
    });

    res.json({ success: true, data: { gradeDistribution: gradeCount, attendanceTrend, subjectProgress } });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Get fee details for a child
// @route   GET /api/parent/fees/:studentId
// @access  Private/Parent
exports.getFees = async (req, res) => {
  try {
    const { studentId } = req.params;
    const parent = await Parent.findOne({ where: { userId: req.user.id } });
    const student = await Student.findByPk(studentId);
    if (!student || !(await parent.hasStudent(student))) {
      return res.status(403).json({ success: false, message: 'Not your child' });
    }
    const fees = await Fee.findAll({
      where: { studentId },
      order: [['year', 'DESC'], ['term', 'DESC']]
    });
    res.json({ success: true, data: fees });
  } catch (error) {
    console.error('Get fees error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Add a manual fee payment
// @route   POST /api/parent/fees/pay
// @access  Private/Parent
exports.addPayment = async (req, res) => {
  try {
    const { studentId, term, year, amount, method, reference } = req.body;
    const parent = await Parent.findOne({ where: { userId: req.user.id } });
    const student = await Student.findByPk(studentId);
    if (!student || !(await parent.hasStudent(student))) {
      return res.status(403).json({ success: false, message: 'Not your child' });
    }

    let fee = await Fee.findOne({ where: { studentId, term, year } });
    if (!fee) {
      fee = await Fee.create({
        studentId,
        schoolCode: student.User.schoolCode,
        term,
        year,
        totalAmount: 5000,
        paidAmount: 0,
        status: 'unpaid'
      });
    }

    const payment = await Payment.create({
      studentId,
      parentId: parent.id,
      feeId: fee.id,
      amount,
      method,
      reference: reference || `PAY-${Date.now()}`,
      status: 'completed',
      schoolCode: student.User.schoolCode
    });

    fee.paidAmount += amount;
    if (fee.paidAmount >= fee.totalAmount) fee.status = 'paid';
    else if (fee.paidAmount > 0) fee.status = 'partial';
    await fee.save();

    res.json({ success: true, data: { payment, fee } });
  } catch (error) {
    console.error('Add payment error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Get child's live attendance for today
// @route   GET /api/parent/child/:studentId/attendance/today
exports.getChildTodayAttendance = async (req, res) => {
  try {
    const { studentId } = req.params;
    const parent = await Parent.findOne({ where: { userId: req.user.id } });
    const student = await Student.findByPk(studentId);
    if (!student || !(await parent.hasStudent(student))) {
      return res.status(403).json({ success: false, message: 'Not your child' });
    }
    
    const today = new Date().toISOString().split('T')[0];
    const attendance = await Attendance.findOne({
      where: { studentId, date: today }
    });
    
    res.json({ 
      success: true, 
      data: attendance || { status: 'not_recorded' } 
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
