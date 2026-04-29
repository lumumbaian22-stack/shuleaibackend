const { Badge, StudentBadge, Reward, StudentReward, Student, User, AcademicRecord, Attendance, Class } = require('../models');
const { Op } = require('sequelize');

// Leaderboard for a class (points)
exports.getClassLeaderboard = async (req, res) => {
  try {
    const { classId } = req.params;
    const classItem = await Class.findByPk(classId);
    if (!classItem) return res.status(404).json({ success: false, message: 'Class not found' });

    const students = await Student.findAll({
      where: { grade: classItem.name },
      include: [{ model: User, attributes: ['name'] }],
      order: [['points', 'DESC']],
      limit: 20
    });

    const leaderboard = students.map((s, index) => ({
      rank: index + 1,
      studentId: s.id,
      name: s.User.name,
      points: s.points
    }));

    res.json({ success: true, data: leaderboard });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Get student badges
exports.getStudentBadges = async (req, res) => {
  try {
    const { studentId } = req.params;
    const badges = await StudentBadge.findAll({
      where: { studentId },
      include: [{ model: Badge }]
    });
    res.json({ success: true, data: badges });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Admin: create badge
exports.createBadge = async (req, res) => {
  try {
    const { name, description, icon, category, requiredPoints } = req.body;
    const badge = await Badge.create({
      name, description, icon, category, requiredPoints,
      schoolId: req.user.schoolCode
    });
    res.status(201).json({ success: true, data: badge });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Admin: award badge to student
exports.awardBadge = async (req, res) => {
  try {
    const { studentId, badgeId } = req.body;
    await StudentBadge.create({ studentId, badgeId });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Rewards store
exports.getRewards = async (req, res) => {
  try {
    let rewards = await Reward.findAll({
      where: { schoolId: req.user.schoolCode, isActive: true }
    });

    if (!rewards || rewards.length === 0) {
      rewards = [
        { id: 'default-1', name: 'Homework Hero', description: 'Complete homework consistently', pointsCost: 50, cost: 50, icon: '📚', isActive: true },
        { id: 'default-2', name: 'Attendance Star', description: 'Great attendance streak', pointsCost: 75, cost: 75, icon: '⭐', isActive: true },
        { id: 'default-3', name: 'Top Effort', description: 'Keep improving your scores', pointsCost: 100, cost: 100, icon: '🏆', isActive: true }
      ];
    }

    res.json({ success: true, data: rewards });
  } catch (error) {
    console.warn('Rewards store fallback used:', error.message);
    res.json({
      success: true,
      data: [
        { id: 'default-1', name: 'Homework Hero', description: 'Complete homework consistently', pointsCost: 50, cost: 50, icon: '📚', isActive: true },
        { id: 'default-2', name: 'Attendance Star', description: 'Great attendance streak', pointsCost: 75, cost: 75, icon: '⭐', isActive: true },
        { id: 'default-3', name: 'Top Effort', description: 'Keep improving your scores', pointsCost: 100, cost: 100, icon: '🏆', isActive: true }
      ]
    });
  }
};

exports.redeemReward = async (req, res) => {
  try {
    const { rewardId } = req.body;
    const student = await Student.findOne({ where: { userId: req.user.id } });
    const reward = await Reward.findByPk(rewardId);
    if (!reward) return res.status(404).json({ success: false, message: 'Reward not found' });
    if (student.points < reward.pointsCost) {
      return res.status(400).json({ success: false, message: 'Insufficient points' });
    }
    // Deduct points
    student.points -= reward.pointsCost;
    await student.save();
    // Create redemption record
    await StudentReward.create({
      studentId: student.id,
      rewardId: reward.id,
      pointsSpent: reward.pointsCost
    });
    // If quantity limited, reduce
    if (reward.quantity > 0) {
      reward.quantity -= 1;
      await reward.save();
    }
    res.json({ success: true, message: 'Reward redeemed', pointsRemaining: student.points });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
