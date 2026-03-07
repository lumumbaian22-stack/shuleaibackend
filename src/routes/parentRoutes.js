const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middleware/auth');
const { Parent, Student, User } = require('../models');

router.use(protect, authorize('parent'));

// @desc    Get parent dashboard data
// @route   GET /api/parent/dashboard
router.get('/dashboard', async (req, res) => {
  try {
    const parent = await Parent.findOne({ where: { userId: req.user.id } });
    const children = await parent.getStudents({ 
      include: [{ model: User, attributes: ['name'] }] 
    });

    res.json({
      success: true,
      data: {
        children: children.map(c => ({
          id: c.id,
          name: c.User.name,
          grade: c.grade,
          elimuid: c.elimuid
        }))
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;
