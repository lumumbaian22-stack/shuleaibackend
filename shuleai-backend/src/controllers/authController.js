const { User, Student, Teacher, Parent, Admin, School } = require('../models');
const { createAlert } = require('../services/notificationService');
const { Op } = require('sequelize');
const jwt = require('jsonwebtoken');

const authController = {
  register: async (req, res) => {
    try {
      console.log('📝 Register attempt:', { body: req.body });
      
      const { name, email, password, role, phone, schoolCode, grade, elimuid } = req.body;

      const school = await School.findOne({ where: { code: schoolCode } });
      if (!school) {
        console.log('❌ School not found:', schoolCode);
        return res.status(404).json({ success: false, message: 'School not found' });
      }

      const existing = await User.findOne({ where: { email } });
      if (existing) {
        console.log('❌ Email already exists:', email);
        return res.status(400).json({ success: false, message: 'Email already in use' });
      }

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

  login: async (req, res) => {
    console.log('🔐 LOGIN REQUEST:', req.body);
    
    try {
      const { email, elimuid, password, role } = req.body;

      if (!password) {
        return res.status(400).json({ 
          success: false, 
          message: 'Password is required' 
        });
      }

      if (!role) {
        return res.status(400).json({ 
          success: false, 
          message: 'Role is required' 
        });
      }

      if (!process.env.JWT_SECRET) {
        console.error('❌ JWT_SECRET is not set');
        return res.status(500).json({ 
          success: false, 
          message: 'Server configuration error' 
        });
      }

      // SUPER ADMIN - bypass database
      if (role === 'super_admin') {
        console.log('👑 Super admin login attempt');
        
        if (password === process.env.SUPER_ADMIN_KEY) {
          console.log('✅ Super admin key valid');
          
          const superAdmin = {
            id: 'super_admin',
            name: 'Super Admin',
            email: 'super@shuleai.com',
            role: 'super_admin',
            schoolCode: 'GLOBAL',
            isActive: true,
            getPublicProfile: function() {
              return {
                id: this.id,
                name: this.name,
                email: this.email,
                role: this.role,
                schoolCode: this.schoolCode,
                isActive: this.isActive
              };
            }
          };
          
          const token = jwt.sign(
            { id: 'super_admin', role: 'super_admin', schoolCode: 'GLOBAL' },
            process.env.JWT_SECRET,
            { expiresIn: process.env.JWT_EXPIRE || '30d' }
          );
          
          return res.json({
            success: true,
            data: { 
              token, 
              user: superAdmin.getPublicProfile(),
              profile: null,
              school: { name: 'Platform', code: 'GLOBAL', system: 'all' }
            }
          });
        } else {
          console.log('❌ Invalid super admin key');
          return res.status(401).json({
            success: false,
            message: 'Invalid super admin credentials'
          });
        }
      }

      // Regular user login (simplified for demo)
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });

    } catch (error) {
      console.error('❌ Login error:', error);
      res.status(500).json({ 
        success: false, 
        message: 'Internal server error'
      });
    }
  },

  getMe: async (req, res) => {
    try {
      const user = req.user;
      res.json({
        success: true,
        data: { user: user.getPublicProfile() }
      });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  },

  logout: (req, res) => {
    res.cookie('token', 'none', { 
      expires: new Date(Date.now() + 10 * 1000), 
      httpOnly: true 
    });
    res.json({ success: true, message: 'Logged out' });
  },

  changePassword: async (req, res) => {
    try {
      const { currentPassword, newPassword } = req.body;
      const user = await User.findByPk(req.user.id, { 
        attributes: { include: ['password'] } 
      });

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
  }
};

console.log('✅ authController loaded');
module.exports = authController;
