const { User, Student, Teacher, Parent, Admin, School } = require('../models');
const { createAlert } = require('../services/notificationService');
const { Op } = require('sequelize');

const authController = {
  // Register a new user
  register: async (req, res) => {
    try {
      console.log('📝 Register attempt:', { body: req.body });
      
      const { name, email, password, role, phone, schoolCode, grade, elimuid } = req.body;

      // Check school exists
      const school = await School.findOne({ where: { code: schoolCode } });
      if (!school) {
        console.log('❌ School not found:', schoolCode);
        return res.status(404).json({ success: false, message: 'School not found' });
      }

      // Check if user already exists
      const existing = await User.findOne({ where: { email } });
      if (existing) {
        console.log('❌ Email already exists:', email);
        return res.status(400).json({ success: false, message: 'Email already in use' });
      }

      // Create user
      const user = await User.create({ name, email, password, role, phone, schoolCode });
      console.log('✅ User created:', user.id);

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
      console.error('❌ Register error:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  },

  // Login user
  login: async (req, res) => {
    console.log('🔐 LOGIN FUNCTION EXECUTING');
    console.log('Request body:', JSON.stringify(req.body, null, 2));
    
    try {
      const { email, elimuid, password, role } = req.body;
      console.log('Parsed credentials:', { email, elimuid, role, hasPassword: !!password });

      // Validate required fields
      if (!password) {
        console.log('❌ Password missing');
        return res.status(400).json({ success: false, message: 'Password is required' });
      }

      if (!role) {
        console.log('❌ Role missing');
        return res.status(400).json({ success: false, message: 'Role is required' });
      }

      let user;
      if (role === 'student' && elimuid) {
        console.log('🔍 Looking up student by elimuid:', elimuid);
        const student = await Student.findOne({ 
          where: { elimuid }, 
          include: [{ model: User }] 
        });
        user = student?.User;
        console.log('Student lookup result:', user ? 'Found' : 'Not found');
      } else {
        console.log('🔍 Looking up user by email:', email, 'and role:', role);
        user = await User.findOne({ where: { email, role } });
        console.log('User lookup result:', user ? 'Found' : 'Not found');
      }

      if (!user) {
        console.log('❌ User not found');
        return res.status(401).json({ success: false, message: 'Invalid credentials' });
      }

      console.log('✅ User found, checking password');
      const isValidPassword = await user.comparePassword(password);
      console.log('Password valid:', isValidPassword);

      if (!isValidPassword) {
        console.log('❌ Invalid password');
        return res.status(401).json({ success: false, message: 'Invalid credentials' });
      }

      if (!user.isActive) {
        console.log('❌ Account inactive');
        return res.status(403).json({ success: false, message: 'Account is deactivated' });
      }

      // Update last login
      user.lastLogin = new Date();
      await user.save();
      console.log('✅ Last login updated');

      const token = user.generateAuthToken();
      console.log('✅ JWT token generated');

      // Get role-specific profile
      let profile = null;
      if (role === 'teacher') {
        profile = await Teacher.findOne({ where: { userId: user.id } });
      } else if (role === 'student') {
        profile = await Student.findOne({ where: { userId: user.id } });
      } else if (role === 'parent') {
        profile = await Parent.findOne({ where: { userId: user.id } });
      } else if (role === 'admin') {
        profile = await Admin.findOne({ where: { userId: user.id } });
      }

      const school = await School.findOne({ where: { code: user.schoolCode } });

      console.log('✅ Login successful for user:', user.id);

      res.json({
        success: true,
        data: { 
          token, 
          user: user.getPublicProfile(), 
          profile, 
          school: school ? {
            name: school.name,
            code: school.code,
            system: school.system
          } : null
        }
      });
    } catch (error) {
      console.error('❌ LOGIN CATCH BLOCK:', error);
      console.error('Error stack:', error.stack);
      res.status(500).json({ 
        success: false, 
        message: 'Internal server error',
        error: error.message,
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
      });
    }
  },

  // Get current user
  getMe: async (req, res) => {
    try {
      console.log('👤 GetMe for user:', req.user.id);
      const user = req.user;
      
      let profile = null;
      if (user.role === 'teacher') {
        profile = await Teacher.findOne({ where: { userId: user.id } });
      } else if (user.role === 'student') {
        profile = await Student.findOne({ where: { userId: user.id } });
      } else if (user.role === 'parent') {
        profile = await Parent.findOne({ where: { userId: user.id } });
      } else if (user.role === 'admin') {
        profile = await Admin.findOne({ where: { userId: user.id } });
      }

      const school = await School.findOne({ where: { code: user.schoolCode } });

      res.json({
        success: true,
        data: { user: user.getPublicProfile(), profile, school }
      });
    } catch (error) {
      console.error('❌ GetMe error:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  },

  // Logout
  logout: (req, res) => {
    console.log('🚪 Logout for user:', req.user?.id);
    res.cookie('token', 'none', { 
      expires: new Date(Date.now() + 10 * 1000), 
      httpOnly: true 
    });
    res.json({ success: true, message: 'Logged out' });
  },

  // Change password
  changePassword: async (req, res) => {
    try {
      console.log('🔑 Password change for user:', req.user.id);
      const { currentPassword, newPassword } = req.body;
      const user = await User.findByPk(req.user.id, { 
        attributes: { include: ['password'] } 
      });

      if (!(await user.comparePassword(currentPassword))) {
        console.log('❌ Current password incorrect');
        return res.status(401).json({ success: false, message: 'Current password is incorrect' });
      }

      user.password = newPassword;
      await user.save();
      console.log('✅ Password updated');

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
      console.error('❌ Change password error:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  }
};

console.log('✅ authController loaded, exports:', Object.keys(authController));
module.exports = authController;
