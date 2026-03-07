const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middleware/auth');
const { School, User } = require('../models');

router.use(protect, authorize('super_admin'));

// @desc    Get super admin overview
// @route   GET /api/super-admin/overview
router.get('/overview', async (req, res) => {
  try {
    const totalSchools = await School.count();
    const activeAdmins = await User.count({ where: { role: 'admin' } });
    
    // Get pending schools (schools waiting for approval)
    const pendingSchools = await School.findAll({ 
      where: { isActive: false },
      limit: 5
    });
    
    // Get paid schools
    const paidSchools = await School.findAll({ 
      where: { isActive: true },
      limit: 5
    });

    res.json({
      success: true,
      data: {
        totalSchools,
        activeAdmins,
        newSchoolsThisMonth: 3, // You can calculate this from createdAt
        pendingApprovals: 6,
        revenue: 1240, // Add real calculation later
        revenueGrowth: 15, // Add real calculation later
        schools: [ // Your school list
          { id: 1, name: 'Nairobi High School', adminEmail: 'admin@nairobi.edu', level: 'Secondary', curriculum: 'cbc', status: 'active', paid: true }
        ],
        pendingSchools: pendingSchools.map(s => ({
          id: s.id,
          name: s.name,
          admin: 'admin@school.com', // You'll need to fetch this
          level: s.system === '844' ? 'Secondary' : 'Primary',
          curriculum: s.system,
          date: s.createdAt
        })),
        paidSchools: paidSchools.map(s => ({
          id: s.id,
          name: s.name,
          customName: s.name,
          paid: true,
          enabled: s.isActive
        })),
        nameChangeRequests: [] // Add your name change requests here
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});
module.exports = router;

