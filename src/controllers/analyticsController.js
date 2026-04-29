const { Op, Sequelize, sequelize } = require('sequelize');
const {
    Student, AcademicRecord, Attendance, School, Teacher, User,
    Class, Payment, Fee, Parent, Competency, LearningOutcome,
    StudentCompetencyProgress, DutyRoster, HomeTaskAssignment, HomeTask,
    ConductLog, ResourceViews, MoodCheckin, Message
} = require('../models');
const moment = require('moment');

// ---------- SUPER ADMIN ANALYTICS ----------
exports.getSuperAdminAnalytics = async (req, res) => {
    try {
        const totalSchools = await School.count();
        const activeSchools = await School.count({ where: { status: 'active' } });
        const pendingSchools = await School.count({ where: { status: 'pending' } });
        const totalStudents = await Student.count();
        const totalTeachers = await Teacher.count();

        const startOfMonth = moment().startOf('month').toDate();
        const revenueMTD = await Payment.sum('amount', {
            where: { status: 'completed', createdAt: { [Op.gte]: startOfMonth } }
        }) || 0;

        const sixMonthsAgo = moment().subtract(6, 'months').startOf('month').toDate();
        const schoolsByMonth = await School.findAll({
            attributes: [[sequelize.fn('DATE_TRUNC', 'month', sequelize.col('createdAt')), 'month'], [sequelize.fn('COUNT', '*'), 'count']],
            where: { createdAt: { [Op.gte]: sixMonthsAgo } },
            group: ['month'], order: [['month', 'ASC']], raw: true
        });
        const growthLabels = [], growthValues = [];
        for (let i = 5; i >= 0; i--) {
            const month = moment().subtract(i, 'months').format('MMM');
            growthLabels.push(month);
            const found = schoolsByMonth.find(s => moment(s.month).format('MMM') === month);
            growthValues.push(found ? parseInt(found.count) : 0);
        }

        const revenueByMonth = await Payment.findAll({
            attributes: [[sequelize.fn('DATE_TRUNC', 'month', sequelize.col('createdAt')), 'month'], [sequelize.fn('SUM', sequelize.col('amount')), 'total']],
            where: { status: 'completed', createdAt: { [Op.gte]: sixMonthsAgo } },
            group: ['month'], order: [['month', 'ASC']], raw: true
        });
        const revenueLabels = [], revenueValues = [];
        for (let i = 5; i >= 0; i--) {
            const month = moment().subtract(i, 'months').format('MMM');
            revenueLabels.push(month);
            const found = revenueByMonth.find(r => moment(r.month).format('MMM') === month);
            revenueValues.push(found ? parseFloat(found.total) : 0);
        }

        const schools = await School.findAll({ attributes: ['settings'] });
        const levelCounts = { primary: 0, secondary: 0, both: 0 };
        schools.forEach(s => {
            const level = s.settings?.schoolLevel || 'secondary';
            levelCounts[level] = (levelCounts[level] || 0) + 1;
        });

        const curriculumCounts = await School.findAll({
            attributes: ['system', [sequelize.fn('COUNT', '*'), 'count']],
            group: ['system'], raw: true
        });
        const curriculumMap = { cbc: 0, '844': 0, british: 0, american: 0 };
        curriculumCounts.forEach(c => { curriculumMap[c.system] = parseInt(c.count); });

        res.json({ success: true, data: { overview: { totalSchools, activeSchools, pendingSchools, totalStudents, totalTeachers, revenueMTD }, growth: { labels: growthLabels, values: growthValues }, revenueTrend: { labels: revenueLabels, values: revenueValues }, distributionByLevel: levelCounts, distributionByCurriculum: curriculumMap } });
    } catch (error) { res.status(500).json({ success: false, message: error.message }); }
};

// ---------- ADMIN ANALYTICS (extended) ----------
exports.getAdminAnalytics = async (req, res) => {
    try {
        const schoolCode = req.user.schoolCode;
        const school = await School.findOne({ where: { schoolId: schoolCode } });
        if (!school) return res.status(404).json({ success: false, message: 'School not found' });

        const totalStudents = await Student.count({ include: [{ model: User, where: { schoolCode } }] });
        const totalTeachers = await Teacher.count({ include: [{ model: User, where: { schoolCode, role: 'teacher' } }] });
        const totalClasses = await Class.count({ where: { schoolCode, isActive: true } });

        const thirtyDaysAgo = moment().subtract(30, 'days').format('YYYY-MM-DD');
        const attendanceRecords = await Attendance.findAll({ where: { schoolCode, date: { [Op.gte]: thirtyDaysAgo } } });
        const presentCount = attendanceRecords.filter(a => a.status === 'present').length;
        const attendanceRate = attendanceRecords.length ? Math.round((presentCount / attendanceRecords.length) * 100) : 0;

        const fees = await Fee.findAll({ where: { schoolCode } });
        const totalFees = fees.reduce((sum, f) => sum + f.totalAmount, 0);
        const paidFees = fees.reduce((sum, f) => sum + f.paidAmount, 0);
        const feeCollectionRate = totalFees ? Math.round((paidFees / totalFees) * 100) : 0;

        // Enrollment trend
        const enrollmentTrend = { labels: [], values: [] };
        const currentYear = new Date().getFullYear();
        const terms = ['Term 1', 'Term 2', 'Term 3'];
        for (let year = currentYear - 1; year <= currentYear; year++) {
            for (const term of terms) {
                enrollmentTrend.labels.push(`${term} ${year}`);
                const count = await AcademicRecord.count({ distinct: true, col: 'studentId', where: { schoolCode, term, year } });
                enrollmentTrend.values.push(count);
            }
        }

        // Grade distribution
        const records = await AcademicRecord.findAll({ where: { schoolCode } });
        const gradeCounts = { A: 0, B: 0, C: 0, D: 0, E: 0 };
        records.forEach(r => {
            const g = r.grade?.[0]?.toUpperCase() || 'E';
            if (gradeCounts.hasOwnProperty(g)) gradeCounts[g]++;
        });

        // Attendance by grade
        const students = await Student.findAll({ include: [{ model: User, where: { schoolCode } }] });
        const gradeAttendance = {};
        for (const student of students) {
            const att = await Attendance.findAll({ where: { studentId: student.id } });
            const present = att.filter(a => a.status === 'present').length;
            const rate = att.length ? Math.round((present / att.length) * 100) : 0;
            if (!gradeAttendance[student.grade]) gradeAttendance[student.grade] = { total: 0, count: 0 };
            gradeAttendance[student.grade].total += rate;
            gradeAttendance[student.grade].count++;
        }
        const attendanceByGrade = {
            labels: Object.keys(gradeAttendance),
            values: Object.values(gradeAttendance).map(g => Math.round(g.total / g.count))
        };

        // Fee status
        const feeStatus = { paid: 0, partial: 0, unpaid: 0 };
        fees.forEach(f => {
            if (f.status === 'paid') feeStatus.paid++;
            else if (f.status === 'partial') feeStatus.partial++;
            else feeStatus.unpaid++;
        });

        // Teacher workload (duty)
        const teacherWorkload = await Teacher.findAll({
            include: [{ model: User, where: { schoolCode, role: 'teacher' }, attributes: ['name'] }]
        });
        const workloadData = teacherWorkload.map(t => ({
            name: t.User.name,
            monthlyDutyCount: t.statistics?.monthlyDutyCount || 0,
            reliabilityScore: t.statistics?.reliabilityScore || 100
        }));

        // Parental engagement: count logins of parents
        const parentLogins = await User.findAll({
            where: { schoolCode, role: 'parent' },
            attributes: ['loginCount', 'name']
        });
        const engagementData = parentLogins.map(p => ({ name: p.name, logins: p.loginCount || 0 }));

        // Tardiness trends: count late by day of week
        const lateRecords = await Attendance.findAll({
            where: { schoolCode, status: 'late', date: { [Op.gte]: thirtyDaysAgo } }
        });
        const dayCounts = { Monday: 0, Tuesday: 0, Wednesday: 0, Thursday: 0, Friday: 0 };
        lateRecords.forEach(a => {
            const day = moment(a.date).format('dddd');
            if (dayCounts.hasOwnProperty(day)) dayCounts[day]++;
        });
        const tardinessTrend = { labels: Object.keys(dayCounts), values: Object.values(dayCounts) };

        // Submit pattern: count homework submitted on time vs late
        const assignments = await HomeTaskAssignment.findAll({
            include: [{ model: HomeTask, attributes: ['dueDate'] }],
            where: { status: 'submitted' }
        });
        let onTime = 0, late = 0;
        assignments.forEach(a => {
            if (a.completedAt && a.HomeTask?.dueDate) {
                if (new Date(a.completedAt) <= new Date(a.HomeTask.dueDate)) onTime++;
                else late++;
            }
        });
        const submitPattern = { onTime, late };

        res.json({ success: true, data: { overview: { totalStudents, totalTeachers, totalClasses, attendanceRate, feeCollectionRate }, enrollmentTrend, gradeDistribution: { labels: Object.keys(gradeCounts), values: Object.values(gradeCounts) }, attendanceByGrade, feeStatus, teacherWorkload: workloadData, parentEngagement: engagementData, tardinessTrend, submitPattern } });
    } catch (error) { res.status(500).json({ success: false, message: error.message }); }
};

// ---------- TEACHER ANALYTICS (extended) ----------
exports.getTeacherAnalytics = async (req, res) => {
    try {
        const teacher = await Teacher.findOne({ where: { userId: req.user.id } });
        if (!teacher) return res.status(404).json({ success: false, message: 'Teacher not found' });

        const classItem = await Class.findOne({ where: { teacherId: teacher.id } });
        let classNames = [];
        if (classItem) classNames.push(classItem.name);
        const allClasses = await Class.findAll({ where: { schoolCode: req.user.schoolCode } });
        allClasses.forEach(cls => {
            if (cls.subjectTeachers?.some(st => st.teacherId === teacher.id)) {
                classNames.push(cls.name);
            }
        });
        classNames = [...new Set(classNames)];
        const students = await Student.findAll({
            where: { grade: { [Op.in]: classNames } },
            include: [{ model: User, attributes: ['name'] }]
        });
        const studentIds = students.map(s => s.id);
        const studentCount = students.length;

        const records = await AcademicRecord.findAll({ where: { studentId: { [Op.in]: studentIds } } });
        const classAverage = records.length ? Math.round(records.reduce((s, r) => s + r.score, 0) / records.length) : 0;

        // Subject averages
        const subjectMap = {};
        records.forEach(r => {
            if (!subjectMap[r.subject]) subjectMap[r.subject] = { total: 0, count: 0 };
            subjectMap[r.subject].total += r.score;
            subjectMap[r.subject].count++;
        });
        const subjectAverages = Object.entries(subjectMap).map(([sub, d]) => ({ subject: sub, average: Math.round(d.total / d.count) }));

        // Attendance trend (last 7 days)
        const last7Days = [];
        for (let i = 6; i >= 0; i--) last7Days.push(moment().subtract(i, 'days').format('YYYY-MM-DD'));
        const attendanceTrend = { labels: [], values: [] };
        for (const date of last7Days) {
            const dayAttendance = await Attendance.findAll({ where: { studentId: { [Op.in]: studentIds }, date } });
            const present = dayAttendance.filter(a => a.status === 'present').length;
            const rate = dayAttendance.length ? Math.round((present / dayAttendance.length) * 100) : 0;
            attendanceTrend.labels.push(moment(date).format('ddd'));
            attendanceTrend.values.push(rate);
        }

        // Grade distribution
        const gradeCounts = { A: 0, B: 0, C: 0, D: 0, E: 0 };
        records.forEach(r => {
            const g = r.grade?.[0]?.toUpperCase() || 'E';
            if (gradeCounts.hasOwnProperty(g)) gradeCounts[g]++;
        });

        // Student performance list
        const studentPerformance = students.map(s => {
            const studentRecords = records.filter(r => r.studentId === s.id);
            const avg = studentRecords.length ? Math.round(studentRecords.reduce((sum, r) => sum + r.score, 0) / studentRecords.length) : 0;
            return { name: s.User.name, average: avg };
        }).sort((a, b) => b.average - a.average);

        // Risk indicators: students whose latest 3 scores average dropped by >15% from previous 3
        const riskStudents = [];
        for (const student of students) {
            const studentRecs = records.filter(r => r.studentId === student.id).sort((a, b) => new Date(b.date) - new Date(a.date));
            if (studentRecs.length >= 6) {
                const recent3 = studentRecs.slice(0, 3);
                const previous3 = studentRecs.slice(3, 6);
                const recentAvg = recent3.reduce((s, r) => s + r.score, 0) / 3;
                const prevAvg = previous3.reduce((s, r) => s + r.score, 0) / 3;
                if (prevAvg > 0 && (prevAvg - recentAvg) / prevAvg > 0.15) {
                    riskStudents.push({ name: student.User.name, recentAvg: Math.round(recentAvg), prevAvg: Math.round(prevAvg), drop: Math.round((prevAvg - recentAvg) / prevAvg * 100) });
                }
            }
        }

        // Submission patterns: on-time vs late homework for this class
        const classAssignments = await HomeTaskAssignment.findAll({
            where: { studentId: { [Op.in]: studentIds }, status: 'submitted' },
            include: [{ model: HomeTask, attributes: ['dueDate'] }]
        });
        let onTime = 0, lateSub = 0;
        classAssignments.forEach(a => {
            if (a.completedAt && a.HomeTask?.dueDate) {
                if (new Date(a.completedAt) <= new Date(a.HomeTask.dueDate)) onTime++;
                else lateSub++;
            }
        });
        const submitPattern = { onTime, late: lateSub };

        // Conduct summary (positive/negative counts)
        const conductCounts = await ConductLog.findAll({
            where: { studentId: { [Op.in]: studentIds } },
            attributes: ['type', [sequelize.fn('COUNT', '*'), 'count']],
            group: ['type'], raw: true
        });
        const conductData = { positive: 0, negative: 0 };
        conductCounts.forEach(c => { conductData[c.type] = parseInt(c.count); });

        // Parent engagement: average logins of parents of these students
        const parentUsers = await User.findAll({
            where: { schoolCode: req.user.schoolCode, role: 'parent' },
            attributes: ['loginCount']
        });
        const avgParentLogins = parentUsers.length ? Math.round(parentUsers.reduce((s, u) => s + (u.loginCount || 0), 0) / parentUsers.length) : 0;

        res.json({ success: true, data: { overview: { studentCount, classAverage, attendanceToday: `${await Attendance.count({ where: { studentId: { [Op.in]: studentIds }, date: moment().format('YYYY-MM-DD'), status: 'present' } })}/${studentCount}` }, subjectAverages, attendanceTrend, gradeDistribution: { labels: Object.keys(gradeCounts), values: Object.values(gradeCounts) }, studentPerformance, riskStudents, submitPattern, conductData, parentEngagement: avgParentLogins } });
    } catch (error) { res.status(500).json({ success: false, message: error.message }); }
};

// ---------- PARENT ANALYTICS (extended) ----------
exports.getParentAnalytics = async (req, res) => {
    try {
        const { childId } = req.query;
        if (!childId) return res.status(400).json({ success: false, message: 'childId required' });
        const parent = await Parent.findOne({ where: { userId: req.user.id } });
        const student = await Student.findByPk(childId, { include: [{ model: User }] });
        if (!student || !(await parent.hasStudent(student))) return res.status(403).json({ success: false, message: 'Not your child' });

        const records = await AcademicRecord.findAll({ where: { studentId: childId }, order: [['date', 'DESC']] });
        const overallAverage = records.length ? Math.round(records.reduce((s, r) => s + r.score, 0) / records.length) : 0;
        const attendance = await Attendance.findAll({ where: { studentId: childId } });
        const present = attendance.filter(a => a.status === 'present').length;
        const attendanceRate = attendance.length ? Math.round((present / attendance.length) * 100) : 0;
        const fee = await Fee.findOne({ where: { studentId: childId, status: { [Op.ne]: 'paid' } } });
        const feeBalance = fee?.balance || 0;

        // Grade trend
        const recentRecords = records.slice(0, 5).reverse();
        const gradeTrend = { labels: recentRecords.map(r => r.assessmentName?.substring(0, 10) || 'Test'), values: recentRecords.map(r => r.score) };

        // Subject performance
        const subjectMap = {};
        records.forEach(r => {
            if (!subjectMap[r.subject]) subjectMap[r.subject] = { total: 0, count: 0 };
            subjectMap[r.subject].total += r.score;
            subjectMap[r.subject].count++;
        });
        const subjectPerformance = Object.entries(subjectMap).map(([sub, d]) => ({
            subject: sub, score: Math.round(d.total / d.count), grade: getGradeFromScore(Math.round(d.total / d.count))
        }));

        // Growth tracking: compare current term average vs previous term
        const termAverages = student.termAverages || [];
        const currentTermAvg = overallAverage;
        const previousTermAvg = termAverages.length > 0 ? termAverages[termAverages.length - 1].average : null;
        const growth = previousTermAvg ? currentTermAvg - previousTermAvg : null;

        // Attendance correlation: show attendance rate vs grade
        const attendanceCorrelation = { attendanceRate, average: overallAverage };

        // Parental engagement: own login count
        const parentLoginCount = req.user.loginCount || 0;

        // Competency levels (if CBC)
        let competencyLevels = [];
        if (req.user.school?.system === 'cbc') {
            const progress = await StudentCompetencyProgress.findAll({
                where: { studentId: childId },
                include: [{ model: LearningOutcome, include: [Competency] }]
            });
            competencyLevels = progress.map(p => ({ competency: p.LearningOutcome.Competency.name, level: p.level }));
        }

        // Mood check-ins
        const moods = await MoodCheckin.findAll({ where: { userId: student.userId }, order: [['createdAt', 'DESC']], limit: 7 });
        const moodData = moods.map(m => ({ mood: m.mood, date: m.createdAt }));

        res.json({ success: true, data: { student: { name: student.User.name, grade: student.grade, elimuid: student.elimuid, photo: student.User.profileImage }, overallAverage, attendanceRate, feeBalance, gradeTrend, subjectPerformance, growth, attendanceCorrelation, parentLoginCount, competencyLevels, moodData } });
    } catch (error) { res.status(500).json({ success: false, message: error.message }); }
};

// ---------- STUDENT ANALYTICS (extended) ----------
exports.getStudentAnalytics = async (req, res) => {
    try {
        const student = await Student.findOne({ where: { userId: req.user.id }, include: [{ model: User }] });
        if (!student) return res.status(404).json({ success: false, message: 'Student not found' });

        const records = await AcademicRecord.findAll({ where: { studentId: student.id }, order: [['date', 'DESC']] });
        const overallAverage = records.length ? Math.round(records.reduce((s, r) => s + r.score, 0) / records.length) : 0;
        const attendance = await Attendance.findAll({ where: { studentId: student.id } });
        const present = attendance.filter(a => a.status === 'present').length;
        const attendanceRate = attendance.length ? Math.round((present / attendance.length) * 100) : 0;
        const points = student.points || 0;

        // Grade trend
        const recentRecords = records.slice(0, 5).reverse();
        const gradeTrend = { labels: recentRecords.map(r => r.assessmentName?.substring(0, 10) || 'Test'), values: recentRecords.map(r => r.score) };

        // Subject performance
        const subjectMap = {};
        records.forEach(r => {
            if (!subjectMap[r.subject]) subjectMap[r.subject] = { total: 0, count: 0 };
            subjectMap[r.subject].total += r.score;
            subjectMap[r.subject].count++;
        });
        const subjectPerformance = Object.entries(subjectMap).map(([sub, d]) => ({ subject: sub, score: Math.round(d.total / d.count) }));

        // Growth: personal best records
        const personalBest = Math.max(...records.map(r => r.score), 0);

        // Peer comparison (percentile rank within class)
        const classmates = await Student.findAll({ where: { grade: student.grade }, include: [{ model: AcademicRecord }] });
        let rank = 1, total = classmates.length;
        for (const other of classmates) {
            const otherAvg = other.AcademicRecords.length ? other.AcademicRecords.reduce((s, r) => s + r.score, 0) / other.AcademicRecords.length : 0;
            if (otherAvg > overallAverage) rank++;
        }
        const percentile = total > 1 ? Math.round((rank / total) * 100) : 100;

        // Submission patterns
        const assignments = await HomeTaskAssignment.findAll({ where: { studentId: student.id, status: 'submitted' }, include: [{ model: HomeTask, attributes: ['dueDate'] }] });
        let onTime = 0, lateSub = 0, totalSubs = assignments.length;
        assignments.forEach(a => {
            if (a.completedAt && a.HomeTask?.dueDate) {
                if (new Date(a.completedAt) <= new Date(a.HomeTask.dueDate)) onTime++;
                else lateSub++;
            }
        });
        const streak = onTime; // simplified streak

        // Mood tracker
        const moods = await MoodCheckin.findAll({ where: { userId: req.user.id }, order: [['createdAt', 'DESC']], limit: 10 });
        const moodData = moods.map(m => ({ mood: m.mood, date: m.createdAt }));

        // Leaderboard rank (class)
        const leaderboardRank = rank; // within class

        res.json({ success: true, data: { student: { name: student.User.name, elimuid: student.elimuid, grade: student.grade, photo: student.User.profileImage }, overallAverage, attendanceRate, points, gradeTrend, subjectPerformance, personalBest, percentile, streak, onTime, lateSub, moodData, leaderboardRank } });
    } catch (error) { res.status(500).json({ success: false, message: error.message }); }
};

function getGradeFromScore(score) {
    if (score >= 80) return 'A';
    if (score >= 70) return 'B';
    if (score >= 60) return 'C';
    if (score >= 50) return 'D';
    return 'E';
}
