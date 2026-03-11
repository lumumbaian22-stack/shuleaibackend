const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middleware/auth');
const { School, Teacher, Student, User } = require('../models');
const { validate, validationRules } = require('../middleware/validation');
const teacherSignupController = require('../controllers/teacherSignupController');
const dutyController = require('../controllers/dutyController');

router.use(protect, authorize('admin', 'super_admin'));

// @desc    Get admin dashboard data
// @route   GET /api/admin/dashboard
router.get('/dashboard', async (req, res) => {
  try {
    const school = await School.findOne({ where: { schoolId: req.user.schoolCode } });
    
    const totalStudents = await Student.count({
      include: [{ model: User, where: { schoolId: req.user.schoolCode } }]
    });
    
    const totalTeachers = await Teacher.count({
      include: [{ model: User, where: { schoolId: req.user.schoolCode } }]
    });
    
    const pendingTeachers = await Teacher.count({
      where: { approvalStatus: 'pending' },
      include: [{ model: User, where: { schoolId: req.user.schoolCode } }]
    });

    res.json({
      success: true,
      data: {
        school: {
          name: school.name,
          id: school.schoolId,
          level: school.system
        },
        stats: {
          totalStudents,
          totalTeachers,
          pendingTeachers,
          attendanceRate: 94.2 // You can calculate this from Attendance model
        }
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Existing routes
router.get('/approvals/pending', teacherSignupController.getPendingApprovals);
router.get('/approvals/stats', teacherSignupController.getApprovalStats);
router.post('/teachers/:teacherId/approve', validationRules.approveTeacher, validate, teacherSignupController.approveTeacher);

// Duty management (existing)
router.post('/duty/generate', dutyController.generateDutyRoster);
router.get('/duty/stats', dutyController.getDutyStats);

// NEW: Optimized duty generation
router.post('/duty/generate-optimized', dutyController.generateOptimizedRoster);

// NEW: Exam supervision
router.post('/exam-supervision', dutyController.createExamSupervision);
router.get('/exam-supervision', dutyController.getExamSupervisions);
router.post('/exam-supervision/:examId/allocate', dutyController.allocateExamSupervisors);

module.exports = router;
