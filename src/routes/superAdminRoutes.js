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

    res.json({
      success: true,
      data: {
        totalSchools,
        activeAdmins,
        newSchoolsThisMonth: 3,
        pendingApprovals: 6
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;
