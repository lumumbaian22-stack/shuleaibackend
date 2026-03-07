const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middleware/auth');
const { Teacher, Student, User } = require('../models');

router.use(protect, authorize('teacher'));

// @desc    Get teacher dashboard data
// @route   GET /api/teacher/dashboard
router.get('/dashboard', async (req, res) => {
  try {
    const teacher = await Teacher.findOne({ where: { userId: req.user.id } });
    
    const students = await Student.findAll({
      where: { grade: teacher.classTeacher },
      include: [{ model: User, attributes: ['name', 'email'] }]
    });

    res.json({
      success: true,
      data: {
        stats: {
          totalStudents: students.length,
          totalClasses: 1
        },
        students: students.map(s => ({
          id: s.id,
          name: s.User.name,
          grade: s.grade,
          elimuid: s.elimuid
        }))
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;
