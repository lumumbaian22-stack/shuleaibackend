const { User, Student, Teacher, Parent, Admin, School } = require('../models');
const { createAlert } = require('../services/notificationService');

// @desc    Register a new user (admin, teacher, parent, student)
// @route   POST /api/auth/register
// @access  Public - NO AUTHENTICATION REQUIRED
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

    // Handle school creation/lookup
    let finalSchoolCode = schoolCode;
    
    // For admin, create school first if no schoolCode provided
    if (role === 'admin' && !schoolCode) {
      console.log('🏫 Creating new school for admin:', name);
      
      // Generate a unique school ID
      const year = new Date().getFullYear();
      const schoolCount = await School.count();
      const generatedSchoolId = `SCH-${year}-${(schoolCount + 1).toString().padStart(5, '0')}`;
      
      try {
        // Create a new school with explicit schoolId
        const newSchool = await School.create({
          schoolId: generatedSchoolId,
          name: req.body.schoolName || `${name}'s School`,
          system: req.body.curriculum || 'cbc'
        });
        
        console.log('✅ School created:', newSchool.schoolId);
        finalSchoolCode = newSchool.schoolId;
      } catch (schoolError) {
        console.error('❌ School creation failed:', schoolError);
        return res.status(500).json({
          success: false,
          message: 'Failed to create school: ' + schoolError.message
        });
      }
    } else if (schoolCode) {
      // Verify existing school
      const school = await School.findOne({ where: { schoolId: schoolCode } });
      if (!school) {
        return res.status(404).json({
          success: false,
          message: 'School not found with the provided code'
        });
      }
      finalSchoolCode = schoolCode;
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

    // Create user
    console.log('👤 Creating user with schoolCode:', finalSchoolCode || 'SCH001');
    
    const user = await User.create({
      name,
      email: email || `${name.replace(/\s+/g, '.').toLowerCase()}@temp.edu`,
      password,
      role,
      phone: phone || '',
      schoolCode: finalSchoolCode || 'SCH001'
    });

    console.log('✅ User created with ID:', user.id);

    let profile = null;

    // Create role-specific profile
    if (role === 'student') {
      console.log('📝 Creating STUDENT profile');
      profile = await Student.create({
        userId: user.id,
        elimuid: elimuid || null,
        grade: grade || 'Not Assigned'
      });
    } else if (role === 'teacher') {
      console.log('📝 Creating TEACHER profile');
      profile = await Teacher.create({
        userId: user.id,
        subjects: req.body.subjects || [],
        classTeacher: req.body.classTeacher || null,
        approvalStatus: 'pending'
      });
    } else if (role === 'parent') {
      console.log('📝 Creating PARENT profile');
      profile = await Parent.create({
        userId: user.id,
        children: []
      });
    } else if (role === 'admin') {
      console.log('📝 Creating ADMIN profile');
      
      // Generate adminId manually
      const year = new Date().getFullYear();
      const adminCount = await Admin.count();
      const generatedAdminId = `ADM-${year}-${(adminCount + 1).toString().padStart(4, '0')}`;
      
      profile = await Admin.create({
        userId: user.id,
        adminId: generatedAdminId,
        position: req.body.position || 'Administrator'
      });
    }

    const token = user.generateAuthToken();

    // Create welcome alert
    await createAlert({
      userId: user.id,
      role,
      type: 'system',
      severity: 'success',
      title: 'Welcome to ShuleAI',
      message: 'Your account has been created.'
    });

    // Return success with school info for admin
    const responseData = {
      token,
      user: user.getPublicProfile(),
      profile
    };

    // If this was an admin registration, include school info
    if (role === 'admin' && finalSchoolCode) {
      const school = await School.findOne({ where: { schoolId: finalSchoolCode } });
      responseData.school = school ? {
        name: school.name,
        schoolId: school.schoolId,
        system: school.system
      } : null;
    }

    res.status(201).json({
      success: true,
      message: 'Registration successful',
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
        let superAdmin = await User.findOne({ 
          where: { role: 'super_admin' } 
        });
        
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

    if (!user.isActive) {
      return res.status(403).json({ 
        success: false, 
        message: 'Account is deactivated' 
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
          schoolCode: user.schoolCode
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
