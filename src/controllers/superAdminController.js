const { School, User, Admin, SchoolNameRequest, Student, Teacher, Parent, ApprovalRequest } = require('../models');
const { createAlert } = require('../services/notificationService');
const { Op } = require('sequelize');

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
                as: 'admins', // Using the 'admins' alias defined in index.js
                attributes: ['id', 'name', 'email', 'phone'],
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
                as: 'admins', // Using the 'admins' alias defined in index.js
                attributes: ['id', 'name', 'email', 'phone', 'createdAt'],
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

// @desc    Approve school
// @route   POST /api/super-admin/schools/:id/approve
// @access  Private/SuperAdmin
exports.approveSchool = async (req, res) => {
    try {
        const { id } = req.params;
        const school = await School.findByPk(id);
        
        if (!school) {
            return res.status(404).json({ success: false, message: 'School not found' });
        }

        school.status = 'active';
        school.isActive = true;
        school.approvedBy = req.user.id;
        school.approvedAt = new Date();
        await school.save();

        // Activate admin users
        await User.update(
            { isActive: true },
            { where: { schoolCode: school.schoolId, role: 'admin' } }
        );

        // Get admin users
        const admins = await User.findAll({ 
            where: { schoolCode: school.schoolId, role: 'admin' } 
        });
        
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
        }

        res.json({ 
            success: true, 
            message: 'School approved successfully',
            data: school
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
      if (sa.id !== req.user.id) { // Don't notify the one who performed the action
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

    // Reactivate admin users only (teachers and others can be reactivated by admin)
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
