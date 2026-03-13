const { User, Student, Teacher, Parent, Admin, School } = require('../models');
const { createAlert } = require('../services/notificationService');
const { Op } = require('sequelize');
const jwt = require('jsonwebtoken');
const sequelize = require('../config/database');

const authController = {
  // Diagnostic endpoint
  superAdminDiagnostic: async (req, res) => {
    try {
      const { email, password, secretKey } = req.body;
      
      // Check if user exists
      const user = await User.findOne({ where: { email, role: 'super_admin' } });
      
      // Get raw user data
      const rawUser = await sequelize.query(
        'SELECT id, email, role, password, "isActive", "schoolCode" FROM "Users" WHERE email = :email',
        { replacements: { email }, type: sequelize.QueryTypes.SELECT }
      );
      
      // Check environment variables
      const envSecret = process.env.SUPER_ADMIN_SECRET;
      
      res.json({
        diagnostics: {
          userExists: !!user,
          userInDatabase: rawUser.length > 0,
          rawUserData: rawUser[0] || null,
          passwordLength: rawUser[0]?.password?.length || 0,
          passwordFirstChars: rawUser[0]?.password?.substring(0, 10) || null,
          isActive: rawUser[0]?.isActive,
          schoolCode: rawUser[0]?.schoolCode,
          secretKeyInEnv: !!envSecret,
          envSecretLength: envSecret?.length,
          envSecretFirstChars: envSecret?.substring(0, 5) + '...',
          providedSecretLength: secretKey?.length,
          providedSecretFirstChars: secretKey?.substring(0, 5) + '...'
        }
      });
    } catch (error) {
      console.error('Diagnostic error:', error);
      res.status(500).json({ error: error.message, stack: error.stack });
    }
  },

  // Super Admin login (no signup)
  superAdminLogin: async (req, res) => {
    try {
      const { email, password, secretKey } = req.body;
      
      // Verify secret key matches env
      if (secretKey !== process.env.SUPER_ADMIN_SECRET) {
        return res.status(401).json({ success: false, message: 'Invalid secret key' });
      }

      const user = await User.findOne({ 
        where: { email, role: 'super_admin' } 
      });

      if (!user || !(await user.comparePassword(password))) {
        return res.status(401).json({ success: false, message: 'Invalid credentials' });
      }

      if (!user.isActive) {
        return res.status(403).json({ success: false, message: 'Account is deactivated' });
      }

      user.lastLogin = new Date();
      await user.save();

      const token = user.generateAuthToken();

      res.json({
        success: true,
        data: { token, user: user.getPublicProfile() }
      });
    } catch (error) {
      console.error('Super admin login error:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  },

  // Admin signup - creates pending school
  adminSignup: async (req, res) => {
    try {
      const { 
        name, email, password, phone, 
        schoolName, schoolLevel, curriculum, 
        address, contact 
      } = req.body;

      // Validate required fields
      if (!name || !email || !password || !schoolName) {
        return res.status(400).json({ 
          success: false, 
          message: 'Missing required fields' 
        });
      }

      // Check if email already exists
      const existing = await User.findOne({ where: { email } });
      if (existing) {
        return res.status(400).json({ 
          success: false, 
          message: 'Email already in use' 
        });
      }

      // Create school - let the model defaults handle schoolId and shortCode
      console.log('Creating school with name:', schoolName);
      const school = await School.create({
        name: schoolName,
        system: curriculum || 'cbc',
        address: address || {},
        contact: contact || { phone, email },
        status: 'pending',
        isActive: false,
        settings: {
          allowTeacherSignup: true,
          requireApproval: true,
          autoApproveDomains: [],
          schoolLevel: schoolLevel || 'secondary',
          dutyManagement: {
            enabled: true,
            reminderHours: 24,
            maxTeachersPerDay: 3,
            checkInWindow: 15
          }
        }
      });

      console.log('School created successfully:', {
        id: school.id,
        schoolId: school.schoolId,
        shortCode: school.shortCode
      });

      // Create admin user (inactive until school approved)
      const user = await User.create({
        name,
        email,
        password,
        role: 'admin',
        phone,
        schoolCode: school.schoolId,
        isActive: false // Admin inactive until school approved
      });

      // Create admin profile
      const admin = await Admin.create({
        userId: user.id,
        position: 'School Administrator',
        managedSchools: [school.id]
      });

      console.log('Admin created successfully with ID:', admin.adminId);

      // Notify super admins about new school registration
      const superAdmins = await User.findAll({ where: { role: 'super_admin' } });
      for (const sa of superAdmins) {
        await createAlert({
          userId: sa.id,
          role: 'super_admin',
          type: 'approval',
          severity: 'info',
          title: 'New School Registration',
          message: `${schoolName} (${school.shortCode}) pending approval`,
          data: { schoolId: school.id, adminId: user.id }
        });
      }

      res.status(201).json({
        success: true,
        message: 'Registration successful. School pending approval by super admin.',
        data: {
          schoolId: school.schoolId,
          shortCode: school.shortCode,
          qrCode: school.qrCode,
          status: school.status
        }
      });
    } catch (error) {
      console.error('Admin signup error details:', {
        message: error.message,
        stack: error.stack,
        name: error.name,
        errors: error.errors
      });
      
      res.status(500).json({ 
        success: false, 
        message: error.message || 'Registration failed. Please try again.'
      });
    }
  },

  // Teacher signup with school short code
  teacherSignup: async (req, res) => {
    try {
      const { name, email, password, phone, schoolCode, subjects, qualification } = req.body;

      // Find school by short code or schoolId
      const school = await School.findOne({
        where: {
          [Op.or]: [
            { shortCode: schoolCode },
            { schoolId: schoolCode }
          ]
        }
      });

      if (!school) {
        return res.status(404).json({ success: false, message: 'Invalid school code' });
      }

      // Check if school is active
      if (school.status !== 'active') {
        return res.status(403).json({ success: false, message: 'School is not yet approved' });
      }

      if (!school.settings.allowTeacherSignup) {
        return res.status(403).json({ success: false, message: 'School not accepting signups' });
      }

      const existing = await User.findOne({ where: { email } });
      if (existing) {
        return res.status(400).json({ success: false, message: 'Email already exists' });
      }

      // Check auto-approve domains
      const emailDomain = email.split('@')[1];
      const autoApprove = school.settings.autoApproveDomains?.includes(emailDomain);

      const user = await User.create({
        name, 
        email, 
        password, 
        role: 'teacher', 
        phone,
        schoolCode: school.schoolId,
        isActive: autoApprove // Auto-approved if domain matches
      });

      const teacher = await Teacher.create({
        userId: user.id,
        subjects: subjects || [],
        qualification,
        approvalStatus: autoApprove ? 'approved' : 'pending',
        approvedAt: autoApprove ? new Date() : null
      });

      if (!autoApprove) {
        // Update school stats
        school.stats.pendingApprovals = (school.stats.pendingApprovals || 0) + 1;
        await school.save();

        // Notify school admins
        const admins = await User.findAll({ 
          where: { role: 'admin', schoolCode: school.schoolId } 
        });
        
        for (const admin of admins) {
          await createAlert({
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

      res.status(201).json({
        success: true,
        message: autoApprove ? 'Signup successful' : 'Pending admin approval',
        data: { 
          status: teacher.approvalStatus,
          schoolName: school.name
        }
      });
    } catch (error) {
      console.error('Teacher signup error:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  },

  // Parent signup with student ELIMUID
  parentSignup: async (req, res) => {
    try {
      const { name, email, password, phone, studentElimuid } = req.body;

      // Find student by ELIMUID
      const student = await Student.findOne({ 
        where: { elimuid: studentElimuid },
        include: [{ model: User, attributes: ['schoolCode'] }]
      });

      if (!student) {
        return res.status(404).json({ success: false, message: 'Invalid student ELIMUID' });
      }

      const existing = await User.findOne({ where: { email } });
      if (existing) {
        return res.status(400).json({ success: false, message: 'Email already exists' });
      }

      // Check if school is active
      const school = await School.findOne({ 
        where: { schoolId: student.User.schoolCode } 
      });
      
      if (school.status !== 'active') {
        return res.status(403).json({ success: false, message: 'School is not active' });
      }

      const user = await User.create({
        name, 
        email, 
        password, 
        role: 'parent', 
        phone,
        schoolCode: student.User.schoolCode,
        isActive: true
      });

      const parent = await Parent.create({
        userId: user.id,
        relationship: 'guardian'
      });

      // Link parent to student
      await parent.addStudent(student);

      res.status(201).json({
        success: true,
        message: 'Parent account created successfully',
        data: { studentName: student.User?.name }
      });
    } catch (error) {
      console.error('Parent signup error:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  },

  // Student login with ELIMUID
  studentLogin: async (req, res) => {
    try {
      const { elimuid, password } = req.body;

      const student = await Student.findOne({ 
        where: { elimuid },
        include: [{ model: User }]
      });

      if (!student || !(await student.User.comparePassword(password))) {
        return res.status(401).json({ success: false, message: 'Invalid credentials' });
      }

      const user = student.User;

      if (!user.isActive) {
        return res.status(403).json({ success: false, message: 'Account is deactivated' });
      }

      // Check if school is active
      const school = await School.findOne({ where: { schoolId: user.schoolCode } });
      if (school.status !== 'active') {
        return res.status(403).json({ success: false, message: 'School is not active' });
      }

      user.lastLogin = new Date();
      await user.save();

      const token = user.generateAuthToken();

      res.json({
        success: true,
        data: { token, user: user.getPublicProfile(), student }
      });
    } catch (error) {
      console.error('Student login error:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  },

  // Regular login for admin/teacher/parent
  login: async (req, res) => {
    try {
      const { email, password, role } = req.body;

      const user = await User.findOne({ where: { email, role } });

      if (!user || !(await user.comparePassword(password))) {
        return res.status(401).json({ success: false, message: 'Invalid credentials' });
      }

      if (!user.isActive) {
        return res.status(403).json({ success: false, message: 'Account is deactivated' });
      }

      // Check school status for non-super-admin users
      if (user.role !== 'super_admin' && user.schoolCode) {
        const school = await School.findOne({ where: { schoolId: user.schoolCode } });
        if (!school || school.status !== 'active') {
          return res.status(403).json({ success: false, message: 'School is not active' });
        }
      }

      user.lastLogin = new Date();
      await user.save();

      const token = user.generateAuthToken();

      let profile = null;
      if (role === 'teacher') profile = await Teacher.findOne({ where: { userId: user.id } });
      else if (role === 'student') profile = await Student.findOne({ where: { userId: user.id } });
      else if (role === 'parent') profile = await Parent.findOne({ where: { userId: user.id } });
      else if (role === 'admin') profile = await Admin.findOne({ where: { userId: user.id } });

      const school = user.schoolCode ? await School.findOne({ where: { schoolId: user.schoolCode } }) : null;

      res.json({
        success: true,
        data: { token, user: user.getPublicProfile(), profile, school }
      });
    } catch (error) {
      console.error('Login error:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  },

  // Refresh token
  refreshToken: async (req, res) => {
    try {
      const { refreshToken } = req.body;
      
      if (!refreshToken) {
        return res.status(401).json({ success: false, message: 'Refresh token required' });
      }

      const decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET);
      const user = await User.findByPk(decoded.id);
      
      if (!user || !user.isActive) {
        return res.status(401).json({ success: false, message: 'Invalid refresh token' });
      }

      const newToken = user.generateAuthToken();
      
      res.json({ success: true, token: newToken });
    } catch (error) {
      console.error('Refresh token error:', error);
      res.status(401).json({ success: false, message: 'Invalid refresh token' });
    }
  },

  // Get current user
  getMe: async (req, res) => {
    try {
      const user = req.user;
      let profile = null;
      if (user.role === 'teacher') profile = await Teacher.findOne({ where: { userId: user.id } });
      else if (user.role === 'student') profile = await Student.findOne({ where: { userId: user.id } });
      else if (user.role === 'parent') profile = await Parent.findOne({ where: { userId: user.id } });
      else if (user.role === 'admin') profile = await Admin.findOne({ where: { userId: user.id } });

      const school = user.schoolCode ? await School.findOne({ where: { schoolId: user.schoolCode } }) : null;

      res.json({
        success: true,
        data: { user: user.getPublicProfile(), profile, school }
      });
    } catch (error) {
      console.error('Get me error:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  },

  // Logout
  logout: (req, res) => {
    res.cookie('token', 'none', { expires: new Date(Date.now() + 10*1000), httpOnly: true });
    res.json({ success: true, message: 'Logged out' });
  },

  // Verify school code (for teacher signup)
  verifySchoolCode: async (req, res) => {
    try {
      const { schoolCode } = req.body;
      
      const school = await School.findOne({
        where: {
          [Op.or]: [
            { shortCode: schoolCode },
            { schoolId: schoolCode }
          ]
        }
      });

      if (!school) {
        return res.status(404).json({ success: false, message: 'Invalid school code' });
      }

      if (school.status !== 'active') {
        return res.status(403).json({ 
          success: false, 
          message: 'School is pending approval. Please try again later.' 
        });
      }

      res.json({
        success: true,
        data: {
          schoolName: school.name,
          schoolId: school.schoolId,
          shortCode: school.shortCode,
          requiresApproval: school.settings.requireApproval,
          autoApproveDomains: school.settings.autoApproveDomains
        }
      });
    } catch (error) {
      console.error('Verify school code error:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  },

  // Change password
  changePassword: async (req, res) => {
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
      console.error('Change password error:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  }
};

console.log('✅ authController loaded, exports:', Object.keys(authController));
module.exports = authController;
