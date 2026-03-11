const { Attendance, Student, School } = require('../../models');
const { Op } = require('sequelize');
const moment = require('moment');

class AttendancePredictor {
  constructor(schoolId) {
    this.schoolId = schoolId;
    this.modelVersion = '1.0';
  }

  // Predict attendance probability for a student on a given date
  async predictStudentAttendance(studentId, targetDate) {
    const student = await Student.findByPk(studentId, {
      include: [{ model: Attendance, limit: 60, order: [['date', 'DESC']] }]
    });

    if (!student || !student.Attendances || student.Attendances.length < 10) {
      return {
        probability: 0.5,
        confidence: 0.3,
        factors: ['insufficient_data']
      };
    }

    const history = student.Attendances;
    const targetDay = moment(targetDate).day(); // 0-6

    // Calculate factors
    const factors = {
      dayOfWeek: this.calculateDayOfWeekFactor(history, targetDay),
      recentTrend: this.calculateRecentTrend(history),
      seasonal: this.calculateSeasonalFactor(history, targetDate),
      consecutiveAbsences: this.checkConsecutiveAbsences(history)
    };

    // Weighted probability calculation
    let probability = 0.5;
    probability += factors.dayOfWeek * 0.3;
    probability += factors.recentTrend * 0.4;
    probability += factors.seasonal * 0.2;
    probability -= factors.consecutiveAbsences * 0.3;

    // Clamp between 0-1
    probability = Math.max(0, Math.min(1, probability));

    // Calculate confidence based on data volume
    const confidence = Math.min(0.9, history.length / 100);

    return {
      probability,
      confidence,
      factors,
      predictedStatus: probability > 0.7 ? 'present' : probability > 0.4 ? 'uncertain' : 'absent'
    };
  }

  // Predict attendance for entire class/school
  async predictSchoolAttendance(date) {
    const students = await Student.findAll({
      where: { schoolCode: this.schoolId },
      include: [{ model: Attendance, limit: 30, order: [['date', 'DESC']] }]
    });

    const predictions = [];
    for (const student of students) {
      const prediction = await this.predictStudentAttendance(student.id, date);
      predictions.push({
        studentId: student.id,
        studentName: student.User?.name,
        ...prediction
      });
    }

    // Aggregate statistics
    const stats = {
      total: predictions.length,
      predictedPresent: predictions.filter(p => p.probability > 0.7).length,
      predictedAbsent: predictions.filter(p => p.probability < 0.3).length,
      uncertain: predictions.filter(p => p.probability >= 0.3 && p.probability <= 0.7).length,
      averageConfidence: predictions.reduce((sum, p) => sum + p.confidence, 0) / predictions.length
    };

    return { predictions, stats };
  }

  // Identify at-risk students based on predicted absence
  async identifyAtRiskStudents(days = 7) {
    const atRisk = [];
    const students = await Student.findAll({
      where: { schoolCode: this.schoolId, status: 'active' }
    });

    for (const student of students) {
      let riskScore = 0;
      const reasons = [];

      // Check next 7 days
      for (let i = 1; i <= days; i++) {
        const futureDate = moment().add(i, 'days').format('YYYY-MM-DD');
        const prediction = await this.predictStudentAttendance(student.id, futureDate);
        
        if (prediction.probability < 0.4) {
          riskScore += (1 - prediction.probability);
          reasons.push({
            date: futureDate,
            probability: prediction.probability,
            factors: prediction.factors
          });
        }
      }

      if (riskScore > 2) { // threshold for at-risk
        atRisk.push({
          studentId: student.id,
          studentName: student.User?.name,
          riskScore: riskScore.toFixed(2),
          reasons: reasons.slice(0, 3)
        });
      }
    }

    return atRisk.sort((a, b) => b.riskScore - a.riskScore);
  }

  // Helper calculation methods
  calculateDayOfWeekFactor(history, targetDay) {
    const dayRecords = history.filter(a => moment(a.date).day() === targetDay);
    if (dayRecords.length === 0) return 0;
    
    const presentCount = dayRecords.filter(a => a.status === 'present').length;
    return presentCount / dayRecords.length;
  }

  calculateRecentTrend(history) {
    const recent = history.slice(0, 10); // last 10 records
    if (recent.length < 5) return 0.5;

    const present = recent.filter(a => a.status === 'present').length;
    const trend = present / recent.length;
    
    // Weight recent more heavily
    return trend;
  }

  calculateSeasonalFactor(history, targetDate) {
    const targetMonth = moment(targetDate).month();
    const sameMonthRecords = history.filter(a => moment(a.date).month() === targetMonth);
    
    if (sameMonthRecords.length < 5) return 0.5;
    
    const present = sameMonthRecords.filter(a => a.status === 'present').length;
    return present / sameMonthRecords.length;
  }

  checkConsecutiveAbsences(history) {
    let maxConsecutive = 0;
    let currentStreak = 0;

    for (const record of history) {
      if (record.status === 'absent') {
        currentStreak++;
        maxConsecutive = Math.max(maxConsecutive, currentStreak);
      } else {
        currentStreak = 0;
      }
    }

    return Math.min(1, maxConsecutive / 5); // normalize, 5+ consecutive = 1
  }
}

module.exports = AttendancePredictor;
