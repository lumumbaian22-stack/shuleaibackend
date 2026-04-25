// src/controllers/analyticsController.js
const { Op, Sequelize } = require('sequelize');
const {
    Student, AcademicRecord, Attendance, School, Teacher, User,
    Class, Payment, Fee, Parent, sequelize
} = require('../models');
const moment = require('moment');

// Super Admin Analytics
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
            attributes: [
                [sequelize.fn('DATE_TRUNC', 'month', sequelize.col('createdAt')), 'month'],
                [sequelize.fn('COUNT', '*'), 'count']
            ],
            where: { createdAt: { [Op.gte]: sixMonthsAgo } },
            group: ['month'],
            order: [['month', 'ASC']],
            raw: true
        });

        const growthLabels = [];
        const growthValues = [];
        for (let i = 5; i >= 0; i--) {
            const month = moment().subtract(i, 'months').format('MMM');
            growthLabels.push(month);
            const found = schoolsByMonth.find(s => moment(s.month).format('MMM') === month);
            growthValues.push(found ? parseInt(found.count) : 0);
        }

        const revenueByMonth = await Payment.findAll({
            attributes: [
                [sequelize.fn('DATE_TRUNC', 'month', sequelize.col('createdAt')), 'month'],
                [sequelize.fn('SUM', sequelize.col('amount')), 'total']
            ],
            where: { status: 'completed', createdAt: { [Op.gte]: sixMonthsAgo } },
            group: ['month'],
            order: [['month', 'ASC']],
            raw: true
        });

        const revenueLabels = [];
        const revenueValues = [];
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
            group: ['system'],
            raw: true
        });
        const curriculumMap = { cbc: 0, '844': 0, british: 0, american: 0 };
        curriculumCounts.forEach(c => { curriculumMap[c.system] = parseInt(c.count); });

        const topSchools = await School.findAll({
            attributes: ['id', 'name', 'schoolId'],
            limit: 5
        });
        for (let s of topSchools) {
            s.studentCount = await User.count({ where: { schoolCode: s.schoolId, role: 'student' } });
        }

        res.json({ success: true, data: { overview: { totalSchools, activeSchools, pendingSchools, totalStudents, totalTeachers, revenueMTD }, growth: { labels: growthLabels, values: growthValues }, revenueTrend: { labels: revenueLabels, values: revenueValues }, distributionByLevel: levelCounts, distributionByCurriculum: curriculumMap, topSchools } });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: error.message });
    }
};

// Admin Analytics
exports.getAdminAnalytics = async (req, res) => {
    try {
        const schoolCode = req.user.schoolCode;
        const school = await School.findOne({ where: { schoolId: schoolCode } });
        if (!school) return res.status(404).json({ success: false, message: 'School not found' });

        const totalStudents = await Student.count({
            include: [{ model: User, where: { schoolCode } }]
        });
        const totalTeachers = await Teacher.count({
            include: [{ model: User, where: { schoolCode, role: 'teacher' } }]
        });
        const totalClasses = await Class.count({ where: { schoolCode, isActive: true } });

        const thirtyDaysAgo = moment().subtract(30, 'days').format('YYYY-MM-DD');
        const attendanceRecords = await Attendance.findAll({
            where: { schoolCode, date: { [Op.gte]: thirtyDaysAgo } }
        });
        const presentCount = attendanceRecords.filter(a => a.status === 'present').length;
        const attendanceRate = attendanceRecords.length ? Math.round((presentCount / attendanceRecords.length) * 100) : 0;

        const fees = await Fee.findAll({ where: { schoolCode } });
        const totalFees = fees.reduce((sum, f) => sum + f.totalAmount, 0);
        const paidFees = fees.reduce((sum, f) => sum + f.paidAmount, 0);
        const feeCollectionRate = totalFees ? Math.round((paidFees / totalFees) * 100) : 0;

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

        const records = await AcademicRecord.findAll({ where: { schoolCode } });
        const gradeCounts = { A: 0, B: 0, C: 0, D: 0, E: 0 };
        records.forEach(r => {
            const g = r.grade?.[0]?.toUpperCase() || 'E';
            if (gradeCounts.hasOwnProperty(g)) gradeCounts[g]++;
        });

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

        const feeStatus = { paid: 0, partial: 0, unpaid: 0 };
        fees.forEach(f => {
            if (f.status === 'paid') feeStatus.paid++;
            else if (f.status === 'partial') feeStatus.partial++;
            else feeStatus.unpaid++;
        });

        const classes = await Class.findAll({ where: { schoolCode, isActive: true } });
        const classAverages = [];
        for (const cls of classes) {
            const classStudents = await Student.findAll({ where: { grade: cls.name } });
            const studentIds = classStudents.map(s => s.id);
            const classRecords = await AcademicRecord.findAll({ where: { studentId: { [Op.in]: studentIds } } });
            const avg = classRecords.length ? classRecords.reduce((s, r) => s + r.score, 0) / classRecords.length : 0;
            classAverages.push({ class: cls.name, average: Math.round(avg) });
        }

        const allSubjectsSet = new Set();
        const classSubjectMap = {}; // className -> { subject: avgScore }

        for (const cls of classes) {
          const classStudents = await Student.findAll({ where: { grade: cls.name } });
          const studentIds = classStudents.map(s => s.id);
          const records = await AcademicRecord.findAll({ where: { studentId: { [Op.in]: studentIds } } });
          const subjectTotals = {};
          records.forEach(r => {
            if (!subjectTotals[r.subject]) subjectTotals[r.subject] = { total: 0, count: 0 };
            subjectTotals[r.subject].total += r.score;
            subjectTotals[r.subject].count++;
          });
          const subjectAvgs = {};
          for (const [subj, val] of Object.entries(subjectTotals)) {
            allSubjectsSet.add(subj);
            subjectAvgs[subj] = Math.round(val.total / val.count);
          }
          classSubjectMap[cls.name] = subjectAvgs;
        }

        const subjectList = Array.from(allSubjectsSet).sort();
        const classList = Object.keys(classSubjectMap).sort();
        const matrix = classList.map(clsName => {
          return subjectList.map(subj => classSubjectMap[clsName][subj] || null);
        });

        const subjectHeatmap = { classList, subjectList, matrix };

        res.json({ success: true, data: { overview: { totalStudents, totalTeachers, totalClasses, attendanceRate, feeCollectionRate }, enrollmentTrend, gradeDistribution: { labels: Object.keys(gradeCounts), values: Object.values(gradeCounts) }, attendanceByGrade, feeStatus, classAverages,subjectHeatmap } });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: error.message });
    }
};

// Teacher Analytics
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

        const today = moment().format('YYYY-MM-DD');
        const todayAttendance = await Attendance.findAll({ where: { studentId: { [Op.in]: studentIds }, date: today } });
        const presentToday = todayAttendance.filter(a => a.status === 'present').length;
        const attendanceToday = `${presentToday}/${studentCount}`;

        const subjectMap = {};
        records.forEach(r => {
            if (!subjectMap[r.subject]) subjectMap[r.subject] = { total: 0, count: 0 };
            subjectMap[r.subject].total += r.score;
            subjectMap[r.subject].count++;
        });
        const subjectAverages = Object.entries(subjectMap).map(([subject, data]) => ({
            subject, average: Math.round(data.total / data.count)
        }));

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

        const gradeCounts = { A: 0, B: 0, C: 0, D: 0, E: 0 };
        records.forEach(r => {
            const g = r.grade?.[0]?.toUpperCase() || 'E';
            if (gradeCounts.hasOwnProperty(g)) gradeCounts[g]++;
        });

        const studentPerformance = students.map(s => {
            const studentRecords = records.filter(r => r.studentId === s.id);
            const avg = studentRecords.length ? Math.round(studentRecords.reduce((sum, r) => sum + r.score, 0) / studentRecords.length) : 0;
            return { name: s.User.name, average: avg };
        }).sort((a, b) => b.average - a.average).slice(0, 10);

        res.json({ success: true, data: { overview: { studentCount, classAverage, attendanceToday, pendingTasks: 0 }, subjectAverages, attendanceTrend, gradeDistribution: { labels: Object.keys(gradeCounts), values: Object.values(gradeCounts) }, studentPerformance } });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: error.message });
    }
};

// Parent Analytics
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

        const recentRecords = records.slice(0, 5).reverse();
        const gradeTrend = { labels: recentRecords.map(r => r.assessmentName?.substring(0, 10) || 'Test'), values: recentRecords.map(r => r.score) };

        const subjectMap = {};
        records.forEach(r => {
            if (!subjectMap[r.subject]) subjectMap[r.subject] = { total: 0, count: 0 };
            subjectMap[r.subject].total += r.score;
            subjectMap[r.subject].count++;
        });
        const subjectPerformance = Object.entries(subjectMap).map(([subject, data]) => ({
            subject,
            score: Math.round(data.total / data.count),
            grade: getGradeFromScoreLocal(Math.round(data.total / data.count))
        }));

        res.json({ success: true, data: { student: { name: student.User.name, grade: student.grade, elimuid: student.elimuid, photo: student.User.profileImage }, overallAverage, attendanceRate, feeBalance, gradeTrend, subjectPerformance } });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: error.message });
    }
};

// Student Analytics
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

        const recentRecords = records.slice(0, 5).reverse();
        const gradeTrend = { labels: recentRecords.map(r => r.assessmentName?.substring(0, 10) || 'Test'), values: recentRecords.map(r => r.score) };

        const subjectMap = {};
        records.forEach(r => {
            if (!subjectMap[r.subject]) subjectMap[r.subject] = { total: 0, count: 0 };
            subjectMap[r.subject].total += r.score;
            subjectMap[r.subject].count++;
        });
        const subjectPerformance = Object.entries(subjectMap).map(([subject, data]) => ({
            subject, score: Math.round(data.total / data.count)
        }));

        const leaderboardRank = 5; // placeholder

        res.json({ success: true, data: { student: { name: student.User.name, elimuid: student.elimuid, grade: student.grade, photo: student.User.profileImage }, overallAverage, attendanceRate, points, gradeTrend, subjectPerformance, leaderboardRank } });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: error.message });
    }
};

function getGradeFromScoreLocal(score) {
    if (score >= 80) return 'A';
    if (score >= 70) return 'B';
    if (score >= 60) return 'C';
    if (score >= 50) return 'D';
    return 'E';
}
