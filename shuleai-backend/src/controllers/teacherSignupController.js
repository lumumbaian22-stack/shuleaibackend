const { User, Teacher, School, ApprovalRequest, Alert } = require('../models');
const QRCode = require('qrcode');
const { Op } = require('sequelize');

exports.teacherSignup = async (req, res) => {
  try {
    const { name, email, password, phone, schoolId, qualification, subjects, classTeacher } = req.body;

    const school = await School.findOne({ 
      where: {
        [Op.or]: [
          { schoolId },
          { lookupCodes: { [Op.contains]: [schoolId] } },
          { qrCode: schoolId }
        ]
      }
    });
    if (!school) {
      return res.status(404).json({ success: false, message: 'Invalid school ID' });
    }

    if (!school.settings.allowTeacherSignup) {
      return res.status(403).json({ success: false, message: 'School not accepting signups' });
    }

    const existing = await User.findOne({ where: { email } });
    if (existing) {
      return res.status(400).json({ success: false, message: 'Email already exists' });
    }

    const emailDomain = email.split('@')[1];
    const autoApprove = school.settings.autoApproveDomains.includes(emailDomain);

    const user = await User.create({
      name, email, password, role: 'teacher', phone,
      schoolCode: school.code,
      isActive: autoApprove
    });

    const teacher = await Teacher.create({
      userId: user.id,
      subjects: subjects || [],
      classTeacher: classTeacher || null,
      qualification,
      approvalStatus: autoApprove ? 'approved' : 'pending',
      approvedAt: autoApprove ? new Date() : null
    });

    if (!autoApprove) {
      await ApprovalRequest.create({
        schoolId: school.schoolId,
        userId: user.id,
        role: 'teacher',
        data: { name, email, phone, qualification, subjects, classTeacher },
        metadata: { ipAddress: req.ip, userAgent: req.headers['user-agent'] }
      });

      school.stats.pendingApprovals++;
      await school.save();

      // Notify admins (internal alerts)
      const admins = await User.findAll({ where: { role: 'admin', schoolCode: school.code } });
      for (const admin of admins) {
        await Alert.create({
          userId: admin.id,
          role: 'admin',
          type: 'approval',
          severity: 'info',
          title: 'New Teacher Signup',
          message: `${name} requested to join.`,
          data: { teacherId: teacher.id }
        });
      }
    }

    const qrData = { teacherId: teacher.id, name, school: school.name };
    const qrCode = await QRCode.toDataURL(JSON.stringify(qrData));

    res.status(201).json({
      success: true,
      message: autoApprove ? 'Signup successful' : 'Pending approval',
      data: { userId: user.id, name, email, school: school.name, status: teacher.approvalStatus, qrCode }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.verifySchoolId = async (req, res) => {
  try {
    const { schoolId } = req.body;
    const school = await School.findOne({
      where: {
        [Op.or]: [
          { schoolId },
          { lookupCodes: { [Op.contains]: [schoolId] } },
          { qrCode: schoolId }
        ]
      }
    });
    if (!school) {
      return res.status(404).json({ success: false, message: 'Invalid school ID' });
    }
    res.json({
      success: true,
      data: {
        schoolName: school.name,
        schoolId: school.schoolId,
        requiresApproval: school.settings.requireApproval,
        autoApproveDomains: school.settings.autoApproveDomains
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.approveTeacher = async (req, res) => {
  try {
    const { teacherId } = req.params;
    const { action, rejectionReason } = req.body;

    const teacher = await Teacher.findByPk(teacherId, { include: [{ model: User }] });
    if (!teacher) return res.status(404).json({ success: false, message: 'Teacher not found' });

    const school = await School.findOne({ where: { code: teacher.User.schoolCode } });

    if (action === 'approve') {
      teacher.approvalStatus = 'approved';
      teacher.approvedBy = req.user.id;
      teacher.approvedAt = new Date();
      teacher.User.isActive = true;
      await teacher.User.save();

      school.stats.pendingApprovals--;
      school.stats.teachers++;
      await school.save();

      await ApprovalRequest.update(
        { status: 'approved', reviewedBy: req.user.id, reviewedAt: new Date() },
        { where: { userId: teacher.User.id } }
      );

      await Alert.create({
        userId: teacher.User.id,
        role: 'teacher',
        type: 'system',
        severity: 'success',
        title: 'Account Approved',
        message: `Your account has been approved.`
      });
    } else {
      teacher.approvalStatus = 'rejected';
      teacher.rejectionReason = rejectionReason;
      teacher.User.isActive = false;
      await teacher.User.save();

      school.stats.pendingApprovals--;
      await school.save();

      await ApprovalRequest.update(
        { status: 'rejected', reviewedBy: req.user.id, reviewedAt: new Date(), rejectionReason },
        { where: { userId: teacher.User.id } }
      );
    }
    await teacher.save();

    res.json({ success: true, message: `Teacher ${action}d` });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.getPendingApprovals = async (req, res) => {
  try {
    const school = await School.findOne({ where: { code: req.user.schoolCode } });
    const pending = await Teacher.findAll({
      where: { approvalStatus: 'pending' },
      include: [{ model: User, attributes: ['id','name','email','phone','createdAt'] }]
    });
    res.json({ success: true, data: { teachers: pending, total: pending.length } });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
