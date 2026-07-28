const {
  Attendance,
  HomeTaskAssignment,
  HomeTask,
  AcademicRecord,
  AchievementEvent,
  StudentBadge,
  Badge,
  StudentReward
} = require('../models');
const { Op } = require('sequelize');

function number(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function completed(status) {
  return ['completed', 'submitted', 'graded', 'reviewed'].includes(String(status || '').toLowerCase());
}

function badgeStatus(earned, earnedLabel, lockedLabel) {
  return earned ? { earned: true, label: earnedLabel } : { earned: false, label: lockedLabel };
}

async function getStudentGamificationSummary(student, schoolCode, options = {}) {
  if (!student?.id) throw new Error('Student profile is required for gamification.');
  const queryOptions = options.transaction ? { transaction: options.transaction } : {};
  const [attendanceRows, homeworkRows, gradeRows, achievementRows, storedBadgeRows, redemptionRows] = await Promise.all([
    Attendance.findAll({
      where: {
        studentId: student.id,
        status: { [Op.ne]: 'holiday' },
        ...(schoolCode ? { schoolCode } : {})
      },
      order: [['date', 'DESC']],
      limit: 120,
      ...queryOptions
    }).catch(() => []),
    HomeTaskAssignment.findAll({
      where: { studentId: student.id },
      include: [{ model: HomeTask, required: false }],
      order: [['createdAt', 'DESC']],
      limit: 200,
      ...queryOptions
    }).catch(() => []),
    AcademicRecord.findAll({
      where: {
        studentId: student.id,
        ...(schoolCode ? { schoolCode } : {}),
        [Op.or]: [{ isPublished: true }, { status: 'published' }]
      },
      order: [['date', 'DESC'], ['createdAt', 'DESC']],
      limit: 240,
      ...queryOptions
    }).catch(() => []),
    AchievementEvent.findAll({
      where: {
        [Op.and]: [
          { [Op.or]: [{ studentId: student.id }, { userId: student.userId }] },
          ...(schoolCode ? [{ [Op.or]: [{ schoolCode }, { schoolCode: null }] }] : [])
        ]
      },
      order: [['createdAt', 'DESC']],
      limit: 100,
      ...queryOptions
    }).catch(() => []),
    StudentBadge.findAll({
      where: { studentId: student.id },
      include: [{ model: Badge, required: true, ...(schoolCode ? { where: { schoolId: schoolCode } } : {}) }],
      order: [['awardedAt', 'DESC']],
      ...queryOptions
    }).catch(() => []),
    StudentReward.findAll({
      where: { studentId: student.id },
      attributes: ['id', 'pointsSpent', 'createdAt'],
      ...queryOptions
    }).catch(() => [])
  ]);

  // Retain the defensive filter for case-variant or legacy values that predate
  // the normalized attendance status constraint.
  const attendanceEligible = attendanceRows.filter(row => String(row.status || '').toLowerCase() !== 'holiday');
  const attendanceMarked = attendanceEligible.length;
  const presentCount = attendanceEligible.filter(row => ['present', 'late'].includes(String(row.status || '').toLowerCase())).length;
  const attendanceRate = attendanceMarked ? Math.round((presentCount / attendanceMarked) * 100) : null;

  const homeworkTotal = homeworkRows.length;
  const homeworkDone = homeworkRows.filter(row => completed(row.status)).length;
  const homeworkRate = homeworkTotal ? Math.round((homeworkDone / homeworkTotal) * 100) : null;
  const homeworkPoints = homeworkRows.reduce((sum, row) => sum + (completed(row.status) ? number(row.pointsEarned) : 0), 0);

  const scoredRows = gradeRows
    .map(row => ({ row, score: Number(row.score) }))
    .filter(item => Number.isFinite(item.score));
  const averageScore = scoredRows.length
    ? Math.round(scoredRows.reduce((sum, item) => sum + item.score, 0) / scoredRows.length)
    : null;

  const bySubject = new Map();
  for (const item of scoredRows) {
    const subject = item.row.subject || 'General';
    const rows = bySubject.get(subject) || [];
    rows.push(item);
    bySubject.set(subject, rows);
  }
  let improvedSubjects = 0;
  for (const rows of bySubject.values()) {
    if (rows.length >= 2 && rows[0].score > rows[rows.length - 1].score) improvedSubjects += 1;
  }

  const teacherPoints = achievementRows.reduce((sum, row) => sum + number(row.points), 0);
  const redeemedPoints = redemptionRows.reduce((sum, row) => sum + number(row.pointsSpent), 0);
  const documentedEarnedPoints = homeworkPoints + teacherPoints;
  const storedPoints = Math.max(0, number(student.points));
  const totalPoints = documentedEarnedPoints > 0
    ? Math.max(storedPoints, Math.max(0, documentedEarnedPoints - redeemedPoints))
    : storedPoints;

  const computedBadges = [
    {
      key: 'attendance_star', icon: '⭐', title: 'Attendance Star', category: 'Attendance',
      description: attendanceRate === null ? 'Attendance badge appears after attendance is marked.' : `${attendanceRate}% across your recorded attendance.`,
      points: attendanceRate !== null && attendanceRate >= 95 ? 25 : 0,
      ...badgeStatus(attendanceRate !== null && attendanceRate >= 95, 'Earned', attendanceRate === null ? 'Waiting for records' : 'Reach 95%')
    },
    {
      key: 'homework_hero', icon: '📚', title: 'Homework Hero', category: 'Homework',
      description: homeworkRate === null ? 'Homework badge appears after assignments are issued.' : `${homeworkRate}% homework completion.`,
      points: homeworkRate !== null && homeworkRate >= 90 ? 25 : 0,
      ...badgeStatus(homeworkRate !== null && homeworkRate >= 90, 'Earned', homeworkRate === null ? 'Waiting for assignments' : 'Reach 90%')
    },
    {
      key: 'performance_badge', icon: '🏆', title: 'Performance Badge', category: 'Academics',
      description: averageScore === null ? 'Performance badge appears after marks are published.' : `Current published average is ${averageScore}%.`,
      points: averageScore !== null && averageScore >= 75 ? 30 : 0,
      ...badgeStatus(averageScore !== null && averageScore >= 75, 'Earned', averageScore === null ? 'Waiting for marks' : 'Reach 75% average')
    },
    {
      key: 'most_improved', icon: '📈', title: 'Most Improved', category: 'Improvement',
      description: scoredRows.length < 2 ? 'Improvement badge appears after more than one assessment.' : `${improvedSubjects} subject${improvedSubjects === 1 ? '' : 's'} improving.`,
      points: improvedSubjects > 0 ? 20 : 0,
      ...badgeStatus(improvedSubjects > 0, 'Earned', scoredRows.length < 2 ? 'Need more marks' : 'Improve next test')
    },
    {
      key: 'participation_points', icon: '💬', title: 'Participation Points', category: 'Participation',
      description: achievementRows.length ? `${achievementRows.length} teacher-awarded achievement event${achievementRows.length === 1 ? '' : 's'}.` : 'Teacher-awarded study participation will appear here.',
      points: teacherPoints,
      ...badgeStatus(teacherPoints > 0, 'Earned', 'Join study discussions')
    }
  ];

  const storedBadges = storedBadgeRows.map(row => {
    const raw = row.toJSON ? row.toJSON() : row;
    const badge = raw.Badge || {};
    return {
      key: `stored_${badge.id || raw.badgeId || raw.id}`,
      icon: badge.icon || '🏅',
      title: badge.name || 'School Badge',
      description: badge.description || 'Awarded by your school.',
      category: badge.category || 'School',
      points: number(badge.requiredPoints),
      earned: true,
      label: 'Earned',
      awardedAt: raw.awardedAt || raw.createdAt
    };
  });
  const knownBadgeTitles = new Set(computedBadges.map(row => String(row.title).toLowerCase()));
  const badges = [...computedBadges, ...storedBadges.filter(row => !knownBadgeTitles.has(String(row.title).toLowerCase()))];

  const actions = [];
  if (attendanceRate !== null && attendanceRate < 95) actions.push('Improve attendance consistency to unlock Attendance Star.');
  if (homeworkRate !== null && homeworkRate < 90) actions.push('Submit pending homework on time to unlock Homework Hero.');
  if (averageScore !== null && averageScore < 75) actions.push('Raise your average score to 75% for the Performance Badge.');
  if (teacherPoints <= 0) actions.push('Participate in study discussions so teachers can award points.');
  if (!actions.length && badges.some(row => row.earned)) actions.push('Great progress. Keep the streak going.');

  return {
    summary: {
      totalPoints,
      earnedPoints: documentedEarnedPoints || storedPoints + redeemedPoints,
      redeemedPoints,
      earnedBadges: badges.filter(row => row.earned).length,
      availableBadges: badges.length,
      attendanceRate,
      attendanceMarked,
      homeworkRate,
      homeworkDone,
      homeworkTotal,
      averageScore,
      participationEvents: achievementRows.length
    },
    badges,
    recentEvents: achievementRows.slice(0, 12).map(row => ({
      id: row.id,
      title: row.title || 'Achievement',
      note: row.note || '',
      points: number(row.points),
      createdAt: row.createdAt
    })),
    actions
  };
}

module.exports = {
  completed,
  getStudentGamificationSummary
};
