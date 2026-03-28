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

// @desc    Add a new student with default password
// @route   POST /api/teacher/students
// @access  Private/Teacher
exports.addStudent = async (req, res) => {
  try {
    const { name, grade, parentEmail, dateOfBirth, gender } = req.body;
    
    // Validate required fields
    if (!name || !grade) {
      return res.status(400).json({ 
        success: false, 
        message: 'Student name and grade are required' 
      });
    }

    // DEFAULT PASSWORD for all students
    const defaultPassword = 'Student123!';

    // Create user for student with default password
    const user = await User.create({
      name,
      email: null,
      password: defaultPassword, // Same for all students
      role: 'student',
      schoolCode: req.user.schoolCode,
      isActive: true,
      firstLogin: true // Mark as first login
    });

    // Create student profile
    const student = await Student.create({
      userId: user.id,
      grade: grade,
      dateOfBirth: dateOfBirth,
      gender: gender
    });

    // If parent email provided, create parent account or link existing
    if (parentEmail) {
      try {
        let parentUser = await User.findOne({ 
          where: { email: parentEmail, role: 'parent' }
        });

        let parent;
        
        if (!parentUser) {
          parentUser = await User.create({
            name: `Parent of ${name}`,
            email: parentEmail,
            password: defaultPassword, // Same default password
            role: 'parent',
            schoolCode: req.user.schoolCode,
            isActive: true
          });

          parent = await Parent.create({
            userId: parentUser.id,
            relationship: 'guardian'
          });
        } else {
          parent = await Parent.findOne({ where: { userId: parentUser.id } });
        }

        if (parent) {
          await parent.addStudent(student);
        }
      } catch (parentError) {
        console.error('Error linking parent:', parentError);
      }
    }

    res.status(201).json({
      success: true,
      message: 'Student added successfully',
      data: {
        id: student.id,
        elimuid: student.elimuid,
        name: user.name,
        grade: student.grade,
        defaultPassword: defaultPassword // Optional: show teacher the default password
      }
    });
  } catch (error) {
    console.error('Add student error:', error);
    res.status(500).json({ 
      success: false, 
      message: error.message || 'Failed to add student' 
    });
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

// @desc    Delete a student from teacher's class
// @route   DELETE /api/teacher/students/:studentId
// @access  Private/Teacher
exports.deleteStudent = async (req, res) => {
  try {
    const { studentId } = req.params;
    
    // Find the teacher
    const teacher = await Teacher.findOne({ where: { userId: req.user.id } });
    if (!teacher) {
      return res.status(404).json({ success: false, message: 'Teacher not found' });
    }
    
    // Find the student
    const student = await Student.findByPk(studentId, {
      include: [{ model: User }]
    });
    
    if (!student) {
      return res.status(404).json({ success: false, message: 'Student not found' });
    }
    
    // Verify this student belongs to this teacher's class
    if (student.grade !== teacher.classTeacher) {
      return res.status(403).json({ success: false, message: 'This student is not in your class' });
    }
    
    // Get student name before deletion for notification
    const studentName = student.User.name;
    const studentUserId = student.userId;
    
    // Delete the student (this will cascade to User due to CASCADE)
    await student.destroy();
    
    // Notify admin about the deletion
    const admins = await User.findAll({ 
      where: { role: 'admin', schoolCode: req.user.schoolCode } 
    });
    
    for (const admin of admins) {
      await createAlert({
        userId: admin.id,
        role: 'admin',
        type: 'system',
        severity: 'info',
        title: 'Student Deleted',
        message: `Teacher ${req.user.name} removed student ${studentName} from class`,
        data: { teacherId: teacher.id, studentId }
      });
    }
    
    res.json({ 
      success: true, 
      message: 'Student removed from class successfully' 
    });
  } catch (error) {
    console.error('Delete student error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Get teacher's assignments (classes and subjects they teach)
// @route   GET /api/teacher/my-assignments
// @access  Private/Teacher
exports.getMyAssignments = async (req, res) => {
  try {
    const { TeacherSubjectAssignment, Teacher, Class } = require('../models');
    
    const teacher = await Teacher.findOne({ where: { userId: req.user.id } });
    if (!teacher) {
      return res.status(404).json({ success: false, message: 'Teacher not found' });
    }

    const assignments = await TeacherSubjectAssignment.findAll({
      where: {
        teacherId: teacher.id,
        academicYear: new Date().getFullYear().toString()
      },
      include: [
        {
          model: Class,
          where: { schoolCode: req.user.schoolCode, isActive: true }
        }
      ],
      order: [['subject', 'ASC']]
    });

    // Find class teacher assignment (where isClassTeacher = true)
    const classTeacherAssignment = assignments.find(a => a.isClassTeacher);
    
    // Get all subject assignments (including class teacher's subjects)
    const subjectAssignments = assignments.map(a => ({
      classId: a.classId,
      className: a.Class?.name,
      classGrade: a.Class?.grade,
      subject: a.subject,
      isClassTeacher: a.isClassTeacher,
      studentCount: a.Class?.studentCount || 0
    }));

    res.json({
      success: true,
      data: {
        teacherId: teacher.id,
        teacherName: req.user.name,
        classTeacher: classTeacherAssignment ? {
          classId: classTeacherAssignment.classId,
          className: classTeacherAssignment.Class?.name,
          classGrade: classTeacherAssignment.Class?.grade,
          studentCount: classTeacherAssignment.Class?.studentCount || 0
        } : null,
        subjects: subjectAssignments,
        allSubjects: [...new Set(subjectAssignments.map(s => s.subject))],
        allClasses: [...new Map(subjectAssignments.map(s => [s.classId, { id: s.classId, name: s.className, grade: s.classGrade }])).values()]
      }
    });
  } catch (error) {
    console.error('Get my assignments error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Get students for a specific class and subject
// @route   GET /api/teacher/class-students
// @access  Private/Teacher
exports.getClassStudentsForSubject = async (req, res) => {
  try {
    const { classId, subject } = req.query;
    const { TeacherSubjectAssignment, Student, User, Class } = require('../models');
    
    const teacher = await Teacher.findOne({ where: { userId: req.user.id } });
    if (!teacher) {
      return res.status(404).json({ success: false, message: 'Teacher not found' });
    }

    // Verify teacher is assigned to this class and subject
    const assignment = await TeacherSubjectAssignment.findOne({
      where: {
        teacherId: teacher.id,
        classId: parseInt(classId),
        subject: subject,
        academicYear: new Date().getFullYear().toString()
      }
    });

    if (!assignment) {
      return res.status(403).json({ 
        success: false, 
        message: 'You are not assigned to teach this subject in this class' 
      });
    }

    // Get the class
    const classItem = await Class.findOne({
      where: { id: classId, schoolCode: req.user.schoolCode }
    });

    if (!classItem) {
      return res.status(404).json({ success: false, message: 'Class not found' });
    }

    // Get students for this class
    let students = await Student.findAll({
      where: { grade: classItem.grade, status: 'active' },
      include: [{ model: User, attributes: ['id', 'name', 'email'] }],
      order: [['createdAt', 'DESC']]
    });

    // If this is a subject that requires combination (like Biology), filter by subject combination
    const combinationSubjects = ['Biology', 'Chemistry', 'Physics', 'History', 'Geography', 'Business', 'Agriculture', 'Computer'];
    if (combinationSubjects.includes(subject) && classItem.grade.includes('Form')) {
      students = students.filter(s => 
        s.subjectCombination && s.subjectCombination.includes(subject)
      );
    }

    const formattedStudents = students.map(s => ({
      id: s.id,
      userId: s.userId,
      name: s.User?.name || 'Unknown',
      elimuid: s.elimuid,
      grade: s.grade,
      subjectCombination: s.subjectCombination || []
    }));

    res.json({
      success: true,
      data: {
        classId: classItem.id,
        className: classItem.name,
        grade: classItem.grade,
        subject: subject,
        students: formattedStudents,
        studentCount: formattedStudents.length
      }
    });
  } catch (error) {
    console.error('Get class students error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// src/controllers/teacherController.js - ADD THESE FUNCTIONS

// @desc    Get teacher's assigned class
// @route   GET /api/teacher/my-class
// @access  Private/Teacher
exports.getMyClass = async (req, res) => {
  try {
    const teacher = await Teacher.findOne({ 
      where: { userId: req.user.id }
    });
    
    if (!teacher) {
      return res.status(404).json({ success: false, message: 'Teacher not found' });
    }

    // Get the class this teacher is assigned to
    const classItem = await Class.findOne({
      where: { teacherId: teacher.id, schoolCode: req.user.schoolCode, isActive: true }
    });

    if (!classItem) {
      // Try to find by classTeacher field (legacy)
      if (teacher.classTeacher) {
        const legacyClass = await Class.findOne({
          where: { name: teacher.classTeacher, schoolCode: req.user.schoolCode, isActive: true }
        });
        if (legacyClass) {
          return res.json({ success: true, data: legacyClass });
        }
      }
      return res.json({ success: true, data: null });
    }

    // Get student count for this class
    const studentCount = await Student.count({
      where: { grade: classItem.name, schoolCode: req.user.schoolCode }
    });

    const classData = classItem.toJSON();
    classData.studentCount = studentCount;

    res.json({ success: true, data: classData });
  } catch (error) {
    console.error('Get my class error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Get teacher's assigned subjects
// @route   GET /api/teacher/my-subjects
// @access  Private/Teacher
exports.getMySubjects = async (req, res) => {
  try {
    const teacher = await Teacher.findOne({ 
      where: { userId: req.user.id }
    });
    
    if (!teacher) {
      return res.status(404).json({ success: false, message: 'Teacher not found' });
    }

    // Get all classes where this teacher is assigned as subject teacher
    const subjectAssignments = await Class.findAll({
      where: {
        schoolCode: req.user.schoolCode,
        isActive: true,
        [Op.or]: [
          { teacherId: teacher.id }, // class teacher
          { subjectTeachers: { [Op.contains]: [{ teacherId: teacher.id }] } } // subject teacher
        ]
      }
    });

    // Format subjects with class information
    const subjects = teacher.subjects || [];
    const subjectList = subjects.map(subject => {
      const classes = subjectAssignments.filter(cls => {
        // Check if teacher teaches this subject in this class
        const subjectTeacher = cls.subjectTeachers?.find(st => st.teacherId === teacher.id && st.subject === subject);
        return subjectTeacher || cls.teacherId === teacher.id; // class teacher teaches all subjects
      }).map(cls => ({
        id: cls.id,
        name: cls.name,
        grade: cls.grade,
        studentCount: 0 // Will be filled later if needed
      }));

      return {
        name: subject,
        classes: classes
      };
    });

    res.json({ success: true, data: subjectList });
  } catch (error) {
    console.error('Get my subjects error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Get teacher stats
// @route   GET /api/teacher/stats
// @access  Private/Teacher
exports.getTeacherStats = async (req, res) => {
  try {
    const teacher = await Teacher.findOne({ 
      where: { userId: req.user.id }
    });
    
    if (!teacher) {
      return res.status(404).json({ success: false, message: 'Teacher not found' });
    }

    // Get students count
    let studentCount = 0;
    let students = [];
    
    if (teacher.classTeacher) {
      students = await Student.findAll({
        where: { grade: teacher.classTeacher, schoolCode: req.user.schoolCode },
        include: [{ model: User, attributes: ['id', 'name', 'email', 'phone'] }]
      });
      studentCount = students.length;
    } else {
      // If subject teacher, get students from classes they teach
      const classes = await Class.findAll({
        where: {
          schoolCode: req.user.schoolCode,
          isActive: true,
          [Op.or]: [
            { teacherId: teacher.id },
            { subjectTeachers: { [Op.contains]: [{ teacherId: teacher.id }] } }
          ]
        }
      });
      
      const gradeNames = classes.map(c => c.name);
      if (gradeNames.length > 0) {
        students = await Student.findAll({
          where: { grade: { [Op.in]: gradeNames }, schoolCode: req.user.schoolCode },
          include: [{ model: User, attributes: ['id', 'name', 'email', 'phone'] }]
        });
        studentCount = students.length;
      }
    }

    // Calculate average score for students
    let totalScore = 0;
    let scoreCount = 0;
    for (const student of students) {
      const records = await AcademicRecord.findAll({
        where: { studentId: student.id },
        order: [['date', 'DESC']],
        limit: 10
      });
      const avg = records.length ? records.reduce((a,b) => a + b.score, 0) / records.length : 0;
      student.average = Math.round(avg);
      totalScore += avg;
      scoreCount++;
    }
    
    const classAverage = scoreCount > 0 ? Math.round(totalScore / scoreCount) : 0;

    // Get marks entered this month
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);
    
    const marksCount = await AcademicRecord.count({
      where: {
        teacherId: teacher.id,
        createdAt: { [Op.gte]: startOfMonth }
      }
    });

    // Get pending tasks (students with no marks this week)
    const startOfWeek = new Date();
    startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay());
    startOfWeek.setHours(0, 0, 0, 0);
    
    const studentsWithMarksThisWeek = await AcademicRecord.findAll({
      where: {
        teacherId: teacher.id,
        date: { [Op.gte]: startOfWeek }
      },
      attributes: ['studentId'],
      group: ['studentId']
    });
    
    const markedStudentIds = studentsWithMarksThisWeek.map(s => s.studentId);
    const pendingTasks = students.filter(s => !markedStudentIds.includes(s.id)).length;

    res.json({ 
      success: true, 
      data: {
        studentCount,
        classAverage,
        subjects: teacher.subjects?.length || 0,
        classTeacher: teacher.classTeacher || null,
        reliabilityScore: teacher.statistics?.reliabilityScore || 100,
        dutiesCompleted: teacher.statistics?.dutiesCompleted || 0,
        marksEnteredThisMonth: marksCount,
        pendingTasks,
        students: students.map(s => ({
          id: s.id,
          name: s.User?.name,
          elimuid: s.elimuid,
          grade: s.grade,
          average: s.average || 0,
          attendance: 95 // Default or calculate from Attendance table
        }))
      }
    });
  } catch (error) {
    console.error('Get teacher stats error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Get students for a specific class (for marks entry)
// @route   GET /api/teacher/classes/:classId/students
// @access  Private/Teacher
exports.getClassStudents = async (req, res) => {
  try {
    const { classId } = req.params;
    
    const teacher = await Teacher.findOne({ where: { userId: req.user.id } });
    if (!teacher) {
      return res.status(404).json({ success: false, message: 'Teacher not found' });
    }
    
    const classItem = await Class.findOne({
      where: { id: classId, schoolCode: req.user.schoolCode, isActive: true }
    });
    
    if (!classItem) {
      return res.status(404).json({ success: false, message: 'Class not found' });
    }
    
    // Verify teacher has access to this class
    const isClassTeacher = classItem.teacherId === teacher.id;
    const isSubjectTeacher = classItem.subjectTeachers?.some(st => st.teacherId === teacher.id);
    
    if (!isClassTeacher && !isSubjectTeacher) {
      return res.status(403).json({ success: false, message: 'You do not have access to this class' });
    }
    
    const students = await Student.findAll({
      where: { grade: classItem.name, schoolCode: req.user.schoolCode },
      include: [{ model: User, attributes: ['id', 'name', 'email', 'phone'] }],
      order: [['createdAt', 'ASC']]
    });
    
    res.json({ success: true, data: students });
  } catch (error) {
    console.error('Get class students error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Bulk upload students via CSV (class teacher only)
// @route   POST /api/teacher/students/upload
// @access  Private/Teacher (class teacher only)
exports.uploadStudentsCSV = async (req, res) => {
  try {
    if (!req.files || !req.files.file) {
      return res.status(400).json({ success: false, message: 'No file uploaded' });
    }
    
    const teacher = await Teacher.findOne({ where: { userId: req.user.id } });
    if (!teacher) {
      return res.status(404).json({ success: false, message: 'Teacher not found' });
    }
    
    if (!teacher.classTeacher) {
      return res.status(403).json({ success: false, message: 'Only class teachers can upload students' });
    }
    
    const file = req.files.file;
    const filePath = path.join('/tmp', `${Date.now()}-${file.name}`);
    await file.mv(filePath);
    
    const results = [];
    const errors = [];
    const elimuids = [];
    
    const readStream = fs.createReadStream(filePath)
      .pipe(csv())
      .on('data', (data) => results.push(data))
      .on('end', async () => {
        const defaultPassword = 'Student123!';
        let successCount = 0;
        
        for (const row of results) {
          try {
            // Validate required fields
            if (!row.name || !row.grade) {
              errors.push({ row, error: 'Missing name or grade' });
              continue;
            }
            
            // Create user
            const user = await User.create({
              name: row.name,
              email: row.parentEmail || null,
              password: defaultPassword,
              role: 'student',
              schoolCode: req.user.schoolCode,
              isActive: true,
              firstLogin: true
            });
            
            // Create student
            const student = await Student.create({
              userId: user.id,
              grade: row.grade,
              dateOfBirth: row.dob || row.dateOfBirth || null,
              gender: row.gender || null
            });
            
            elimuids.push({ name: row.name, elimuid: student.elimuid });
            successCount++;
            
            // Link parent if email provided
            if (row.parentEmail) {
              let parentUser = await User.findOne({
                where: { email: row.parentEmail, role: 'parent', schoolCode: req.user.schoolCode }
              });
              
              if (!parentUser) {
                parentUser = await User.create({
                  name: `Parent of ${row.name}`,
                  email: row.parentEmail,
                  password: defaultPassword,
                  role: 'parent',
                  schoolCode: req.user.schoolCode,
                  isActive: true
                });
                
                await Parent.create({
                  userId: parentUser.id,
                  relationship: row.parentRelationship || 'guardian',
                  phone: row.parentPhone || null
                });
              }
              
              const parent = await Parent.findOne({ where: { userId: parentUser.id } });
              if (parent) {
                await parent.addStudent(student);
              }
            }
            
          } catch (err) {
            errors.push({ row, error: err.message });
          }
        }
        
        // Clean up
        fs.unlinkSync(filePath);
        
        res.json({
          success: true,
          message: `Processed ${results.length} records. Success: ${successCount}, Failed: ${errors.length}`,
          data: {
            successCount,
            failedCount: errors.length,
            elimuids,
            errors: errors.slice(0, 10) // Limit errors for response
          }
        });
      });
      
    readStream.on('error', (error) => {
      console.error('CSV read error:', error);
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
      res.status(500).json({ success: false, message: 'Error reading CSV file' });
    });
    
  } catch (error) {
    console.error('Upload students CSV error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Bulk save marks
// @route   POST /api/teacher/marks/bulk
// @access  Private/Teacher
exports.saveBulkMarks = async (req, res) => {
  try {
    const { classId, subject, assessmentType, assessmentName, date, marks } = req.body;
    
    const teacher = await Teacher.findOne({ where: { userId: req.user.id } });
    if (!teacher) {
      return res.status(404).json({ success: false, message: 'Teacher not found' });
    }
    
    const classItem = await Class.findOne({
      where: { id: classId, schoolCode: req.user.schoolCode, isActive: true }
    });
    
    if (!classItem) {
      return res.status(404).json({ success: false, message: 'Class not found' });
    }
    
    // Verify teacher has permission for this subject in this class
    const isClassTeacher = classItem.teacherId === teacher.id;
    const isSubjectTeacher = classItem.subjectTeachers?.some(st => st.teacherId === teacher.id && st.subject === subject);
    
    if (!isClassTeacher && !isSubjectTeacher) {
      return res.status(403).json({ success: false, message: 'You do not have permission to enter marks for this subject' });
    }
    
    let saved = 0;
    let failed = 0;
    const results = [];
    
    for (const mark of marks) {
      try {
        const [record, created] = await AcademicRecord.findOrCreate({
          where: {
            studentId: mark.studentId,
            subject: subject,
            assessmentType: assessmentType,
            assessmentName: assessmentName,
            date: date
          },
          defaults: {
            studentId: mark.studentId,
            schoolCode: req.user.schoolCode,
            term: mark.term || 'Term 1',
            year: new Date().getFullYear(),
            subject: subject,
            assessmentType: assessmentType,
            assessmentName: assessmentName,
            score: mark.score,
            teacherId: teacher.id,
            date: date,
            isPublished: true
          }
        });
        
        if (!created) {
          await record.update({ score: mark.score, teacherId: teacher.id });
        }
        
        saved++;
        results.push({ studentId: mark.studentId, success: true });
      } catch (err) {
        failed++;
        results.push({ studentId: mark.studentId, success: false, error: err.message });
      }
    }
    
    res.json({
      success: true,
      message: `Saved ${saved} marks, failed ${failed}`,
      data: { saved, failed, results }
    });
  } catch (error) {
    console.error('Bulk marks error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};
