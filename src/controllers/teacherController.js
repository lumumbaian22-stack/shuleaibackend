// src/controllers/teacherController.js - COMPLETE FIXED VERSION
const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');
const { Op } = require('sequelize');
const { Teacher, Student, AcademicRecord, Attendance, User, Parent, Class, Message, DutyRoster, School, Task } = require('../models');
const { getGradeFromScore } = require('../utils/curriculumHelper');
const { createAlert } = require('../services/notificationService');
const moment = require('moment');

// ============ EXISTING FUNCTIONS (keep your existing ones, they work) ============

// @desc    Get teacher's dashboard
// @route   GET /api/teacher/dashboard
// @access  Private/Teacher
exports.getDashboard = async (req, res) => {
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

    const todayDuty = await exports.getTodayDuty(req.user.id);
    const unreadCount = await Message.count({
      where: { receiverId: req.user.id, isRead: false }
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

// @desc    Get teacher's students with subject matrix
// @route   GET /api/teacher/students
// @access  Private/Teacher
exports.getMyStudents = async (req, res) => {
  try {
    const teacher = await Teacher.findOne({ where: { userId: req.user.id } });
    if (!teacher) {
      return res.status(404).json({ success: false, message: 'Teacher profile not found' });
    }

    // Find class where teacher is class teacher
    const classItem = await Class.findOne({
      where: { teacherId: teacher.id, schoolCode: req.user.schoolCode, isActive: true }
    });

    let classNames = [];
    if (classItem) {
      classNames.push(classItem.name);
    } else if (teacher.classTeacher) {
      classNames.push(teacher.classTeacher);
    }

    // Find subject teaching assignments
    const allClasses = await Class.findAll({
      where: { schoolCode: req.user.schoolCode, isActive: true }
    });
    const subjectAssignments = [];
    for (const cls of allClasses) {
      if (cls.subjectTeachers && Array.isArray(cls.subjectTeachers)) {
        const assignment = cls.subjectTeachers.find(st => st.teacherId === teacher.id);
        if (assignment) {
          subjectAssignments.push({
            classId: cls.id,
            className: cls.name,
            subject: assignment.subject
          });
          if (!classNames.includes(cls.name)) {
            classNames.push(cls.name);
          }
        }
      }
    }

    classNames = [...new Set(classNames)];

    if (classNames.length === 0) {
      return res.json({ success: true, data: { students: [], isClassTeacher: false, subjects: [], classNames: [] } });
    }

    // Get all students in these classes
    const students = await Student.findAll({
      where: { grade: { [Op.in]: classNames } },
      include: [{ model: User, attributes: ['id', 'name', 'email', 'phone'] }]
    });

    const studentIds = students.map(s => s.id);

    // Get ALL academic records for these students (not filtered by term/year)
    const academicRecords = await AcademicRecord.findAll({
      where: { studentId: { [Op.in]: studentIds } }
    });
    
    const attendanceRecords = await Attendance.findAll({
      where: { studentId: { [Op.in]: studentIds } }
    });

    // Determine subjects to display
    const school = await School.findOne({ where: { schoolId: req.user.schoolCode } });
    const curriculum = school?.system || 'cbc';
    const curriculumHelper = require('../utils/curriculumHelper');
    const allSubjects = new Set();
    
    if (classItem) {
      const curriculumSubjects = curriculumHelper.getSubjectsForCurriculum(curriculum, school?.settings?.schoolLevel || 'both');
      curriculumSubjects.forEach(s => allSubjects.add(s));
      const customSubjects = school?.settings?.customSubjects || [];
      customSubjects.forEach(s => allSubjects.add(s));
    }

    const displaySubjects = classItem ? Array.from(allSubjects) : subjectAssignments.map(a => a.subject);

    // Build student data with subject scores
    const studentData = students.map(student => {
      const user = student.User;
      const studentRecords = academicRecords.filter(r => r.studentId === student.id);
      const studentAttendance = attendanceRecords.filter(a => a.studentId === student.id);
      
      const present = studentAttendance.filter(a => a.status === 'present').length;
      const attendanceRate = studentAttendance.length ? Math.round((present / studentAttendance.length) * 100) : 100;

      const subjectScores = {};
      if (classItem) {
        for (const subject of allSubjects) {
          const subjectRecords = studentRecords.filter(r => r.subject === subject);
          const avg = subjectRecords.length
            ? Math.round(subjectRecords.reduce((sum, r) => sum + r.score, 0) / subjectRecords.length)
            : null;
          subjectScores[subject] = avg;
        }
      } else {
        for (const assignment of subjectAssignments) {
          const subjectRecords = studentRecords.filter(r => r.subject === assignment.subject);
          const avg = subjectRecords.length
            ? Math.round(subjectRecords.reduce((sum, r) => sum + r.score, 0) / subjectRecords.length)
            : null;
          subjectScores[assignment.subject] = avg;
        }
      }

      const allScores = Object.values(subjectScores).filter(s => s !== null);
      const overallAvg = allScores.length
        ? Math.round(allScores.reduce((a, b) => a + b, 0) / allScores.length)
        : null;

      return {
        id: student.id,
        userId: user.id,
        name: user.name,
        email: user.email,
        elimuid: student.elimuid,
        grade: student.grade,
        status: student.status,
        attendance: attendanceRate,
        subjectScores,
        overallAverage: overallAvg
      };
    });

    res.json({
      success: true,
      data: {
        students: studentData,
        isClassTeacher: !!classItem,
        subjects: displaySubjects,
        classNames,
        teacherName: req.user.name
      }
    });
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
    
    if (!name || !grade) {
      return res.status(400).json({ success: false, message: 'Student name and grade are required' });
    }

    const defaultPassword = 'Student123!';

    const user = await User.create({
      name,
      email: null,
      password: defaultPassword,
      role: 'student',
      schoolCode: req.user.schoolCode,
      isActive: true,
      firstLogin: true
    });

    const student = await Student.create({
      userId: user.id,
      grade: grade,
      dateOfBirth: dateOfBirth,
      gender: gender
    });

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
            password: defaultPassword,
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
        defaultPassword: defaultPassword
      }
    });
  } catch (error) {
    console.error('Add student error:', error);
    res.status(500).json({ success: false, message: error.message || 'Failed to add student' });
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

    const school = await School.findOne({ where: { schoolId: req.user.schoolCode } });
    const grade = getGradeFromScore(score, school.system, school.settings?.schoolLevel || 'secondary');

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
      isPublished: req.body.isPublished !== undefined ? req.body.isPublished : true,
      gradingScale: req.body.gradingScale || null 
    });

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
        for (const row of results) {
          try {
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
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
    res.status(500).json({ success: false, message: error.message });
  }
};

// ============ MESSAGE FUNCTIONS ============

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
                { model: User, as: 'Sender', attributes: ['id', 'name', 'role'] },
                { model: User, as: 'Receiver', attributes: ['id', 'name', 'role'] }
            ],
            order: [['createdAt', 'DESC']]
        });
        
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

exports.deleteMessage = async (req, res) => {
  try {
    const { messageId } = req.params;
    const { deleteFor } = req.body;

    const message = await Message.findByPk(messageId);

    if (!message) {
      return res.status(404).json({ success: false, message: 'Message not found' });
    }

    if (message.senderId !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Not authorized' });
    }

    if (deleteFor === 'everyone') {
      message.content = '[This message was deleted]';
      message.metadata = { ...message.metadata, deleted: true, deletedBy: req.user.id, deletedAt: new Date() };
      await message.save();
    } else {
      const deletedFor = message.metadata?.deletedFor || [];
      if (!deletedFor.includes(req.user.id)) {
        deletedFor.push(req.user.id);
        message.metadata = { ...message.metadata, deletedFor };
        await message.save();
      }
    }

    if (global.io) {
      global.io.to(`user-${message.receiverId}`).emit('message-deleted', { messageId: message.id, deleteFor });
      if (message.senderId !== req.user.id) {
        global.io.to(`user-${message.senderId}`).emit('message-deleted', { messageId: message.id, deleteFor });
      }
    }

    res.json({ success: true, message: 'Message deleted' });
  } catch (error) {
    console.error('Delete message error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.replyToParent = async (req, res) => {
    try {
        const { parentId, message, originalMessageId } = req.body;
        
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

exports.getTodayDuty = async (userId) => {
  try {
    const teacher = await Teacher.findOne({ where: { userId } });
    if (!teacher) return null;

    const school = await School.findOne({ where: { schoolId: teacher.User?.schoolCode } });
    if (!school) return null;

    const today = new Date().toISOString().split('T')[0];
    
    const roster = await DutyRoster.findOne({
      where: { schoolId: school.schoolId, date: today }
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

exports.deleteStudent = async (req, res) => {
  try {
    const { studentId } = req.params;
    
    const teacher = await Teacher.findOne({ where: { userId: req.user.id } });
    if (!teacher) {
      return res.status(404).json({ success: false, message: 'Teacher not found' });
    }
    
    const student = await Student.findByPk(studentId, {
      include: [{ model: User }]
    });
    
    if (!student) {
      return res.status(404).json({ success: false, message: 'Student not found' });
    }
    
    if (student.grade !== teacher.classTeacher) {
      return res.status(403).json({ success: false, message: 'This student is not in your class' });
    }
    
    const studentName = student.User.name;
    
    await student.destroy();
    
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
    
    res.json({ success: true, message: 'Student removed from class successfully' });
  } catch (error) {
    console.error('Delete student error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// ============ NEW FUNCTIONS - FIXED ============

// @desc    Get teacher's assigned class
// @route   GET /api/teacher/my-class
// @access  Private/Teacher
exports.getMyClass = async (req, res) => {
  try {
    const teacher = await Teacher.findOne({ where: { userId: req.user.id } });
    if (!teacher) return res.status(404).json({ success: false, message: 'Teacher not found' });

    const classItem = await Class.findOne({
      where: { teacherId: teacher.id, schoolCode: req.user.schoolCode, isActive: true }
    });

    if (!classItem) {
      if (teacher.classTeacher) {
        const legacyClass = await Class.findOne({
          where: { name: teacher.classTeacher, schoolCode: req.user.schoolCode, isActive: true }
        });
        if (legacyClass) return res.json({ success: true, data: legacyClass });
      }
      return res.json({ success: true, data: null });
    }

    const studentCount = await Student.count({ where: { grade: classItem.name } });
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
    const teacher = await Teacher.findOne({ where: { userId: req.user.id } });
    if (!teacher) return res.status(404).json({ success: false, message: 'Teacher not found' });

    const allClasses = await Class.findAll({
      where: { schoolCode: req.user.schoolCode, isActive: true }
    });

    const subjects = teacher.subjects || [];
    const subjectList = subjects.map(subject => {
      const classes = allClasses.filter(cls => {
        const subjectTeacher = cls.subjectTeachers?.find(st => st.teacherId === teacher.id && st.subject === subject);
        return subjectTeacher || cls.teacherId === teacher.id;
      }).map(cls => ({
        id: cls.id,
        name: cls.name,
        grade: cls.grade,
        studentCount: 0
      }));

      return { name: subject, classes };
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
    const teacher = await Teacher.findOne({ where: { userId: req.user.id } });
    if (!teacher) return res.status(404).json({ success: false, message: 'Teacher not found' });

    let classNames = [];
    if (teacher.classTeacher) classNames.push(teacher.classTeacher);
    const allClasses = await Class.findAll({ where: { schoolCode: req.user.schoolCode, isActive: true } });
    for (const cls of allClasses) {
      if (cls.subjectTeachers?.some(st => st.teacherId === teacher.id)) {
        classNames.push(cls.name);
      }
    }
    classNames = [...new Set(classNames)];

    let students = [];
    if (classNames.length) {
      students = await Student.findAll({
        where: { grade: { [Op.in]: classNames } },
        include: [{ model: User, attributes: ['id', 'name'] }]
      });
    }

    const today = new Date().toISOString().split('T')[0];
    const attendanceToday = await Attendance.findAll({
      where: { studentId: { [Op.in]: students.map(s => s.id) }, date: today }
    });
    const presentToday = attendanceToday.filter(a => a.status === 'present').length;
    const attendanceTodayStr = `${presentToday}/${students.length}`;

    const pendingTasks = await Task.count({
      where: { userId: req.user.id, status: { [Op.ne]: 'completed' } }
    });

    let totalScore = 0, scoreCount = 0;
    for (const student of students) {
      const records = await AcademicRecord.findAll({ where: { studentId: student.id } });
      const avg = records.length ? records.reduce((a,b) => a + b.score, 0) / records.length : 0;
      totalScore += avg;
      scoreCount++;
    }
    const classAverage = scoreCount ? Math.round(totalScore / scoreCount) : 0;

    res.json({
      success: true,
      data: { studentCount: students.length, classAverage, attendanceToday: attendanceTodayStr, pendingTasks }
    });
  } catch (error) {
    console.error(error);
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
    if (!teacher) return res.status(404).json({ success: false, message: 'Teacher not found' });
    
    const classItem = await Class.findOne({
      where: { id: classId, schoolCode: req.user.schoolCode, isActive: true }
    });
    if (!classItem) return res.status(404).json({ success: false, message: 'Class not found' });
    
    const isClassTeacher = classItem.teacherId === teacher.id;
    const isSubjectTeacher = classItem.subjectTeachers?.some(st => st.teacherId === teacher.id);
    if (!isClassTeacher && !isSubjectTeacher) {
      return res.status(403).json({ success: false, message: 'You do not have access to this class' });
    }
    
    const students = await Student.findAll({
      where: { grade: classItem.name },
      include: [{ model: User, attributes: ['id', 'name', 'email', 'phone'] }],  // FIXED
      order: [['createdAt', 'ASC']]
    });
    
    res.json({ success: true, data: students });
  } catch (error) {
    console.error('Get class students error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Bulk upload students via CSV
// @route   POST /api/teacher/students/upload
// @access  Private/Teacher
exports.uploadStudentsCSV = async (req, res) => {
  try {
    if (!req.files || !req.files.file) {
      return res.status(400).json({ success: false, message: 'No file uploaded' });
    }
    
    const teacher = await Teacher.findOne({ where: { userId: req.user.id } });
    if (!teacher) return res.status(404).json({ success: false, message: 'Teacher not found' });
    if (!teacher.classTeacher) return res.status(403).json({ success: false, message: 'Only class teachers can upload students' });
    
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
        const targetGrade = teacher.classTeacher;
        
        for (const row of results) {
          try {
            if (!row.name) { errors.push({ row, error: 'Missing name' }); continue; }
            
            const user = await User.create({
              name: row.name,
              email: row.parentEmail || null,
              password: defaultPassword,
              role: 'student',
              schoolCode: req.user.schoolCode,
              isActive: true,
              firstLogin: true
            });
            
            const student = await Student.create({
              userId: user.id,
              grade: targetGrade,
              dateOfBirth: row.dob || row.dateOfBirth || null,
              gender: row.gender || null
            });
            
            elimuids.push({ name: row.name, elimuid: student.elimuid });
            successCount++;
            
            if (row.parentEmail) {
              let parentUser = await User.findOne({ where: { email: row.parentEmail, role: 'parent', schoolCode: req.user.schoolCode } });
              if (!parentUser) {
                parentUser = await User.create({
                  name: `Parent of ${row.name}`,
                  email: row.parentEmail,
                  password: defaultPassword,
                  role: 'parent',
                  schoolCode: req.user.schoolCode,
                  isActive: true
                });
                await Parent.create({ userId: parentUser.id, relationship: row.parentRelationship || 'guardian', phone: row.parentPhone || null });
              }
              const parent = await Parent.findOne({ where: { userId: parentUser.id } });
              if (parent) await parent.addStudent(student);
            }
          } catch (err) {
            errors.push({ row, error: err.message });
          }
        }
        
        fs.unlinkSync(filePath);
        
        res.json({
          success: true,
          message: `Processed ${results.length} records. Success: ${successCount}, Failed: ${errors.length}`,
          data: { successCount, failedCount: errors.length, elimuids, errors: errors.slice(0, 10) }
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
    if (!teacher) return res.status(404).json({ success: false, message: 'Teacher not found' });
    
    const classItem = await Class.findOne({ where: { id: classId, schoolCode: req.user.schoolCode, isActive: true } });
    if (!classItem) return res.status(404).json({ success: false, message: 'Class not found' });
    
    const isClassTeacher = classItem.teacherId === teacher.id;
    const isSubjectTeacher = classItem.subjectTeachers?.some(st => st.teacherId === teacher.id && st.subject === subject);
    if (!isClassTeacher && !isSubjectTeacher) {
      return res.status(403).json({ success: false, message: 'You do not have permission to enter marks for this subject' });
    }
    
    let saved = 0, failed = 0;
    const results = [];
    
    for (const mark of marks) {
      try {
        const [record, created] = await AcademicRecord.findOrCreate({
          where: { studentId: mark.studentId, subject, assessmentType, assessmentName, date },
          defaults: {
            studentId: mark.studentId,
            schoolCode: req.user.schoolCode,
            term: mark.term || 'Term 1',
            year: new Date().getFullYear(),
            subject,
            assessmentType,
            assessmentName,
            score: mark.score,
            teacherId: teacher.id,
            date,
            isPublished: true,
            gradingScale: req.body.gradingScale || null
          }
        });
        if (!created) await record.update({ score: mark.score, teacherId: teacher.id });
        saved++;
        results.push({ studentId: mark.studentId, success: true });
      } catch (err) {
        failed++;
        results.push({ studentId: mark.studentId, success: false, error: err.message });
      }
    }
    
    res.json({ success: true, message: `Saved ${saved} marks, failed ${failed}`, data: { saved, failed, results } });
  } catch (error) {
    console.error('Bulk marks error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Get teacher's assignments
// @route   GET /api/teacher/my-assignments
// @access  Private/Teacher
exports.getMyAssignments = async (req, res) => {
  try {
    const teacher = await Teacher.findOne({ where: { userId: req.user.id } });
    if (!teacher) return res.status(404).json({ success: false, message: 'Teacher not found' });

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

    const classTeacherClass = classes.find(c => c.teacherId === teacher.id);
    const subjectClasses = classes.filter(c => c.teacherId !== teacher.id);

    res.json({
      success: true,
      data: {
        teacherId: teacher.id,
        teacherName: req.user.name,
        classTeacher: classTeacherClass ? { id: classTeacherClass.id, name: classTeacherClass.name, grade: classTeacherClass.grade } : null,
        subjects: subjectClasses.map(c => ({
          classId: c.id,
          className: c.name,
          grade: c.grade,
          subject: c.subjectTeachers?.find(st => st.teacherId === teacher.id)?.subject || 'Unknown'
        }))
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
    const teacher = await Teacher.findOne({ where: { userId: req.user.id } });
    if (!teacher) return res.status(404).json({ success: false, message: 'Teacher not found' });

    const classItem = await Class.findOne({ where: { id: classId, schoolCode: req.user.schoolCode, isActive: true } });
    if (!classItem) return res.status(404).json({ success: false, message: 'Class not found' });

    const isClassTeacher = classItem.teacherId === teacher.id;
    const isSubjectTeacher = classItem.subjectTeachers?.some(st => st.teacherId === teacher.id && st.subject === subject);
    if (!isClassTeacher && !isSubjectTeacher) {
      return res.status(403).json({ success: false, message: 'You are not assigned to teach this subject in this class' });
    }

    const students = await Student.findAll({
      where: { grade: classItem.name },
      include: [{ model: User, attributes: ['id', 'name', 'email'] }],
      order: [['createdAt', 'DESC']]
    });

    const formattedStudents = students.map(s => ({
      id: s.id, userId: s.userId, name: s.User?.name || 'Unknown', elimuid: s.elimuid, grade: s.grade
    }));

    res.json({
      success: true,
      data: { classId: classItem.id, className: classItem.name, grade: classItem.grade, subject, students: formattedStudents, studentCount: formattedStudents.length }
    });
  } catch (error) {
    console.error('Get class students error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Get teacher's subject performance and attendance trend
// @route   GET /api/teacher/performance
// @access  Private/Teacher
// Inside teacherController.js, add or update this method:

exports.getPerformanceData = async (req, res) => {
  try {
    const teacher = await Teacher.findOne({ where: { userId: req.user.id } });
    if (!teacher) return res.status(404).json({ success: false, message: 'Teacher not found' });

    let classNames = [];
    if (teacher.classTeacher) classNames.push(teacher.classTeacher);
    const allClasses = await Class.findAll({ where: { schoolCode: req.user.schoolCode, isActive: true } });
    for (const cls of allClasses) {
      if (cls.subjectTeachers?.some(st => st.teacherId === teacher.id)) {
        classNames.push(cls.name);
      }
    }
    classNames = [...new Set(classNames)];
    if (classNames.length === 0) {
      return res.json({ success: true, data: { subjectAverages: [], attendanceTrend: [] } });
    }

    const students = await Student.findAll({ where: { grade: { [Op.in]: classNames } } });
    const studentIds = students.map(s => s.id);

    const records = await AcademicRecord.findAll({ where: { studentId: { [Op.in]: studentIds } } });
    const subjectScores = {};
    records.forEach(rec => {
      if (!subjectScores[rec.subject]) subjectScores[rec.subject] = { total: 0, count: 0 };
      subjectScores[rec.subject].total += rec.score;
      subjectScores[rec.subject].count++;
    });
    const subjectAverages = Object.entries(subjectScores).map(([subject, data]) => ({ subject, average: Math.round(data.total / data.count) }));

    const startDate = moment().subtract(6, 'days').format('YYYY-MM-DD');
    const attendanceRecords = await Attendance.findAll({
      where: { studentId: { [Op.in]: studentIds }, date: { [Op.gte]: startDate } }
    });
    const dailyStats = {};
    for (let i = 0; i < 7; i++) {
      const date = moment().subtract(6 - i, 'days').format('YYYY-MM-DD');
      dailyStats[date] = { present: 0, total: 0 };
    }
    attendanceRecords.forEach(att => {
      if (dailyStats[att.date]) {
        dailyStats[att.date].total++;
        if (att.status === 'present') dailyStats[att.date].present++;
      }
    });
    const attendanceTrend = Object.entries(dailyStats).map(([date, stats]) => ({ date, rate: stats.total ? Math.round((stats.present / stats.total) * 100) : 0 }));

    res.json({ success: true, data: { subjectAverages, attendanceTrend } });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Update a mark
// @route   PUT /api/teacher/marks/:recordId
exports.updateMark = async (req, res) => {
  try {
    const { recordId } = req.params;
    const { score, assessmentName, assessmentType, date, term, year } = req.body;
    const record = await AcademicRecord.findByPk(recordId);
    if (!record) return res.status(404).json({ success: false, message: 'Record not found' });
    const teacher = await Teacher.findOne({ where: { userId: req.user.id } });
    if (record.teacherId !== teacher.id) return res.status(403).json({ success: false, message: 'Not authorized' });
    await record.update({ score, assessmentName, assessmentType, date, term, year });
    res.json({ success: true, data: record });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Delete a mark
// @route   DELETE /api/teacher/marks/:recordId
exports.deleteMark = async (req, res) => {
  try {
    const { recordId } = req.params;
    const record = await AcademicRecord.findByPk(recordId);
    if (!record) return res.status(404).json({ success: false, message: 'Record not found' });
    const teacher = await Teacher.findOne({ where: { userId: req.user.id } });
    if (record.teacherId !== teacher.id) return res.status(403).json({ success: false, message: 'Not authorized' });
    await record.destroy();
    res.json({ success: true, message: 'Mark deleted' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Download marks CSV template
// @route   GET /api/teacher/marks-template
exports.downloadMarksTemplate = (req, res) => {
  const template = `name,elimuid,subject,score,assessmentType,date,term,year,assessmentName\nJohn Doe,ELI-2024-001,Mathematics,85,exam,2024-03-15,Term 1,2024,Math Mid-Term`;
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename=marks_template.csv');
  res.send(template);
};

// @desc    Get gradebook for teacher's class (all students with subject scores)
// @route   GET /api/teacher/gradebook
// @access  Private/Teacher
exports.getClassGradebook = async (req, res) => {
  try {
    const teacher = await Teacher.findOne({ where: { userId: req.user.id } });
    if (!teacher) return res.status(404).json({ success: false, message: 'Teacher not found' });

    const classItem = await Class.findOne({ where: { teacherId: teacher.id, schoolCode: req.user.schoolCode, isActive: true } });
    if (!classItem) return res.status(403).json({ success: false, message: 'No class assigned as class teacher' });

    const students = await Student.findAll({
      where: { grade: classItem.name },
      include: [{ model: User, attributes: ['id', 'name'] }],
      order: [['createdAt', 'ASC']]
    });

    const studentIds = students.map(s => s.id);
    const records = await AcademicRecord.findAll({ where: { studentId: studentIds } });

    const subjectsFromRecords = [...new Set(records.map(r => r.subject))];
    const teacherSubjects = teacher.subjects || [];
    const allSubjects = [...new Set([...subjectsFromRecords, ...teacherSubjects])].sort();

    const gradebook = students.map(student => {
      const studentRecords = records.filter(r => r.studentId === student.id);
      const scores = {};
      allSubjects.forEach(subject => {
        const subjectRecords = studentRecords.filter(r => r.subject === subject);
        const avg = subjectRecords.length ? Math.round(subjectRecords.reduce((sum, r) => sum + r.score, 0) / subjectRecords.length) : null;
        scores[subject] = avg;
      });
      const allScores = Object.values(scores).filter(s => s !== null);
      const overallAvg = allScores.length ? Math.round(allScores.reduce((a, b) => a + b, 0) / allScores.length) : null;

      return { id: student.id, name: student.User.name, elimuid: student.elimuid, scores, overallAverage: overallAvg };
    });

    res.json({ success: true, data: { className: classItem.name, subjects: allSubjects, students: gradebook } });
  } catch (error) {
    console.error('Get class gradebook error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Get attendance for a specific date
// @route   GET /api/teacher/attendance/:date
exports.getAttendanceForDate = async (req, res) => {
  try {
    const { date } = req.params;
    const teacher = await Teacher.findOne({ where: { userId: req.user.id } });
    if (!teacher) return res.status(404).json({ success: false, message: 'Teacher not found' });

    // Get students in teacher's class(es)
    let classNames = [];
    if (teacher.classTeacher) classNames.push(teacher.classTeacher);
    const classes = await Class.findAll({ where: { schoolCode: req.user.schoolCode } });
    classes.forEach(cls => {
      if (cls.subjectTeachers?.some(st => st.teacherId === teacher.id)) classNames.push(cls.name);
    });
    const students = await Student.findAll({ where: { grade: { [Op.in]: [...new Set(classNames)] } } });
    const studentIds = students.map(s => s.id);

    const attendance = await Attendance.findAll({
      where: { studentId: { [Op.in]: studentIds }, date }
    });
    res.json({ success: true, data: attendance });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Add this method to teacherController.js
exports.publishMarks = async (req, res) => {
  try {
    const { classId, subject, term, year } = req.body;
    const teacher = await Teacher.findOne({ where: { userId: req.user.id } });
    if (!teacher) return res.status(404).json({ success: false, message: 'Teacher not found' });

    // Find all AcademicRecords for this class (by grade) that are draft and match subject/term/year
    const classItem = await Class.findByPk(classId);
    if (!classItem) return res.status(404).json({ success: false, message: 'Class not found' });

    const students = await Student.findAll({ where: { grade: classItem.name } });
    const studentIds = students.map(s => s.id);

    await AcademicRecord.update(
      { isPublished: true },
      {
        where: {
          studentId: studentIds,
          subject,
          term,
          year,
          isPublished: false
        }
      }
    );

    res.json({ success: true, message: 'All marks published for this class/subject.' });
  } catch (error) {
    console.error('Publish marks error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// ============ V3 OVERRIDES: role-correct students, CSV upload, draft/publish marks ============
async function v3Teacher(userId) { return Teacher.findOne({ where:{ userId }, include:[{ model:User, attributes:['id','name','email','phone','schoolCode'] }] }); }
function v3Access(teacher, cls, subject) { const isClassTeacher = Number(cls.teacherId) === Number(teacher.id); const isSubjectTeacher = (cls.subjectTeachers || []).some(a => Number(a.teacherId) === Number(teacher.id) && (!subject || String(a.subject).toLowerCase() === String(subject).toLowerCase())); return { isClassTeacher, isSubjectTeacher, allowed:isClassTeacher || isSubjectTeacher }; }
exports.uploadStudentsCSV = async (req,res) => {
  try {
    if (!req.files || !req.files.file) return res.status(400).json({ success:false, message:'No file uploaded' });
    const teacher = await v3Teacher(req.user.id); if (!teacher) return res.status(404).json({ success:false, message:'Teacher not found' });
    const classItem = await Class.findOne({ where:{ teacherId: teacher.id, schoolCode:req.user.schoolCode, isActive:true } });
    if (!classItem) return res.status(403).json({ success:false, message:'Only the assigned class teacher can upload students for that class' });
    const filePath = path.join('/tmp', `${Date.now()}-${req.files.file.name}`); await req.files.file.mv(filePath);
    const rows=[], errors=[], elimuids=[];
    fs.createReadStream(filePath).pipe(csv()).on('data', r => rows.push(r)).on('end', async () => {
      let successCount=0;
      for (const row of rows) { try {
        const name = row.name || row.fullName || row.studentName; if (!name) { errors.push({ row, error:'Missing name' }); continue; }
        const user = await User.create({ name, email: row.email || null, phone: row.phone || null, password:'Student123!', role:'student', schoolCode:req.user.schoolCode, isActive:true, firstLogin:true });
        const student = await Student.create({ userId:user.id, grade:classItem.name, dateOfBirth: row.dob || row.dateOfBirth || null, gender: row.gender || null, assessmentNumber: row.assessmentNumber || row.assessment_number || null, nemisNumber: row.nemisNumber || row.nemis_number || null, location: row.location || null, parentName: row.parentName || row.parent_name || null, parentEmail: row.parentEmail || row.parent_email || null, parentPhone: row.parentPhone || row.parent_phone || null, parentRelationship: row.parentRelationship || row.relationship || 'guardian', isPrefect: String(row.isPrefect || '').toLowerCase() === 'true' });
        elimuids.push({ name, elimuid:student.elimuid, assessmentNumber:student.assessmentNumber }); successCount++;
      } catch(err) { errors.push({ row, error:err.message }); } }
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
      res.json({ success:true, message:`Class ${classItem.name}: success ${successCount}, failed ${errors.length}`, data:{ classId:classItem.id, className:classItem.name, successCount, failedCount:errors.length, elimuids, errors:errors.slice(0,20) } });
    }).on('error', err => { if (fs.existsSync(filePath)) fs.unlinkSync(filePath); res.status(500).json({ success:false, message:err.message }); });
  } catch(error) { console.error('V3 CSV upload error:', error); res.status(500).json({ success:false, message:error.message }); }
};
exports.saveBulkMarks = async (req,res) => {
  try {
    const { classId, subject, assessmentType, assessmentName, date, marks=[], term='Term 1', year=new Date().getFullYear() } = req.body;
    const teacher = await v3Teacher(req.user.id); if (!teacher) return res.status(404).json({ success:false, message:'Teacher not found' });
    const cls = await Class.findOne({ where:{ id:classId, schoolCode:req.user.schoolCode, isActive:true } }); if (!cls) return res.status(404).json({ success:false, message:'Class not found' });
    const access = v3Access(teacher, cls, subject); if (!access.allowed) return res.status(403).json({ success:false, message:'You can only enter marks for assigned subjects/classes' });
    let saved=0, failed=0; const results=[];
    for (const m of marks) { try { const score=Number(m.score); if (!Number.isFinite(score)||score<0||score>100) throw new Error('Score must be 0-100'); const [record,created]=await AcademicRecord.findOrCreate({ where:{ studentId:m.studentId, subject, assessmentType, assessmentName, term, year:Number(year) }, defaults:{ studentId:m.studentId, schoolCode:req.user.schoolCode, term, year:Number(year), subject, assessmentType, assessmentName, score, grade:getGradeFromScore(score), teacherId:teacher.id, date:date||new Date(), isPublished:false } }); if (!created) { if (record.isPublished) throw new Error('Published marks cannot be edited'); await record.update({ score, grade:getGradeFromScore(score), teacherId:teacher.id, date:date||record.date }); } saved++; results.push({ studentId:m.studentId, success:true, recordId:record.id }); } catch(err){ failed++; results.push({ studentId:m.studentId, success:false, error:err.message }); } }
    res.json({ success:true, message:`Saved ${saved} draft mark(s). Class teacher publishes final report card marks.`, data:{ saved, failed, results } });
  } catch(error) { console.error('V3 save marks error:', error); res.status(500).json({ success:false, message:error.message }); }
};
exports.publishMarks = async (req,res) => {
  try {
    const { classId, term='Term 1', year=new Date().getFullYear() } = req.body;
    const teacher = await v3Teacher(req.user.id); if (!teacher) return res.status(404).json({ success:false, message:'Teacher not found' });
    const cls = await Class.findOne({ where:{ id:classId, schoolCode:req.user.schoolCode, isActive:true } }); if (!cls) return res.status(404).json({ success:false, message:'Class not found' });
    if (Number(cls.teacherId) !== Number(teacher.id)) return res.status(403).json({ success:false, message:'Only the class teacher can publish final marks for this class' });
    const students = await Student.findAll({ where:{ grade:cls.name }, attributes:['id'] }); const ids=students.map(s=>s.id);
    const [count] = await AcademicRecord.update({ isPublished:true }, { where:{ schoolCode:req.user.schoolCode, studentId:{ [Op.in]:ids }, term, year:Number(year) } });
    res.json({ success:true, message:`${count} mark(s) published for ${cls.name}`, data:{ count, classId:cls.id, term, year:Number(year) } });
  } catch(error) { console.error('V3 publish marks error:', error); res.status(500).json({ success:false, message:error.message }); }
};



// ============ V7 ACADEMIC SUITE: marks backtesting, analytics, report card ============
function v7GradeFromScale(score, scale) {
  const n = Number(score);
  const ranges = Array.isArray(scale) && scale.length ? scale : [
    { grade: 'A', min: 80, max: 100, remark: 'Excellent', point: 5 },
    { grade: 'B', min: 70, max: 79, remark: 'Very Good', point: 4 },
    { grade: 'C', min: 60, max: 69, remark: 'Good', point: 3 },
    { grade: 'D', min: 50, max: 59, remark: 'Fair', point: 2 },
    { grade: 'E', min: 40, max: 49, remark: 'Pass', point: 1 },
    { grade: 'F', min: 0, max: 39, remark: 'Fail', point: 0 }
  ];
  const found = ranges.find(r => n >= Number(r.min) && n <= Number(r.max));
  return found || ranges[ranges.length - 1];
}
function v7AnalyzeMarks(records) {
  const scores = records.map(r => Number(r.score)).filter(Number.isFinite);
  const avg = scores.length ? Math.round(scores.reduce((a,b)=>a+b,0)/scores.length) : 0;
  const highest = scores.length ? Math.max(...scores) : 0;
  const lowest = scores.length ? Math.min(...scores) : 0;
  const passRate = scores.length ? Math.round((scores.filter(s=>s>=50).length/scores.length)*100) : 0;
  const bySubject = {};
  records.forEach(r => {
    bySubject[r.subject] = bySubject[r.subject] || [];
    bySubject[r.subject].push(Number(r.score));
  });
  const subjectPerformance = Object.entries(bySubject).map(([subject, vals]) => ({
    subject,
    average: vals.length ? Math.round(vals.reduce((a,b)=>a+b,0)/vals.length) : 0,
    highest: vals.length ? Math.max(...vals) : 0,
    lowest: vals.length ? Math.min(...vals) : 0
  })).sort((a,b)=>b.average-a.average);
  return {
    average: avg,
    highest,
    lowest,
    passRate,
    totalRecords: records.length,
    subjectPerformance,
    strengths: subjectPerformance.filter(s => s.average >= 75).map(s => s.subject),
    improvementAreas: subjectPerformance.filter(s => s.average < 60).map(s => s.subject),
    recommendation: avg >= 80 ? 'Excellent performance. Maintain the momentum and support peers.' :
      avg >= 60 ? 'Good progress. Focus on weaker subject areas for steady improvement.' :
      'Needs close support, remedial work, and parent-teacher follow-up.'
  };
}

exports.getMarksEntryContext = async (req, res) => {
  try {
    const teacher = await v3Teacher(req.user.id);
    if (!teacher) return res.status(404).json({ success:false, message:'Teacher not found' });

    const classes = await Class.findAll({ where:{ schoolCode:req.user.schoolCode, isActive:true }, order:[['grade','ASC'],['name','ASC']] });
    const available = [];
    for (const cls of classes) {
      const isClassTeacher = Number(cls.teacherId) === Number(teacher.id);
      const subjects = (cls.subjectTeachers || [])
        .filter(a => Number(a.teacherId) === Number(teacher.id) || isClassTeacher)
        .map(a => a.subject)
        .filter(Boolean);
      if (isClassTeacher || subjects.length) {
        available.push({
          classId: cls.id,
          className: cls.name,
          grade: cls.grade,
          stream: cls.stream,
          isClassTeacher,
          subjects: [...new Set(subjects)]
        });
      }
    }

    res.json({
      success:true,
      data:{
        teacherId: teacher.id,
        classes: available,
        assessmentTypes: ['test','exam','assignment','project','quiz','backtesting'],
        terms: ['Term 1','Term 2','Term 3'],
        years: Array.from({length: 8}, (_,i)=>new Date().getFullYear()-i),
        defaultScale: [
          { grade:'A', min:80, max:100, point:5, description:'Excellent' },
          { grade:'B', min:70, max:79, point:4, description:'Very Good' },
          { grade:'C', min:60, max:69, point:3, description:'Good' },
          { grade:'D', min:50, max:59, point:2, description:'Fair' },
          { grade:'E', min:40, max:49, point:1, description:'Pass' },
          { grade:'F', min:0, max:39, point:0, description:'Fail' }
        ]
      }
    });
  } catch(error) { res.status(500).json({ success:false, message:error.message }); }
};

exports.getStudentsForMarksEntry = async (req,res) => {
  try {
    const { classId } = req.query;
    const teacher = await v3Teacher(req.user.id);
    if (!teacher) return res.status(404).json({ success:false, message:'Teacher not found' });
    const cls = await Class.findOne({ where:{ id:classId, schoolCode:req.user.schoolCode, isActive:true } });
    if (!cls) return res.status(404).json({ success:false, message:'Class not found' });
    const isClassTeacher = Number(cls.teacherId) === Number(teacher.id);
    const isSubjectTeacher = (cls.subjectTeachers || []).some(a => Number(a.teacherId) === Number(teacher.id));
    if (!isClassTeacher && !isSubjectTeacher) return res.status(403).json({ success:false, message:'Not assigned to this class' });

    const students = await Student.findAll({
      where:{ grade: cls.name },
      include:[{ model:User, attributes:['id','name','email','phone','profileImage'] }],
      order:[[User,'name','ASC']]
    });

    res.json({ success:true, data: students.map(s => ({
      id:s.id,
      name:s.User?.name,
      admissionNo:s.admissionNumber || s.admissionNo || s.elimuid,
      elimuid:s.elimuid,
      assessmentNumber:s.assessmentNumber,
      nemisNumber:s.nemisNumber,
      photo:s.User?.profileImage
    }))});
  } catch(error) { res.status(500).json({ success:false, message:error.message }); }
};

exports.analyzeMarksBatch = async (req,res) => {
  try {
    const { marks=[], gradingScale } = req.body;
    const rows = marks.map(m => {
      const g = v7GradeFromScale(m.score, gradingScale);
      return { ...m, score:Number(m.score), grade:g.grade, remark:g.description || g.remark, point:g.point };
    });
    res.json({ success:true, data:{ rows, analysis:v7AnalyzeMarks(rows.map(r=>({ ...r, subject:req.body.subject || r.subject || 'Subject' }))) } });
  } catch(error) { res.status(500).json({ success:false, message:error.message }); }
};

exports.saveBulkMarks = async (req,res) => {
  try {
    const { classId, subject, assessmentType='test', assessmentName, date, marks=[], term='Term 1', year=new Date().getFullYear(), gradingScale, backtesting=false } = req.body;
    const teacher = await v3Teacher(req.user.id); if (!teacher) return res.status(404).json({ success:false, message:'Teacher not found' });
    const cls = await Class.findOne({ where:{ id:classId, schoolCode:req.user.schoolCode, isActive:true } }); if (!cls) return res.status(404).json({ success:false, message:'Class not found' });
    const access = v3Access(teacher, cls, subject); if (!access.allowed) return res.status(403).json({ success:false, message:'You can only enter marks for assigned subjects/classes' });

    let saved=0, failed=0; const results=[]; const savedRecords=[];
    for (const m of marks) {
      try {
        const score=Number(m.score);
        if (!Number.isFinite(score)||score<0||score>100) throw new Error('Score must be 0-100');
        const scaleGrade = v7GradeFromScale(score, gradingScale);
        const [record,created]=await AcademicRecord.findOrCreate({
          where:{ studentId:m.studentId, subject, assessmentType, assessmentName, term, year:Number(year) },
          defaults:{
            studentId:m.studentId,
            schoolCode:req.user.schoolCode,
            term,
            year:Number(year),
            subject,
            assessmentType: assessmentType === 'backtesting' ? 'test' : assessmentType,
            assessmentName: assessmentName || `${subject} ${assessmentType}`,
            score,
            grade:scaleGrade.grade,
            remarks:m.remarks || scaleGrade.description || scaleGrade.remark,
            teacherId:teacher.id,
            date:date||new Date(),
            isPublished:false,
            gradingScale: gradingScale || null
          }
        });
        if (!created) {
          if (record.isPublished) throw new Error('Published marks cannot be edited');
          await record.update({ score, grade:scaleGrade.grade, remarks:m.remarks || scaleGrade.description || scaleGrade.remark, teacherId:teacher.id, date:date||record.date, gradingScale:gradingScale || record.gradingScale });
        }
        saved++;
        savedRecords.push(record);
        results.push({ studentId:m.studentId, success:true, recordId:record.id, grade:scaleGrade.grade });
      } catch(err) {
        failed++;
        results.push({ studentId:m.studentId, success:false, error:err.message });
      }
    }
    const analysis = v7AnalyzeMarks(savedRecords);
    res.json({
      success:true,
      message:`Saved ${saved} draft mark(s). ${backtesting ? 'Backtesting data saved for analysis. ' : ''}Class teacher publishes final report card marks.`,
      data:{ saved, failed, results, analysis, status:'draft' }
    });
  } catch(error) { console.error('V7 save marks error:', error); res.status(500).json({ success:false, message:error.message }); }
};

exports.getReportCard = async (req,res) => {
  try {
    const { studentId, term='Term 1', year=new Date().getFullYear() } = req.query;
    const student = await Student.findOne({
      where:{ id:studentId },
      include:[{ model:User, attributes:['id','name','email','phone','profileImage'] }]
    });
    if (!student) return res.status(404).json({ success:false, message:'Student not found' });

    const records = await AcademicRecord.findAll({
      where:{ studentId, term, year:Number(year), isPublished:true },
      order:[['subject','ASC']]
    });
    const scores = records.map(r=>Number(r.score)).filter(Number.isFinite);
    const total = scores.reduce((a,b)=>a+b,0);
    const average = scores.length ? Math.round(total/scores.length) : 0;
    const gradeInfo = v7GradeFromScale(average, records[0]?.gradingScale);

    const classItem = await Class.findOne({ where:{ name:student.grade, schoolCode:req.user.schoolCode } });
    const classmates = await Student.findAll({ where:{ grade:student.grade }, attributes:['id'] });
    const classIds = classmates.map(s=>s.id);
    const allRecords = await AcademicRecord.findAll({ where:{ studentId:{ [Op.in]:classIds }, term, year:Number(year), isPublished:true }});
    const classAverages = {};
    for (const r of allRecords) {
      classAverages[r.studentId] = classAverages[r.studentId] || [];
      classAverages[r.studentId].push(Number(r.score));
    }
    const rankings = Object.entries(classAverages).map(([id, vals]) => ({ id:Number(id), avg: vals.reduce((a,b)=>a+b,0)/vals.length })).sort((a,b)=>b.avg-a.avg);
    const position = rankings.findIndex(r=>r.id===Number(studentId))+1 || null;
    const classMean = rankings.length ? Math.round(rankings.reduce((a,b)=>a+b.avg,0)/rankings.length) : 0;

    const attendance = await Attendance.findAll({ where:{ studentId } });
    const present = attendance.filter(a=>a.status==='present').length;
    const attendanceRate = attendance.length ? Math.round((present/attendance.length)*100) : 0;

    const subjects = records.map((r,i) => ({
      no:i+1,
      subject:r.subject,
      maxMarks:100,
      score:r.score,
      percentage:r.score,
      grade:r.grade || v7GradeFromScale(r.score, r.gradingScale).grade,
      point:v7GradeFromScale(r.score, r.gradingScale).point,
      remarks:r.remarks || v7GradeFromScale(r.score, r.gradingScale).description
    }));

    const analysis = v7AnalyzeMarks(records);
    res.json({
      success:true,
      data:{
        school:{ name:req.user.schoolCode, motto:'Excellence in Education' },
        student:{
          id:student.id,
          name:student.User?.name,
          admissionNo:student.admissionNumber || student.admissionNo || student.elimuid,
          assessmentNumber:student.assessmentNumber,
          nemisNumber:student.nemisNumber,
          class:student.grade,
          stream:classItem?.stream || '',
          dateOfBirth:student.dateOfBirth,
          gender:student.gender,
          photo:student.User?.profileImage
        },
        term,
        year:Number(year),
        summary:{
          average,
          total,
          overallGrade:gradeInfo.grade,
          position,
          totalStudents:rankings.length,
          classMean,
          totalSubjects:subjects.length,
          passed:subjects.filter(s=>Number(s.score)>=50).length,
          failed:subjects.filter(s=>Number(s.score)<50).length,
          attendanceRate
        },
        subjects,
        attendance:{ daysOpen:attendance.length, daysPresent:present, daysAbsent:attendance.length-present, attendanceRate },
        analysis,
        remarks:{
          teacher: analysis.recommendation,
          principal: average >= 70 ? 'Keep up the good work. Your dedication will lead to greater achievements.' : 'More effort and close support are recommended for improved performance.'
        },
        gradingScale: records[0]?.gradingScale || [
          { grade:'A', min:80, max:100, description:'Excellent' },
          { grade:'B', min:70, max:79, description:'Very Good' },
          { grade:'C', min:60, max:69, description:'Good' },
          { grade:'D', min:50, max:59, description:'Fair' },
          { grade:'E', min:40, max:49, description:'Pass' },
          { grade:'F', min:0, max:39, description:'Fail' }
        ]
      }
    });
  } catch(error) { console.error('Report card error:', error); res.status(500).json({ success:false, message:error.message }); }
};

