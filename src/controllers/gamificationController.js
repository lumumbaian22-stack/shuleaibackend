const { sequelize, Badge, StudentBadge, Reward, StudentReward, Student, Parent, User, AcademicRecord, Attendance, Class, HomeTaskAssignment, HomeTask, AchievementEvent } = require('../models');
const { Op } = require('sequelize');
const linkage = require('../services/schoolLinkageService');
const { getStudentGamificationSummary } = require('../services/studentGamificationService');


function normalizeScore(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

async function getCurrentStudent(req) {
  return Student.findOne({
    where: { userId: req.user.id },
    include: [{ model: User, required: true, where: { schoolCode: req.user.schoolCode }, attributes: ['id', 'name', 'email', 'schoolCode'] }]
  });
}

async function getSchoolStudent(studentId, schoolCode, transaction) {
  return Student.findOne({
    where: { id: Number(studentId) },
    include: [{ model: User, required: true, where: { schoolCode }, attributes: ['id', 'name', 'schoolCode'] }],
    transaction
  });
}

async function canViewStudent(req, student) {
  if (['admin', 'super_admin', 'teacher', 'finance_officer'].includes(req.user.role)) return true;
  if (req.user.role === 'student') return Number(student.userId) === Number(req.user.id);
  if (req.user.role === 'parent') {
    const parent = await Parent.findOne({ where: { userId: req.user.id } });
    return Boolean(parent && await parent.hasStudent(student));
  }
  return false;
}

async function canViewClassLeaderboard(req, classId) {
  const role = String(req.user.role || '').toLowerCase();
  if (['admin', 'super_admin', 'finance_officer'].includes(role)) return true;
  if (role === 'student') {
    const student = await getCurrentStudent(req);
    const cls = student ? await linkage.resolveStudentClass(student, req.user.schoolCode).catch(() => null) : null;
    return Number(cls?.id) === Number(classId);
  }
  if (role === 'parent') {
    const children = await linkage.resolveParentLinkedStudents(req.user.id, req.user.schoolCode).catch(() => []);
    for (const child of children) {
      const cls = await linkage.resolveStudentClass(child, req.user.schoolCode).catch(() => null);
      if (Number(cls?.id) === Number(classId)) return true;
    }
    return false;
  }
  if (role === 'teacher') {
    const classes = await linkage.resolveTeacherAssignedClasses(req.user.id, req.user.schoolCode).catch(() => []);
    return classes.some(cls => Number(cls.id) === Number(classId));
  }
  return false;
}

function badgeStatus(earned, labelWhenEarned, labelWhenLocked) {
  return earned ? { earned: true, label: labelWhenEarned } : { earned: false, label: labelWhenLocked };
}

exports.getMyRewardsSummary = async (req, res) => {
  try {
    if (req.user.role !== 'student') {
      return res.status(403).json({ success: false, message: 'Only students can view personal rewards' });
    }

    const student = await getCurrentStudent(req);
    if (!student) return res.status(404).json({ success: false, message: 'Student profile not found' });
    const summary = await getStudentGamificationSummary(student, req.user.schoolCode);
    res.json({
      success: true,
      data: {
        student: { id: student.id, name: student.User?.name || 'Student', grade: student.grade, classId: student.classId, elimuid: student.elimuid },
        ...summary
      }
    });
  } catch (error) {
    console.error('getMyRewardsSummary error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// Leaderboard for a class (points)
exports.getClassLeaderboard = async (req, res) => {
  try {
    const { classId } = req.params;
    const classItem = await Class.findOne({ where: { id: Number(classId), schoolCode: req.user.schoolCode } });
    if (!classItem) return res.status(404).json({ success: false, message: 'Class not found' });
    if (!(await canViewClassLeaderboard(req, classItem.id))) {
      return res.status(403).json({ success: false, message: 'You cannot view this class leaderboard' });
    }

    const students = await linkage.resolveClassStudents([classItem.id], req.user.schoolCode, { limit: 200 }).catch(() => []);
    const scored = await Promise.all(students.map(async student => ({
      student,
      gamification: await getStudentGamificationSummary(student, req.user.schoolCode)
    })));
    scored.sort((a, b) => b.gamification.summary.totalPoints - a.gamification.summary.totalPoints);
    const leaderboard = scored.slice(0, 20).map(({ student: s, gamification }, index) => ({
        rank: index + 1,
        studentId: s.id,
        userId: s.userId || s.User?.id,
        name: s.User?.name || `Student ${s.id}`,
        elimuid: s.elimuid || '',
        points: gamification.summary.totalPoints
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
    const student = await getSchoolStudent(studentId, req.user.schoolCode);
    if (!student) return res.status(404).json({ success: false, message: 'Student not found in your school' });
    if (!(await canViewStudent(req, student))) return res.status(403).json({ success: false, message: 'You cannot view this student\'s badges' });
    const badges = await StudentBadge.findAll({
      where: { studentId },
      include: [{ model: Badge, required: true, where: { schoolId: req.user.schoolCode } }]
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
    const [student, badge] = await Promise.all([
      getSchoolStudent(studentId, req.user.schoolCode),
      Badge.findOne({ where: { id: Number(badgeId), schoolId: req.user.schoolCode } })
    ]);
    if (!student) return res.status(404).json({ success: false, message: 'Student not found in your school' });
    if (!badge) return res.status(404).json({ success: false, message: 'Badge not found in your school' });
    await StudentBadge.findOrCreate({ where: { studentId: Number(studentId), badgeId: Number(badgeId) } });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Rewards store. This is now a real store only; no fake default rewards are returned.
exports.getRewards = async (req, res) => {
  try {
    const rewards = await Reward.findAll({
      where: { schoolId: req.user.schoolCode, isActive: true },
      order: [['pointsCost', 'ASC']]
    });
    res.json({ success: true, data: rewards || [] });
  } catch (error) {
    console.error('getRewards error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.redeemReward = async (req, res) => {
  const transaction = await sequelize.transaction();
  try {
    const { rewardId } = req.body;
    const student = await Student.findOne({ where: { userId: req.user.id }, transaction, lock: transaction.LOCK.UPDATE });
    const reward = await Reward.findOne({ where: { id: Number(rewardId), schoolId: req.user.schoolCode, isActive: true }, transaction, lock: transaction.LOCK.UPDATE });
    if (!student) { await transaction.rollback(); return res.status(404).json({ success: false, message: 'Student profile not found' }); }
    if (!reward) { await transaction.rollback(); return res.status(404).json({ success: false, message: 'Reward not found in your school' }); }
    const gamification = await getStudentGamificationSummary(student, req.user.schoolCode, { transaction });
    if (gamification.summary.totalPoints < reward.pointsCost) {
      await transaction.rollback();
      return res.status(400).json({ success: false, message: 'Insufficient points' });
    }
    if (Number(reward.quantity) === 0) {
      await transaction.rollback();
      return res.status(409).json({ success: false, message: 'Reward is out of stock' });
    }
    // Deduct points
    student.points = Math.max(0, Number(student.points || 0) - Number(reward.pointsCost || 0));
    await student.save({ transaction });
    // Create redemption record
    await StudentReward.create({
      studentId: student.id,
      rewardId: reward.id,
      pointsSpent: reward.pointsCost
    }, { transaction });
    // If quantity limited, reduce
    if (reward.quantity > 0) {
      reward.quantity -= 1;
      await reward.save({ transaction });
    }
    await transaction.commit();
    const pointsRemaining = Math.max(0, Number(gamification.summary.totalPoints || 0) - Number(reward.pointsCost || 0));
    res.json({ success: true, message: 'Reward redeemed', pointsRemaining });
  } catch (error) {
    if (!transaction.finished) await transaction.rollback();
    res.status(500).json({ success: false, message: error.message });
  }
};
