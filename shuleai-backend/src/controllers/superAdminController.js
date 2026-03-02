const { School, User, Admin, SchoolNameRequest, Student, Teacher, Parent } = require('../models');
const { createAlert } = require('../services/notificationService');
const { Op } = require('sequelize');

exports.getOverview = async (req, res) => {
  try {
    const stats = {
      schools: await School.count(),
      students: await Student.count(),
      teachers: await Teacher.count(),
      parents: await Parent.count(),
      pendingRequests: await SchoolNameRequest.count({ where: { status: 'pending' } }),
      users: await User.count()
    };
    res.json({ success: true, data: { stats } });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.getSchools = async (req, res) => {
  try {
    const schools = await School.findAll({ order: [['createdAt', 'DESC']] });
    res.json({ success: true, data: schools });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.createSchool = async (req, res) => {
  try {
    const { name, system, address, contact } = req.body;
    
    const school = await School.create({
      name,
      system: system || '844',
      address,
      contact,
      createdBy: req.user.id,
      useCustomName: false,
      customName: null
    });

    const adminUser = await User.create({
      name: `Admin ${school.name}`,
      email: `admin@${school.schoolId.toLowerCase()}.edu`,
      password: 'Admin123!',
      role: 'admin',
      schoolCode: school.code,
      isActive: true
    });

    await Admin.create({
      userId: adminUser.id,
      position: 'School Administrator',
      managedSchools: [school.id]
    });

    res.status(201).json({ success: true, message: 'School created successfully', data: school });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.updateSchool = async (req, res) => {
  try {
    const { id } = req.params;
    const school = await School.findByPk(id);
    
    if (!school) {
      return res.status(404).json({ success: false, message: 'School not found' });
    }

    const allowedFields = ['name', 'system', 'address', 'contact', 'settings', 'isActive', 'useCustomName', 'customName'];
    allowedFields.forEach(field => {
      if (req.body[field] !== undefined) {
        school[field] = req.body[field];
      }
    });

    await school.save();
    res.json({ success: true, data: school });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.deleteSchool = async (req, res) => {
  try {
    const { id } = req.params;
    const school = await School.findByPk(id);
    
    if (!school) {
      return res.status(404).json({ success: false, message: 'School not found' });
    }

    await User.destroy({ where: { schoolCode: school.code } });
    await school.destroy();

    res.json({ success: true, message: 'School and all associated data deleted' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.getPendingRequests = async (req, res) => {
  try {
    const requests = await SchoolNameRequest.findAll({
      where: { status: 'pending' },
      include: [{ model: User, attributes: ['name', 'email'] }],
      order: [['createdAt', 'DESC']]
    });
    res.json({ success: true, data: requests });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.approveRequest = async (req, res) => {
  try {
    const { id } = req.params;
    const request = await SchoolNameRequest.findByPk(id);
    
    if (!request) {
      return res.status(404).json({ success: false, message: 'Request not found' });
    }

    request.status = 'approved';
    request.reviewedBy = req.user.id;
    request.reviewedAt = new Date();
    await request.save();

    const school = await School.findOne({ where: { code: request.schoolCode } });
    if (school) {
      school.customName = request.newName;
      school.useCustomName = true;
      await school.save();
    }

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
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.rejectRequest = async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;
    const request = await SchoolNameRequest.findByPk(id);
    
    if (!request) {
      return res.status(404).json({ success: false, message: 'Request not found' });
    }

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
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.updateBankDetails = async (req, res) => {
  try {
    const { schoolId } = req.params;
    const school = await School.findByPk(schoolId);
    
    if (!school) {
      return res.status(404).json({ success: false, message: 'School not found' });
    }

    school.bankDetails = req.body;
    await school.save();

    res.json({ success: true, data: school.bankDetails });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
