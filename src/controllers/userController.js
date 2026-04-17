// src/controllers/userController.js
const { User, Student, Teacher, Parent, AcademicRecord, Attendance, Alert } = require('../models');
const { Op } = require('sequelize');
const { createAlert } = require('../services/notificationService');
const path = require('path');

// @desc    Get user statistics for profile
// @route   GET /api/user/stats
// @access  Private
exports.getUserStats = async (req, res) => {
  try {
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
      
      // Get students count
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
      
      // Get academic stats
      const records = await AcademicRecord.findAll({
        where: { studentId: student.id },
        order: [['date', 'DESC']]
      });
      const avg = records.length ? records.reduce((a,b) => a + b.score, 0) / records.length : 0;
      stats.averageScore = Math.round(avg);
      stats.totalAssessments = records.length;
      
      // Get attendance stats
      const attendance = await Attendance.findAll({
        where: { studentId: student.id }
      });
      const present = attendance.filter(a => a.status === 'present').length;
      stats.attendanceRate = attendance.length ? Math.round((present / attendance.length) * 100) : 0;
      
    } else if (user.role === 'parent') {
      const parent = await Parent.findOne({ where: { userId: user.id } });
      const children = await parent.getStudents({ 
        include: [{ model: User, attributes: ['name'] }]
      });
      stats.childrenCount = children.length;
      stats.children = children.map(c => ({
        id: c.id,
        name: c.User?.name,
        grade: c.grade,
        elimuid: c.elimuid
      }));
    }
    
    res.json({ success: true, data: stats });
  } catch (error) {
    console.error('Get user stats error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Update user profile
// @route   PUT /api/user/profile
// @access  Private
exports.updateProfile = async (req, res) => {
  try {
    const { name, email, phone } = req.body;
    
    // Check if email is already taken by another user
    if (email && email !== req.user.email) {
      const existing = await User.findOne({ where: { email, id: { [Op.ne]: req.user.id } } });
      if (existing) {
        return res.status(400).json({ success: false, message: 'Email already in use' });
      }
    }
    
    await req.user.update({ name, email, phone });
    
    // Create alert for profile update
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
// @route   GET /api/user/preferences
// @access  Private
exports.getPreferences = async (req, res) => {
  try {
    res.json({ success: true, data: req.user.preferences || {
      notifications: { email: true, sms: false, push: true },
      theme: 'light'
    } });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Update user preferences
// @route   PUT /api/user/preferences
// @access  Private
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
// @route   GET /api/user/export
// @access  Private
exports.exportMyData = async (req, res) => {
  try {
    const user = req.user;
    let exportData = {
      user: user.getPublicProfile(),
      createdAt: user.createdAt,
      lastLogin: user.lastLogin,
      preferences: user.preferences
    };
    
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
// @route   POST /api/user/deactivate
// @access  Private
exports.deactivateAccount = async (req, res) => {
  try {
    const { reason } = req.body;
    
    req.user.isActive = false;
    await req.user.save();
    
    // Notify admins
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

// @desc    Upload profile picture
// @route   POST /api/user/profile-picture
// @access  Private
exports.uploadProfilePicture = async (req, res) => {
  try {
    // Check for file using either 'picture' or 'image' field
    const file = req.files?.picture || req.files?.image;
    if (!file) {
      return res.status(400).json({ success: false, message: 'No image uploaded' });
    }

    const fileName = `profile_${req.user.id}_${Date.now()}.jpg`;
    const uploadDir = path.join(__dirname, '../uploads/profiles/');
    
    // Ensure directory exists
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    
    const uploadPath = path.join(uploadDir, fileName);
    await file.mv(uploadPath);
    
    const profileImageUrl = `/uploads/profiles/${fileName}`;
    await req.user.update({ profileImage: profileImageUrl });
    
    res.json({ success: true, data: { profileImage: profileImageUrl } });
  } catch (error) {
    console.error('Profile upload error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Get user alerts
// @route   GET /api/user/alerts
exports.getAlerts = async (req, res) => {
  try {
    const alerts = await Alert.findAll({
      where: { userId: req.user.id },
      order: [['createdAt', 'DESC']],
      limit: 50
    });
    res.json({ success: true, data: alerts });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
