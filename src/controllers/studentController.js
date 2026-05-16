// src/controllers/studentController.js
const { Student, AcademicRecord, Attendance, Message, User, Class, Teacher, Parent, School } = require('../models');
const { Op } = require('sequelize');
const { ensureRuntimeSchema } = require('../utils/schemaSafety');

// Helper: get grade from score using the school's curriculum (simplified)
function getGradeFromScore(score, curriculum, level) {
    // If custom grading scale is provided, this would use it. Fallback to default.
    if (!curriculum) return 'N/A';
    const CURRICULUMS = {
        'cbc': {
            primary: [
                { range: '80-100', grade: 'EE' },
                { range: '60-79', grade: 'ME' },
                { range: '40-59', grade: 'AE' },
                { range: '0-39', grade: 'BE' }
            ],
            secondary: [
                { range: '80-100', grade: 'A' },
                { range: '75-79', grade: 'A-' },
                { range: '70-74', grade: 'B+' },
                { range: '65-69', grade: 'B' },
                { range: '60-64', grade: 'B-' },
                { range: '55-59', grade: 'C+' },
                { range: '50-54', grade: 'C' },
                { range: '45-49', grade: 'C-' },
                { range: '40-44', grade: 'D+' },
                { range: '35-39', grade: 'D' },
                { range: '30-34', grade: 'D-' },
                { range: '0-29', grade: 'E' }
            ]
        },
        '844': {
            primary: [
                { range: '80-100', grade: 'A' },
                { range: '75-79', grade: 'A-' },
                { range: '70-74', grade: 'B+' },
                { range: '65-69', grade: 'B' },
                { range: '60-64', grade: 'B-' },
                { range: '55-59', grade: 'C+' },
                { range: '50-54', grade: 'C' },
                { range: '45-49', grade: 'C-' },
                { range: '40-44', grade: 'D+' },
                { range: '35-39', grade: 'D' },
                { range: '30-34', grade: 'D-' },
                { range: '0-29', grade: 'E' }
            ],
            secondary: [
                { range: '80-100', grade: 'A' },
                { range: '75-79', grade: 'A-' },
                { range: '70-74', grade: 'B+' },
                { range: '65-69', grade: 'B' },
                { range: '60-64', grade: 'B-' },
                { range: '55-59', grade: 'C+' },
                { range: '50-54', grade: 'C' },
                { range: '45-49', grade: 'C-' },
                { range: '40-44', grade: 'D+' },
                { range: '35-39', grade: 'D' },
                { range: '30-34', grade: 'D-' },
                { range: '0-29', grade: 'E' }
            ]
        },
        'british': {
            primary: [
                { range: '90-100', grade: 'A*' },
                { range: '80-89', grade: 'A' },
                { range: '70-79', grade: 'B' },
                { range: '60-69', grade: 'C' },
                { range: '50-59', grade: 'D' },
                { range: '40-49', grade: 'E' },
                { range: '30-39', grade: 'F' },
                { range: '20-29', grade: 'G' },
                { range: '0-19', grade: 'U' }
            ],
            secondary: [
                { range: '90-100', grade: 'A*' },
                { range: '80-89', grade: 'A' },
                { range: '70-79', grade: 'B' },
                { range: '60-69', grade: 'C' },
                { range: '50-59', grade: 'D' },
                { range: '40-49', grade: 'E' },
                { range: '30-39', grade: 'F' },
                { range: '20-29', grade: 'G' },
                { range: '0-19', grade: 'U' }
            ]
        },
        'american': {
            primary: [
                { range: '90-100', grade: 'A' },
                { range: '80-89', grade: 'B' },
                { range: '70-79', grade: 'C' },
                { range: '60-69', grade: 'D' },
                { range: '0-59', grade: 'F' }
            ],
            secondary: [
                { range: '90-100', grade: 'A' },
                { range: '80-89', grade: 'B' },
                { range: '70-79', grade: 'C' },
                { range: '60-69', grade: 'D' },
                { range: '0-59', grade: 'F' }
            ]
        }
    };
    const curriculumData = CURRICULUMS[curriculum];
    if (!curriculumData) return 'N/A';
    let normalizedLevel = level;
    if (level === 'both') normalizedLevel = 'secondary';
    const scale = curriculumData[normalizedLevel] || curriculumData.primary;
    if (!scale) return 'N/A';
    const scoreNum = Number(score);
    if (isNaN(scoreNum)) return 'N/A';
    for (const entry of scale) {
        const [min, max] = entry.range.split('-').map(Number);
        if (scoreNum >= min && scoreNum <= max) {
            return entry.grade;
        }
    }
    return 'N/A';
}

// @desc    Get student's own dashboard data
// @route   GET /api/student/dashboard
// @access  Private/Student
exports.getDashboard = async (req, res) => {
  try {
    await ensureRuntimeSchema().catch(() => null);
    const student = await Student.findOne({ where: { userId: req.user.id } });
    if (!student) return res.status(404).json({ success: false, message: 'Student profile not found' });

    // Only show published marks
    const records = await AcademicRecord.findAll({
        where: { studentId: student.id, isPublished: true },
        order: [['date', 'DESC']],
        limit: 10
    });
    const attendance = await Attendance.findAll({
        where: { studentId: student.id },
        order: [['date', 'DESC']],
        limit: 20
    });

    const classItem = await Class.findOne({
        where: { name: student.grade, schoolCode: req.user.schoolCode }
    });

    // Fetch school settings for curriculum / grading
    const school = await School.findOne({ where: { schoolId: req.user.schoolCode } });
    const curriculum = school ? school.system : 'cbc';
    const schoolLevel = school?.settings?.schoolLevel || 'secondary';

    const avg = records.length ? (records.reduce((a, b) => a + b.score, 0) / records.length).toFixed(1) : 0;

    res.json({
      success: true,
      data: {
        student: {
          ...req.user.getPublicProfile(),
          studentId: student.id,
          grade: student.grade,
          classId: student.classId || classItem?.id || null,
          curriculum: student.curriculum || curriculum,
          academicStatus: student.academicStatus,
          admissionNumber: student.admissionNumber,
          assessmentNumber: student.assessmentNumber
        },
        averageScore: parseFloat(avg),
        stats: {
            averageScore: parseFloat(avg),
            attendanceRate: attendance.length ? Math.round((attendance.filter(a => a.status === 'present').length / attendance.length) * 100) : 0
        },
        recentRecords: records.map(r => ({
            ...r.toJSON(),
            grade: getGradeFromScore(r.score, curriculum, schoolLevel)
        })),
        recentAttendance: attendance,
        paymentStatus: student.paymentStatus,
        classId: classItem?.id || null,
        school: {
            curriculum,
            schoolLevel
        }
      }
    });
  } catch (error) {
    console.error('Student dashboard error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Get grade-aware learning materials generated from school curriculum and student performance
// @route   GET /api/student/materials
// @access  Private/Student
exports.getMaterials = async (req, res) => {
  try {
    const student = await Student.findOne({ where: { userId: req.user.id } });
    if (!student) return res.status(404).json({ success: false, message: 'Student not found' });

    const school = await School.findOne({ where: { schoolId: req.user.schoolCode } });
    const curriculum = school?.system || 'cbc';
    const schoolLevel = school?.settings?.schoolLevel || 'both';
    const curriculumHelper = require('../utils/curriculumHelper');
    const subjects = curriculumHelper.getSubjectsForCurriculum(curriculum, schoolLevel) || ['Mathematics','English','Kiswahili','Science'];
    const records = await AcademicRecord.findAll({ where: { studentId: student.id, schoolCode: req.user.schoolCode, isPublished: true } });

    const avgBySubject = {};
    for (const subject of subjects) {
      const rows = records.filter(r => String(r.subject).toLowerCase() === String(subject).toLowerCase());
      avgBySubject[subject] = rows.length ? Math.round(rows.reduce((sum, r) => sum + Number(r.score || 0), 0) / rows.length) : null;
    }

    const materials = subjects.slice(0, 12).map((subject, idx) => {
      const avg = avgBySubject[subject];
      const level = avg === null ? 'starter' : avg < 40 ? 'foundation' : avg < 60 ? 'practice' : avg < 80 ? 'mastery' : 'extension';
      return {
        id: `${student.id}-${idx + 1}`,
        title: `${subject} ${level.charAt(0).toUpperCase() + level.slice(1)} Pack`,
        subject,
        grade: student.grade,
        curriculum,
        type: 'guided-study',
        level,
        performanceAverage: avg,
        activities: [
          `Review today’s ${subject} class notes`,
          `Complete 5 ${level} questions`,
          `Explain one ${subject} idea to a parent or study partner`,
          `Write one question to ask your teacher`
        ],
        estimatedMinutes: level === 'foundation' ? 25 : 15
      };
    });

    res.json({ success: true, data: materials });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};



function normalizeAssessmentName(row) {
  return row.assessmentName || row.assessmentType || 'Assessment';
}

function buildStudentRecommendations(records, filter = {}) {
  const rows = (records || []).map(r => r.toJSON ? r.toJSON() : r).filter(Boolean);
  const selected = rows.filter(row => {
    const yearOk = !filter.year || String(row.year) === String(filter.year);
    const termOk = !filter.term || String(row.term) === String(filter.term);
    const assessmentValue = normalizeAssessmentName(row);
    const assessmentOk = !filter.assessment || String(assessmentValue) === String(filter.assessment) || String(row.assessmentType) === String(filter.assessment);
    return yearOk && termOk && assessmentOk;
  });

  if (!rows.length) {
    return [{ type: 'empty', priority: 'info', title: 'No recommendations yet', detail: 'Recommendations will appear after your teacher publishes marks.' }];
  }
  if (!selected.length) {
    return [{ type: 'empty-selection', priority: 'info', title: 'No data for this selection', detail: 'Choose a year, term, and assessment that already has published marks.' }];
  }

  const bySubject = {};
  selected.forEach(row => {
    const subject = row.subject || 'Subject';
    if (!bySubject[subject]) bySubject[subject] = [];
    bySubject[subject].push(Number(row.score || row.percentage || 0));
  });
  const subjectAverages = Object.entries(bySubject).map(([subject, scores]) => ({
    subject,
    average: Math.round(scores.reduce((sum, score) => sum + score, 0) / scores.length),
    count: scores.length
  })).sort((a, b) => a.average - b.average);

  const items = [];
  const weak = subjectAverages.filter(item => item.average < 60).slice(0, 2);
  weak.forEach(item => {
    const level = item.average < 40 ? 'foundation' : item.average < 50 ? 'urgent' : 'practice';
    items.push({
      type: 'weak-subject',
      priority: item.average < 40 ? 'high' : 'medium',
      subject: item.subject,
      title: `Focus on ${item.subject}`,
      detail: item.average < 40
        ? `${item.subject} is at ${item.average}%. Start with teacher notes, basic examples, then 10 short practice questions.`
        : `${item.subject} is at ${item.average}%. Revise the missed areas and do extra practice before the next assessment.`,
      action: level === 'foundation' ? 'Revise basics + ask teacher for support' : 'Practice weak topics'
    });
  });

  const strong = [...subjectAverages].reverse().find(item => item.average >= 70) || [...subjectAverages].reverse()[0];
  if (strong) {
    items.push({
      type: 'strength',
      priority: 'positive',
      subject: strong.subject,
      title: `Maintain ${strong.subject}`,
      detail: `${strong.subject} is currently your strongest area at ${strong.average}%. Keep revising it while giving more time to weaker subjects.`,
      action: 'Keep momentum'
    });
  }

  const overallAverage = Math.round(selected.reduce((sum, row) => sum + Number(row.score || row.percentage || 0), 0) / selected.length);
  if (overallAverage < 50) {
    items.unshift({
      type: 'overall-risk',
      priority: 'high',
      title: 'Create a daily revision routine',
      detail: `Your average for this selection is ${overallAverage}%. Use 30 minutes daily: 15 minutes notes, 10 minutes questions, 5 minutes corrections.`,
      action: 'Start daily revision'
    });
  } else if (overallAverage >= 75) {
    items.push({
      type: 'extension',
      priority: 'positive',
      title: 'Try advanced practice',
      detail: `Your average is ${overallAverage}%. Use challenge questions to protect your performance and prepare for harder exams.`,
      action: 'Attempt advanced questions'
    });
  }

  return items.slice(0, 3);
}

// @desc    Get own grades (only published)
// @route   GET /api/student/grades
// @access  Private/Student
exports.getGrades = async (req, res) => {
  try {
    const student = await Student.findOne({ where: { userId: req.user.id } });
    if (!student) return res.status(404).json({ success: false, message: 'Student not found' });

    const school = await School.findOne({ where: { schoolId: req.user.schoolCode } });
    const curriculum = school ? school.system : 'cbc';
    const schoolLevel = school?.settings?.schoolLevel || 'secondary';

    const records = await AcademicRecord.findAll({
        where: {
          studentId: student.id,
          schoolCode: req.user.schoolCode,
          [Op.or]: [{ isPublished: true }, { status: 'published' }]
        },
        include: [{
          model: Teacher,
          required: false,
          include: [{ model: User, attributes: ['id', 'name'], required: false }]
        }],
        order: [['year', 'DESC'], ['term', 'DESC'], ['date', 'DESC'], ['subject', 'ASC']]
    });

    const enriched = records.map(r => {
        const row = r.toJSON();
        const score = Number(row.score || 0);
        return {
          id: row.id,
          studentId: row.studentId,
          schoolCode: row.schoolCode,
          year: row.year,
          term: row.term,
          subject: row.subject,
          assessmentType: row.assessmentType,
          assessmentName: row.assessmentName || row.assessmentType || 'Assessment',
          score,
          totalMarks: 100,
          percentage: score,
          grade: getGradeFromScore(score, curriculum, schoolLevel),
          remark: row.remarks || '',
          remarks: row.remarks || '',
          teacherName: row.Teacher?.User?.name || 'Not assigned',
          date: row.date,
          publishedAt: row.publishedAt || null
        };
    });

    const recommendations = buildStudentRecommendations(records, req.query || {});

    res.json({ success: true, data: enriched, recommendations });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};


// @desc    Get own grade recommendations from real published marks
// @route   GET /api/student/recommendations
// @access  Private/Student
exports.getGradeRecommendations = async (req, res) => {
  try {
    const student = await Student.findOne({ where: { userId: req.user.id } });
    if (!student) return res.status(404).json({ success: false, message: 'Student not found' });

    const records = await AcademicRecord.findAll({
      where: {
        studentId: student.id,
        schoolCode: req.user.schoolCode,
        [Op.or]: [{ isPublished: true }, { status: 'published' }]
      },
      order: [['year', 'DESC'], ['term', 'DESC'], ['date', 'DESC'], ['subject', 'ASC']]
    });

    res.json({
      success: true,
      data: buildStudentRecommendations(records, req.query || {}),
      meta: {
        studentId: student.id,
        grade: student.grade,
        year: req.query.year || null,
        term: req.query.term || null,
        assessment: req.query.assessment || null
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Get own attendance
// @route   GET /api/student/attendance
// @access  Private/Student
exports.getAttendance = async (req, res) => {
  try {
    await ensureRuntimeSchema().catch(() => null);
    const student = await Student.findOne({ where: { userId: req.user.id } });
    const attendance = await Attendance.findAll({ where: { studentId: student.id }, order: [['date', 'DESC']] });
    res.json({ success: true, data: attendance });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Send a message to another user (internal chat)
// @route   POST /api/student/message
// @access  Private/Student
exports.sendMessage = async (req, res) => {
  try {
    const { receiverId, content } = req.body;
    const message = await Message.create({
      senderId: req.user.id,
      receiverId,
      content
    });

    if (global.io) {
      global.io.to(`user-${receiverId}`).emit('private-message', {
        from: req.user.id,
        message: content,
        timestamp: new Date()
      });
    }

    res.status(201).json({ success: true, data: message });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Get messages (conversation with a specific user)
// @route   GET /api/student/messages/:otherUserId
// @access  Private/Student
exports.getMessages = async (req, res) => {
  try {
    const { otherUserId } = req.params;
    const messages = await Message.findAll({
      where: {
        [Op.or]: [
          { senderId: req.user.id, receiverId: otherUserId },
          { senderId: otherUserId, receiverId: req.user.id }
        ]
      },
      order: [['createdAt', 'ASC']]
    });
    res.json({ success: true, data: messages });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Send group message to classmates
// @route   POST /api/student/group-message
// @access  Private/Student
exports.sendGroupMessage = async (req, res) => {
  try {
    const { content, replyToId } = req.body;
    const student = await Student.findOne({ where: { userId: req.user.id } });
    if (!student) return res.status(404).json({ success: false, message: 'Student not found' });
    const classmates = await Student.findAll({ where: { grade: student.grade, id: { [Op.ne]: student.id } } });
    const recipients = classmates.map(s => s.userId);
    const messages = recipients.map(receiverId => ({
      senderId: req.user.id,
      receiverId,
      content,
      replyToMessageId: replyToId || null,
      metadata: { type: 'student_group', studentName: req.user.name }
    }));
    await Message.bulkCreate(messages);
    if (global.io) {
      recipients.forEach(recipientId => {
        global.io.to(`user-${recipientId}`).emit('new-student-message', { from: req.user.id, content, replyToId });
      });
    }
    res.status(201).json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Get group messages for student's class
// @route   GET /api/student/group-messages
// @access  Private/Student
exports.getGroupMessages = async (req, res) => {
  try {
    const student = await Student.findOne({ where: { userId: req.user.id } });
    if (!student) return res.status(404).json({ success: false });
    const allStudents = await Student.findAll({
        include: [{ model: User, where: { schoolCode: req.user.schoolCode } }]
    });
    const classmates = allStudents.filter(s => s.grade === student.grade && s.id !== student.id);
    const classmateUserIds = classmates.map(s => s.User.id);
    const messages = await Message.findAll({
      where: {
        [Op.or]: [
          { senderId: req.user.id, receiverId: { [Op.in]: classmateUserIds } },
          { senderId: { [Op.in]: classmateUserIds }, receiverId: req.user.id }
        ]
      },
      include: [{ model: User, as: 'Sender', attributes: ['id', 'name'] }],
      order: [['createdAt', 'ASC']]
    });
    res.json({ success: true, data: messages });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ============ NEW: Comprehensive Student Details ============

// @desc    Get comprehensive student details (for unified modal)
// @route   GET /api/students/:studentId/details
// @access  Private (with ownership check)
exports.getStudentFullDetails = async (req, res) => {
    try {
        const { studentId } = req.params;
        const student = await Student.findByPk(studentId, {
            include: [
                { model: User, attributes: ['id', 'name', 'email', 'phone', 'profileImage', 'isActive'] }
            ]
        });

        if (!student) {
            return res.status(404).json({ success: false, message: 'Student not found' });
        }

        // Authorization
        const user = req.user;
        let authorized = false;
        if (['admin', 'super_admin'].includes(user.role)) {
            authorized = true;
        } else if (user.role === 'teacher') {
            const teacher = await Teacher.findOne({ where: { userId: user.id } });
            if (teacher) {
                const classes = await Class.findAll({ where: { schoolCode: user.schoolCode } });
                const teachesClass = classes.some(cls =>
                    cls.teacherId === teacher.id ||
                    (cls.subjectTeachers && cls.subjectTeachers.some(st => st.teacherId === teacher.id))
                );
                if (teachesClass && classes.some(cls => cls.name === student.grade)) {
                    authorized = true;
                }
            }
        } else if (user.role === 'parent') {
            const parent = await Parent.findOne({ where: { userId: user.id } });
            if (parent && await parent.hasStudent(student)) {
                authorized = true;
            }
        } else if (user.role === 'student') {
            if (student.userId === user.id) {
                authorized = true;
            }
        }

        if (!authorized) {
            return res.status(403).json({ success: false, message: 'Forbidden' });
        }

        // School curriculum
        const school = await School.findOne({ where: { schoolId: student.User?.schoolCode || user.schoolCode } });
        const curriculum = school ? school.system : 'cbc';
        const schoolLevel = school?.settings?.schoolLevel || 'secondary';

        // Parents
        const parents = await student.getParents({
            include: [{ model: User, attributes: ['id', 'name', 'email', 'phone'] }]
        });
        const parentList = parents.map(p => ({
            id: p.id,
            name: p.User.name,
            phone: p.User.phone,
            email: p.User.email,
            relationship: p.relationship
        }));

        // Class teacher
        const classTeacher = await Teacher.findOne({
            where: { classTeacher: student.grade },
            include: [{ model: User, attributes: ['id', 'name', 'email', 'phone'] }]
        });

        // Academic records (only published)
        const records = await AcademicRecord.findAll({
            where: { studentId, isPublished: true },
            order: [['date', 'DESC']]
        });
        const overallAverage = records.length
            ? Math.round(records.reduce((s, r) => s + r.score, 0) / records.length)
            : 0;

        // Subject averages with curriculum grading
        const subjectMap = {};
        records.forEach(r => {
            if (!subjectMap[r.subject]) subjectMap[r.subject] = { total: 0, count: 0 };
            subjectMap[r.subject].total += r.score;
            subjectMap[r.subject].count++;
        });
        const subjects = Object.entries(subjectMap).map(([subject, data]) => ({
            subject,
            average: Math.round(data.total / data.count),
            grade: getGradeFromScore(Math.round(data.total / data.count), curriculum, schoolLevel)
        }));

        // Term averages
        const termAverages = [];
        const terms = ['Term 1', 'Term 2', 'Term 3'];
        const currentYear = new Date().getFullYear();
        for (let year = currentYear - 1; year <= currentYear; year++) {
            for (const term of terms) {
                const termRecords = records.filter(r => r.term === term && r.year === year);
                if (termRecords.length) {
                    const avg = Math.round(termRecords.reduce((s, r) => s + r.score, 0) / termRecords.length);
                    termAverages.push({ term: `${term} ${year}`, average: avg });
                }
            }
        }

        // Attendance summary
        const attendance = await Attendance.findAll({ where: { studentId } });
        const present = attendance.filter(a => a.status === 'present').length;
        const absent = attendance.filter(a => a.status === 'absent').length;
        const late = attendance.filter(a => a.status === 'late').length;
        const attendanceRate = attendance.length
            ? Math.round((present / attendance.length) * 100)
            : 0;

        // Recent assessments
        const recentAssessments = records.slice(0, 5).map(r => ({
            subject: r.subject,
            assessment: r.assessmentName,
            score: r.score,
            date: r.date
        }));

        const address = student.address || 'Not provided';
        const isPrefect = student.isPrefect || false;

        res.json({
            success: true,
            data: {
                student: {
                    id: student.id,
                    elimuid: student.elimuid,
                    grade: student.grade,
                    status: student.status,
                    enrollmentDate: student.enrollmentDate,
                    dateOfBirth: student.dateOfBirth,
                    gender: student.gender,
                    isPrefect,
                    photo: student.User.profileImage
                },
                user: {
                    name: student.User.name,
                    email: student.User.email,
                    phone: student.User.phone
                },
                parents: parentList,
                classTeacher: classTeacher ? {
                    name: classTeacher.User.name,
                    email: classTeacher.User.email,
                    phone: classTeacher.User.phone
                } : null,
                academicSummary: {
                    overallAverage,
                    termAverages,
                    subjects
                },
                attendanceSummary: {
                    rate: attendanceRate,
                    present,
                    absent,
                    late
                },
                recentAssessments,
                address,
                school: {
                    curriculum,
                    schoolLevel
                }
            }
        });
    } catch (error) {
        console.error('Get student full details error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
};
