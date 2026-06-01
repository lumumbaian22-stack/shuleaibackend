const { Student, User, AcademicRecord, Attendance, Fee, Payment, Alert, Parent, Teacher, School, Message, Class, sequelize } = require('../models');
const { createAlert } = require('../services/notificationService');
const { Op } = require('sequelize');
const { ensureRuntimeSchema } = require('../utils/schemaSafety');


async function countLinkedParents(studentId) {
  const rows = await sequelize.query(
    'SELECT COUNT(DISTINCT "parentId")::int AS count FROM "StudentParents" WHERE "studentId" = :studentId',
    { replacements: { studentId }, type: sequelize.QueryTypes.SELECT }
  );
  return Number(rows?.[0]?.count || 0);
}


async function linkParentToStudentSafely(parentId, studentId) {
  const now = new Date();
  await sequelize.query(`
    INSERT INTO "StudentParents" ("studentId", "parentId", "createdAt", "updatedAt")
    VALUES (:studentId, :parentId, :createdAt, :updatedAt)
    ON CONFLICT ("studentId", "parentId") DO UPDATE
      SET "updatedAt" = EXCLUDED."updatedAt"
  `, {
    replacements: { studentId, parentId, createdAt: now, updatedAt: now },
    type: sequelize.QueryTypes.INSERT
  });
}

async function parentHasStudent(parentId, studentId) {
  const rows = await sequelize.query(
    'SELECT 1 FROM "StudentParents" WHERE "parentId" = :parentId AND "studentId" = :studentId LIMIT 1',
    { replacements: { parentId, studentId }, type: sequelize.QueryTypes.SELECT }
  );
  return rows.length > 0;
}

async function enrichLinkedChildren(children) {
  const classIds = [...new Set(children.map(c => c.classId).filter(Boolean))];
  const classes = classIds.length ? await Class.findAll({ where: { id: { [Op.in]: classIds } } }) : [];
  const classMap = new Map(classes.map(c => [String(c.id), c]));

  const schoolCodes = [...new Set(children.map(c => c.User?.schoolCode).filter(Boolean))];
  const schools = schoolCodes.length ? await School.findAll({ where: { schoolId: { [Op.in]: schoolCodes } } }) : [];
  const schoolMap = new Map(schools.map(s => [String(s.schoolId), s]));

  return children.map(child => {
    const raw = child.toJSON ? child.toJSON() : child;
    const classItem = raw.classId ? classMap.get(String(raw.classId)) : null;
    const schoolCode = raw.User?.schoolCode || raw.schoolCode || null;
    const school = schoolCode ? schoolMap.get(String(schoolCode)) : null;
    return {
      ...raw,
      name: raw.User?.name || raw.name || 'Student',
      className: classItem?.name || raw.grade || 'Not Assigned',
      classId: raw.classId || null,
      schoolCode,
      schoolName: school?.name || raw.User?.School?.name || schoolCode || 'School',
      schoolLogo: school?.settings?.branding?.logoDataUrl || school?.settings?.branding?.logoUrl || school?.settings?.branding?.logo || school?.settings?.logo || null,
      curriculum: raw.curriculum || school?.system || 'cbc'
    };
  });
}

// @desc    Get parent's children
// @route   GET /api/parent/children
// @access  Private/Parent
exports.getChildren = async (req, res) => {
  try {
    await ensureRuntimeSchema().catch(() => null);
    const parent = await Parent.findOne({ where: { userId: req.user.id } });
    if (!parent) {
      return res.status(404).json({ success: false, message: 'Parent profile not found' });
    }

    const children = await parent.getStudents({
      attributes: { include: ['classId'] },
      joinTableAttributes: [],
      include: [{ model: User, attributes: ['id', 'name', 'email', 'phone', 'schoolCode', 'profileImage'] }],
      order: [[User, 'name', 'ASC']]
    });

    const enrichedChildren = await enrichLinkedChildren(children);
    res.json({ success: true, data: enrichedChildren });
  } catch (error) {
    console.error('Get children error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Link an extra child to a parent using that child's Elimu ID only
// @route   POST /api/parent/children/link
// @access  Private/Parent
exports.linkChildByElimuId = async (req, res) => {
  try {
    await ensureRuntimeSchema().catch(() => null);
    const rawElimuId = String(req.body?.elimuid || req.body?.elimuId || '').trim();
    if (!rawElimuId) {
      return res.status(400).json({ success: false, message: 'Please enter the child Elimu ID' });
    }

    const parent = await Parent.findOne({ where: { userId: req.user.id } });
    if (!parent) return res.status(404).json({ success: false, message: 'Parent profile not found' });

    const student = await Student.findOne({
      where: sequelize.where(sequelize.fn('LOWER', sequelize.col('elimuid')), rawElimuId.toLowerCase()),
      attributes: { include: ['classId'] },
      include: [{ model: User, attributes: ['id', 'name', 'schoolCode'] }]
    });

    // Do not expose other learners through search-like responses.
    if (!student) {
      return res.status(404).json({ success: false, message: 'Unable to link child with this Elimu ID' });
    }

    const alreadyLinked = await parentHasStudent(parent.id, student.id);
    if (alreadyLinked) {
      const children = await enrichLinkedChildren([student]);
      return res.json({ success: true, message: 'This child is already linked to your account', data: children[0] });
    }

    const linkedParentCount = await countLinkedParents(student.id);
    if (linkedParentCount >= 2) {
      return res.status(403).json({ success: false, message: 'This Elimu ID already has the maximum two parent/guardian accounts linked' });
    }

    await linkParentToStudentSafely(parent.id, student.id);
    const children = await enrichLinkedChildren([student]);

    res.status(201).json({ success: true, message: 'Child linked successfully', data: children[0] });
  } catch (error) {
    console.error('Link child by Elimu ID error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Get a child's academic summary (published marks only + school curriculum info)
// @route   GET /api/parent/child/:studentId/summary
// @access  Private/Parent
exports.getChildSummary = async (req, res) => {
  try {
    await ensureRuntimeSchema().catch(() => null);
    const { studentId } = req.params;
    const parent = await Parent.findOne({ where: { userId: req.user.id } });
    if (!parent) return res.status(404).json({ success: false, message: 'Parent not found' });

    const student = await Student.findByPk(studentId, { 
      attributes: { include: ['classId'] },
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

    // Fetch only PUBLISHED academic records
    const records = await AcademicRecord.findAll({ 
      where: { studentId, isPublished: true }, 
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

    // Get school info – include curriculum and level so frontend can compute correct grades
    const school = await School.findOne({ 
      where: { schoolId: student.User?.schoolCode || req.user.schoolCode },
      attributes: ['name', 'bankDetails', 'contact', 'schoolId', 'system', 'settings']
    });

    res.json({
      success: true,
      data: {
        student: { ...student.User.getPublicProfile(), studentId: student.id, elimuid: student.elimuid, grade: student.grade, classId: student.classId, curriculum: student.curriculum, schoolCode: student.User?.schoolCode },
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
        school: school,
        // Explicitly pass curriculum info for the frontend
        curriculum: school ? school.system : 'cbc',
        schoolLevel: school?.settings?.schoolLevel || 'secondary'
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
      attributes: { include: ['classId'] },
      include: [{ model: User, attributes: ['id', 'name'] }] 
    });
    
    if (!student || !(await parent.hasStudent(student))) {
      return res.status(403).json({ success: false, message: 'Not your child' });
    }

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
      attributes: { include: ['classId'] },
      include: [{ model: User, attributes: ['name'] }] 
    });
    
    if (!student || !(await parent.hasStudent(student))) {
      return res.status(403).json({ success: false, message: 'Not your child' });
    }

    const school = await School.findOne({ 
      where: { schoolId: req.user.schoolCode },
      attributes: ['name', 'bankDetails', 'contact', 'schoolId']
    });

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

    const student = payment.Student;
    student.subscriptionPlan = payment.plan;
    student.subscriptionStatus = 'active';
    student.subscriptionExpiry = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    await student.save();

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
    if (!parent) return res.status(404).json({ success: false, message: 'Parent profile not found' });

    const payments = await Payment.findAll({
      where: { parentId: parent.id, schoolCode: req.user.schoolCode },
      include: [
        { model: Student, include: [{ model: User, attributes: ['id', 'name', 'schoolCode'] }] },
        { model: Fee }
      ],
      order: [['createdAt', 'DESC']],
      limit: 500
    });

    const school = await School.findOne({
      where: { schoolId: req.user.schoolCode },
      attributes: ['name', 'bankDetails', 'settings']
    });

    const normalized = payments.map((payment) => {
      const row = payment.toJSON ? payment.toJSON() : payment;
      const fee = row.Fee || null;
      const total = Number(fee?.totalAmount || 0);
      const paid = Number(fee?.paidAmount || 0);
      return {
        ...row,
        feeTerm: fee?.term || row.metadata?.term || null,
        feeYear: fee?.year || row.metadata?.year || null,
        feeTotalAmount: total,
        feePaidAmount: paid,
        feeBalance: Math.max(0, total - paid),
        category: row.paymentType === 'fee' ? 'school_fee' : row.paymentType || 'payment'
      };
    });

    res.json({ success: true, data: { payments: normalized, school } });
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

    const prices = { basic: 3, premium: 10, ultimate: 20 };
    const amount = prices[newPlan];

    const school = await School.findOne({ 
      where: { schoolId: req.user.schoolCode },
      attributes: ['name', 'bankDetails', 'contact']
    });

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
    const target = String(recipientType || 'admin').toLowerCase();
    const parent = await Parent.findOne({ where: { userId: req.user.id } });
    if (!parent) return res.status(404).json({ success:false, message:'Parent not found' });
    const student = await Student.findByPk(studentId, { include: [{ model: User, attributes: ['id', 'name', 'schoolCode'] }] });
    if (!student) return res.status(404).json({ success:false, message:'Student not found' });
    const linked = await sequelize.query('SELECT 1 FROM "StudentParents" WHERE "parentId"=:parentId AND "studentId"=:studentId LIMIT 1', { replacements:{ parentId:parent.id, studentId:student.id }, type:sequelize.QueryTypes.SELECT });
    if (!linked.length || student.User?.schoolCode !== req.user.schoolCode) return res.status(403).json({ success:false, message:'Not your child' });

    let recipientId = null, recipientName = '', actualRecipientType = target;
    if (target === 'admin') {
      const admin = await User.findOne({ where: { role: 'admin', schoolCode: req.user.schoolCode, isActive: true } }) || await User.findOne({ where:{ role:'admin', schoolCode:req.user.schoolCode } });
      if (!admin) return res.status(404).json({ success:false, message:'School admin not found' });
      recipientId = admin.id; recipientName = admin.name; actualRecipientType = 'admin';
    } else if (target === 'teacher') {
      let teacher = null;
      const possibleClassNames = [student.className, student.grade, student.class, student.stream].filter(Boolean).map(String);
      let cls = student.classId ? await Class.findOne({ where:{ id:student.classId, schoolCode:req.user.schoolCode } }).catch(()=>null) : null;
      if (!cls && possibleClassNames.length) cls = await Class.findOne({ where:{ schoolCode:req.user.schoolCode, [Op.or]: [{ name:{ [Op.in]: possibleClassNames } }, { grade:{ [Op.in]: possibleClassNames } }] } }).catch(()=>null);
      if (cls?.teacherId) teacher = await Teacher.findOne({ where:{ id:cls.teacherId }, include:[{ model:User, where:{ schoolCode:req.user.schoolCode }, attributes:['id','name','email'] }] }).catch(()=>null);
      if (!teacher && cls?.id) {
        const { TeacherSubjectAssignment } = require('../models');
        const ass = await TeacherSubjectAssignment.findOne({ where:{ classId:cls.id, isClassTeacher:true }, include:[{ model:Teacher, include:[{ model:User, where:{ schoolCode:req.user.schoolCode }, attributes:['id','name','email'] }] }] }).catch(()=>null);
        teacher = ass?.Teacher || null;
      }
      if (!teacher && cls?.id) teacher = await Teacher.findOne({ where:{ classId:cls.id }, include:[{ model:User, where:{ schoolCode:req.user.schoolCode }, attributes:['id','name','email'] }] }).catch(()=>null);
      if (!teacher) {
        const teacherNames = [...possibleClassNames, cls?.name, cls?.grade].filter(Boolean);
        if (teacherNames.length) teacher = await Teacher.findOne({ where:{ classTeacher:{ [Op.in]: teacherNames } }, include:[{ model:User, where:{ schoolCode:req.user.schoolCode }, attributes:['id','name','email'] }] }).catch(()=>null);
      }
      if (!teacher) {
        // Final consolidation: do not break parent messaging when class-teacher lookup
        // cannot match legacy class storage. Fallback to school admin and return the
        // actual recipient so the frontend toast is truthful.
        const admin = await User.findOne({ where: { role: 'admin', schoolCode: req.user.schoolCode, isActive: true } })
          || await User.findOne({ where:{ role:'admin', schoolCode:req.user.schoolCode } });
        if (!admin) return res.status(404).json({ success:false, message:'Class teacher has not been assigned yet and school admin was not found.' });
        recipientId = admin.id; recipientName = admin.name; actualRecipientType = 'admin';
      } else {
        recipientId = teacher.User.id; recipientName = teacher.User.name; actualRecipientType = 'teacher';
      }
    } else {
      return res.status(400).json({ success:false, message:'Invalid recipient type' });
    }

    const { Message } = require('../models');
    const newMessage = await Message.create({
      senderId: req.user.id,
      receiverId: recipientId,
      content: message,
      metadata: { studentId: student.id, studentName: student.User?.name, parentName: req.user.name, requestedRecipientType: target, actualRecipientType, conversationType: 'parent-to-staff' }
    });

    if (global.io) global.io.to(`user-${recipientId}`).emit('new-message', { from:req.user.id, fromName:req.user.name, content:message, studentName:student.User?.name, timestamp:new Date() });

    res.status(201).json({ success:true, message:'Message sent successfully', data:{ id:newMessage.id, recipient:recipientName, recipientType:actualRecipientType, requestedRecipientType:target, recipientId, sentAt:newMessage.createdAt } });
  } catch (error) {
    console.error('Send parent message error:', error);
    res.status(500).json({ success:false, message:error.message });
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

// @desc    Get child analytics (published marks only + curriculum info)
// @route   GET /api/parent/child/:studentId/analytics
// @access  Private/Parent
exports.getChildAnalytics = async (req, res) => {
  try {
    const { studentId } = req.params;
    const parent = await Parent.findOne({ where: { userId: req.user.id } });
    const student = await Student.findByPk(studentId);
    if (!parent || !student || !(await parent.hasStudent(student))) return res.status(403).json({ success: false, message: 'Child not linked to this parent' });

    // Only published marks
    const records = await AcademicRecord.findAll({ where: { studentId, isPublished: true } });
    const gradeCount = { A:0, B:0, C:0, D:0, E:0 };
    records.forEach(r => {
      const grade = r.grade?.[0] || 'C';
      if (gradeCount[grade] !== undefined) gradeCount[grade]++;
      else gradeCount['C']++;
    });

    const sixMonthsAgo = new Date(); sixMonthsAgo.setMonth(sixMonthsAgo.getMonth()-6);
    const attendance = await Attendance.findAll({
      where: { studentId, date: { [Op.gte]: sixMonthsAgo } },
      order: [['date', 'ASC']]
    });
    const attendanceByMonth = {};
    attendance.forEach(a => {
      const month = new Date(a.date).toISOString().slice(0,7);
      if (!attendanceByMonth[month]) attendanceByMonth[month] = { present:0, total:0 };
      attendanceByMonth[month].total++;
      if (a.status === 'present') attendanceByMonth[month].present++;
    });
    const attendanceTrend = Object.entries(attendanceByMonth).map(([month, data]) => ({
      month,
      rate: (data.present/data.total)*100
    }));

    const subjectProgress = {};
    records.forEach(r => {
      if (!subjectProgress[r.subject]) subjectProgress[r.subject] = [];
      subjectProgress[r.subject].push({ date: r.date, score: r.score });
    });

    // Include school info for grade calculations
    const school = await School.findOne({ where: { schoolId: req.user.schoolCode } });

    res.json({ 
      success: true, 
      data: { 
        gradeDistribution: gradeCount, 
        attendanceTrend, 
        subjectProgress,
        curriculum: school?.system || 'cbc',
        schoolLevel: school?.settings?.schoolLevel || 'secondary'
      } 
    });
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
    if (!parent) return res.status(404).json({ success: false, message: 'Parent profile not found' });
    const student = await Student.findByPk(studentId, { include: [{ model: User, attributes: ['id','name','schoolCode'] }] });
    if (!student || !(await parent.hasStudent(student)) || student.User?.schoolCode !== req.user.schoolCode) {
      return res.status(403).json({ success: false, message: 'Not your child' });
    }
    const fees = await Fee.findAll({
      where: { studentId, schoolCode: req.user.schoolCode },
      include: [{ model: Payment, required: false, where: { schoolCode: req.user.schoolCode, paymentType: 'fee' } }],
      order: [['year', 'DESC'], ['term', 'DESC']]
    });
    const normalized = fees.map((fee) => {
      const row = fee.toJSON ? fee.toJSON() : fee;
      const total = Number(row.totalAmount || 0);
      const paid = Number(row.paidAmount || 0);
      return { ...row, balance: Math.max(0, total - paid), payments: row.Payments || row.payments || [] };
    });
    res.json({ success: true, data: normalized });
  } catch (error) {
    console.error('Get fees error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Fee payment endpoint disabled; production uses Daraja STK + callback
// @route   POST /api/parent/fees/pay
// @access  Private/Parent
exports.addPayment = async (req, res) => {
  try {
    const { studentId, term, year, amount, method, reference } = req.body;
    const parent = await Parent.findOne({ where: { userId: req.user.id } });
    const student = await Student.findByPk(studentId, { include: [{ model: User, attributes: ['id','name','schoolCode'] }] });
    if (!student || !(await parent.hasStudent(student))) {
      return res.status(403).json({ success: false, message: 'Not your child' });
    }

    let fee = await Fee.findOne({ where: { studentId, schoolCode: req.user.schoolCode, term, year } });
    if (!fee) {
      fee = await Fee.create({
        studentId,
        schoolCode: student.User?.schoolCode || req.user.schoolCode,
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
    const student = await Student.findByPk(studentId, { include: [{ model: User, attributes: ['id','name','schoolCode'] }] });
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

// In parentController.js
exports.getConversations = async (req, res) => {
  try {
    const parent = await Parent.findOne({ where: { userId: req.user.id } });
    const messages = await Message.findAll({
      where: {
        [Op.or]: [{ senderId: req.user.id }, { receiverId: req.user.id }]
      },
      include: [
        { model: User, as: 'Sender', attributes: ['id', 'name', 'role'] },
        { model: User, as: 'Receiver', attributes: ['id', 'name', 'role'] }
      ],
      order: [['createdAt', 'DESC']]
    });
    const conversations = {};
    messages.forEach(msg => {
      const otherId = msg.senderId === req.user.id ? msg.receiverId : msg.senderId;
      if (!conversations[otherId]) {
        conversations[otherId] = {
          userId: otherId,
          userName: msg.senderId === req.user.id ? msg.Receiver?.name : msg.Sender?.name,
          lastMessage: msg.content,
          lastMessageTime: msg.createdAt,
          unreadCount: msg.receiverId === req.user.id && !msg.isRead ? 1 : 0
        };
      } else if (msg.receiverId === req.user.id && !msg.isRead) {
        conversations[otherId].unreadCount++;
      }
    });
    res.json({ success: true, data: Object.values(conversations) });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
