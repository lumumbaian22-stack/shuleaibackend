const { DutyRoster, Teacher, Department, ExamSupervision } = require('../../models');
const { Op } = require('sequelize');
const moment = require('moment');
const DutyAnalyticsEngine = require('../analytics/dutyAnalyticsEngine');
const { createAlert } = require('../../utils/notifications');

class DutyAutoBalancer {
  constructor(schoolId) {
    this.schoolId = schoolId;
    this.analytics = new DutyAnalyticsEngine(schoolId);
  }

  // Generate optimized duty roster for a period
  async generateOptimizedRoster(startDate, endDate, options = {}) {
    const {
      respectPreferences = true,
      balanceDepartments = true,
      avoidConflicts = true,
      minGapBetweenDuties = 24 // hours
    } = options;

    const teachers = await Teacher.findAll({
      where: { 'user.schoolCode': this.schoolId, approvalStatus: 'approved' },
      include: [{ model: User }, { model: Department }]
    });

    const departments = await Department.findAll({
      where: { schoolId: this.schoolId }
    });

    const start = moment(startDate);
    const end = moment(endDate);
    const days = end.diff(start, 'days') + 1;

    const roster = [];
    const teacherLoad = {};
    teachers.forEach(t => teacherLoad[t.id] = 0);

    // Get existing duties for this period to avoid conflicts
    const existingDuties = await DutyRoster.findAll({
      where: {
        schoolId: this.schoolId,
        date: { [Op.between]: [startDate, endDate] }
      }
    });

    const teacherSchedules = {};
    teachers.forEach(t => {
      teacherSchedules[t.id] = {
        duties: [],
        preferences: t.dutyPreferences || {},
        departmentId: t.departmentId,
        maxLoad: t.dutyPreferences?.maxDutiesPerWeek || 3
      };
    });

    // Add existing duties to load
    existingDuties.forEach(roster => {
      roster.duties.forEach(duty => {
        if (teacherSchedules[duty.teacherId]) {
          teacherSchedules[duty.teacherId].duties.push({
            date: roster.date,
            type: duty.type
          });
          teacherLoad[duty.teacherId]++;
        }
      });
    });

    // Define duty slots
    const slots = ['morning', 'lunch', 'afternoon'];
    const requiredPerDay = 3;

    // Generate for each day
    for (let i = 0; i < days; i++) {
      const currentDate = start.clone().add(i, 'days');
      if (currentDate.day() === 0 || currentDate.day() === 6) continue; // skip weekends

      // Check if roster already exists
      const existing = existingDuties.find(r => r.date === currentDate.format('YYYY-MM-DD'));
      if (existing) {
        roster.push(existing);
        continue;
      }

      const dayDuties = [];

      // Get available teachers for this day
      let availableTeachers = teachers.filter(t => {
        const schedule = teacherSchedules[t.id];
        
        // Check blackout dates
        if (schedule.preferences.blackoutDates) {
          const blackedOut = schedule.preferences.blackoutDates.some(d =>
            moment(d).isSame(currentDate, 'day')
          );
          if (blackedOut) return false;
        }

        // Check max load
        if (teacherLoad[t.id] >= schedule.maxLoad * (days / 7)) {
          return false;
        }

        // Check preferred days
        if (respectPreferences && schedule.preferences.preferredDays) {
          const dayName = currentDate.format('dddd');
          if (schedule.preferences.preferredDays.length > 0 &&
              !schedule.preferences.preferredDays.includes(dayName)) {
            return false;
          }
        }

        // Check for conflicts with existing duties
        if (avoidConflicts) {
          const hasConflict = schedule.duties.some(d => {
            const dutyDate = moment(d.date);
            const hoursDiff = Math.abs(dutyDate.diff(currentDate, 'hours'));
            return hoursDiff < minGapBetweenDuties;
          });
          if (hasConflict) return false;
        }

        return true;
      });

      // Sort by current load (lowest first)
      availableTeachers.sort((a, b) => teacherLoad[a.id] - teacherLoad[b.id]);

      // Balance by department if enabled
      if (balanceDepartments) {
        availableTeachers = this.balanceByDepartment(availableTeachers, departments, teacherLoad);
      }

      // Assign duties
      for (let j = 0; j < Math.min(requiredPerDay, availableTeachers.length); j++) {
        const teacher = availableTeachers[j];
        const slot = slots[j % slots.length];

        dayDuties.push({
          teacherId: teacher.id,
          teacherName: teacher.User?.name,
          type: slot,
          area: this.getDutyArea(slot),
          timeSlot: this.getTimeSlot(slot),
          status: 'scheduled'
        });

        teacherLoad[teacher.id]++;
        teacherSchedules[teacher.id].duties.push({
          date: currentDate.format('YYYY-MM-DD'),
          type: slot
        });
      }

      // If we couldn't assign all required duties, mark as understaffed
      if (dayDuties.length < requiredPerDay) {
        await this.handleUnderstaffedDay(currentDate, requiredPerDay - dayDuties.length);
      }

      // Create roster
      const newRoster = await DutyRoster.create({
        schoolId: this.schoolId,
        date: currentDate.format('YYYY-MM-DD'),
        duties: dayDuties,
        createdBy: 'system',
        metadata: {
          generationMethod: 'auto_balanced',
          availableTeachers: availableTeachers.length,
          required: requiredPerDay,
          assigned: dayDuties.length
        }
      });

      roster.push(newRoster);
    }

    // Notify teachers of new assignments
    await this.notifyNewAssignments(roster, teachers);

    return {
      roster,
      stats: {
        totalDays: roster.length,
        totalDuties: roster.reduce((sum, r) => sum + r.duties.length, 0),
        understaffedDays: roster.filter(r => r.duties.length < requiredPerDay).length,
        teacherLoad
      }
    };
  }

  // Handle exam supervision allocation
  async allocateExamSupervision(examId) {
    const exam = await ExamSupervision.findByPk(examId);
    if (!exam) throw new Error('Exam not found');

    const teachers = await Teacher.findAll({
      where: { 'user.schoolCode': this.schoolId },
      include: [{ model: User }]
    });

    // Check existing duty assignments for that day
    const existingDuties = await DutyRoster.findOne({
      where: {
        schoolId: this.schoolId,
        date: exam.date
      }
    });

    const assignedTeachers = [];
    const conflicts = [];

    // Find available teachers
    const available = teachers.filter(t => {
      // Check if already on duty that day
      if (existingDuties) {
        const hasDuty = existingDuties.duties.some(d => d.teacherId === t.id);
        if (hasDuty) {
          conflicts.push({
            teacher: t.User.name,
            reason: 'Already has duty that day'
          });
          return false;
        }
      }

      // Check if teacher has exam that day (would need a TeacherExam model)
      // Placeholder - assume available
      return true;
    });

    // Select required number of supervisors
    for (let i = 0; i < exam.requiredSupervisors && i < available.length; i++) {
      assignedTeachers.push(available[i].id);
    }

    // Update exam with assigned supervisors
    exam.assignedSupervisors = assignedTeachers;
    exam.status = assignedTeachers.length >= exam.requiredSupervisors ? 'assigned' : 'conflict';
    exam.conflictNotes = conflicts.length > 0 ? JSON.stringify(conflicts) : null;
    await exam.save();

    // Notify assigned teachers
    for (const teacherId of assignedTeachers) {
      const teacher = teachers.find(t => t.id === teacherId);
      await createAlert({
        userId: teacher.userId,
        role: 'teacher',
        type: 'exam',
        severity: 'info',
        title: 'Exam Supervision Assigned',
        message: `You have been assigned to supervise ${exam.examName} on ${exam.date} at ${exam.venue}`,
        data: { examId: exam.id }
      });
    }

    // Notify admin if understaffed
    if (assignedTeachers.length < exam.requiredSupervisors) {
      const admins = await User.findAll({ where: { role: 'admin', schoolCode: this.schoolId } });
      for (const admin of admins) {
        await createAlert({
          userId: admin.id,
          role: 'admin',
          type: 'exam',
          severity: 'critical',
          title: 'Exam Supervision Understaffed',
          message: `Exam ${exam.examName} on ${exam.date} needs ${exam.requiredSupervisors - assignedTeachers.length} more supervisors`,
          data: { examId: exam.id, conflicts }
        });
      }
    }

    return {
      exam,
      assigned: assignedTeachers.length,
      required: exam.requiredSupervisors,
      conflicts
    };
  }

  // Handle understaffed day
  async handleUnderstaffedDay(date, shortage) {
    const admins = await User.findAll({ where: { role: 'admin', schoolCode: this.schoolId } });
    
    for (const admin of admins) {
      await createAlert({
        userId: admin.id,
        role: 'admin',
        type: 'duty',
        severity: 'critical',
        title: 'Duty Roster Understaffed',
        message: `${date.format('YYYY-MM-DD')} is understaffed by ${shortage} teachers. Please review.`,
        data: { date: date.format('YYYY-MM-DD'), shortage }
      });
    }

    // Try to find volunteers? Could implement opt-in system
  }

  // Balance teachers by department
  balanceByDepartment(teachers, departments, teacherLoad) {
    const deptLoad = {};
    departments.forEach(d => deptLoad[d.id] = 0);

    teachers.forEach(t => {
      if (t.departmentId) {
        deptLoad[t.departmentId] += teacherLoad[t.id] || 0;
      }
    });

    // Sort teachers from least loaded departments first
    return teachers.sort((a, b) => {
      const aLoad = a.departmentId ? deptLoad[a.departmentId] : 0;
      const bLoad = b.departmentId ? deptLoad[b.departmentId] : 0;
      return aLoad - bLoad;
    });
  }

  // Notify teachers of new assignments
  async notifyNewAssignments(rosters, teachers) {
    for (const roster of rosters) {
      for (const duty of roster.duties) {
        const teacher = teachers.find(t => t.id === duty.teacherId);
        if (teacher) {
          await createAlert({
            userId: teacher.userId,
            role: 'teacher',
            type: 'duty',
            severity: 'info',
            title: 'New Duty Assignment',
            message: `You have been assigned to ${duty.type} duty on ${moment(roster.date).format('MMM Do')} at ${duty.area}`,
            data: { rosterId: roster.id, duty }
          });
        }
      }
    }
  }

  getDutyArea(type) {
    const areas = {
      morning: 'School Gate / Assembly Area',
      lunch: 'Dining Hall / Playground',
      afternoon: 'School Compound / Classrooms',
      whole_day: 'General Supervision'
    };
    return areas[type] || 'School Compound';
  }

  getTimeSlot(type) {
    const slots = {
      morning: { start: '07:30', end: '08:30' },
      lunch: { start: '12:30', end: '14:00' },
      afternoon: { start: '15:30', end: '16:30' },
      whole_day: { start: '07:30', end: '16:30' }
    };
    return slots[type] || { start: '08:00', end: '16:00' };
  }
}

module.exports = DutyAutoBalancer;
