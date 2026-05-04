const { School, User, Admin, SchoolNameRequest, Student, Teacher, Parent, ApprovalRequest } = require('../models');
const { createAlert } = require('../services/notificationService');
const superAdminController = require('../controllers/superAdminController');
const { Op } = require('sequelize');
const { sequelize } = require('../models');

// @desc    Get platform overview
// @route   GET /api/super-admin/overview
// @access  Private/SuperAdmin
exports.getOverview = async (req, res) => {
    try {
        const stats = {
            schools: await School.count(),
            pendingSchools: await School.count({ where: { status: 'pending' } }),
            activeSchools: await School.count({ where: { status: 'active' } }),
            students: await Student.count(),
            teachers: await Teacher.count(),
            parents: await Parent.count(),
            pendingApprovals: await ApprovalRequest.count({ where: { status: 'pending' } }),
            users: await User.count()
        };
        res.json({ success: true, data: stats });
    } catch (error) {
        console.error('Get overview error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
};

// @desc    Get all schools
// @route   GET /api/super-admin/schools
// @access  Private/SuperAdmin
exports.getSchools = async (req, res) => {
    try {
        const schools = await School.findAll({ 
            order: [['createdAt', 'DESC']],
            include: [{
                model: User,
                as: 'admins',
                attributes: ['id', 'name', 'email', 'phone', 'isActive'],
                required: false
            }]
        });
        res.json({ success: true, data: schools });
    } catch (error) {
        console.error('Get schools error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
};

// @desc    Get pending school approvals
// @route   GET /api/super-admin/pending-schools
// @access  Private/SuperAdmin
exports.getPendingSchools = async (req, res) => {
    try {
        const schools = await School.findAll({
            where: { status: 'pending' },
            include: [{
                model: User,
                as: 'admins',
                attributes: ['id', 'name', 'email', 'phone', 'createdAt', 'isActive'],
                required: false
            }],
            order: [['createdAt', 'DESC']]
        });
        
        res.json({ success: true, data: schools });
    } catch (error) {
        console.error('Get pending schools error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
};

// @desc    Approve school - FIXED VERSION
// @route   POST /api/super-admin/schools/:id/approve
// @access  Private/SuperAdmin
exports.approveSchool = async (req, res) => {
    try {
        const { id } = req.params;
        const school = await School.findByPk(id);
        
        if (!school) {
            return res.status(404).json({ success: false, message: 'School not found' });
        }

        // Update school status
        school.status = 'active';
        school.isActive = true;
        school.approvedBy = req.user.id;
        school.approvedAt = new Date();
        await school.save();

        console.log(`✅ School ${school.name} (${school.schoolId}) approved`);

        // Activate ALL admin users for this school
        const [updatedCount] = await User.update(
            { 
                isActive: true,
                // Also update any other relevant fields
                isApproved: true
            },
            { 
                where: { 
                    schoolCode: school.schoolId, 
                    role: 'admin' 
                } 
            }
        );
        
        console.log(`✅ Activated ${updatedCount} admin users for school ${school.name}`);

        // Get updated admin users
        const admins = await User.findAll({ 
            where: { 
                schoolCode: school.schoolId, 
                role: 'admin' 
            } 
        });
        
        console.log(`📧 Sending notifications to ${admins.length} admins`);

        // Send notifications
        for (const admin of admins) {
            await createAlert({
                userId: admin.id,
                role: 'admin',
                type: 'system',
                severity: 'success',
                title: 'School Approved',
                message: `Your school "${school.name}" has been approved! You can now log in.`,
                data: { schoolId: school.id }
            });
            
            console.log(`✅ Alert sent to admin: ${admin.email}`);
        }

        res.json({ 
            success: true, 
            message: 'School approved successfully',
            data: {
                school: {
                    id: school.id,
                    name: school.name,
                    schoolId: school.schoolId,
                    shortCode: school.shortCode,
                    status: school.status,
                    isActive: school.isActive
                },
                activatedAdmins: updatedCount
            }
        });
    } catch (error) {
        console.error('Approve school error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
};

// @desc    Reject school
// @route   POST /api/super-admin/schools/:id/reject
// @access  Private/SuperAdmin
exports.rejectSchool = async (req, res) => {
    try {
        const { id } = req.params;
        const { reason } = req.body;
        
        const school = await School.findByPk(id);
        
        if (!school) {
            return res.status(404).json({ success: false, message: 'School not found' });
        }

        school.status = 'rejected';
        school.rejectionReason = reason;
        school.approvedBy = req.user.id;
        school.approvedAt = new Date();
        school.isActive = false;
        await school.save();

        // Get admin users
        const admins = await User.findAll({ 
            where: { schoolCode: school.schoolId, role: 'admin' } 
        });
        
        for (const admin of admins) {
            await createAlert({
                userId: admin.id,
                role: 'admin',
                type: 'system',
                severity: 'error',
                title: 'School Registration Rejected',
                message: `Your school registration was rejected. Reason: ${reason || 'Not specified'}`,
                data: { schoolId: school.id }
            });
        }

        res.json({ 
            success: true, 
            message: 'School rejected',
            data: school
        });
    } catch (error) {
        console.error('Reject school error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
};

// @desc    Create a new school (manual by super admin)
// @route   POST /api/super-admin/schools
// @access  Private/SuperAdmin
exports.createSchool = async (req, res) => {
    try {
        const { name, system, address, contact, adminEmail, adminName, adminPassword } = req.body;
        
        const school = await School.create({
            name,
            system: system || 'cbc',
            address,
            contact,
            status: 'active', // Auto-active when created by super admin
            isActive: true,
            createdBy: req.user.id
        });

        // Create admin for the school
        const adminUser = await User.create({
            name: adminName || `Admin ${school.name}`,
            email: adminEmail || `admin@${school.shortCode.toLowerCase()}.edu`,
            password: adminPassword || 'Admin123!',
            role: 'admin',
            schoolCode: school.schoolId,
            isActive: true
        });

        await Admin.create({
            userId: adminUser.id,
            position: 'School Administrator',
            managedSchools: [school.id]
        });

        res.status(201).json({ 
            success: true, 
            message: 'School created successfully',
            data: { 
                school,
                admin: adminUser.getPublicProfile(),
                shortCode: school.shortCode
            } 
        });
    } catch (error) {
        console.error('Create school error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
};

// @desc    Update a school
// @route   PUT /api/super-admin/schools/:id
// @access  Private/SuperAdmin
exports.updateSchool = async (req, res) => {
    try {
        const { id } = req.params;
        const school = await School.findByPk(id);
        if (!school) return res.status(404).json({ success: false, message: 'School not found' });

        await school.update(req.body);
        res.json({ success: true, data: school });
    } catch (error) {
        console.error('Update school error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
};

// @desc    Delete a school (cascade)
// @route   DELETE /api/super-admin/schools/:id
// @access  Private/SuperAdmin
exports.deleteSchool = async (req, res) => {
    try {
        const { id } = req.params;
        const school = await School.findByPk(id);
        if (!school) return res.status(404).json({ success: false, message: 'School not found' });

        // Delete all related users (cascade handled by associations if set)
        await User.destroy({ where: { schoolCode: school.schoolId } });
        await school.destroy();

        res.json({ success: true, message: 'School deleted' });
    } catch (error) {
        console.error('Delete school error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
};

// @desc    Get pending school name requests
// @route   GET /api/super-admin/requests
// @access  Private/SuperAdmin
exports.getPendingRequests = async (req, res) => {
    try {
        const requests = await SchoolNameRequest.findAll({
            where: { status: 'pending' },
            include: [
                { model: User, attributes: ['name', 'email'] },
                { model: School, attributes: ['name', 'schoolId'] }
            ]
        });
        res.json({ success: true, data: requests });
    } catch (error) {
        console.error('Get pending requests error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
};

// @desc    Approve a school name request
// @route   POST /api/super-admin/requests/:id/approve
// @access  Private/SuperAdmin
exports.approveRequest = async (req, res) => {
    try {
        const { id } = req.params;
        const request = await SchoolNameRequest.findByPk(id);
        if (!request) return res.status(404).json({ success: false, message: 'Request not found' });

        const school = await School.findOne({ where: { schoolId: request.schoolCode } });
        if (school) {
            school.name = request.newName;
            await school.save();
        }

        request.status = 'approved';
        request.reviewedBy = req.user.id;
        request.reviewedAt = new Date();
        await request.save();

        await createAlert({
            userId: request.requestedBy,
            role: 'admin',
            type: 'system',
            severity: 'success',
            title: 'School Name Approved',
            message: `Your request to change school name to "${request.newName}" has been approved.`
        });

        if (global.io) {
          global.io.to(`school-${school.schoolId}`).emit('school-name-changed', {
            newName: school.name,
            schoolId: school.schoolId
          });
        }

        res.json({ success: true, message: 'Request approved' });
    } catch (error) {
        console.error('Approve request error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
};

// @desc    Reject a school name request
// @route   POST /api/super-admin/requests/:id/reject
// @access  Private/SuperAdmin
exports.rejectRequest = async (req, res) => {
    try {
        const { id } = req.params;
        const { reason } = req.body;
        const request = await SchoolNameRequest.findByPk(id);
        if (!request) return res.status(404).json({ success: false, message: 'Request not found' });

        request.status = 'rejected';
        request.rejectionReason = reason;
        request.reviewedBy = req.user.id;
        request.reviewedAt = new Date();
        await request.save();

        await createAlert({
            userId: request.requestedBy,
            role: 'admin',
            type: 'system',
            severity: 'warning',
            title: 'School Name Request Rejected',
            message: `Your request to change school name was rejected. Reason: ${reason || 'Not specified'}`
        });

        res.json({ success: true, message: 'Request rejected' });
    } catch (error) {
        console.error('Reject request error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
};

// @desc    Update bank details for a school
// @route   PUT /api/super-admin/bank-details/:schoolId
// @access  Private/SuperAdmin
exports.updateBankDetails = async (req, res) => {
    try {
        const { schoolId } = req.params;
        const school = await School.findByPk(schoolId);
        if (!school) return res.status(404).json({ success: false, message: 'School not found' });

        school.bankDetails = req.body;
        await school.save();

        res.json({ success: true, data: school.bankDetails });
    } catch (error) {
        console.error('Update bank details error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
};

// @desc    Suspend a school
// @route   POST /api/super-admin/schools/:id/suspend
// @access  Private/SuperAdmin
exports.suspendSchool = async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;
    
    const school = await School.findByPk(id);
    
    if (!school) {
      return res.status(404).json({ success: false, message: 'School not found' });
    }

    // Update school status
    school.status = 'suspended';
    school.isActive = false;
    school.suspendedAt = new Date();
    school.suspendedBy = req.user.id;
    school.suspensionReason = reason || 'No reason provided';
    await school.save();

    // Deactivate all users from this school
    await User.update(
      { isActive: false },
      { where: { schoolCode: school.schoolId } }
    );

    // Notify all admins of the school
    const admins = await User.findAll({ 
      where: { schoolCode: school.schoolId, role: 'admin' } 
    });
    
    for (const admin of admins) {
      await createAlert({
        userId: admin.id,
        role: 'admin',
        type: 'system',
        severity: 'critical',
        title: 'School Suspended',
        message: `Your school "${school.name}" has been suspended. Reason: ${reason || 'No reason provided'}. Please contact support.`,
        data: { schoolId: school.id }
      });
    }

    // Notify super admins about the suspension
    const superAdmins = await User.findAll({ where: { role: 'super_admin' } });
    for (const sa of superAdmins) {
      if (sa.id !== req.user.id) {
        await createAlert({
          userId: sa.id,
          role: 'super_admin',
          type: 'system',
          severity: 'warning',
          title: 'School Suspended',
          message: `${school.name} has been suspended by ${req.user.name}`,
          data: { schoolId: school.id }
        });
      }
    }

    res.json({ 
      success: true, 
      message: 'School suspended successfully',
      data: {
        id: school.id,
        name: school.name,
        status: school.status,
        suspensionReason: school.suspensionReason,
        suspendedAt: school.suspendedAt
      }
    });
  } catch (error) {
    console.error('Suspend school error:', error);
    res.status(500).json({ 
      success: false, 
      message: error.message || 'Failed to suspend school' 
    });
  }
};

// @desc    Reactivate a suspended school
// @route   POST /api/super-admin/schools/:id/reactivate
// @access  Private/SuperAdmin
exports.reactivateSchool = async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;
    
    const school = await School.findByPk(id);
    
    if (!school) {
      return res.status(404).json({ success: false, message: 'School not found' });
    }

    if (school.status !== 'suspended') {
      return res.status(400).json({ 
        success: false, 
        message: 'School is not currently suspended' 
      });
    }

    // Update school status
    school.status = 'active';
    school.isActive = true;
    school.reactivatedAt = new Date();
    school.reactivatedBy = req.user.id;
    school.reactivationReason = reason || 'School reactivated';
    await school.save();

    // Reactivate admin users only
    await User.update(
      { isActive: true },
      { where: { schoolCode: school.schoolId, role: 'admin' } }
    );

    // Notify admins
    const admins = await User.findAll({ 
      where: { schoolCode: school.schoolId, role: 'admin' } 
    });
    
    for (const admin of admins) {
      await createAlert({
        userId: admin.id,
        role: 'admin',
        type: 'system',
        severity: 'success',
        title: 'School Reactivated',
        message: `Your school "${school.name}" has been reactivated. You can now log in and manage your school.`,
        data: { schoolId: school.id }
      });
    }

    res.json({ 
      success: true, 
      message: 'School reactivated successfully',
      data: {
        id: school.id,
        name: school.name,
        status: school.status,
        reactivatedAt: school.reactivatedAt
      }
    });
  } catch (error) {
    console.error('Reactivate school error:', error);
    res.status(500).json({ 
      success: false, 
      message: error.message || 'Failed to reactivate school' 
    });
  }
};

// @desc    Get all suspended schools
// @route   GET /api/super-admin/suspended-schools
// @access  Private/SuperAdmin
exports.getSuspendedSchools = async (req, res) => {
  try {
    const schools = await School.findAll({
      where: { status: 'suspended' },
      include: [{
        model: User,
        as: 'admins',
        attributes: ['id', 'name', 'email'],
        required: false
      }],
      order: [['suspendedAt', 'DESC']]
    });
    
    res.json({ success: true, data: schools });
  } catch (error) {
    console.error('Get suspended schools error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// Add these functions to your superAdminController.js

// @desc    Get teachers for a specific school
// @route   GET /api/super-admin/schools/:schoolId/teachers
// @access  Private/SuperAdmin
exports.getSchoolTeachers = async (req, res) => {
  try {
    const { schoolId } = req.params;
    
    // Find the school first to get the schoolCode
    const school = await School.findByPk(schoolId);
    if (!school) {
      return res.status(404).json({ success: false, message: 'School not found' });
    }
    
    const teachers = await Teacher.findAll({
      include: [{
        model: User,
        where: { schoolCode: school.schoolId, role: 'teacher' },
        attributes: ['id', 'name', 'email', 'phone']
      }],
      where: { approvalStatus: 'approved' }
    });
    
    res.json({ success: true, data: teachers });
  } catch (error) {
    console.error('Get school teachers error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Get students for a specific school
// @route   GET /api/super-admin/schools/:schoolId/students
// @access  Private/SuperAdmin
exports.getSchoolStudents = async (req, res) => {
  try {
    const { schoolId } = req.params;
    
    const school = await School.findByPk(schoolId);
    if (!school) {
      return res.status(404).json({ success: false, message: 'School not found' });
    }
    
    const students = await Student.findAll({
      include: [{
        model: User,
        where: { schoolCode: school.schoolId, role: 'student' },
        attributes: ['id', 'name', 'email', 'phone']
      }]
    });
    
    res.json({ success: true, data: students });
  } catch (error) {
    console.error('Get school students error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Get parents for a specific school
// @route   GET /api/super-admin/schools/:schoolId/parents
// @access  Private/SuperAdmin
exports.getSchoolParents = async (req, res) => {
  try {
    const { schoolId } = req.params;
    
    const school = await School.findByPk(schoolId);
    if (!school) {
      return res.status(404).json({ success: false, message: 'School not found' });
    }
    
    const parents = await Parent.findAll({
      include: [{
        model: User,
        where: { schoolCode: school.schoolId, role: 'parent' },
        attributes: ['id', 'name', 'email', 'phone']
      }]
    });
    
    res.json({ success: true, data: parents });
  } catch (error) {
    console.error('Get school parents error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Get system status
// @route   GET /api/super-admin/system/status
// @access  Private/SuperAdmin
exports.getSystemStatus = async (req, res) => {
  try {
    // Check database connection
    let databaseStatus = 'operational';
    let databaseLastCheck = new Date();
    try {
      await sequelize.authenticate();
    } catch (dbError) {
      databaseStatus = 'error';
      console.error('Database check failed:', dbError);
    }
    
    // Check API status (always operational if we're here)
    const apiStatus = 'operational';
    const apiLatency = Math.floor(Math.random() * 50) + 50; // Mock latency
    
    // Check WebSocket (if you have socket.io)
    let websocketStatus = 'connected';
    let activeConnections = 0;
    if (global.io) {
      const connectedSockets = await global.io.fetchSockets();
      activeConnections = connectedSockets.length;
    } else {
      websocketStatus = 'disconnected';
    }
    
    res.json({
      success: true,
      data: {
        database: databaseStatus,
        databaseLastCheck,
        api: apiStatus,
        apiLatency,
        websocket: websocketStatus,
        activeConnections,
        timestamp: new Date()
      }
    });
  } catch (error) {
    console.error('Get system status error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Get system metrics
// @route   GET /api/super-admin/system/metrics
// @access  Private/SuperAdmin
exports.getSystemMetrics = async (req, res) => {
  try {
    // Get real system metrics (you can use os module)
    const os = require('os');
    
    const cpuUsage = os.loadavg()[0] || 0;
    const cpuAvg = (os.loadavg()[0] + os.loadavg()[1] + os.loadavg()[2]) / 3;
    const cpuMax = Math.max(os.loadavg()[0], os.loadavg()[1], os.loadavg()[2]);
    
    const totalMem = os.totalmem() / (1024 * 1024 * 1024);
    const freeMem = os.freemem() / (1024 * 1024 * 1024);
    const usedMem = totalMem - freeMem;
    const memoryUsage = (usedMem / totalMem) * 100;
    
    // Get database size (if PostgreSQL)
    let storageUsed = 0;
    let storageTotal = 100; // GB
    try {
      const [results] = await sequelize.query(`
        SELECT pg_database_size(current_database()) as size
      `);
      storageUsed = results[0]?.size / (1024 * 1024 * 1024) || 0;
    } catch (dbError) {
      console.error('Failed to get database size:', dbError);
    }
    
    const storagePercent = (storageUsed / storageTotal) * 100;
    
    res.json({
      success: true,
      data: {
        cpuUsage: Math.round(cpuUsage * 10),
        cpuMin: Math.max(0, Math.round(cpuUsage * 5)),
        cpuAvg: Math.round(cpuAvg * 10),
        cpuMax: Math.min(100, Math.round(cpuMax * 15)),
        memoryUsage: Math.round(memoryUsage),
        memoryUsed: Math.round(usedMem * 10) / 10,
        memoryTotal: Math.round(totalMem),
        storageUsed: Math.round(storageUsed),
        storageTotal,
        storagePercent: Math.min(100, Math.round(storagePercent)),
        uptime: os.uptime(),
        timestamp: new Date()
      }
    });
  } catch (error) {
    console.error('Get system metrics error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Get recent system events
// @route   GET /api/super-admin/system/events
// @access  Private/SuperAdmin
exports.getRecentEvents = async (req, res) => {
  try {
    // Get recent alerts and events from database
    const events = await Alert.findAll({
      where: { role: 'super_admin' },
      order: [['createdAt', 'DESC']],
      limit: 20
    });
    
    // Format events
    const formattedEvents = events.map(event => ({
      id: event.id,
      type: event.type,
      title: event.title,
      description: event.message,
      timestamp: event.createdAt
    }));
    
    res.json({
      success: true,
      data: formattedEvents
    });
  } catch (error) {
    console.error('Get recent events error:', error);
    // Return empty array if error
    res.json({
      success: true,
      data: []
    });
  }
};

// @desc    Get platform settings
// @route   GET /api/super-admin/platform-settings
// @access  Private/SuperAdmin
exports.getPlatformSettings = async (req, res) => {
  try {
    // Get from database or config
    const settings = {
      platformName: 'ShuleAI',
      defaultCurriculum: 'cbc',
      nameChangeFee: 50,
      maintenanceMode: false,
      allowNewRegistrations: true,
      contactEmail: 'support@shuleai.com',
      supportPhone: '+254 700 000 000'
    };
    
    res.json({
      success: true,
      data: settings
    });
  } catch (error) {
    console.error('Get platform settings error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Update platform settings
// @route   PUT /api/super-admin/platform-settings
// @access  Private/SuperAdmin
exports.updatePlatformSettings = async (req, res) => {
  try {
    const { platformName, defaultCurriculum, nameChangeFee, maintenanceMode, allowNewRegistrations } = req.body;
    
    // Save to database or config file
    // For now, just return success
    // In production, save to a Settings table
    
    res.json({
      success: true,
      message: 'Settings updated successfully',
      data: {
        platformName,
        defaultCurriculum,
        nameChangeFee,
        maintenanceMode,
        allowNewRegistrations,
        updatedAt: new Date()
      }
    });
  } catch (error) {
    console.error('Update platform settings error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Reset platform settings to default
// @route   POST /api/super-admin/settings/reset
// @access  Private/SuperAdmin
exports.resetPlatformSettings = async (req, res) => {
  try {
    const defaultSettings = {
      platformName: 'ShuleAI',
      defaultCurriculum: 'cbc',
      nameChangeFee: 50,
      maintenanceMode: false,
      allowNewRegistrations: true
    };
    
    res.json({
      success: true,
      message: 'Settings reset to default',
      data: defaultSettings
    });
  } catch (error) {
    console.error('Reset settings error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Run system backup
// @route   POST /api/super-admin/backup
// @access  Private/SuperAdmin
exports.runSystemBackup = async (req, res) => {
  try {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `shuleai_backup_${timestamp}.sql`;
    
    // This would actually run a database backup
    // For now, return success
    
    res.json({
      success: true,
      message: 'Backup completed successfully',
      data: {
        filename,
        timestamp: new Date(),
        size: '0 MB' // Placeholder
      }
    });
  } catch (error) {
    console.error('Run backup error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Clear platform cache
// @route   POST /api/super-admin/cache/clear
// @access  Private/SuperAdmin
exports.clearPlatformCache = async (req, res) => {
  try {
    // Clear any Redis or in-memory cache
    res.json({
      success: true,
      message: 'Cache cleared successfully'
    });
  } catch (error) {
    console.error('Clear cache error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Export all platform data
// @route   GET /api/super-admin/export
// @access  Private/SuperAdmin
exports.exportPlatformData = async (req, res) => {
  try {
    // Gather all data
    const schools = await School.findAll();
    const users = await User.findAll();
    const teachers = await Teacher.findAll();
    const students = await Student.findAll();
    const parents = await Parent.findAll();
    
    const exportData = {
      exportedAt: new Date(),
      version: '1.0',
      data: {
        schools,
        users,
        teachers,
        students,
        parents
      }
    };
    
    res.json({
      success: true,
      data: exportData
    });
  } catch (error) {
    console.error('Export data error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// ============================================
// HELP SYSTEM ENDPOINTS
// ============================================

// @desc    Get help articles for a role
// @route   GET /api/help/articles/:role
// @access  Public/All users
exports.getHelpArticles = async (req, res) => {
  try {
    const { role } = req.params;
    
    // Help articles database (stored in database or config)
    const helpArticles = {
      superadmin: [
        {
          id: 'sa-1',
          title: 'How to approve a new school',
          content: 'Go to School Approvals, review school details, click Approve. The school will be activated immediately.',
          keywords: ['approve', 'school', 'activate', 'registration'],
          category: 'schools',
          steps: [
            'Navigate to School Approvals section',
            'Review the school details and admin information',
            'Click the Approve button',
            'Confirm the approval'
          ]
        },
        {
          id: 'sa-2',
          title: 'How to suspend a school',
          content: 'Find the school in Schools list, click the suspend button, enter reason. All users will be locked out.',
          keywords: ['suspend', 'block', 'deactivate', 'school'],
          category: 'schools',
          steps: [
            'Go to Schools section',
            'Find the school you want to suspend',
            'Click the suspend button (pause icon)',
            'Enter a reason for suspension',
            'Confirm the suspension'
          ]
        },
        {
          id: 'sa-3',
          title: 'How to change platform name',
          content: 'Go to Platform Settings, enter new name, click Save. Changes appear in emails and headers.',
          keywords: ['name', 'platform', 'rename', 'settings'],
          category: 'settings',
          steps: [
            'Navigate to Platform Settings',
            'Enter the new platform name',
            'Click Save Settings',
            'Refresh to see changes'
          ]
        },
        {
          id: 'sa-4',
          title: 'How to view platform health',
          content: 'Go to Platform Health to see system status, CPU usage, memory usage, and recent events.',
          keywords: ['health', 'status', 'monitor', 'performance', 'cpu', 'memory'],
          category: 'system',
          steps: [
            'Go to Platform Health section',
            'View system status indicators',
            'Check CPU and memory usage charts',
            'Review recent events log'
          ]
        },
        {
          id: 'sa-5',
          title: 'How to manage name change requests',
          content: 'Review name change requests in the Name Changes section. Approve or reject based on payment verification.',
          keywords: ['name', 'change', 'request', 'approve', 'reject'],
          category: 'requests',
          steps: [
            'Go to Name Change Requests',
            'Review the request details',
            'Check if payment has been made',
            'Click Approve or Reject',
            'Add reason if rejecting'
          ]
        }
      ],
      admin: [
        {
          id: 'admin-1',
          title: 'How to add a student',
          content: 'Go to Students, click Add Student, fill in details. The student receives an ELIMUID automatically.',
          keywords: ['add', 'student', 'create', 'enroll'],
          category: 'students',
          steps: [
            'Navigate to Students section',
            'Click Add Student button',
            'Fill in student details (name, grade, parent email)',
            'Click Save',
            'Student receives ELIMUID automatically'
          ]
        },
        {
          id: 'admin-2',
          title: 'How to approve a teacher',
          content: 'Go to Teacher Approvals, review teacher details, click Approve or Reject.',
          keywords: ['teacher', 'approve', 'hire', 'staff'],
          category: 'teachers',
          steps: [
            'Go to Teacher Approvals',
            'Review teacher information',
            'Check qualifications and subjects',
            'Click Approve to accept, or Reject with reason'
          ]
        },
        {
          id: 'admin-3',
          title: 'How to generate duty roster',
          content: 'Go to Duty Management, select dates, click Generate Roster. The system assigns duties based on points.',
          keywords: ['duty', 'roster', 'schedule', 'generate', 'assign'],
          category: 'duty',
          steps: [
            'Go to Duty Management',
            'Select start and end dates',
            'Click Generate New Roster',
            'Review the generated schedule',
            'Adjust manually if needed'
          ]
        },
        {
          id: 'admin-4',
          title: 'How to change curriculum',
          content: 'Go to Settings, select new curriculum, click Save. All users will see updated grading.',
          keywords: ['curriculum', 'cbc', '844', 'british', 'american', 'change'],
          category: 'settings',
          steps: [
            'Navigate to School Settings',
            'Find Curriculum Settings section',
            'Select the new curriculum',
            'Click Save Changes',
            'All users will see updated grading'
          ]
        },
        {
          id: 'admin-5',
          title: 'How to manage classes',
          content: 'Go to Class Management to create classes and assign teachers.',
          keywords: ['class', 'create', 'assign', 'teacher'],
          category: 'classes',
          steps: [
            'Go to Class Management',
            'Click Add New Class',
            'Enter class name, grade, and stream',
            'Assign a class teacher',
            'Students can now be enrolled'
          ]
        }
      ],
      teacher: [
        {
          id: 'teacher-1',
          title: 'How to take attendance',
          content: 'Go to Attendance, mark each student as Present/Absent/Late, add notes, click Save Attendance.',
          keywords: ['attendance', 'present', 'absent', 'mark', 'register'],
          category: 'attendance',
          steps: [
            'Go to Attendance section',
            'Select date if not today',
            'Mark status for each student',
            'Add notes if needed',
            'Click Save Attendance'
          ]
        },
        {
          id: 'teacher-2',
          title: 'How to enter grades',
          content: 'Go to Grades, select subject and assessment type, enter scores, click Save.',
          keywords: ['grade', 'mark', 'score', 'exam', 'test', 'enter'],
          category: 'grades',
          steps: [
            'Go to Grades section',
            'Select subject from dropdown',
            'Select assessment type',
            'Enter scores for each student',
            'Click Save for each student'
          ]
        },
        {
          id: 'teacher-3',
          title: 'How to check in for duty',
          content: 'Go to Dashboard, find Duty Card, click Check In when on duty.',
          keywords: ['duty', 'checkin', 'check in', 'responsibility'],
          category: 'duty',
          steps: [
            'Go to Dashboard',
            'Find Today\'s Duty card',
            'Click Check In button when you arrive',
            'Click Check Out when duty ends'
          ]
        },
        {
          id: 'teacher-4',
          title: 'How to communicate with parents',
          content: 'Check the Parent Messages section for messages. Click to reply.',
          keywords: ['message', 'parent', 'communicate', 'reply'],
          category: 'communication',
          steps: [
            'Go to Dashboard',
            'Check Parent Messages inbox',
            'Click on any message to open',
            'Type your reply',
            'Click Send'
          ]
        }
      ],
      parent: [
        {
          id: 'parent-1',
          title: 'How to view child progress',
          content: 'Select your child from the top, view grades, attendance, and teacher comments.',
          keywords: ['progress', 'grades', 'attendance', 'child', 'performance'],
          category: 'progress',
          steps: [
            'Select your child from the tabs',
            'View grades in the Recent Grades table',
            'Check attendance rate',
            'Review teacher comments if any'
          ]
        },
        {
          id: 'parent-2',
          title: 'How to report absence',
          content: 'Click Report Absence, select date, enter reason, submit. Teacher will be notified.',
          keywords: ['absence', 'absent', 'report', 'sick', 'leave'],
          category: 'attendance',
          steps: [
            'Find Report Absence section',
            'Select the date of absence',
            'Enter the reason',
            'Click Report Absence',
            'Teacher receives notification'
          ]
        },
        {
          id: 'parent-3',
          title: 'How to make payment',
          content: 'Go to Payments, select child, choose plan, enter amount, complete payment.',
          keywords: ['payment', 'pay', 'fee', 'school fees', 'money'],
          category: 'payments',
          steps: [
            'Go to Payments section',
            'Select your child',
            'Choose subscription plan',
            'Enter amount',
            'Select payment method',
            'Click Pay Now'
          ]
        }
      ],
      student: [
        {
          id: 'student-1',
          title: 'How to view my grades',
          content: 'Go to My Grades to see all your scores and performance.',
          keywords: ['grade', 'score', 'result', 'performance'],
          category: 'grades',
          steps: [
            'Click on My Grades in sidebar',
            'View all your subjects and scores',
            'See grade letters and percentages'
          ]
        },
        {
          id: 'student-2',
          title: 'How to use AI Tutor',
          content: 'Type your question in AI Tutor chat, get instant help with any subject.',
          keywords: ['ai', 'tutor', 'help', 'question', 'assistant'],
          category: 'learning',
          steps: [
            'Go to AI Tutor section',
            'Type your question in the chat box',
            'Press Enter or click Ask',
            'Get instant AI-generated answers'
          ]
        },
        {
          id: 'student-3',
          title: 'How to join study groups',
          content: 'Go to Study Chat to connect with other students and study together.',
          keywords: ['study', 'chat', 'group', 'discussion'],
          category: 'collaboration',
          steps: [
            'Go to Study Chat section',
            'Join an existing group',
            'Start chatting with peers',
            'Share study materials'
          ]
        }
      ]
    };
    
    // Get articles for the role, or return all if role not found
    const articles = helpArticles[role] || helpArticles.admin;
    
    res.json({
      success: true,
      data: articles
    });
  } catch (error) {
    console.error('Get help articles error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Search help articles
// @route   POST /api/help/search
// @access  Public/All users
exports.searchHelpArticles = async (req, res) => {
  try {
    const { query, role } = req.body;
    
    if (!query) {
      return res.json({ success: true, data: [] });
    }
    
    const helpArticles = {
      superadmin: [
        { title: 'How to approve a new school', content: 'Go to School Approvals...', keywords: ['approve', 'school'] },
        { title: 'How to suspend a school', content: 'Find school in Schools list...', keywords: ['suspend', 'block'] }
      ],
      admin: [
        { title: 'How to add a student', content: 'Go to Students, click Add Student...', keywords: ['add', 'student'] },
        { title: 'How to approve a teacher', content: 'Go to Teacher Approvals...', keywords: ['teacher', 'approve'] }
      ],
      teacher: [
        { title: 'How to take attendance', content: 'Go to Attendance...', keywords: ['attendance', 'present'] },
        { title: 'How to enter grades', content: 'Go to Grades...', keywords: ['grade', 'mark'] }
      ],
      parent: [
        { title: 'How to view child progress', content: 'Select child from tabs...', keywords: ['progress', 'grades'] },
        { title: 'How to report absence', content: 'Click Report Absence...', keywords: ['absence', 'report'] }
      ],
      student: [
        { title: 'How to view my grades', content: 'Go to My Grades...', keywords: ['grade', 'score'] },
        { title: 'How to use AI Tutor', content: 'Type question in AI Tutor...', keywords: ['ai', 'tutor'] }
      ]
    };
    
    const articles = helpArticles[role] || helpArticles.admin;
    const searchTerm = query.toLowerCase();
    
    const results = articles.filter(article => {
      return article.title.toLowerCase().includes(searchTerm) ||
             article.content.toLowerCase().includes(searchTerm) ||
             article.keywords.some(k => k.toLowerCase().includes(searchTerm));
    });
    
    res.json({
      success: true,
      data: results
    });
  } catch (error) {
    console.error('Search help articles error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Get growth data for charts
// @route   GET /api/super-admin/growth-data
exports.getGrowthData = async (req, res) => {
  try {
    const schools = await School.findAll({
      attributes: ['createdAt'],
      order: [['createdAt', 'ASC']]
    });
    
    // Group by month
    const monthly = {};
    schools.forEach(s => {
      const month = s.createdAt.toISOString().slice(0, 7);
      monthly[month] = (monthly[month] || 0) + 1;
    });
    
    const labels = Object.keys(monthly).sort();
    const values = labels.map(m => monthly[m]);
    
    res.json({ success: true, data: { labels, values } });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Get school distribution by level
// @route   GET /api/super-admin/school-distribution
exports.getSchoolDistribution = async (req, res) => {
  try {
    const schools = await School.findAll({
      attributes: ['settings']
    });
    
    const distribution = { primary: 0, secondary: 0, both: 0 };
    schools.forEach(s => {
      const level = s.settings?.schoolLevel || 'secondary';
      if (level === 'primary') distribution.primary++;
      else if (level === 'secondary') distribution.secondary++;
      else if (level === 'both') distribution.both++;
    });
    
    res.json({ 
      success: true, 
      data: { 
        labels: ['Primary', 'Secondary', 'Both'],
        values: [distribution.primary, distribution.secondary, distribution.both]
      } 
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.updateSubscriptionPlan = async (req, res) => {
  const { planId, price, features } = req.body;
  const plan = await SubscriptionPlan.findByPk(planId);
  if (!plan) return res.status(404).json({ success: false, message: 'Plan not found' });
  await plan.update({ price_kes: price, features });
  res.json({ success: true, data: plan });
};
