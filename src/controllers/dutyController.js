const { Op } = require('sequelize');
const { DutyRoster, Teacher, School, User, Alert } = require('../models');
const moment = require('moment');
const { DUTY_AREAS, DUTY_TIME_SLOTS } = require('../config/constants');
const { createAlert, createBulkAlerts } = require('../services/notificationService');
const dutyFairness = require('../utils/dutyFairness');
const { User, Teacher, School, DutyRoster } = require('../models');

// ============ HELPER FUNCTIONS (Define these FIRST) ============

async function checkUnderstaffedDays(schoolId, startDate, endDate) {
  const rosters = await DutyRoster.findAll({
    where: {
      schoolId,
      date: { [Op.between]: [startDate, endDate] }
    }
  });

  const understaffedDays = [];
  const requiredPerArea = { morning: 2, lunch: 3, afternoon: 2 };

  rosters.forEach(roster => {
    const areaCount = {};
    roster.duties.forEach(d => {
      areaCount[d.type] = (areaCount[d.type] || 0) + 1;
    });

    const missing = [];
    Object.entries(requiredPerArea).forEach(([area, required]) => {
      if ((areaCount[area] || 0) < required) {
        missing.push(area);
      }
    });

    if (missing.length > 0) {
      understaffedDays.push({
        date: roster.date,
        missingAreas: missing
      });
    }
  });

  return understaffedDays;
}

function generateRecommendations(teacherStats, departmentStats) {
  const recommendations = [];

  // Find overworked teachers
  const avgDuties = teacherStats.reduce((a, b) => a + b.scheduled, 0) / teacherStats.length || 0;
  const overworked = teacherStats.filter(t => t.scheduled > avgDuties * 1.5);
  if (overworked.length > 0) {
    recommendations.push({
      type: 'workload_balance',
      message: `${overworked.length} teachers have above-average duty load`,
      teachers: overworked.map(t => t.teacherName)
    });
  }

  // Find understaffed departments
  Object.entries(departmentStats).forEach(([dept, stats]) => {
    const deptAvg = stats.totalDuties / stats.teachers;
    if (deptAvg > 10) {
      recommendations.push({
        type: 'department_overload',
        department: dept,
        message: `${dept} department has high duty load (${deptAvg.toFixed(1)} per teacher)`
      });
    }
  });

  return recommendations;
}

// ============ MAIN CONTROLLER FUNCTIONS ============

// @desc    Get duty statistics (for admin)
// @route   GET /api/admin/duty/stats
// @access  Private/Admin
exports.getDutyStats = async (req, res) => {
  try {
    // FIXED: Changed from 'code' to 'schoolId'
    const school = await School.findOne({ where: { schoolId: req.user.schoolCode } });
    if (!school) {
      return res.status(404).json({ success: false, message: 'School not found' });
    }

    const startOfMonth = moment().startOf('month');
    const endOfMonth = moment().endOf('month');

    const rosters = await DutyRoster.findAll({
      where: {
        schoolId: school.schoolId,
        date: { [Op.between]: [startOfMonth.format('YYYY-MM-DD'), endOfMonth.format('YYYY-MM-DD')] }
      }
    });

    // FIXED: Changed from 'school.code' to 'school.schoolId'
    const teachers = await Teacher.findAll({
      include: [{ model: User, where: { schoolCode: school.schoolId } }]
    });

    const stats = {
      totalDuties: rosters.reduce((acc, r) => acc + r.duties.length, 0),
      completedDuties: rosters.reduce((acc, r) => acc + r.duties.filter(d => d.status === 'completed').length, 0),
      missedDuties: rosters.reduce((acc, r) => acc + r.duties.filter(d => d.status === 'missed').length, 0),
      teacherPerformance: teachers.map(t => {
        const teacherDuties = rosters.flatMap(r => r.duties.filter(d => d.teacherId === t.id));
        const completed = teacherDuties.filter(d => d.status === 'completed').length;
        return {
          teacherName: t.User?.name || 'Unknown',
          assigned: teacherDuties.length,
          completed,
          rate: teacherDuties.length ? (completed / teacherDuties.length * 100).toFixed(1) : 0
        };
      })
    };

    res.json({ success: true, data: stats });
  } catch (error) {
    console.error('Get duty stats error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Generate duty roster with fairness balancing
// @route   POST /api/admin/duty/generate
// @access  Private/Admin
exports.generateDutyRoster = async (req, res) => {
  try {
    const { startDate, endDate, type = 'auto' } = req.body;
    // FIXED: Changed from 'code' to 'schoolId'
    const school = await School.findOne({ where: { schoolId: req.user.schoolCode } });
    if (!school) {
      return res.status(404).json({ success: false, message: 'School not found' });
    }
    
    const start = moment(startDate || new Date());
    const end = moment(endDate || moment().add(7, 'days'));
    const days = end.diff(start, 'days') + 1;

    const dutySlots = ['morning', 'lunch', 'afternoon'];
    const rosters = [];
    const alerts = [];
    const understaffedAlerts = [];

    // Reset weekly counts if Monday
    if (moment().day() === 1) {
      await Teacher.update(
        { 'statistics.weeklyDutyCount': 0 },
        { where: { approvalStatus: 'approved' } }
      );
    }

    for (let i = 0; i < days; i++) {
      const currentDate = moment(start).add(i, 'days');
      if (currentDate.day() === 0) continue; // skip Sunday

      const dateStr = currentDate.format('YYYY-MM-DD');
      const dayOfWeek = currentDate.format('dddd').toLowerCase();

      // Check if roster already exists
      const existing = await DutyRoster.findOne({
        where: { schoolId: school.schoolId, date: dateStr }
      });
      if (existing) {
        rosters.push(existing);
        continue;
      }

      const dayDuties = [];

      // Assign duties for each slot
      for (const slot of dutySlots) {
        const required = school.settings?.dutyManagement?.teachersPerSlot?.[slot] || 
                        (slot === 'lunch' ? 3 : 2);

        const { assigned, conflicts, shortage } = await dutyFairness.assignDutyFairly(
          school.schoolId,
          dateStr,
          slot,
          required
        );

        // Add assigned duties
        assigned.forEach(teacher => {
          dayDuties.push({
            teacherId: teacher.id,
            teacherName: teacher.User?.name || 'Unknown',
            type: slot,
            area: DUTY_AREAS[slot],
            timeSlot: DUTY_TIME_SLOTS[slot],
            status: 'scheduled'
          });

          // Update teacher statistics
          dutyFairness.updateTeacherDutyStats(teacher.id, 'assign');

          // Create alert for teacher
          alerts.push({
            userId: teacher.User?.id,
            role: 'teacher',
            type: 'duty',
            severity: 'info',
            title: 'Duty Assignment',
            message: `You are assigned to ${slot} duty on ${currentDate.format('MMM Do')}`,
            data: { date: dateStr, dutyType: slot, area: DUTY_AREAS[slot] }
          });
        });

        // Track understaffed slots
        if (shortage > 0) {
          understaffedAlerts.push({
            date: dateStr,
            slot,
            required,
            assigned: assigned.length,
            shortage
          });
        }
      }

      if (dayDuties.length) {
        const roster = await DutyRoster.create({
          schoolId: school.schoolId,
          date: dateStr,
          duties: dayDuties,
          createdBy: req.user.id,
          metadata: { 
            generationMethod: type,
            generatedAt: new Date()
          }
        });
        rosters.push(roster);
      }
    }

    // Create all alerts in bulk
    if (alerts.length > 0) {
      await Alert.bulkCreate(alerts);
    }

    // Check for understaffed areas and alert admin
    const understaffed = await dutyFairness.checkUnderstaffedAreas(
      school.schoolId,
      moment().format('YYYY-MM-DD')
    );

    if (understaffed.length > 0) {
      // FIXED: Changed from 'school.code' to 'school.schoolId'
      const admins = await User.findAll({ 
        where: { 
          role: 'admin', 
          schoolCode: school.schoolId 
        } 
      });

      for (const admin of admins) {
        await createAlert({
          userId: admin.id,
          role: 'admin',
          type: 'duty',
          severity: 'warning',
          title: 'Understaffed Areas Detected',
          message: `${understaffed.length} areas need more teachers`,
          data: { understaffed }
        });
      }
    }

    // Send real-time updates via WebSocket
    if (global.io) {
      global.io.to(`school-${school.schoolId}`).emit('duty-roster-updated', {
        message: 'New duty roster generated',
        count: rosters.length
      });
    }

    res.json({ 
      success: true, 
      message: `Generated ${rosters.length} rosters`, 
      data: {
        rosters,
        understaffed: understaffedAlerts,
        stats: {
          totalDuties: rosters.reduce((acc, r) => acc + r.duties.length, 0),
          totalAlerts: alerts.length,
          understaffedCount: understaffedAlerts.length
        }
      }
    });
  } catch (error) {
    console.error('Duty generation error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Get duty fairness report
// @route   GET /api/admin/duty/fairness-report
// @access  Private/Admin
exports.getFairnessReport = async (req, res) => {
  try {
    // FIXED: Changed from 'code' to 'schoolId'
    const school = await School.findOne({ where: { schoolId: req.user.schoolCode } });
    if (!school) {
      return res.status(404).json({ success: false, message: 'School not found' });
    }

    const teachers = await Teacher.findAll({
      where: { approvalStatus: 'approved' },
      include: [{ model: User, attributes: ['name', 'email'] }]
    });

    const startOfMonth = moment().startOf('month').format('YYYY-MM-DD');
    const endOfMonth = moment().endOf('month').format('YYYY-MM-DD');

    const rosters = await DutyRoster.findAll({
      where: {
        schoolId: school.schoolId,
        date: { [Op.between]: [startOfMonth, endOfMonth] }
      }
    });

    // Calculate statistics per teacher
    const teacherStats = teachers.map(teacher => {
      const teacherDuties = rosters.flatMap(r => 
        r.duties.filter(d => d.teacherId === teacher.id)
      );

      const completed = teacherDuties.filter(d => d.status === 'completed').length;
      const missed = teacherDuties.filter(d => d.status === 'missed').length;
      const scheduled = teacherDuties.length;

      return {
        teacherId: teacher.id,
        teacherName: teacher.User?.name || 'Unknown',
        department: teacher.department || 'general',
        scheduled,
        completed,
        missed,
        completionRate: scheduled ? ((completed / scheduled) * 100).toFixed(1) : 0,
        monthlyDutyCount: teacher.statistics?.monthlyDutyCount || 0,
        reliabilityScore: teacher.statistics?.reliabilityScore || 100,
        preferences: teacher.dutyPreferences
      };
    });

    // Calculate department stats
    const departmentStats = {};
    teacherStats.forEach(stat => {
      const dept = stat.department;
      if (!departmentStats[dept]) {
        departmentStats[dept] = {
          teachers: 0,
          totalDuties: 0,
          completedDuties: 0,
          missedDuties: 0
        };
      }
      departmentStats[dept].teachers++;
      departmentStats[dept].totalDuties += stat.scheduled;
      departmentStats[dept].completedDuties += stat.completed;
      departmentStats[dept].missedDuties += stat.missed;
    });

    // Calculate fairness score (standard deviation of duty distribution)
    const dutyCounts = teacherStats.map(t => t.scheduled);
    const mean = dutyCounts.reduce((a, b) => a + b, 0) / dutyCounts.length || 0;
    const variance = dutyCounts.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / dutyCounts.length;
    const stdDev = Math.sqrt(variance);
    const fairnessScore = Math.max(0, Math.min(100, 100 - (stdDev / mean * 100) || 100));

    res.json({
      success: true,
      data: {
        period: {
          month: moment().format('MMMM YYYY'),
          start: startOfMonth,
          end: endOfMonth
        },
        summary: {
          totalTeachers: teachers.length,
          totalDuties: rosters.reduce((acc, r) => acc + r.duties.length, 0),
          fairnessScore: fairnessScore.toFixed(1),
          understaffedDays: await checkUnderstaffedDays(school.schoolId, startOfMonth, endOfMonth)
        },
        departmentStats,
        teacherStats: teacherStats.sort((a, b) => a.scheduled - b.scheduled),
        recommendations: generateRecommendations(teacherStats, departmentStats)
      }
    });
  } catch (error) {
    console.error('Fairness report error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Manual duty adjustment
// @route   POST /api/admin/duty/adjust
// @access  Private/Admin
exports.manualAdjustDuty = async (req, res) => {
  try {
    const { date, teacherId, newTeacherId, dutyType, reason } = req.body;
    // FIXED: Changed from 'code' to 'schoolId'
    const school = await School.findOne({ where: { schoolId: req.user.schoolCode } });
    if (!school) {
      return res.status(404).json({ success: false, message: 'School not found' });
    }

    const roster = await DutyRoster.findOne({
      where: { schoolId: school.schoolId, date }
    });

    if (!roster) {
      return res.status(404).json({ success: false, message: 'Roster not found' });
    }

    // Find and update the duty
    const dutyIndex = roster.duties.findIndex(
      d => d.teacherId === parseInt(teacherId) && d.type === dutyType
    );

    if (dutyIndex === -1) {
      return res.status(404).json({ success: false, message: 'Duty not found' });
    }

    const oldTeacherId = roster.duties[dutyIndex].teacherId;
    
    // Update duty
    roster.duties[dutyIndex].teacherId = parseInt(newTeacherId);
    roster.duties[dutyIndex].teacherName = req.body.newTeacherName;
    roster.duties[dutyIndex].adjustedBy = req.user.id;
    roster.duties[dutyIndex].adjustedAt = new Date();
    roster.duties[dutyIndex].adjustmentReason = reason;

    await roster.save();

    // Update statistics
    await dutyFairness.updateTeacherDutyStats(oldTeacherId, 'unassign');
    await dutyFairness.updateTeacherDutyStats(newTeacherId, 'assign');

    // Notify affected teachers
    const alerts = [
      {
        userId: oldTeacherId,
        role: 'teacher',
        type: 'duty',
        severity: 'info',
        title: 'Duty Adjustment',
        message: `Your duty on ${moment(date).format('MMM Do')} has been reassigned.`
      },
      {
        userId: newTeacherId,
        role: 'teacher',
        type: 'duty',
        severity: 'info',
        title: 'New Duty Assignment',
        message: `You have been assigned to ${dutyType} duty on ${moment(date).format('MMM Do')}.`
      }
    ];

    await Alert.bulkCreate(alerts);

    res.json({
      success: true,
      message: 'Duty adjusted successfully',
      data: roster.duties[dutyIndex]
    });
  } catch (error) {
    console.error('Manual adjust error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Get understaffed areas
// @route   GET /api/admin/duty/understaffed
// @access  Private/Admin
exports.getUnderstaffedAreas = async (req, res) => {
  try {
    // FIXED: Changed from 'code' to 'schoolId'
    const school = await School.findOne({ where: { schoolId: req.user.schoolCode } });
    if (!school) {
      return res.status(404).json({ success: false, message: 'School not found' });
    }

    const today = moment().format('YYYY-MM-DD');
    const nextWeek = moment().add(7, 'days').format('YYYY-MM-DD');

    const understaffed = [];
    
    for (let date = moment(today); date.isBefore(nextWeek); date.add(1, 'day')) {
      if (date.day() === 0) continue; // skip Sunday
      
      const result = await dutyFairness.checkUnderstaffedAreas(
        school.schoolId,
        date.format('YYYY-MM-DD')
      );
      
      if (result.length > 0) {
        understaffed.push({
          date: date.format('YYYY-MM-DD'),
          areas: result
        });
      }
    }

    res.json({
      success: true,
      data: understaffed
    });
  } catch (error) {
    console.error('Understaffed areas error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Get teacher workload
// @route   GET /api/admin/duty/teacher-workload
// @access  Private/Admin
exports.getTeacherWorkload = async (req, res) => {
  try {
    // FIXED: Changed from 'code' to 'schoolId'
    const school = await School.findOne({ where: { schoolId: req.user.schoolCode } });
    if (!school) {
      return res.status(404).json({ success: false, message: 'School not found' });
    }
    
    const teachers = await Teacher.findAll({
      where: { approvalStatus: 'approved' },
      include: [{ model: User, attributes: ['name', 'email'] }]
    });

    const workload = teachers.map(teacher => ({
      teacherId: teacher.id,
      teacherName: teacher.User?.name || 'Unknown',
      department: teacher.department || 'general',
      monthlyDutyCount: teacher.statistics?.monthlyDutyCount || 0,
      weeklyDutyCount: teacher.statistics?.weeklyDutyCount || 0,
      reliabilityScore: teacher.statistics?.reliabilityScore || 100,
      preferences: teacher.dutyPreferences,
      status: teacher.statistics?.monthlyDutyCount > 10 ? 'overworked' : 
              teacher.statistics?.monthlyDutyCount < 3 ? 'underworked' : 'balanced'
    }));

    res.json({
      success: true,
      data: workload.sort((a, b) => b.monthlyDutyCount - a.monthlyDutyCount)
    });
  } catch (error) {
    console.error('Teacher workload error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Get today's duty
// @route   GET /api/duty/today
// @access  Private
exports.getTodayDuty = async (req, res) => {
  try {
    // FIXED: Changed from 'code' to 'schoolId'
    const school = await School.findOne({ where: { schoolId: req.user.schoolCode } });
    if (!school) {
      return res.status(404).json({ success: false, message: 'School not found' });
    }

    const today = moment().format('YYYY-MM-DD');
    
    const roster = await DutyRoster.findOne({
      where: { schoolId: school.schoolId, date: today }
    });

    if (!roster) {
      return res.json({ success: true, data: { duties: [], message: 'No duty today' } });
    }

    // Add isOnDuty flag for teacher
    const duties = roster.duties.map(d => ({
      ...d,
      isOnDuty: req.user.role === 'teacher' && d.teacherId === req.user.id,
      checkedIn: !!d.checkedIn,
      checkedOut: !!d.checkedOut
    }));

    res.json({ success: true, data: { date: today, duties } });
  } catch (error) {
    console.error('Get today duty error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Get weekly duty schedule
// @route   GET /api/duty/week
// @access  Private
exports.getWeeklyDuty = async (req, res) => {
  try {
    // FIXED: Changed from 'code' to 'schoolId'
    const school = await School.findOne({ where: { schoolId: req.user.schoolCode } });
    if (!school) {
      return res.status(404).json({ success: false, message: 'School not found' });
    }

    const startOfWeek = moment().startOf('week');
    const endOfWeek = moment().endOf('week');

    const rosters = await DutyRoster.findAll({
      where: {
        schoolId: school.schoolId,
        date: { [Op.between]: [startOfWeek.format('YYYY-MM-DD'), endOfWeek.format('YYYY-MM-DD')] }
      },
      order: [['date', 'ASC']]
    });

    const weekly = [];
    for (let i = 0; i < 7; i++) {
      const day = moment().startOf('week').add(i, 'days');
      const dayRoster = rosters.find(r => r.date === day.format('YYYY-MM-DD'));
      weekly.push({
        date: day.format('YYYY-MM-DD'),
        dayName: day.format('dddd'),
        isToday: day.isSame(moment(), 'day'),
        duties: dayRoster ? dayRoster.duties : []
      });
    }

    res.json({ success: true, data: weekly });
  } catch (error) {
    console.error('Get weekly duty error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Teacher check-in for duty
// @route   POST /api/duty/check-in
// @access  Private/Teacher
exports.checkInDuty = async (req, res) => {
  try {
    const { location, notes } = req.body;
    const teacher = await Teacher.findOne({ where: { userId: req.user.id } });
    if (!teacher) return res.status(404).json({ success: false, message: 'Teacher not found' });

    // FIXED: Changed from 'code' to 'schoolId'
    const school = await School.findOne({ where: { schoolId: req.user.schoolCode } });
    if (!school) {
      return res.status(404).json({ success: false, message: 'School not found' });
    }

    const today = moment().format('YYYY-MM-DD');

    const roster = await DutyRoster.findOne({
      where: { schoolId: school.schoolId, date: today }
    });
    if (!roster) return res.status(404).json({ success: false, message: 'No duty today' });

    const dutyIndex = roster.duties.findIndex(d => d.teacherId === teacher.id);
    if (dutyIndex === -1) return res.status(403).json({ success: false, message: 'Not on duty today' });

    // Check time window
    const currentTime = moment();
    const slot = roster.duties[dutyIndex].timeSlot;
    const start = moment(slot.start, 'HH:mm');
    const end = moment(slot.end, 'HH:mm');
    const window = school.settings?.dutyManagement?.checkInWindow || 15;
    
    if (!currentTime.isBetween(start.clone().subtract(window, 'minutes'), end.clone().add(window, 'minutes'))) {
      return res.status(400).json({ success: false, message: `Check-in only allowed within ${window} minutes of duty time` });
    }

    roster.duties[dutyIndex].checkedIn = {
      at: new Date(),
      by: req.user.id,
      location: location || 'School'
    };
    roster.duties[dutyIndex].status = 'completed';
    roster.duties[dutyIndex].notes = notes || '';
    await roster.save();

    // Update teacher's personal duty record
    const teacherDuty = (teacher.duties || []).find(d => moment(d.date).isSame(moment(), 'day'));
    if (teacherDuty) {
      teacherDuty.status = 'completed';
      teacherDuty.completedAt = new Date();
      teacherDuty.checkedIn = { at: new Date(), location };
      teacher.statistics.dutiesCompleted = (teacher.statistics.dutiesCompleted || 0) + 1;
      if (teacher.updateReliabilityScore) teacher.updateReliabilityScore();
      await teacher.save();
    }

    // Notify admins - FIXED: Changed from 'school.code' to 'school.schoolId'
    const admins = await User.findAll({ 
      where: { 
        role: 'admin', 
        schoolCode: school.schoolId 
      } 
    });
    
    for (const admin of admins) {
      await createAlert({
        userId: admin.id,
        role: 'admin',
        type: 'duty',
        severity: 'info',
        title: 'Teacher Checked In',
        message: `${teacher.User?.name || 'Teacher'} checked in for ${roster.duties[dutyIndex].type} duty.`
      });
    }

    res.json({ success: true, message: 'Checked in successfully' });
  } catch (error) {
    console.error('Check in error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Teacher check-out from duty
// @route   POST /api/duty/check-out
// @access  Private/Teacher
exports.checkOutDuty = async (req, res) => {
  try {
    const { location, notes } = req.body;
    const teacher = await Teacher.findOne({ where: { userId: req.user.id } });
    
    // FIXED: Changed from 'code' to 'schoolId'
    const school = await School.findOne({ where: { schoolId: req.user.schoolCode } });
    if (!school) {
      return res.status(404).json({ success: false, message: 'School not found' });
    }

    const today = moment().format('YYYY-MM-DD');

    const roster = await DutyRoster.findOne({
      where: { schoolId: school.schoolId, date: today }
    });
    if (!roster) return res.status(404).json({ success: false, message: 'No duty today' });

    const dutyIndex = roster.duties.findIndex(d => d.teacherId === teacher.id);
    if (dutyIndex === -1) return res.status(403).json({ success: false, message: 'Not on duty today' });

    roster.duties[dutyIndex].checkedOut = {
      at: new Date(),
      by: req.user.id,
      location: location || 'School'
    };
    await roster.save();

    res.json({ success: true, message: 'Checked out successfully' });
  } catch (error) {
    console.error('Check out error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Update teacher duty preferences
// @route   PUT /api/duty/preferences
// @access  Private/Teacher
exports.updateDutyPreferences = async (req, res) => {
  try {
    const teacher = await Teacher.findOne({ where: { userId: req.user.id } });
    if (!teacher) return res.status(404).json({ success: false, message: 'Teacher not found' });

    teacher.dutyPreferences = {
      ...teacher.dutyPreferences,
      ...req.body
    };
    await teacher.save();

    res.json({ success: true, data: teacher.dutyPreferences });
  } catch (error) {
    console.error('Update preferences error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Request duty swap
// @route   POST /api/duty/request-swap
// @access  Private/Teacher
exports.requestDutySwap = async (req, res) => {
  try {
    const { dutyDate, reason, targetTeacherId } = req.body;
    const teacher = await Teacher.findOne({ where: { userId: req.user.id } });
    
    // FIXED: Changed from 'code' to 'schoolId'
    const school = await School.findOne({ where: { schoolId: req.user.schoolCode } });
    if (!school) {
      return res.status(404).json({ success: false, message: 'School not found' });
    }

    const roster = await DutyRoster.findOne({
      where: { schoolId: school.schoolId, date: moment(dutyDate).format('YYYY-MM-DD') }
    });
    if (!roster) return res.status(404).json({ success: false, message: 'No duty on that date' });

    const duty = roster.duties.find(d => d.teacherId === teacher.id);
    if (!duty) return res.status(403).json({ success: false, message: 'You are not on duty that day' });

    // Notify admin - FIXED: Changed from 'school.code' to 'school.schoolId'
    const admins = await User.findAll({ 
      where: { 
        role: 'admin', 
        schoolCode: school.schoolId 
      } 
    });
    
    for (const admin of admins) {
      await createAlert({
        userId: admin.id,
        role: 'admin',
        type: 'duty',
        severity: 'info',
        title: 'Duty Swap Request',
        message: `${teacher.User?.name || 'Teacher'} requests to swap duty on ${moment(dutyDate).format('MMM Do')}. Reason: ${reason}`,
        data: { teacherId: teacher.id, dutyDate, targetTeacherId, reason }
      });
    }

    res.json({ success: true, message: 'Swap request sent to admin' });
  } catch (error) {
    console.error('Request swap error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Request duty swap
// @route   POST /api/duty/request-swap
// @access  Private/Teacher
exports.requestDutySwap = async (req, res) => {
    try {
        const { dutyDate, reason, targetTeacherId } = req.body;
        
        const teacher = await Teacher.findOne({ where: { userId: req.user.id } });
        if (!teacher) {
            return res.status(404).json({ success: false, message: 'Teacher not found' });
        }
        
        const school = await School.findOne({ where: { schoolId: req.user.schoolCode } });
        if (!school) {
            return res.status(404).json({ success: false, message: 'School not found' });
        }
        
        const roster = await DutyRoster.findOne({
            where: { schoolId: school.schoolId, date: moment(dutyDate).format('YYYY-MM-DD') }
        });
        
        if (!roster) {
            return res.status(404).json({ success: false, message: 'No duty on that date' });
        }
        
        const duty = roster.duties.find(d => d.teacherId === teacher.id);
        if (!duty) {
            return res.status(403).json({ success: false, message: 'You are not on duty that day' });
        }
        
        // Create swap request
        const swapRequest = {
            id: Date.now(),
            teacherId: teacher.id,
            teacherName: teacher.User?.name,
            targetTeacherId: targetTeacherId || null,
            date: dutyDate,
            dutyType: duty.type,
            reason: reason,
            status: 'pending',
            createdAt: new Date()
        };
        
        // Store in database or in-memory
        let swapRequests = [];
        const stored = await DutyRoster.findOne({ where: { schoolId: school.schoolId, date: 'swap_requests' } });
        
        if (stored && stored.duties) {
            swapRequests = stored.duties;
        }
        
        swapRequests.push(swapRequest);
        
        await DutyRoster.upsert({
            schoolId: school.schoolId,
            date: 'swap_requests',
            duties: swapRequests,
            createdBy: req.user.id
        });
        
        // Notify admin
        const admins = await User.findAll({ 
            where: { role: 'admin', schoolCode: school.schoolId } 
        });
        
        for (const admin of admins) {
            await createAlert({
                userId: admin.id,
                role: 'admin',
                type: 'duty',
                severity: 'info',
                title: 'Duty Swap Request',
                message: `${teacher.User?.name} requests to swap duty on ${moment(dutyDate).format('MMM Do')}. Reason: ${reason}`,
                data: { swapRequest }
            });
        }
        
        res.json({ 
            success: true, 
            message: 'Swap request sent to admin',
            data: swapRequest
        });
    } catch (error) {
        console.error('Request swap error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
};

// @desc    Get available duty swaps for teacher
// @route   GET /api/duty/available-swaps
// @access  Private/Teacher
exports.getAvailableSwaps = async (req, res) => {
    try {
        const teacher = await Teacher.findOne({ where: { userId: req.user.id } });
        if (!teacher) {
            return res.status(404).json({ success: false, message: 'Teacher not found' });
        }
        
        const school = await School.findOne({ where: { schoolId: req.user.schoolCode } });
        
        const swapRequests = await DutyRoster.findOne({ 
            where: { schoolId: school.schoolId, date: 'swap_requests' } 
        });
        
        if (!swapRequests || !swapRequests.duties) {
            return res.json({ success: true, data: [] });
        }
        
        // Filter available swaps (not involving current teacher and pending)
        const available = swapRequests.duties.filter(req => 
            req.status === 'pending' && 
            req.teacherId !== teacher.id &&
            (!req.targetTeacherId || req.targetTeacherId === teacher.id)
        );
        
        // Get teacher names for each swap
        const enriched = await Promise.all(available.map(async req => {
            const requestingTeacher = await Teacher.findByPk(req.teacherId, {
                include: [{ model: User, attributes: ['name'] }]
            });
            
            return {
                ...req,
                teacherName: requestingTeacher?.User?.name || 'Unknown',
                dutyDate: req.date,
                dutyType: req.dutyType
            };
        }));
        
        res.json({ success: true, data: enriched });
    } catch (error) {
        console.error('Get available swaps error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
};
