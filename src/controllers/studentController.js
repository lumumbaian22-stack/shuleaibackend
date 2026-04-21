// src/controllers/studentController.js
const { Student, AcademicRecord, Attendance, Message, User, Class, Teacher, Parent } = require('../models');
const { Op } = require('sequelize');

// @desc    Get student's own dashboard data
// @route   GET /api/student/dashboard
// @access  Private/Student
exports.getDashboard = async (req, res) => {
  try {
    const student = await Student.findOne({ where: { userId: req.user.id } });
    if (!student) return res.status(404).json({ success: false, message: 'Student profile not found' });

    const records = await AcademicRecord.findAll({ where: { studentId: student.id }, order: [['date', 'DESC']], limit: 10 });
    const attendance = await Attendance.findAll({ where: { studentId: student.id }, order: [['date', 'DESC']], limit: 20 });

    const avg = records.length ? records.reduce((a,b) => a + b.score, 0) / records.length : 0;

    res.json({
      success: true,
      data: {
        student: req.user.getPublicProfile(),
        averageScore: avg,
        recentRecords: records,
        recentAttendance: attendance,
        paymentStatus: student.paymentStatus
      }
    });
  } catch (error) {
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

// @desc    Get own grades
// @route   GET /api/student/grades
// @access  Private/Student
exports.getGrades = async (req, res) => {
  try {
    const student = await Student.findOne({ where: { userId: req.user.id } });
    const records = await AcademicRecord.findAll({ where: { studentId: student.id }, order: [['date', 'DESC']] });
    res.json({ success: true, data: records });
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
    const classmates = await Student.findAll({ where: { grade: student.grade } });
    const classmateIds = classmates.map(s => s.userId);
    const messages = await Message.findAll({
      where: {
        [Op.or]: [
          { senderId: req.user.id, receiverId: { [Op.in]: classmateIds } },
          { senderId: { [Op.in]: classmateIds }, receiverId: req.user.id }
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

// Helper: get grade from score (simplified)
function getGradeFromScoreLocal(score) {
    if (score >= 80) return 'A';
    if (score >= 70) return 'B';
    if (score >= 60) return 'C';
    if (score >= 50) return 'D';
    return 'E';
}

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

        // Authorization: only allow if user is admin, teacher of the class, parent of student, or the student themselves
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

        // Fetch parents
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

        // Fetch class teacher
        const classTeacher = await Teacher.findOne({
            where: { classTeacher: student.grade },
            include: [{ model: User, attributes: ['id', 'name', 'email', 'phone'] }]
        });

        // Academic summary
        const records = await AcademicRecord.findAll({ where: { studentId }, order: [['date', 'DESC']] });
        const overallAverage = records.length ? Math.round(records.reduce((s, r) => s + r.score, 0) / records.length) : 0;

        // Subject averages
        const subjectMap = {};
        records.forEach(r => {
            if (!subjectMap[r.subject]) subjectMap[r.subject] = { total: 0, count: 0 };
            subjectMap[r.subject].total += r.score;
            subjectMap[r.subject].count++;
        });
        const subjects = Object.entries(subjectMap).map(([subject, data]) => ({
            subject,
            average: Math.round(data.total / data.count),
            grade: getGradeFromScoreLocal(Math.round(data.total / data.count))
        }));

        // Term averages (last 3 terms)
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
        const attendanceRate = attendance.length ? Math.round((present / attendance.length) * 100) : 0;

        // Recent assessments (last 5)
        const recentAssessments = records.slice(0, 5).map(r => ({
            subject: r.subject,
            assessment: r.assessmentName,
            score: r.score,
            date: r.date
        }));

        // Address (placeholder; can be added to Student model later)
        const address = student.address || 'Not provided';

        // Prefect status
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
                address
            }
        });
    } catch (error) {
        console.error('Get student full details error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
};
