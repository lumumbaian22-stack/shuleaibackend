// src/controllers/studentController.js
const { Student, AcademicRecord, Attendance, Message, User, Class, Teacher, Parent, School } = require('../models');
const { Op } = require('sequelize');

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
        student: req.user.getPublicProfile(),
        averageScore: parseFloat(avg),
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

// @desc    Get learning materials (placeholder)
// @route   GET /api/student/materials
// @access  Private/Student
exports.getMaterials = async (req, res) => {
  try {
    const materials = [
      { id: 1, title: 'Mathematics Notes', type: 'pdf', url: '/uploads/math.pdf' },
      { id: 2, title: 'Science Video', type: 'video', url: '/uploads/science.mp4' }
    ];
    res.json({ success: true, data: materials });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

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
        where: { studentId: student.id, isPublished: true },
        order: [['date', 'DESC']]
    });

    const enriched = records.map(r => ({
        ...r.toJSON(),
        grade: getGradeFromScore(r.score, curriculum, schoolLevel)
    }));

    res.json({ success: true, data: enriched });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Get own attendance
// @route   GET /api/student/attendance
// @access  Private/Student
exports.getAttendance = async (req, res) => {
  try {
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


// @desc    Get current student's class members for class-scoped group/private chat
// @route   GET /api/student/chat/class-members
// @access  Private/student
exports.getClassMembers = async (req, res) => {
  try {
    const student = await Student.findOne({
      where: { userId: req.user.id },
      include: [{ model: User, attributes: ['id', 'name', 'email', 'role', 'profileImage'] }]
    });

    if (!student) {
      return res.status(404).json({ success: false, message: 'Student profile not found' });
    }

    const where = {};
    if (student.classId) where.classId = student.classId;
    else if (student.grade) where.grade = student.grade;
    else return res.json({ success: true, data: [] });

    const classmates = await Student.findAll({
      where,
      include: [{ model: User, attributes: ['id', 'name', 'email', 'role', 'profileImage'] }],
      order: [['firstName', 'ASC'], ['lastName', 'ASC']]
    });

    const members = classmates
      .filter(s => s.userId && String(s.userId) !== String(req.user.id))
      .map(s => ({
        id: s.userId,
        userId: s.userId,
        studentId: s.id,
        name: s.User?.name || `${s.firstName || ''} ${s.lastName || ''}`.trim() || 'Student',
        email: s.User?.email || s.email || '',
        role: 'student',
        profileImage: s.User?.profileImage || s.profileImage || null,
        classId: s.classId,
        grade: s.grade,
        admissionNumber: s.admissionNumber,
        assessmentNumber: s.assessmentNumber
      }));

    res.json({ success: true, data: members });
  } catch (error) {
    console.error('Get class members error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.ensureStudentCanMessageUser = async (studentUserId, targetUserId) => {
  const student = await Student.findOne({ where: { userId: studentUserId } });
  const targetStudent = await Student.findOne({ where: { userId: targetUserId } });
  if (!student || !targetStudent) return false;

  if (student.classId && targetStudent.classId) {
    return String(student.classId) === String(targetStudent.classId);
  }
  return !!student.grade && !!targetStudent.grade && String(student.grade) === String(targetStudent.grade);
};

function getMessageModel() {
  try {
    return require('../models').Message;
  } catch (_) {
    return null;
  }
}

async function getCurrentStudentForChat(userId) {
  return Student.findOne({ where: { userId } });
}

// @desc    Send message to student's own class group
exports.sendClassGroupMessage = async (req, res) => {
  try {
    const Message = getMessageModel();
    if (!Message) return res.status(500).json({ success: false, message: 'Message model not available' });

    const student = await getCurrentStudentForChat(req.user.id);
    if (!student) return res.status(404).json({ success: false, message: 'Student profile not found' });

    const text = (req.body.message || req.body.content || '').trim();
    if (!text) return res.status(400).json({ success: false, message: 'Message cannot be empty' });

    const classKey = student.classId ? `class:${student.classId}` : `grade:${student.grade}`;

    const saved = await Message.create({
      senderId: req.user.id,
      recipientId: null,
      message: text,
      content: text,
      type: 'student_class_group',
      groupId: classKey,
      classId: student.classId || null,
      schoolCode: req.user.schoolCode
    });

    res.json({ success: true, data: saved });
  } catch (error) {
    console.error('Send class group message error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Get messages for student's own class group
exports.getClassGroupMessages = async (req, res) => {
  try {
    const Message = getMessageModel();
    if (!Message) return res.status(500).json({ success: false, message: 'Message model not available' });

    const student = await getCurrentStudentForChat(req.user.id);
    if (!student) return res.status(404).json({ success: false, message: 'Student profile not found' });

    const classKey = student.classId ? `class:${student.classId}` : `grade:${student.grade}`;

    const messages = await Message.findAll({
      where: { groupId: classKey, type: 'student_class_group' },
      include: [{ model: User, as: 'sender', attributes: ['id', 'name', 'role', 'profileImage'] }],
      order: [['createdAt', 'ASC']],
      limit: 200
    });

    res.json({ success: true, data: messages });
  } catch (error) {
    console.error('Get class group messages error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Student sends private message only to classmate
exports.sendClassPrivateMessage = async (req, res) => {
  try {
    const Message = getMessageModel();
    if (!Message) return res.status(500).json({ success: false, message: 'Message model not available' });

    const { recipientId } = req.body;
    const text = (req.body.message || req.body.content || '').trim();

    if (!recipientId || !text) {
      return res.status(400).json({ success: false, message: 'recipientId and message are required' });
    }

    const allowed = await exports.ensureStudentCanMessageUser(req.user.id, recipientId);
    if (!allowed) {
      return res.status(403).json({ success: false, message: 'Students can only privately message classmates in their own class' });
    }

    const saved = await Message.create({
      senderId: req.user.id,
      recipientId,
      message: text,
      content: text,
      type: 'student_private',
      schoolCode: req.user.schoolCode
    });

    res.json({ success: true, data: saved });
  } catch (error) {
    console.error('Send class private message error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Student gets private thread with classmate
exports.getClassPrivateMessages = async (req, res) => {
  try {
    const Message = getMessageModel();
    if (!Message) return res.status(500).json({ success: false, message: 'Message model not available' });

    const otherUserId = req.params.otherUserId;
    const allowed = await exports.ensureStudentCanMessageUser(req.user.id, otherUserId);
    if (!allowed) {
      return res.status(403).json({ success: false, message: 'Students can only view private chats with classmates in their own class' });
    }

    const { Op } = require('sequelize');
    const messages = await Message.findAll({
      where: {
        [Op.or]: [
          { senderId: req.user.id, recipientId: otherUserId },
          { senderId: otherUserId, recipientId: req.user.id }
        ]
      },
      include: [
        { model: User, as: 'sender', attributes: ['id', 'name', 'role', 'profileImage'] },
        { model: User, as: 'recipient', attributes: ['id', 'name', 'role', 'profileImage'] }
      ],
      order: [['createdAt', 'ASC']],
      limit: 200
    });

    res.json({ success: true, data: messages });
  } catch (error) {
    console.error('Get class private messages error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};
