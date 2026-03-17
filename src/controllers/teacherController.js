const { Teacher, Student, AcademicRecord, Attendance, User, Parent, Message } = require('../models');
const { createAlert } = require('../services/notificationService');
const { Op } = require('sequelize');
const csv = require('csv-parser');
const fs = require('fs');

// @desc    Get teacher's dashboard
// @route   GET /api/teacher/dashboard
// @access  Private/Teacher
exports.getDashboard = async (req, res) => {
  try {
    const teacher = await Teacher.findOne({ where: { userId: req.user.id } });
    if (!teacher) {
      return res.status(404).json({ success: false, message: 'Teacher profile not found' });
    }

    // Get students if teacher has a class
    let students = [];
    if (teacher.classTeacher) {
      students = await Student.findAll({
        where: { grade: teacher.classTeacher },
        include: [{ model: User, attributes: ['id', 'name', 'email', 'phone'] }]
      });
    }

    // Get today's duty
    const todayDuty = await exports.getTodayDuty(req.user.id);

    // Get unread message count
    const unreadCount = await Message.count({
      where: {
        receiverId: req.user.id,
        isRead: false
      }
    });

    res.json({
      success: true,
      data: {
        teacher: {
          id: teacher.id,
          employeeId: teacher.employeeId,
          subjects: teacher.subjects,
          classTeacher: teacher.classTeacher,
          department: teacher.department
        },
        user: req.user.getPublicProfile(),
        students: students,
        todayDuty: todayDuty,
        unreadMessages: unreadCount,
        stats: {
          totalStudents: students.length,
          totalClasses: teacher.classTeacher ? 1 : 0
        }
      }
    });
  } catch (error) {
    console.error('Get dashboard error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Get teacher's students
// @route   GET /api/teacher/students
// @access  Private/Teacher
exports.getMyStudents = async (req, res) => {
  try {
    const teacher = await Teacher.findOne({ where: { userId: req.user.id } });
    if (!teacher) {
      return res.status(404).json({ success: false, message: 'Teacher profile not found' });
    }

    let students = [];
    if (teacher.classTeacher) {
      students = await Student.findAll({
        where: { grade: teacher.classTeacher },
        include: [{ model: User, attributes: ['id', 'name', 'email', 'phone'] }]
      });
    }

    res.json({ success: true, data: students });
  } catch (error) {
    console.error('Get my students error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Enter marks for a student
// @route   POST /api/teacher/marks
// @access  Private/Teacher
exports.enterMarks = async (req, res) => {
  try {
    const { studentId, subject, score, assessmentType, assessmentName, date, term, year } = req.body;
    
    const teacher = await Teacher.findOne({ where: { userId: req.user.id } });
    if (!teacher) {
      return res.status(404).json({ success: false, message: 'Teacher not found' });
    }

    const record = await AcademicRecord.create({
      studentId,
      schoolCode: req.user.schoolCode,
      term: term || 'Term 1',
      year: year || new Date().getFullYear(),
      subject,
      assessmentType: assessmentType || 'test',
      assessmentName: assessmentName || `${subject} ${assessmentType || 'test'}`,
      score,
      teacherId: teacher.id,
      date: date || new Date(),
      isPublished: true
    });

    // Check for performance alerts (score < 50)
    if (score < 50) {
      const student = await Student.findByPk(studentId, { 
        include: [{ model: User, attributes: ['id', 'name'] }] 
      });
      
      if (student) {
        await createAlert({
          userId: student.userId,
          role: 'student',
          type: 'academic',
          severity: 'warning',
          title: 'Low Score Alert',
          message: `You scored ${score}% in ${subject}. Please review.`
        });

        // Also alert parents
        const parents = await student.getParents({ 
          include: [{ model: User, attributes: ['id'] }] 
        });
        
        for (const parent of parents) {
          await createAlert({
            userId: parent.userId,
            role: 'parent',
            type: 'academic',
            severity: 'warning',
            title: `Low Score: ${student.User.name}`,
            message: `${student.User.name} scored ${score}% in ${subject}.`
          });
        }
      }
    }

    res.status(201).json({ success: true, data: record });
  } catch (error) {
    console.error('Enter marks error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Take attendance
// @route   POST /api/teacher/attendance
// @access  Private/Teacher
exports.takeAttendance = async (req, res) => {
  try {
    const { studentId, date, status, reason } = req.body;
    
    const [attendance, created] = await Attendance.findOrCreate({
      where: { studentId, date },
      defaults: { 
        studentId, 
        date, 
        status, 
        reason, 
        schoolCode: req.user.schoolCode, 
        reportedBy: req.user.id 
      }
    });

    if (!created) {
      attendance.status = status;
      attendance.reason = reason;
      await attendance.save();
    }

    // Alert if absent
    if (status === 'absent') {
      const student = await Student.findByPk(studentId, { 
        include: [{ model: User, attributes: ['id', 'name'] }] 
      });
      
      if (student) {
        await createAlert({
          userId: student.userId,
          role: 'student',
          type: 'attendance',
          severity: 'info',
          title: 'Absence Recorded',
          message: `You were marked absent on ${date}.`
        });
      }
    }

    res.json({ success: true, data: attendance });
  } catch (error) {
    console.error('Take attendance error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Add a comment about a student
// @route   POST /api/teacher/comment
// @access  Private/Teacher
exports.addComment = async (req, res) => {
  try {
    const { studentId, comment } = req.body;
    
    const student = await Student.findByPk(studentId, { 
      include: [{ model: User, attributes: ['id', 'name'] }] 
    });
    
    if (!student) {
      return res.status(404).json({ success: false, message: 'Student not found' });
    }

    const parents = await student.getParents({ 
      include: [{ model: User, attributes: ['id', 'name'] }] 
    });
    
    for (const parent of parents) {
      await createAlert({
        userId: parent.userId,
        role: 'parent',
        type: 'system',
        severity: 'info',
        title: `Teacher Comment: ${student.User.name}`,
        message: comment
      });
    }

    res.json({ success: true, message: 'Comment sent to parents' });
  } catch (error) {
    console.error('Add comment error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Upload CSV of marks
// @route   POST /api/teacher/upload/marks
// @access  Private/Teacher
exports.uploadMarksCSV = async (req, res) => {
  if (!req.files || !req.files.file) {
    return res.status(400).json({ success: false, message: 'No file uploaded' });
  }

  const file = req.files.file;
  const filePath = `/tmp/${Date.now()}-${file.name}`;
  
  try {
    await file.mv(filePath);

    const results = [];
    const errors = [];

    const teacher = await Teacher.findOne({ where: { userId: req.user.id } });
    if (!teacher) {
      return res.status(404).json({ success: false, message: 'Teacher not found' });
    }

    const readStream = fs.createReadStream(filePath)
      .pipe(csv())
      .on('data', (data) => results.push(data))
      .on('end', async () => {
        // Process each row
        for (const row of results) {
          try {
            // Find student by ID or ELIMUID
            const student = await Student.findOne({
              where: {
                [Op.or]: [
                  { id: row.studentId },
                  { elimuid: row.elimuid }
                ]
              }
            });

            if (!student) {
              errors.push({ row, error: 'Student not found' });
              continue;
            }

            await AcademicRecord.create({
              studentId: student.id,
              schoolCode: req.user.schoolCode,
              term: row.term || 'Term 1',
              year: row.year || new Date().getFullYear(),
              subject: row.subject,
              assessmentType: row.assessmentType || 'test',
              assessmentName: row.assessmentName || `${row.subject} ${row.assessmentType || 'test'}`,
              score: parseInt(row.score),
              teacherId: teacher.id,
              date: row.date || new Date(),
              isPublished: true
            });
          } catch (err) {
            errors.push({ row, error: err.message });
          }
        }

        // Clean up temp file
        fs.unlinkSync(filePath);

        res.json({
          success: true,
          message: `Processed ${results.length} records with ${errors.length} errors`,
          data: {
            total: results.length,
            successful: results.length - errors.length,
            errors: errors
          }
        });
      });

    readStream.on('error', (error) => {
      console.error('CSV read error:', error);
      fs.unlinkSync(filePath);
      res.status(500).json({ success: false, message: 'Error reading CSV file' });
    });

  } catch (error) {
    console.error('Upload marks CSV error:', error);
    // Clean up temp file if it exists
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
    res.status(500).json({ success: false, message: error.message });
  }
};

// ============ MESSAGE FUNCTIONS ============

// @desc    Get all conversations for teacher
// @route   GET /api/teacher/conversations
// @access  Private/Teacher
exports.getConversations = async (req, res) => {
    try {
        const messages = await Message.findAll({
            where: {
                [Op.or]: [
                    { receiverId: req.user.id },
                    { senderId: req.user.id }
                ]
            },
            include: [
                { 
                    model: User, 
                    as: 'Sender', 
                    attributes: ['id', 'name', 'role'] 
                },
                { 
                    model: User, 
                    as: 'Receiver', 
                    attributes: ['id', 'name', 'role'] 
                }
            ],
            order: [['createdAt', 'DESC']]
        });
        
        // Group by conversation
        const conversations = {};
        messages.forEach(msg => {
            const otherUserId = msg.senderId === req.user.id ? msg.receiverId : msg.senderId;
            const otherUser = msg.senderId === req.user.id ? msg.Receiver : msg.Sender;
            
            if (!conversations[otherUserId]) {
                conversations[otherUserId] = {
                    userId: otherUserId,
                    userName: otherUser?.name || 'Unknown',
                    userRole: otherUser?.role || 'unknown',
                    lastMessage: msg.content,
                    lastMessageTime: msg.createdAt,
                    unreadCount: msg.receiverId === req.user.id && !msg.isRead ? 1 : 0,
                    studentName: msg.metadata?.studentName,
                    studentGrade: msg.metadata?.studentGrade,
                    messages: []
                };
            } else {
                if (msg.receiverId === req.user.id && !msg.isRead) {
                    conversations[otherUserId].unreadCount++;
                }
            }
            
            conversations[otherUserId].messages.push(msg);
        });
        
        res.json({ success: true, data: Object.values(conversations) });
    } catch (error) {
        console.error('Get conversations error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
};

// @desc    Get messages with a specific user
// @route   GET /api/teacher/messages/:otherUserId
// @access  Private/Teacher
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
            include: [
                { model: User, as: 'Sender', attributes: ['id', 'name', 'role'] },
                { model: User, as: 'Receiver', attributes: ['id', 'name', 'role'] }
            ],
            order: [['createdAt', 'ASC']]
        });
        
        res.json({ success: true, data: messages });
    } catch (error) {
        console.error('Get messages error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
};

// @desc    Mark messages as read
// @route   PUT /api/teacher/messages/read/:conversationId
// @access  Private/Teacher
exports.markMessagesAsRead = async (req, res) => {
    try {
        const { conversationId } = req.params;
        
        await Message.update(
            { isRead: true, readAt: new Date() },
            {
                where: {
                    senderId: conversationId,
                    receiverId: req.user.id,
                    isRead: false
                }
            }
        );
        
        res.json({ success: true, message: 'Messages marked as read' });
    } catch (error) {
        console.error('Mark as read error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
};

// @desc    Reply to parent message
// @route   POST /api/teacher/reply
// @access  Private/Teacher
exports.replyToParent = async (req, res) => {
    try {
        const { parentId, message, originalMessageId } = req.body;
        
        // Create reply message
        const reply = await Message.create({
            senderId: req.user.id,
            receiverId: parentId,
            content: message,
            metadata: {
                inReplyTo: originalMessageId,
                type: 'teacher_reply',
                teacherName: req.user.name
            }
        });
        
        // Create alert for parent
        await createAlert({
            userId: parentId,
            role: 'parent',
            type: 'message',
            severity: 'info',
            title: `📬 Reply from ${req.user.name}`,
            message: message.substring(0, 100) + (message.length > 100 ? '...' : ''),
            data: {
                teacherId: req.user.id,
                teacherName: req.user.name,
                messageId: reply.id
            }
        });
        
        // Real-time notification
        if (global.io) {
            global.io.to(`user-${parentId}`).emit('new-message', {
                from: req.user.id,
                fromName: req.user.name,
                fromRole: 'teacher',
                content: message,
                timestamp: new Date()
            });
        }
        
        res.status(201).json({
            success: true,
            message: 'Reply sent successfully',
            data: reply
        });
        
    } catch (error) {
        console.error('Reply error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
};

// @desc    Get today's duty for a teacher
// @access  Private/Teacher
exports.getTodayDuty = async (userId) => {
  try {
    const teacher = await Teacher.findOne({ where: { userId } });
    if (!teacher) return null;

    const { DutyRoster } = require('../models');
    const today = new Date().toISOString().split('T')[0];
    
    const roster = await DutyRoster.findOne({
      where: {
        date: today
      }
    });

    if (roster && roster.duties) {
      const duty = roster.duties.find(d => d.teacherId === teacher.id);
      return duty || null;
    }
    return null;
  } catch (error) {
    console.error('Error getting today duty:', error);
    return null;
  }
};
