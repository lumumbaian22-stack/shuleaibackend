const { DutyRoster, Teacher, Department, ExamSupervision, School } = require('../../models');
const { Op } = require('sequelize');
const moment = require('moment');
const { createAlert } = require('../../utils/notifications');

class DutyAnalyticsEngine {
  constructor(schoolId) {
    this.schoolId = schoolId;
  }

  // Analyze duty coverage and identify understaffed areas
  async analyzeCoverage(startDate, endDate) {
    const rosters = await DutyRoster.findAll({
      where: {
        schoolId: this.schoolId,
        date: {
          [Op.between]: [startDate, endDate]
        }
      },
      include: [{ model: Teacher, as: 'teachers' }]
    });

    const departments = await Department.findAll({
      where: { schoolId: this.schoolId },
      include: [{ model: Teacher, as: 'teachers' }]
    });

    const analysis = {
      understaffedDays: [],
      departmentLoad: {},
      teacherLoad: {},
      recommendations: []
    };

    // Analyze each day
    for (const roster of rosters) {
      const requiredPerDay = 3; // configurable
      if (roster.duties.length < requiredPerDay) {
        analysis.understaffedDays.push({
          date: roster.date,
          required: requiredPerDay,
          actual: roster.duties.length,
          shortage: requiredPerDay - roster.duties.length
        });
      }
    }

    // Analyze department load
    for (const dept of departments) {
      const deptTeachers = dept.teachers.map(t => t.id);
      const deptDuties = rosters.flatMap(r => 
        r.duties.filter(d => deptTeachers.includes(d.teacherId))
      );

      const load = deptDuties.length / (deptTeachers.length || 1);
      analysis.departmentLoad[dept.name] = {
        totalDuties: deptDuties.length,
        teacherCount: deptTeachers.length,
        averageLoad: load.toFixed(2),
        isUnderstaffed: load < dept.understaffedThreshold
      };

      if (load < dept.understaffedThreshold) {
        analysis.recommendations.push({
          type: 'department',
          department: dept.name,
          message: `Department ${dept.name} is understaffed. Average load: ${load.toFixed(2)} duties/teacher`,
          suggestedAction: 'Hire more teachers or reduce duty frequency'
        });
      }
    }

    // Analyze individual teacher load
    const allTeachers = await Teacher.findAll({
      where: { 'user.schoolCode': this.schoolId },
      include: [{ model: User }]
    });

    for (const teacher of allTeachers) {
      const teacherDuties = rosters.flatMap(r => 
        r.duties.filter(d => d.teacherId === teacher.id)
      );
      
      const load = teacherDuties.length;
      analysis.teacherLoad[teacher.id] = {
        name: teacher.User?.name,
        duties: load,
        department: teacher.departmentId,
        isOverloaded: load > (teacher.dutyPreferences?.maxDutiesPerWeek || 3)
      };

      if (load > (teacher.dutyPreferences?.maxDutiesPerWeek || 3)) {
        analysis.recommendations.push({
          type: 'teacher',
          teacherId: teacher.id,
          teacherName: teacher.User?.name,
          message: `${teacher.User?.name} is overloaded with ${load} duties this week`,
          suggestedAction: 'Redistribute duties'
        });
      }
    }

    return analysis;
  }

  // Auto-adjust future schedules based on analytics
  async autoAdjustSchedules(futureStartDate, futureEndDate) {
    const analysis = await this.analyzeCoverage(
      moment().subtract(30, 'days').format('YYYY-MM-DD'),
      moment().format('YYYY-MM-DD')
    );

    const recommendations = [];
    
    // Identify understaffed days and suggest additional assignments
    for (const day of analysis.understaffedDays) {
      const shortage = day.shortage;
      
      // Find available teachers not overloaded
      const availableTeachers = Object.entries(analysis.teacherLoad)
        .filter(([id, load]) => !load.isOverloaded)
        .map(([id]) => parseInt(id));

      if (availableTeachers.length >= shortage) {
        recommendations.push({
          date: day.date,
          action: 'assign_extra',
          teacherCount: shortage,
          suggestedTeachers: availableTeachers.slice(0, shortage)
        });
      }
    }

    // Redistribute overloaded teachers' duties
    for (const [teacherId, load] of Object.entries(analysis.teacherLoad)) {
      if (load.isOverloaded) {
        const overloadCount = load.duties - 3; // excess duties
        
        // Find underloaded teachers in same department
        const deptTeachers = Object.entries(analysis.teacherLoad)
          .filter(([id, l]) => 
            !l.isOverloaded && 
            l.duties < 2 && 
            id !== teacherId
          )
          .map(([id]) => parseInt(id));

        if (deptTeachers.length >= overloadCount) {
          recommendations.push({
            teacherId: parseInt(teacherId),
            action: 'redistribute',
            count: overloadCount,
            toTeachers: deptTeachers.slice(0, overloadCount)
          });
        }
      }
    }

    return recommendations;
  }

  // Generate department performance metrics
  async getDepartmentMetrics(departmentId, period = 'month') {
    const startDate = moment().subtract(1, period).format('YYYY-MM-DD');
    const endDate = moment().format('YYYY-MM-DD');

    const department = await Department.findByPk(departmentId, {
      include: [{ model: Teacher, as: 'teachers' }]
    });

    const rosters = await DutyRoster.findAll({
      where: {
        schoolId: this.schoolId,
        date: { [Op.between]: [startDate, endDate] }
      }
    });

    const teacherIds = department.teachers.map(t => t.id);
    const deptDuties = rosters.flatMap(r => 
      r.duties.filter(d => teacherIds.includes(d.teacherId))
    );

    const metrics = {
      department: department.name,
      period,
      totalDuties: deptDuties.length,
      teacherCount: teacherIds.length,
      averagePerTeacher: (deptDuties.length / teacherIds.length).toFixed(2),
      completionRate: this.calculateCompletionRate(deptDuties),
      trends: this.calculateTrends(deptDuties, period),
      understaffedDays: await this.countUnderstaffedDays(startDate, endDate, department)
    };

    return metrics;
  }

  calculateCompletionRate(duties) {
    const completed = duties.filter(d => d.status === 'completed').length;
    return duties.length ? (completed / duties.length * 100).toFixed(1) : 0;
  }

  calculateTrends(duties, period) {
    const weekly = {};
    duties.forEach(d => {
      const week = moment(d.date).format('YYYY-[W]WW');
      if (!weekly[week]) weekly[week] = 0;
      weekly[week]++;
    });
    return weekly;
  }

  async countUnderstaffedDays(startDate, endDate, department) {
    const rosters = await DutyRoster.findAll({
      where: {
        schoolId: this.schoolId,
        date: { [Op.between]: [startDate, endDate] }
      }
    });

    let understaffed = 0;
    rosters.forEach(roster => {
      const deptDuties = roster.duties.filter(d => 
        department.teachers.some(t => t.id === d.teacherId)
      );
      if (deptDuties.length < department.understaffedThreshold) {
        understaffed++;
      }
    });

    return understaffed;
  }
}

module.exports = DutyAnalyticsEngine;
