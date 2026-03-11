const { BehaviorAlert, Student, AcademicRecord, Attendance } = require('../../models');
const { Op } = require('sequelize');
const moment = require('moment');
const { createAlert } = require('../../utils/notifications');

class BehaviorMonitor {
  constructor(schoolId) {
    this.schoolId = schoolId;
    this.thresholds = {
      attendance: {
        consecutiveAbsences: 2,
        weeklyAbsenceRate: 0.3,
        monthlyAbsenceRate: 0.2
      },
      academic: {
        gradeDrop: 15, // percentage points
        consecutiveLowScores: 2,
        failingThreshold: 50
      },
      lateSubmissions: {
        count: 3,
        period: 7 // days
      }
    };
  }

  // Run all monitors for a student
  async monitorStudent(studentId) {
    const alerts = [];

    // Run each monitor
    const attendanceAlerts = await this.checkAttendancePatterns(studentId);
    const academicAlerts = await this.checkAcademicPerformance(studentId);
    const submissionAlerts = await this.checkLateSubmissions(studentId);

    alerts.push(...attendanceAlerts, ...academicAlerts, ...submissionAlerts);

    // Create alerts in database
    for (const alert of alerts) {
      await BehaviorAlert.create({
        ...alert,
        schoolId: this.schoolId,
        studentId
      });

      // Also create user notification
      const student = await Student.findByPk(studentId, { include: [{ model: User }] });
      await createAlert({
        userId: student.userId,
        role: 'student',
        type: 'behavior',
        severity: alert.severity,
        title: alert.title,
        message: alert.description
      });

      // Notify parents if severity is high
      if (alert.severity === 'critical') {
        const parents = await student.getParents({ include: [{ model: User }] });
        for (const parent of parents) {
          await createAlert({
            userId: parent.userId,
            role: 'parent',
            type: 'behavior',
            severity: 'warning',
            title: `Behavior Alert: ${student.User.name}`,
            message: alert.description
          });
        }
      }
    }

    return alerts;
  }

  // Monitor all active students
  async monitorAllStudents() {
    const students = await Student.findAll({
      where: { schoolCode: this.schoolId, status: 'active' }
    });

    const results = {
      total: students.length,
      alertsGenerated: 0,
      criticalAlerts: 0,
      studentsWithAlerts: []
    };

    for (const student of students) {
      const alerts = await this.monitorStudent(student.id);
      if (alerts.length > 0) {
        results.alertsGenerated += alerts.length;
        results.criticalAlerts += alerts.filter(a => a.severity === 'critical').length;
        results.studentsWithAlerts.push({
          studentId: student.id,
          studentName: student.User?.name,
          alertCount: alerts.length,
          criticalCount: alerts.filter(a => a.severity === 'critical').length
        });
      }
    }

    return results;
  }

  // Check attendance patterns
  async checkAttendancePatterns(studentId) {
    const alerts = [];
    const attendance = await Attendance.findAll({
      where: {
        studentId,
        date: { [Op.gte]: moment().subtract(30, 'days').toDate() }
      },
      order: [['date', 'DESC']]
    });

    if (attendance.length === 0) return alerts;

    // Check consecutive absences
    let consecutiveAbsences = 0;
    for (const record of attendance) {
      if (record.status === 'absent') {
        consecutiveAbsences++;
        if (consecutiveAbsences >= this.thresholds.attendance.consecutiveAbsences) {
          alerts.push({
            type: 'attendance_pattern',
            severity: consecutiveAbsences >= 3 ? 'critical' : 'warning',
            title: 'Consecutive Absences Detected',
            description: `Student has been absent for ${consecutiveAbsences} consecutive days.`,
            data: { consecutiveAbsences, records: attendance.slice(0, consecutiveAbsences) }
          });
          break;
        }
      } else {
        consecutiveAbsences = 0;
      }
    }

    // Check weekly attendance rate
    const weekly = attendance.slice(0, 7);
    const weeklyAbsent = weekly.filter(a => a.status === 'absent').length;
    if (weekly.length > 0 && weeklyAbsent / weekly.length > this.thresholds.attendance.weeklyAbsenceRate) {
      alerts.push({
        type: 'attendance_pattern',
        severity: 'warning',
        title: 'Low Weekly Attendance',
        description: `Student attendance rate this week is ${((1 - weeklyAbsent/weekly.length)*100).toFixed(0)}%`,
        data: { weeklyRate: weeklyAbsent/weekly.length }
      });
    }

    return alerts;
  }

  // Check academic performance
  async checkAcademicPerformance(studentId) {
    const alerts = [];
    const records = await AcademicRecord.findAll({
      where: {
        studentId,
        date: { [Op.gte]: moment().subtract(60, 'days').toDate() }
      },
      order: [['date', 'DESC']]
    });

    if (records.length < 3) return alerts;

    // Check for significant grade drop
    const recent = records.slice(0, 3);
    const previous = records.slice(3, 6);
    
    if (previous.length > 0) {
      const recentAvg = recent.reduce((sum, r) => sum + r.score, 0) / recent.length;
      const previousAvg = previous.reduce((sum, r) => sum + r.score, 0) / previous.length;
      
      const drop = previousAvg - recentAvg;
      if (drop >= this.thresholds.academic.gradeDrop) {
        alerts.push({
          type: 'grade_drop',
          severity: drop >= 25 ? 'critical' : 'warning',
          title: 'Significant Grade Drop',
          description: `Grades dropped by ${drop.toFixed(1)}% in the recent assessments.`,
          data: { recentAvg, previousAvg, drop }
        });
      }
    }

    // Check for failing grades
    const failing = recent.filter(r => r.score < this.thresholds.academic.failingThreshold);
    if (failing.length >= this.thresholds.academic.consecutiveLowScores) {
      alerts.push({
        type: 'grade_drop',
        severity: 'critical',
        title: 'Consecutive Failing Grades',
        description: `Student scored below 50% in ${failing.length} recent assessments.`,
        data: { failingRecords: failing }
      });
    }

    return alerts;
  }

  // Check late submissions (would need an AssignmentSubmission model)
  async checkLateSubmissions(studentId) {
    // This would query an AssignmentSubmission model
    // Placeholder for now
    return [];
  }

  // Get behavior summary for a student
  async getStudentBehaviorSummary(studentId) {
    const alerts = await BehaviorAlert.findAll({
      where: {
        studentId,
        createdAt: { [Op.gte]: moment().subtract(90, 'days').toDate() }
      },
      order: [['createdAt', 'DESC']]
    });

    const summary = {
      totalAlerts: alerts.length,
      byType: {},
      bySeverity: {},
      recentAlerts: alerts.slice(0, 5),
      riskLevel: 'low'
    };

    alerts.forEach(alert => {
      summary.byType[alert.type] = (summary.byType[alert.type] || 0) + 1;
      summary.bySeverity[alert.severity] = (summary.bySeverity[alert.severity] || 0) + 1;
    });

    // Determine risk level
    const criticalCount = summary.bySeverity.critical || 0;
    const warningCount = summary.bySeverity.warning || 0;
    
    if (criticalCount > 2 || warningCount > 5) {
      summary.riskLevel = 'high';
    } else if (criticalCount > 0 || warningCount > 2) {
      summary.riskLevel = 'medium';
    }

    return summary;
  }
}

module.exports = BehaviorMonitor;
