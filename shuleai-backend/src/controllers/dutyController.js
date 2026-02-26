const { Op } = require('sequelize');
const { DutyRoster, Teacher, School, User, Alert } = require('../models');
const moment = require('moment');
const { DUTY_AREAS, DUTY_TIME_SLOTS } = require('../config/constants');
const { createAlert, createBulkAlerts } = require('../services/notificationService');

// @desc    Generate duty roster (auto or manual)
// @route   POST /api/admin/duty/generate
// @access  Private/Admin
exports.generateDutyRoster = async (req, res) => {
  try {
    const { startDate, endDate, type = 'auto' } = req.body;
    const school = await School.findOne({ where: { code: req.user.schoolCode } });
    const teachers = await Teacher.findAll({
      where: { approvalStatus: 'approved' },
      include: [{ model: User, where: { schoolCode: req.user.schoolCode } }]
    });

    if (!teachers.length) {
      return res.status(400).json({ success: false, message: 'No approved teachers found' });
    }

    const start = moment(startDate || new Date());
    const end = moment(endDate || moment().add(7, 'days'));
    const days = end.diff(start, 'days') + 1;

    const dutySlots = ['morning', 'lunch', 'afternoon'];
    const maxPerDay = school.settings.dutyManagement.maxTeachersPerDay || 3;

    const teacherDutyCount = {};
    teachers.forEach(t => teacherDutyCount[t.id] = 0);

    const rosters = [];

    for (let i = 0; i < days; i++) {
      const currentDate = moment(start).add(i, 'days');
      if (currentDate.day() === 0 || currentDate.day() === 6) continue; // skip weekends

      const existing = await DutyRoster.findOne({
        where: {
          schoolId: school.schoolId,
          date: currentDate.format('YYYY-MM-DD')
        }
      });
      if (existing) {
        rosters.push(existing);
        continue;
      }

      const available = teachers.filter(t => {
        if (t.dutyPreferences?.blackoutDates) {
          const blackedOut = t.dutyPreferences.blackoutDates.some(d =>
            moment(d).isSame(currentDate, 'day')
          );
          if (blackedOut) return false;
        }
        return true;
      });

      const sorted = available.sort((a, b) => teacherDutyCount[a.id] - teacherDutyCount[b.id]);

      const dayDuties = [];
      for (let j = 0; j < Math.min(maxPerDay, sorted.length); j++) {
        const teacher = sorted[j];
        const slot = dutySlots[j % dutySlots.length];
        teacherDutyCount[teacher.id]++;

        const duty = {
          teacherId: teacher.id,
          teacherName: teacher.User.name,
          type: slot,
          area: DUTY_AREAS[slot],
          timeSlot: DUTY_TIME_SLOTS[slot],
          status: 'scheduled'
        };
        dayDuties.push(duty);

        // Update teacher's duties list
        const duties = teacher.duties || [];
        duties.push({
          date: currentDate.toDate(),
          type: slot,
          area: DUTY_AREAS[slot],
          status: 'assigned'
        });
        teacher.duties = duties;
        await teacher.save();
      }

      if (dayDuties.length) {
        const roster = await DutyRoster.create({
          schoolId: school.schoolId,
          date: currentDate.format('YYYY-MM-DD'),
          duties: dayDuties,
          createdBy: req.user.id,
          metadata: { generationMethod: type }
        });
        rosters.push(roster);
      }
    }

    // Notify teachers
    for (const roster of rosters) {
      for (const duty of roster.duties) {
        const teacher = teachers.find(t => t.id === duty.teacherId);
        if (teacher) {
          await createAlert({
            userId: teacher.User.id,
            role: 'teacher',
            type: 'duty',
            severity: 'info',
            title: 'Duty Assignment',
            message: `You are assigned to ${duty.type} duty on ${moment(roster.date).format('MMM Do')} at ${duty.area}`,
            data: { date: roster.date, dutyType: duty.type, area: duty.area }
          });
        }
      }
    }

    res.json({ success: true, message: `Generated ${rosters.length} rosters`, data: rosters });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Get today's duty
// @route   GET /api/duty/today
// @access  Private (all roles)
exports.getTodayDuty = async (req, res) => {
  try {
    const { date } = req.query;
    const targetDate = date ? moment(date) : moment();
    const school = await School.findOne({ where: { code: req.user.schoolCode } });

    const roster = await DutyRoster.findOne({
      where: {
        schoolId: school.schoolId,
        date: targetDate.format('YYYY-MM-DD')
      }
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

    res.json({ success: true, data: { date: targetDate.format('YYYY-MM-DD'), duties } });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Get weekly duty schedule
// @route   GET /api/duty/week
// @access  Private (all roles)
exports.getWeeklyDuty = async (req, res) => {
  try {
    const school = await School.findOne({ where: { code: req.user.schoolCode } });
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

    const school = await School.findOne({ where: { code: req.user.schoolCode } });
    const today = moment().format('YYYY-MM-DD');

    const roster = await DutyRoster.findOne({
      where: { schoolId: school.schoolId, date: today }
    });
    if (!roster) return res.status(404).json({ success: false, message: 'No duty today' });

    const dutyIndex = roster.duties.findIndex(d => d.teacherId === teacher.id);
    if (dutyIndex === -1) return res.status(403).json({ success: false, message: 'Not on duty today' });

    // Check time window (optional)
    const currentTime = moment();
    const slot = roster.duties[dutyIndex].timeSlot;
    const start = moment(slot.start, 'HH:mm');
    const end = moment(slot.end, 'HH:mm');
    const window = school.settings.dutyManagement.checkInWindow || 15;
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
      teacher.updateReliabilityScore();
      await teacher.save();
    }

    // Notify admins
    const admins = await User.findAll({ where: { role: 'admin', schoolCode: school.code } });
    for (const admin of admins) {
      await createAlert({
        userId: admin.id,
        role: 'admin',
        type: 'duty',
        severity: 'info',
        title: 'Teacher Checked In',
        message: `${teacher.User.name} checked in for ${roster.duties[dutyIndex].type} duty.`
      });
    }

    res.json({ success: true, message: 'Checked in successfully' });
  } catch (error) {
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
    const school = await School.findOne({ where: { code: req.user.schoolCode } });
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
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Get duty statistics (for admin)
// @route   GET /api/admin/duty/stats
// @access  Private/Admin
exports.getDutyStats = async (req, res) => {
  try {
    const school = await School.findOne({ where: { code: req.user.schoolCode } });
    const startOfMonth = moment().startOf('month');
    const endOfMonth = moment().endOf('month');

    const rosters = await DutyRoster.findAll({
      where: {
        schoolId: school.schoolId,
        date: { [Op.between]: [startOfMonth.format('YYYY-MM-DD'), endOfMonth.format('YYYY-MM-DD')] }
      }
    });

    const teachers = await Teacher.findAll({
      include: [{ model: User, where: { schoolCode: school.code } }]
    });

    const stats = {
      totalDuties: rosters.reduce((acc, r) => acc + r.duties.length, 0),
      completedDuties: rosters.reduce((acc, r) => acc + r.duties.filter(d => d.status === 'completed').length, 0),
      missedDuties: rosters.reduce((acc, r) => acc + r.duties.filter(d => d.status === 'missed').length, 0),
      teacherPerformance: teachers.map(t => {
        const teacherDuties = rosters.flatMap(r => r.duties.filter(d => d.teacherId === t.id));
        const completed = teacherDuties.filter(d => d.status === 'completed').length;
        return {
          teacherName: t.User.name,
          assigned: teacherDuties.length,
          completed,
          rate: teacherDuties.length ? (completed / teacherDuties.length * 100).toFixed(1) : 0
        };
      })
    };

    res.json({ success: true, data: stats });
  } catch (error) {
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
    const school = await School.findOne({ where: { code: req.user.schoolCode } });

    const roster = await DutyRoster.findOne({
      where: { schoolId: school.schoolId, date: moment(dutyDate).format('YYYY-MM-DD') }
    });
    if (!roster) return res.status(404).json({ success: false, message: 'No duty on that date' });

    const duty = roster.duties.find(d => d.teacherId === teacher.id);
    if (!duty) return res.status(403).json({ success: false, message: 'You are not on duty that day' });

    // Notify admin
    const admins = await User.findAll({ where: { role: 'admin', schoolCode: school.code } });
    for (const admin of admins) {
      await createAlert({
        userId: admin.id,
        role: 'admin',
        type: 'duty',
        severity: 'info',
        title: 'Duty Swap Request',
        message: `${teacher.User.name} requests to swap duty on ${moment(dutyDate).format('MMM Do')}. Reason: ${reason}`,
        data: { teacherId: teacher.id, dutyDate, targetTeacherId, reason }
      });
    }

    res.json({ success: true, message: 'Swap request sent to admin' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};