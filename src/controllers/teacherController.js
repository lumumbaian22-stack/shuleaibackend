// src/controllers/teacherController.js - COMPLETE FIXED VERSION
const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');
const { Op } = require('sequelize');
const { Teacher, Student, AcademicRecord, Attendance, User, Parent, Class, Message, DutyRoster, School, Task, TeacherSubjectAssignment } = require('../models');
const { getGradeFromScore } = require('../utils/curriculumHelper');
const { createAlert } = require('../services/notificationService');
const moment = require('moment');
const { ensureRuntimeSchema } = require('../utils/schemaSafety');

// ============ EXISTING FUNCTIONS (keep your existing ones, they work) ============

// @desc    Get teacher's dashboard
// @route   GET /api/teacher/dashboard
// @access  Private/Teacher
exports.getDashboard = async (req, res) => {
  try {
    await ensureRuntimeSchema().catch(() => null);
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
    await ensureRuntimeSchema().catch(() => null);
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
      grade,
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
    await ensureRuntimeSchema().catch(() => null);
    const teacher = await Teacher.findOne({ where: { userId: req.user.id } });
    if (!teacher) return res.status(404).json({ success: false, message: 'Teacher not found' });

    const assignments = await TeacherSubjectAssignment.findAll({
      where: { teacherId: teacher.id },
      include: [{ model: Class, required: false }],
      order: [['subject', 'ASC']]
    });

    const bySubject = new Map();
    for (const a of assignments) {
      const cls = a.Class;
      if (cls && cls.schoolCode !== req.user.schoolCode) continue;
      const subject = a.subject || 'General';
      if (!bySubject.has(subject)) bySubject.set(subject, { name: subject, classes: [] });
      bySubject.get(subject).classes.push({
        id: a.classId,
        name: cls?.name || `Class ${a.classId}`,
        grade: cls?.grade || '',
        stream: cls?.stream || '',
        isClassTeacher: !!a.isClassTeacher
      });
    }

    // Also include legacy class teacher class if assigned directly on Teacher/Class.
    const classTeacherClasses = await Class.findAll({
      where: { schoolCode: req.user.schoolCode, isActive: true, [Op.or]: [{ teacherId: teacher.id }, { id: teacher.classId || 0 }] }
    });
    if (classTeacherClasses.length && !bySubject.has('Class Teacher')) bySubject.set('Class Teacher', { name: 'Class Teacher', classes: [] });
    for (const cls of classTeacherClasses) {
      bySubject.get('Class Teacher').classes.push({ id: cls.id, name: cls.name, grade: cls.grade, stream: cls.stream, isClassTeacher: true });
    }

    res.json({ success: true, data: Array.from(bySubject.values()) });
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
    await ensureRuntimeSchema().catch(() => null);
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
    await ensureRuntimeSchema().catch(() => null);
    const { Op } = require('sequelize');
    const { classId } = req.params;
    const teacher = await Teacher.findOne({ where: { userId: req.user.id } });
    if (!teacher) return res.status(404).json({ success: false, message: 'Teacher not found' });

    const classItem = await Class.findOne({ where: { id: classId, schoolCode: req.user.schoolCode, isActive: true } });
    if (!classItem) return res.status(404).json({ success: false, message: 'Class not found' });

    const subjectTeachers = Array.isArray(classItem.subjectTeachers) ? classItem.subjectTeachers : [];
    const isClassTeacher = String(classItem.teacherId) === String(teacher.id) || String(teacher.classTeacher || '').toLowerCase() === String(classItem.name || '').toLowerCase();
    const isSubjectTeacher = subjectTeachers.some(st => String(st.teacherId) === String(teacher.id));
    if (!isClassTeacher && !isSubjectTeacher) return res.status(403).json({ success: false, message: 'You do not have access to this class' });

    const names = [...new Set([
      classItem.name,
      classItem.grade,
      `${classItem.grade || ''} ${classItem.stream || ''}`.trim(),
      `${classItem.name || ''} ${classItem.stream || ''}`.trim()
    ].filter(Boolean))];

    const userInclude = { model: User, attributes: ['id', 'name', 'email', 'phone', 'schoolCode'], where: { schoolCode: req.user.schoolCode }, required: true };
    let students = await Student.findAll({
      where: { grade: { [Op.in]: names }, status: { [Op.ne]: 'inactive' } },
      include: [userInclude],
      order: [['createdAt', 'ASC']],
      limit: 1000
    });

    if (!students.length && classItem.grade) {
      students = await Student.findAll({
        where: { grade: { [Op.iLike]: `%${classItem.grade}%` }, status: { [Op.ne]: 'inactive' } },
        include: [userInclude],
        order: [['createdAt', 'ASC']],
        limit: 1000
      });
    }

    res.json({
      success: true,
      data: students,
      meta: { classId: classItem.id, className: classItem.name, grade: classItem.grade, stream: classItem.stream, count: students.length }
    });
  } catch (error) {
    console.error('Get class students error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};


// @desc    Get one student visible to the teacher
// @route   GET /api/teacher/students/:studentId
// @access  Private/Teacher
exports.getTeacherStudentDetails = async (req, res) => {
  try {
    await ensureRuntimeSchema().catch(() => null);
    const teacher = await Teacher.findOne({ where: { userId: req.user.id } });
    if (!teacher) return res.status(404).json({ success: false, message: 'Teacher not found' });
    const student = await Student.findOne({
      where: { id: req.params.studentId, status: { [Op.ne]: 'inactive' } },
      include: [{ model: User, attributes: ['id','name','email','phone','profileImage','profilePicture','schoolCode'], where: { schoolCode: req.user.schoolCode }, required: true }]
    });
    if (!student) return res.status(404).json({ success: false, message: 'Student not found' });
    res.json({ success: true, data: student });
  } catch (error) {
    console.error('Get teacher student details error:', error);
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
    await ensureRuntimeSchema().catch(() => null);
    const teacher = await Teacher.findOne({ where: { userId: req.user.id } });
    if (!teacher) return res.status(404).json({ success: false, message: 'Teacher not found' });

    const subjectAssignments = await TeacherSubjectAssignment.findAll({
      where: { teacherId: teacher.id },
      include: [{ model: Class, required: false }],
      order: [['subject', 'ASC']]
    });

    const classesById = new Map();
    const subjects = [];
    for (const a of subjectAssignments) {
      const cls = a.Class;
      if (cls && cls.schoolCode !== req.user.schoolCode) continue;
      const clsData = {
        classId: a.classId,
        className: cls?.name || `Class ${a.classId}`,
        grade: cls?.grade || '',
        stream: cls?.stream || '',
        subject: a.subject || 'General',
        isClassTeacher: !!a.isClassTeacher
      };
      subjects.push(clsData);
      if (!classesById.has(String(a.classId))) classesById.set(String(a.classId), { id: a.classId, name: clsData.className, grade: clsData.grade, stream: clsData.stream, subjects: [] });
      classesById.get(String(a.classId)).subjects.push(clsData.subject);
    }

    const directClasses = await Class.findAll({
      where: { schoolCode: req.user.schoolCode, isActive: true, [Op.or]: [{ teacherId: teacher.id }, { id: teacher.classId || 0 }] }
    });
    for (const cls of directClasses) {
      if (!classesById.has(String(cls.id))) classesById.set(String(cls.id), { id: cls.id, name: cls.name, grade: cls.grade, stream: cls.stream, subjects: [] });
    }

    const classTeacherClass = directClasses[0] || (teacher.classId ? await Class.findOne({ where: { id: teacher.classId, schoolCode: req.user.schoolCode } }) : null);

    res.json({
      success: true,
      data: {
        teacherId: teacher.id,
        teacherName: req.user.name,
        classTeacher: classTeacherClass ? { id: classTeacherClass.id, name: classTeacherClass.name, grade: classTeacherClass.grade, stream: classTeacherClass.stream } : null,
        subjects,
        classes: Array.from(classesById.values())
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
    await ensureRuntimeSchema().catch(() => null);
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
    if (record.isPublished || record.status === 'locked' || record.lockedAt) {
      return res.status(423).json({ success:false, message:'This mark is locked after publication. Ask admin to unlock it before editing.' });
    }
    const school = await School.findOne({ where:{ schoolId:req.user.schoolCode } });
    const grade = score !== undefined ? getGradeFromScore(Number(score), school?.system || 'cbc', school?.settings?.schoolLevel || 'secondary', req.body.gradingScale || record.gradingScale || null) : record.grade;
    const auditTrail = Array.isArray(record.auditTrail) ? record.auditTrail : [];
    auditTrail.push({ action:'mark_updated', by:req.user.id, teacherId:teacher.id, oldScore:record.score, newScore:score, reason:req.body.reason || 'Teacher correction before publish', at:new Date().toISOString() });
    await record.update({ score, grade, assessmentName, assessmentType, date, term, year, auditTrail, version:(record.version || 1)+1 });
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
    if (record.isPublished || record.status === 'locked' || record.lockedAt) {
      return res.status(423).json({ success:false, message:'Published/locked marks cannot be deleted. Ask admin to unlock/correct with audit log.' });
    }
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
    const { classId, subject, assessmentType='CAT', assessmentName, date, marks=[], term='Term 1', year=new Date().getFullYear(), gradingScale=null } = req.body;
    if (!assessmentName) return res.status(400).json({ success:false, message:'Assessment name is required' });
    if (!Array.isArray(marks) || !marks.length) return res.status(400).json({ success:false, message:'At least one mark is required' });

    const teacher = await v3Teacher(req.user.id);
    if (!teacher) return res.status(404).json({ success:false, message:'Teacher not found' });
    const cls = await Class.findOne({ where:{ id:classId, schoolCode:req.user.schoolCode, isActive:true } });
    if (!cls) return res.status(404).json({ success:false, message:'Class not found' });
    const access = v3Access(teacher, cls, subject);
    if (!access.allowed) return res.status(403).json({ success:false, message:'You can only enter marks for assigned subjects/classes' });

    const school = await School.findOne({ where:{ schoolId:req.user.schoolCode } });
    const curriculum = (school?.system || school?.settings?.curriculum || 'cbc');
    const level = school?.settings?.schoolLevel || 'secondary';
    const studentIdsInClass = (await Student.findAll({ where:{ grade:cls.name }, attributes:['id'] })).map(s => Number(s.id));

    let saved=0, failed=0; const results=[];
    for (const m of marks) {
      try {
        const studentId = Number(m.studentId);
        if (!studentIdsInClass.includes(studentId)) throw new Error('Student is not in this class');
        const score = Number(m.score);
        if (!Number.isFinite(score) || score < 0 || score > 100) throw new Error('Score must be 0-100');
        const grade = getGradeFromScore(score, curriculum, level, gradingScale);
        const where = { studentId, subject, assessmentType, assessmentName, term, year:Number(year), schoolCode:req.user.schoolCode };
        const existing = await AcademicRecord.findOne({ where });
        const auditEntry = { action: existing ? 'mark_updated' : 'mark_created', by:req.user.id, teacherId:teacher.id, oldScore:existing?.score ?? null, newScore:score, reason:m.reason || 'Teacher marks entry', at:new Date().toISOString(), term, year:Number(year), subject, assessmentType, assessmentName };
        if (existing) {
          const locked = existing.status === 'locked' || existing.isPublished === true || existing.lockedAt;
          if (locked && !existing.unlockedBy) throw new Error('Published/locked marks cannot be edited. Request admin unlock.');
          await existing.update({
            score, grade, remarks:m.remarks || existing.remarks || '', classId:cls.id, curriculum,
            teacherId:teacher.id, date:date || existing.date, gradingScale,
            status: existing.status === 'published' ? 'published' : 'draft',
            version:(existing.version || 1) + 1,
            auditTrail:[...(Array.isArray(existing.auditTrail)?existing.auditTrail:[]), auditEntry]
          });
          results.push({ studentId, success:true, recordId:existing.id, updated:true });
        } else {
          const record = await AcademicRecord.create({
            studentId, schoolCode:req.user.schoolCode, classId:cls.id, curriculum, term, year:Number(year), subject,
            assessmentType, assessmentName, score, grade, remarks:m.remarks || '', teacherId:teacher.id,
            date:date || new Date(), isPublished:false, status:'draft', gradingScale,
            auditTrail:[auditEntry]
          });
          results.push({ studentId, success:true, recordId:record.id, created:true });
        }
        saved++;
      } catch(err) { failed++; results.push({ studentId:m.studentId, success:false, error:err.message }); }
    }
    res.json({ success:true, message:`Saved ${saved} draft mark(s). Published marks will lock with audit history.`, data:{ saved, failed, results, classId:cls.id, className:cls.name, term, year:Number(year), subject } });
  } catch(error) { console.error('V66 save marks error:', error); res.status(500).json({ success:false, message:error.message }); }
};

exports.publishMarks = async (req,res) => {
  try {
    const { classId, term='Term 1', year=new Date().getFullYear(), subject=null } = req.body;
    const teacher = await v3Teacher(req.user.id); if (!teacher) return res.status(404).json({ success:false, message:'Teacher not found' });
    const cls = await Class.findOne({ where:{ id:classId, schoolCode:req.user.schoolCode, isActive:true } }); if (!cls) return res.status(404).json({ success:false, message:'Class not found' });
    if (Number(cls.teacherId) !== Number(teacher.id)) return res.status(403).json({ success:false, message:'Only the class teacher can publish and lock final marks for this class' });
    const students = await Student.findAll({ where:{ grade:cls.name }, attributes:['id'] }); const ids=students.map(s=>s.id);
    const where = { schoolCode:req.user.schoolCode, studentId:{ [Op.in]:ids }, term, year:Number(year), isPublished:false };
    if (subject) where.subject = subject;
    const records = await AcademicRecord.findAll({ where });
    for (const record of records) {
      const trail = Array.isArray(record.auditTrail) ? record.auditTrail : [];
      trail.push({ action:'marks_published_locked', by:req.user.id, teacherId:teacher.id, at:new Date().toISOString(), classId:cls.id, term, year:Number(year), subject:record.subject });
      await record.update({ isPublished:true, status:'locked', publishedAt:new Date(), publishedBy:req.user.id, lockedAt:new Date(), auditTrail:trail });
    }
    res.json({ success:true, message:`${records.length} mark(s) published and locked for ${cls.name}`, data:{ count:records.length, classId:cls.id, term, year:Number(year), locked:true } });
  } catch(error) { console.error('V66 publish marks error:', error); res.status(500).json({ success:false, message:error.message }); }
};
