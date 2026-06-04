// src/controllers/userController.js
const { User, Student, Teacher, Parent, AcademicRecord, Attendance, Alert } = require('../models');
const { Op } = require('sequelize');
const { createAlert } = require('../services/notificationService');
const path = require('path');
const fs = require('fs');
const { ensureRuntimeSchema } = require('../utils/schemaSafety');
const { getAlertsForUser } = require('../services/alertReceiverEngine');

// @desc    Get user statistics for profile
exports.getUserStats = async (req, res) => {
  try {
    await ensureRuntimeSchema().catch(() => null);
    const user = req.user;
    let stats = {
      memberSince: user.createdAt,
      lastLogin: user.lastLogin,
      isActive: user.isActive,
      role: user.role,
      name: user.name,
      email: user.email,
      phone: user.phone
    };
    
    if (user.role === 'teacher') {
      const teacher = await Teacher.findOne({ where: { userId: user.id } });
      stats.classTeacher = teacher?.classTeacher;
      stats.subjects = teacher?.subjects;
      stats.employeeId = teacher?.employeeId;
      stats.department = teacher?.department;
      stats.reliabilityScore = teacher?.statistics?.reliabilityScore || 100;
      stats.dutiesCompleted = teacher?.statistics?.dutiesCompleted || 0;
      
      let studentCount = 0;
      if (teacher.classTeacher) {
        studentCount = await Student.count({ where: { grade: teacher.classTeacher } });
      }
      stats.studentCount = studentCount;
      
    } else if (user.role === 'student') {
      const student = await Student.findOne({ where: { userId: user.id } });
      stats.grade = student?.grade;
      stats.elimuid = student?.elimuid;
      stats.enrollmentDate = student?.enrollmentDate;
      stats.gender = student?.gender;
      stats.dateOfBirth = student?.dateOfBirth;
      
      const records = await AcademicRecord.findAll({ where: { studentId: student.id }, order: [['date', 'DESC']] });
      const avg = records.length ? records.reduce((a,b) => a + b.score, 0) / records.length : 0;
      stats.averageScore = Math.round(avg);
      stats.totalAssessments = records.length;
      
      const attendance = await Attendance.findAll({ where: { studentId: student.id } });
      const present = attendance.filter(a => a.status === 'present').length;
      stats.attendanceRate = attendance.length ? Math.round((present / attendance.length) * 100) : 0;
      
    } else if (user.role === 'parent') {
      const parent = await Parent.findOne({ where: { userId: user.id } });
      const children = await parent.getStudents({ include: [{ model: User, attributes: ['name'] }] });
      stats.childrenCount = children.length;
      stats.children = children.map(c => ({ id: c.id, name: c.User?.name, grade: c.grade, elimuid: c.elimuid }));
    }
    
    res.json({ success: true, data: stats });
  } catch (error) {
    console.error('Get user stats error:', error);
    const message = String(error?.original?.message || error?.message || error);
    if (message.includes('classId') || message.includes('schoolCode') || message.includes('column')) {
      await ensureRuntimeSchema().catch(() => null);
      return res.json({ success: true, data: { role: req.user.role, name: req.user.name, email: req.user.email, repaired: true } });
    }
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Update user profile
exports.updateProfile = async (req, res) => {
  try {
    const { name, email, phone } = req.body;
    
    if (email && email !== req.user.email) {
      const existing = await User.findOne({ where: { email, id: { [Op.ne]: req.user.id } } });
      if (existing) return res.status(400).json({ success: false, message: 'Email already in use' });
    }
    
    await req.user.update({ name, email, phone });
    
    await createAlert({
      userId: req.user.id,
      role: req.user.role,
      type: 'system',
      severity: 'info',
      title: 'Profile Updated',
      message: 'Your profile information has been updated successfully.'
    });
    
    res.json({ success: true, data: req.user.getPublicProfile() });
  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Get user preferences
exports.getPreferences = async (req, res) => {
  try {
    res.json({ success: true, data: req.user.preferences || { notifications: { email: true, sms: false, push: true }, theme: 'light' } });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Update user preferences
exports.updatePreferences = async (req, res) => {
  try {
    req.user.preferences = { ...req.user.preferences, ...req.body.preferences };
    await req.user.save();
    res.json({ success: true, data: req.user.preferences });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Export user data
exports.exportMyData = async (req, res) => {
  try {
    const user = req.user;
    let exportData = { user: user.getPublicProfile(), createdAt: user.createdAt, lastLogin: user.lastLogin, preferences: user.preferences };
    
    if (user.role === 'teacher') {
      const teacher = await Teacher.findOne({ where: { userId: user.id } });
      exportData.teacher = teacher;
    } else if (user.role === 'student') {
      const student = await Student.findOne({ where: { userId: user.id } });
      const records = await AcademicRecord.findAll({ where: { studentId: student.id } });
      const attendance = await Attendance.findAll({ where: { studentId: student.id } });
      exportData.student = student;
      exportData.academicRecords = records;
      exportData.attendance = attendance;
    } else if (user.role === 'parent') {
      const parent = await Parent.findOne({ where: { userId: user.id } });
      const children = await parent.getStudents();
      exportData.parent = parent;
      exportData.children = children;
    }
    
    res.json({ success: true, data: exportData });
  } catch (error) {
    console.error('Export data error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Deactivate account
exports.deactivateAccount = async (req, res) => {
  try {
    const { reason } = req.body;
    req.user.isActive = false;
    await req.user.save();
    
    const admins = await User.findAll({ where: { role: 'admin', schoolCode: req.user.schoolCode } });
    for (const admin of admins) {
      await createAlert({
        userId: admin.id,
        role: 'admin',
        type: 'system',
        severity: 'info',
        title: 'User Account Deactivated',
        message: `${req.user.name} (${req.user.role}) has deactivated their account. Reason: ${reason || 'Not specified'}`,
        data: { userId: req.user.id }
      });
    }
    
    res.json({ success: true, message: 'Account deactivated successfully' });
  } catch (error) {
    console.error('Deactivate account error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Upload profile picture (FIXED)
exports.uploadProfilePicture = async (req, res) => {
  try {
    const file = req.files?.picture || req.files?.image || req.file;
    if (!file) {
      return res.status(400).json({ success: false, message: 'No image uploaded. Expected form field: picture' });
    }

    const originalName = file.name || file.originalname || 'profile.jpg';
    const ext = path.extname(originalName) || '.jpg';
    const fileName = `profile_${req.user.id}_${Date.now()}${ext}`;
    const uploadDir = path.join(__dirname, '../../uploads/profiles');

    if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

    const uploadPath = path.join(uploadDir, fileName);

    if (file.mv) await file.mv(uploadPath);
    else if (file.tempFilePath) await fs.promises.copyFile(file.tempFilePath, uploadPath);
    else if (file.path) await fs.promises.copyFile(file.path, uploadPath);
    else if (file.buffer) await fs.promises.writeFile(uploadPath, file.buffer);
    else return res.status(400).json({ success: false, message: 'Unsupported upload object from server middleware' });

    const relativeUrl = `/uploads/profiles/${fileName}`;
    const absoluteUrl = `${req.protocol}://${req.get('host')}${relativeUrl}`;
    let durableProfileImageDataUrl = null;
    try {
      const imageBuffer = await fs.promises.readFile(uploadPath);
      const mime = file.mimetype || file.type || 'image/jpeg';
      if (imageBuffer.length <= 1024 * 1024) durableProfileImageDataUrl = `data:${mime};base64,${imageBuffer.toString('base64')}`;
    } catch (_) {}
    const preferences = { ...(req.user.preferences || {}) };
    if (durableProfileImageDataUrl) preferences.profileImageDataUrl = durableProfileImageDataUrl;

    await req.user.update({ profileImage: durableProfileImageDataUrl || absoluteUrl, preferences });

    res.json({ success: true, data: { profileImage: durableProfileImageDataUrl || absoluteUrl, profileImagePath: relativeUrl, durable: !!durableProfileImageDataUrl } });
  } catch (error) {
    console.error('Profile upload error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Get user alerts
exports.getAlerts = async (req, res) => {
  try {
    const alerts = await getAlertsForUser(req.user, {
      studentId: req.query.studentId || req.query.childId || null,
      limit: Number(req.query.limit || 50)
    });
    res.json({ success: true, data: alerts });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.uploadSignature = async (req, res) => {
    try {
        if (!req.files || !req.files.signature) {
            return res.status(400).json({ success: false, message: 'No signature file uploaded' });
        }
        const file = req.files.signature;
        const originalName = file.name || 'signature.png';
        const ext = path.extname(originalName) || '.png';
        const mime = file.mimetype || file.type || 'image/png';
        const safeMime = /^image\/(png|jpe?g|webp|gif)$/i.test(mime) ? mime : 'image/png';
        const fileName = `sig_${req.user.id}_${Date.now()}${ext}`;
        const uploadDir = path.join(__dirname, '../../uploads/signatures/');
        if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
        const uploadPath = path.join(uploadDir, fileName);
        if (file.mv) await file.mv(uploadPath);
        else if (file.tempFilePath) await fs.promises.copyFile(file.tempFilePath, uploadPath);
        else if (file.buffer) await fs.promises.writeFile(uploadPath, file.buffer);
        else return res.status(400).json({ success: false, message: 'Unsupported signature upload object' });

        const relativeUrl = `/uploads/signatures/${fileName}`;
        let signatureDataUrl = null;
        try {
          const buffer = await fs.promises.readFile(uploadPath);
          // Signatures are usually small. Keep a DB-backed copy so Render restarts/redeploys do not erase them.
          if (buffer.length <= 1024 * 1024) signatureDataUrl = `data:${safeMime};base64,${buffer.toString('base64')}`;
        } catch (_) {}

        const durableSignature = signatureDataUrl || relativeUrl;
        const preferences = {
          ...(req.user.preferences || {}),
          signatureUrl: durableSignature,
          signatureDataUrl: signatureDataUrl || (req.user.preferences || {}).signatureDataUrl || null,
          signatureFileUrl: relativeUrl,
          signatureUpdatedAt: new Date().toISOString()
        };
        await req.user.update({ preferences });
        if (req.user.role === 'teacher') {
            await Teacher.update({ signature: durableSignature, signatureUrl: durableSignature }, { where: { userId: req.user.id } }).catch(() => null);
        }
        if (req.user.role === 'admin') {
            await Admin.update({ signature: durableSignature, signatureUrl: durableSignature }, { where: { userId: req.user.id } }).catch(() => null);
        }
        res.json({ success: true, data: { signatureUrl: durableSignature, signature: durableSignature, signatureFileUrl: relativeUrl, durable: !!signatureDataUrl } });
    } catch (error) {
        console.error('Signature upload error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
};
