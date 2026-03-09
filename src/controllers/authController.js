const { User, Student, Teacher, Parent, Admin, School, ApprovalRequest } = require('../models');
const { createAlert } = require('../services/notificationService');

// @desc    Register a new user (admin, parent, student)
// @route   POST /api/auth/register
// @access  Public
exports.register = async (req, res) => {
  try {
    const { name, email, password, role, phone, schoolCode, grade, elimuid } = req.body;

    console.log('📝 Registration attempt:', { name, email, role, schoolCode });

    // Validate required fields
    if (!name || !password || !role) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: name, password, and role are required'
      });
    }

    // Check if user already exists
    if (email) {
      const existing = await User.findOne({ where: { email } });
      if (existing) {
        return res.status(400).json({
          success: false,
          message: 'Email already in use'
        });
      }
    }

    let finalSchoolCode = schoolCode;
    let school = null;
    let responseData = {};

    // Handle different roles
    if (role === 'admin') {
      // ADMIN: Create school first
      console.log('🏫 Creating new school for admin');
      
      const year = new Date().getFullYear();
      const schoolCount = await School.count();
      const generatedSchoolId = `SCH-${year}-${(schoolCount + 1).toString().padStart(5, '0')}`;
      
      school = await School.create({
        schoolId: generatedSchoolId,
        name: req.body.schoolName || `${name}'s School`,
        system: req.body.curriculum || 'cbc'
      });
      
      finalSchoolCode = school.schoolId;
      
      // Create user (inactive - pending approval)
      const user = await User.create({
        name,
        email,
        password,
        role: 'admin',
        phone: phone || '',
        schoolCode: finalSchoolCode,
        isActive: false
      });

      // Generate adminId
      const adminCount = await Admin.count();
      const generatedAdminId = `ADM-${year}-${(adminCount + 1).toString().padStart(4, '0')}`;
      
      const profile = await Admin.create({
        userId: user.id,
        adminId: generatedAdminId,
        position: req.body.position || 'School Administrator'
      });

      // Create approval request
      await ApprovalRequest.create({
        schoolId: school.schoolId,
        userId: user.id,
        role: 'admin',
        status: 'pending',
        data: { name, email, schoolName: school.name }
      });

      // Notify super admins
      const superAdmins = await User.findAll({ where: { role: 'super_admin' } });
      for (const sa of superAdmins) {
        await createAlert({
          userId: sa.id,
          role: 'super_admin',
          type: 'approval',
          severity: 'info',
          title: 'New Admin Registration',
          message: `${name} registered for ${school.name}`
        });
      }

      const token = user.generateAuthToken();

      responseData = {
        token,
        user: user.getPublicProfile(),
        profile,
        school: {
          name: school.name,
          schoolId: school.schoolId,
          system: school.system
        },
        message: 'Registration submitted for super admin approval'
      };

    } else if (role === 'parent') {
      // PARENT: Must provide schoolCode and child's elimuid
      if (!schoolCode) {
        return res.status(400).json({
          success: false,
          message: 'School code is required for parent registration'
        });
      }

      school = await School.findOne({ where: { schoolId: schoolCode } });
      if (!school) {
        return res.status(404).json({
          success: false,
          message: 'School not found with provided code'
        });
      }

      // Verify child exists with this elimuid
      if (elimuid) {
        const child = await Student.findOne({ 
          where: { elimuid },
          include: [{ model: User }]
        });
        
        if (!child) {
          return res.status(404).json({
            success: false,
            message: 'No student found with this ELIMUID'
          });
        }
      }

      const user = await User.create({
        name,
        email,
        password,
        role: 'parent',
        phone: phone || '',
        schoolCode,
        isActive: true
      });

      const profile = await Parent.create({
        userId: user.id,
        children: []
      });

      const token = user.generateAuthToken();

      responseData = {
        token,
        user: user.getPublicProfile(),
        profile
      };

    } else if (role === 'student') {
      // STUDENT: Usually created by teacher, but can self-register
      if (!schoolCode) {
        return res.status(400).json({
          success: false,
          message: 'School code is required for student registration'
        });
      }

      school = await School.findOne({ where: { schoolId: schoolCode } });
      if (!school) {
        return res.status(404).json({
          success: false,
          message: 'School not found with provided code'
        });
      }

      // Generate ELIMUID if not provided
      const finalElimuid = elimuid || `ELIMU-${new Date().getFullYear()}-${Math.floor(Math.random() * 10000).toString().padStart(4, '0')}`;

      const user = await User.create({
        name,
        email: email || `${name.replace(/\s+/g, '.').toLowerCase()}@student.edu`,
        password,
        role: 'student',
        phone: phone || '',
        schoolCode,
        isActive: true
      });

      const profile = await Student.create({
        userId: user.id,
        elimuid: finalElimuid,
        grade: grade || 'Not Assigned'
      });

      const token = user.generateAuthToken();

      responseData = {
        token,
        user: user.getPublicProfile(),
        profile,
        elimuid: finalElimuid
      };

    } else {
      return res.status(400).json({
        success: false,
        message: 'Invalid role specified'
      });
    }

    // Create welcome alert
    await createAlert({
      userId: responseData.user.id,
      role,
      type: 'system',
      severity: 'info',
      title: role === 'admin' ? 'Registration Pending' : 'Welcome to ShuleAI',
      message: role === 'admin' 
        ? 'Your registration is pending super admin approval'
        : 'Your account has been created successfully'
    });

    res.status(201).json({
      success: true,
      message: responseData.message || 'Registration successful',
      data: responseData
    });

  } catch (error) {
    console.error('❌ Registration error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Registration failed'
    });
  }
};

// @desc    Teacher signup with school ID
// @route   POST /api/auth/teacher/signup
// @access  Public
exports.teacherSignup = async (req, res) => {
  try {
    const { name, email, password, schoolId, subjects, qualification, classTeacher } = req.body;

    console.log('📝 Teacher signup attempt:', { name, email, schoolId });

    // Validate required fields
    if (!name || !email || !password || !schoolId) {
      return res.status(400).json({
        success: false,
        message: 'Name, email, password, and schoolId are required'
      });
    }

    // Find the school
    const school = await School.findOne({ where: { schoolId } });
    if (!school) {
      return res.status(404).json({
        success: false,
        message: 'School not found with provided ID'
      });
    }

    // Check if user exists
    const existing = await User.findOne({ where: { email } });
    if (existing) {
      return res.status(400).json({
        success: false,
        message: 'Email already in use'
      });
    }

    // Create user (inactive - pending admin approval)
    const user = await User.create({
      name,
      email,
      password,
      role: 'teacher',
      schoolCode: school.schoolId,
      isActive: false
    });

    // Generate employee ID
    const year = new Date().getFullYear();
    const teacherCount = await Teacher.count();
    const employeeId = `TCH-${year}-${(teacherCount + 1).toString().padStart(4, '0')}`;

    // Create teacher profile (pending)
    const profile = await Teacher.create({
      userId: user.id,
      employeeId,
      subjects: subjects || [],
      classTeacher: classTeacher || null,
      qualification,
      approvalStatus: 'pending'
    });

    // Create approval request
    await ApprovalRequest.create({
      schoolId: school.schoolId,
      userId: user.id,
      role: 'teacher',
      status: 'pending',
      data: { name, email, subjects, qualification }
    });

    // Notify school admins
    const admins = await User.findAll({ 
      where: { 
        role: 'admin',
        schoolCode: school.schoolId
      } 
    });

    for (const admin of admins) {
      await createAlert({
        userId: admin.id,
        role: 'admin',
        type: 'approval',
        severity: 'info',
        title: 'New Teacher Signup',
        message: `${name} requested to join as teacher`
      });
    }

    const token = user.generateAuthToken();

    res.status(201).json({
      success: true,
      message: 'Teacher registration submitted for admin approval',
      data: {
        token,
        user: user.getPublicProfile(),
        profile,
        school: {
          name: school.name,
          schoolId: school.schoolId
        }
      }
    });

  } catch (error) {
    console.error('❌ Teacher signup error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Teacher signup failed'
    });
  }
};

// @desc    Verify school ID
// @route   POST /api/auth/verify-school
// @access  Public
exports.verifySchoolId = async (req, res) => {
  try {
    const { schoolId } = req.body;

    const school = await School.findOne({ 
      where: { schoolId } 
    });

    if (!school) {
      return res.status(404).json({
        success: false,
        message: 'School not found'
      });
    }

    res.json({
      success: true,
      data: {
        schoolName: school.name,
        schoolId: school.schoolId,
        system: school.system
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// @desc    Login user
// @route   POST /api/auth/login
// @access  Public
exports.login = async (req, res) => {
  try {
    const { email, elimuid, password, role } = req.body;
    
    console.log('🔐 Login attempt:', { email, elimuid, role });

    // SUPER ADMIN SPECIAL HANDLING
    if (role === 'super_admin') {
      if (password === process.env.SUPER_ADMIN_KEY) {
        let superAdmin = await User.findOne({ where: { role: 'super_admin' } });
        
        if (!superAdmin) {
          superAdmin = await User.create({
            name: 'Super Admin',
            email: process.env.SUPER_ADMIN_EMAIL || 'super@shuleai.com',
            password: process.env.SUPER_ADMIN_KEY,
            role: 'super_admin',
            schoolCode: 'GLOBAL',
            isActive: true
          });
        }

        superAdmin.lastLogin = new Date();
        await superAdmin.save();

        const token = superAdmin.generateAuthToken();

        return res.json({
          success: true,
          data: { 
            token, 
            user: superAdmin.getPublicProfile(),
            profile: null,
            school: null
          }
        });
      } else {
        return res.status(401).json({ 
          success: false, 
          message: 'Invalid super admin key' 
        });
      }
    }

    // Regular user login
    let user;
    if (role === 'student' && elimuid) {
      const student = await Student.findOne({ 
        where: { elimuid }, 
        include: [{ model: User }] 
      });
      user = student?.User;
    } else {
      user = await User.findOne({ where: { email, role } });
    }

    if (!user || !(await user.comparePassword(password))) {
      return res.status(401).json({ 
        success: false, 
        message: 'Invalid credentials' 
      });
    }

    // Check if user is active (especially for pending approvals)
    if (!user.isActive) {
      let message = 'Account is pending approval';
      if (role === 'admin') message = 'Admin account pending super admin approval';
      if (role === 'teacher') message = 'Teacher account pending school admin approval';
      
      return res.status(403).json({ 
        success: false, 
        message
      });
    }

    user.lastLogin = new Date();
    await user.save();

    const token = user.generateAuthToken();

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

    const school = await School.findOne({ where: { schoolId: user.schoolCode } });

    res.json({
      success: true,
      data: { 
        token, 
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          phone: user.phone,
          schoolCode: user.schoolCode,
          isActive: user.isActive
        }, 
        profile, 
        school: school ? {
          name: school.name,
          schoolId: school.schoolId,
          system: school.system
        } : null
      }
    });

  } catch (error) {
    console.error('Login error:', error);
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
    
    if (user.role === 'teacher') {
      profile = await Teacher.findOne({ where: { userId: user.id } });
    } else if (user.role === 'student') {
      profile = await Student.findOne({ where: { userId: user.id } });
    } else if (user.role === 'parent') {
      profile = await Parent.findOne({ where: { userId: user.id } });
    } else if (user.role === 'admin') {
      profile = await Admin.findOne({ where: { userId: user.id } });
    }

    const school = await School.findOne({ where: { schoolId: user.schoolCode } });

    res.json({
      success: true,
      data: { 
        user: user.getPublicProfile(), 
        profile, 
        school 
      }
    });
  } catch (error) {
    console.error('GetMe error:', error);
    res.status(500).json({ 
      success: false, 
      message: error.message 
    });
  }
};

// @desc    Logout (clear cookie)
// @route   POST /api/auth/logout
// @access  Private
exports.logout = (req, res) => {
  res.cookie('token', 'none', { 
    expires: new Date(Date.now() + 10*1000), 
    httpOnly: true 
  });
  res.json({ 
    success: true, 
    message: 'Logged out' 
  });
};

// @desc    Change password
// @route   POST /api/auth/change-password
// @access  Private
exports.changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const user = await User.findByPk(req.user.id, { 
      attributes: { include: ['password'] } 
    });

    if (!(await user.comparePassword(currentPassword))) {
      return res.status(401).json({ 
        success: false, 
        message: 'Current password is incorrect' 
      });
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

    res.json({ 
      success: true, 
      message: 'Password updated' 
    });
  } catch (error) {
    console.error('Change password error:', error);
    res.status(500).json({ 
      success: false, 
      message: error.message 
    });
  }
};

// @desc    Forgot password
// @route   POST /api/auth/forgot-password
// @access  Public
exports.forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;
    // Implementation for password reset (email would be sent here)
    res.json({ 
      success: true, 
      message: 'If your email exists, you will receive a password reset link' 
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      message: error.message 
    });
  }
};

// @desc    Reset password
// @route   POST /api/auth/reset-password
// @access  Public
exports.resetPassword = async (req, res) => {
  try {
    const { token, newPassword } = req.body;
    // Implementation for password reset
    res.json({ 
      success: true, 
      message: 'Password reset successful' 
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      message: error.message 
    });
  }
};
