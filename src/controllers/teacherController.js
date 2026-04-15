// src/controllers/teacherController.js - COMPLETE FIXED VERSION
const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');
const { Op } = require('sequelize');
const { Teacher, Student, AcademicRecord, Attendance, User, Parent, Class, Message, DutyRoster, School } = require('../models');
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

// @desc    Get teacher's students
// @route   GET /api/teacher/students
// @access  Private/Teacher
exports.getMyStudents = async (req, res) => {
  try {
    const teacher = await Teacher.findOne({ where: { userId: req.user.id } });
    if (!teacher) {
      return res.status(404).json({ success: false, message: 'Teacher profile not found' });
    }

    // First, find the class where this teacher is the class teacher (via Class.teacherId)
    const classItem = await Class.findOne({
      where: { teacherId: teacher.id, schoolCode: req.user.schoolCode, isActive: true }
    });
    
    let classNames = [];
    if (classItem) {
      classNames.push(classItem.name);
    } else if (teacher.classTeacher) {
      classNames.push(teacher.classTeacher);
    }
    
    // Also add classes where teacher is a subject teacher
    const allClasses = await Class.findAll({
      where: { schoolCode: req.user.schoolCode, isActive: true }
    });
    for (const cls of allClasses) {
      if (cls.subjectTeachers && Array.isArray(cls.subjectTeachers)) {
        if (cls.subjectTeachers.some(st => st.teacherId === teacher.id)) {
          classNames.push(cls.name);
        }
      }
    }
    
    classNames = [...new Set(classNames)];
    
    if (classNames.length === 0) {
      return res.json({ success: true, data: [] });
    }
    
    const students = await Student.findAll({
      where: { grade: { [Op.in]: classNames } },
      include: [{ model: User, attributes: ['id', 'name', 'email', 'phone'] }]
    });
    
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
    
    if (!name || !grade) {
      return res.status(400).json({ 
        success: false, 
        message: 'Student name and grade are required' 
      });
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

    // Get school curriculum for grade calculation
    const school = await School.findOne({ where: { schoolId: req.user.schoolCode } });
    const { getGradeFromScore } = require('../utils/curriculumHelper');
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
      isPublished: true,
      grade: grade   // ✅ added here
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

    // Get the teacher's school to filter duty roster
    const school = await School.findOne({ where: { schoolId: teacher.User.schoolCode } });
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
    
    res.json({ 
      success: true, 
      message: 'Student removed from class successfully' 
    });
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

    const studentCount = await Student.count({
      where: { grade: classItem.name }
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

    // Get all classes in the school
    const allClasses = await Class.findAll({
      where: { schoolCode: req.user.schoolCode, isActive: true }
    });

    // Format subjects with class information
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
    const teacher = await Teacher.findOne({ where: { userId: req.user.id } });
    if (!teacher) return res.status(404).json({ success: false, message: 'Teacher not found' });

    // Collect class names
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

    // Real attendance today
    const today = new Date().toISOString().split('T')[0];
    const attendanceToday = await Attendance.findAll({
      where: {
        studentId: { [Op.in]: students.map(s => s.id) },
        date: today
      }
    });
    const presentToday = attendanceToday.filter(a => a.status === 'present').length;
    const attendanceTodayStr = `${presentToday}/${students.length}`;

    // Real pending tasks
    const pendingTasks = await Task.count({
      where: { userId: req.user.id, status: { [Op.ne]: 'completed' } }
    });

    // Real class average
    let totalScore = 0;
    let scoreCount = 0;
    for (const student of students) {
      const records = await AcademicRecord.findAll({ where: { studentId: student.id } });
      const avg = records.length ? records.reduce((a,b) => a + b.score, 0) / records.length : 0;
      totalScore += avg;
      scoreCount++;
    }
    const classAverage = scoreCount ? Math.round(totalScore / scoreCount) : 0;

    res.json({
      success: true,
      data: {
        studentCount: students.length,
        classAverage,
        attendanceToday: attendanceTodayStr,
        pendingTasks
      }
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
    
    // FIXED: Use classItem.name (the class name) not teacher.classTeacher
    const students = await Student.findAll({
      where: { grade: classItem.name },  // ← FIXED: Use classItem.name
      include: [{ model: User, attributes: ['id', 'name', 'email', 'phone'] }],
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
        
        // Use the teacher's own class for all uploaded students
        const targetGrade = teacher.classTeacher;
        
        for (const row of results) {
          try {
            // Name is required; grade is ignored (we use teacher's class)
            if (!row.name) {
              errors.push({ row, error: 'Missing name' });
              continue;
            }
            
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
              grade: targetGrade,  // ← Override with teacher's class
              dateOfBirth: row.dob || row.dateOfBirth || null,
              gender: row.gender || null
            });
            
            elimuids.push({ name: row.name, elimuid: student.elimuid });
            successCount++;
            
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
        
        fs.unlinkSync(filePath);
        
        res.json({
          success: true,
          message: `Processed ${results.length} records. Success: ${successCount}, Failed: ${errors.length}`,
          data: {
            successCount,
            failedCount: errors.length,
            elimuids,
            errors: errors.slice(0, 10)
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

// @desc    Get teacher's assignments
// @route   GET /api/teacher/my-assignments
// @access  Private/Teacher
exports.getMyAssignments = async (req, res) => {
  try {
    const teacher = await Teacher.findOne({ where: { userId: req.user.id } });
    if (!teacher) {
      return res.status(404).json({ success: false, message: 'Teacher not found' });
    }

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
        classTeacher: classTeacherClass ? {
          id: classTeacherClass.id,
          name: classTeacherClass.name,
          grade: classTeacherClass.grade
        } : null,
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
    if (!teacher) {
      return res.status(404).json({ success: false, message: 'Teacher not found' });
    }

    const classItem = await Class.findOne({
      where: { id: classId, schoolCode: req.user.schoolCode, isActive: true }
    });

    if (!classItem) {
      return res.status(404).json({ success: false, message: 'Class not found' });
    }

    const isClassTeacher = classItem.teacherId === teacher.id;
    const isSubjectTeacher = classItem.subjectTeachers?.some(st => st.teacherId === teacher.id && st.subject === subject);

    if (!isClassTeacher && !isSubjectTeacher) {
      return res.status(403).json({ 
        success: false, 
        message: 'You are not assigned to teach this subject in this class' 
      });
    }

    const students = await Student.findAll({
      where: { grade: classItem.name },
      include: [{ model: User, attributes: ['id', 'name', 'email'] }],
      order: [['createdAt', 'DESC']]
    });

    const formattedStudents = students.map(s => ({
      id: s.id,
      userId: s.userId,
      name: s.User?.name || 'Unknown',
      elimuid: s.elimuid,
      grade: s.grade
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

// @desc    Get teacher's subject performance and attendance trend
// @route   GET /api/teacher/performance
// @access  Private/Teacher
// Inside teacherController.js, add or update this method:

exports.getPerformanceData = async (req, res) => {
  try {
    const teacher = await Teacher.findOne({ where: { userId: req.user.id } });
    if (!teacher) return res.status(404).json({ success: false, message: 'Teacher not found' });

    // Collect class names where this teacher teaches
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

    // Students in those classes
    const students = await Student.findAll({ where: { grade: { [Op.in]: classNames } } });
    const studentIds = students.map(s => s.id);

    // Subject averages (real data)
    const records = await AcademicRecord.findAll({ where: { studentId: { [Op.in]: studentIds } } });
    const subjectScores = {};
    records.forEach(rec => {
      if (!subjectScores[rec.subject]) subjectScores[rec.subject] = { total: 0, count: 0 };
      subjectScores[rec.subject].total += rec.score;
      subjectScores[rec.subject].count++;
    });
    const subjectAverages = Object.entries(subjectScores).map(([subject, data]) => ({
      subject,
      average: Math.round(data.total / data.count)
    }));

    // Attendance trend (last 7 days)
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
    const attendanceTrend = Object.entries(dailyStats).map(([date, stats]) => ({
      date,
      rate: stats.total ? Math.round((stats.present / stats.total) * 100) : 0
    }));

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
    // Verify teacher owns this record
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
