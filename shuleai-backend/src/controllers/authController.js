const { User, Student, Teacher, Parent, Admin, School } = require('../models');
const { createAlert } = require('../services/notificationService');

// @desc    Register a new user (admin, teacher, parent, student)
// @route   POST /api/auth/register
// @access  Public (but should be restricted in practice)
exports.register = async (req, res) => {
  try {
    const { name, email, password, role, phone, schoolCode, grade, elimuid } = req.body;

    // Check school exists
    const school = await School.findOne({ where: { code: schoolCode } });
    if (!school) return res.status(404).json({ success: false, message: 'School not found' });

    // Check if user already exists
    const existing = await User.findOne({ where: { email } });
    if (existing) return res.status(400).json({ success: false, message: 'Email already in use' });

    // Create user
    const user = await User.create({ name, email, password, role, phone, schoolCode });

    let profile;
    if (role === 'student') {
      profile = await Student.create({
        userId: user.id,
        elimuid: elimuid || null,
        grade: grade || 'Not Assigned'
      });
    } else if (role === 'teacher') {
      profile = await Teacher.create({ userId: user.id });
    } else if (role === 'parent') {
      profile = await Parent.create({ userId: user.id });
    } else if (role === 'admin') {
      profile = await Admin.create({ userId: user.id });
    }

    const token = user.generateAuthToken();

    await createAlert({
      userId: user.id,
      role,
      type: 'system',
      severity: 'success',
      title: 'Welcome to ShuleAI',
      message: 'Your account has been created.'
    });

    res.status(201).json({
      success: true,
      message: 'Registration successful',
      data: { token, user: user.getPublicProfile(), profile }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Login user
// @route   POST /api/auth/login
// @access  Public
exports.login = async (req, res) => {
  try {
    const { email, elimuid, password, role } = req.body;
    let user;
    if (role === 'student' && elimuid) {
      const student = await Student.findOne({ where: { elimuid }, include: [{ model: User }] });
      user = student?.User;
    } else {
      user = await User.findOne({ where: { email, role } });
    }

    if (!user || !(await user.comparePassword(password))) {
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }

    if (!user.isActive) {
      return res.status(403).json({ success: false, message: 'Account is deactivated' });
    }

    user.lastLogin = new Date();
    await user.save();

    const token = user.generateAuthToken();

    let profile = null;
    if (role === 'teacher') profile = await Teacher.findOne({ where: { userId: user.id } });
    else if (role === 'student') profile = await Student.findOne({ where: { userId: user.id } });
    else if (role === 'parent') profile = await Parent.findOne({ where: { userId: user.id } });
    else if (role === 'admin') profile = await Admin.findOne({ where: { userId: user.id } });

    const school = await School.findOne({ where: { code: user.schoolCode } });

    res.json({
      success: true,
      data: { token, user: user.getPublicProfile(), profile, school }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Get current user
// @route   GET /api/auth/me
// @access  Private
exports.getMe = async (req, res) => {
  try {
    const user = req.user;
    let profile = null;
    if (user.role === 'teacher') profile = await Teacher.findOne({ where: { userId: user.id } });
    else if (user.role === 'student') profile = await Student.findOne({ where: { userId: user.id } });
    else if (user.role === 'parent') profile = await Parent.findOne({ where: { userId: user.id } });
    else if (user.role === 'admin') profile = await Admin.findOne({ where: { userId: user.id } });

    const school = await School.findOne({ where: { code: user.schoolCode } });

    res.json({
      success: true,
      data: { user: user.getPublicProfile(), profile, school }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Logout (clear cookie)
// @route   POST /api/auth/logout
// @access  Private
exports.logout = (req, res) => {
  res.cookie('token', 'none', { expires: new Date(Date.now() + 10*1000), httpOnly: true });
  res.json({ success: true, message: 'Logged out' });
};

// @desc    Change password
// @route   POST /api/auth/change-password
// @access  Private
exports.changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const user = await User.findByPk(req.user.id, { attributes: { include: ['password'] } });

    if (!(await user.comparePassword(currentPassword))) {
      return res.status(401).json({ success: false, message: 'Current password is incorrect' });
    }

    user.password = newPassword;
    await user.save();

    await createAlert({
      userId: user.id,
      role: user.role,
      type: 'system',
      severity: 'info',
      title: 'Password Changed',
      message: 'Your password was successfully changed.'
    });

    res.json({ success: true, message: 'Password updated' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

console.log('✅ authController loaded, exports:', Object.keys(module.exports));
module.exports = authController;
// Forgot password and reset password are omitted because external email is removed.