const { Op } = require('sequelize');
const path = require('path');
const fs = require('fs');
const {
  User, Teacher, Student, Class,
  Department, DepartmentMember, TeacherSubjectAssignment,
  ChatGroup, ChatGroupMember, ChatMessage,
  ClassroomThread, ThreadReply, AchievementEvent
} = require('../models');

function schoolCodeOf(req) {
  return req.user?.schoolCode;
}

async function getTeacherProfile(userId) {
  return Teacher.findOne({ where: { userId } });
}

async function getStudentProfile(userId) {
  return Student.unscoped ? Student.unscoped().findOne({ where: { userId } }) : Student.findOne({ where: { userId } });
}

async function getClassStudyParticipants({ schoolCode, classId }) {
  if (!classId) return [];
  const students = await (Student.unscoped ? Student.unscoped() : Student).findAll({
    where: { classId, status: 'active' },
    include: [{ model: User, attributes: ['id','name','role','profileImage'], where: { schoolCode, role: 'student', isActive: true } }],
    order: [[User, 'name', 'ASC']],
    limit: 120
  });
  return students.map(s => ({
    id: s.User?.id,
    studentId: s.id,
    name: s.User?.name || s.name || 'Student',
    role: 'student',
    profileImage: s.User?.profileImage || null,
    admissionNumber: s.admissionNumber || null
  })).filter(x => x.id);
}


async function resolveStudentClassContext(req) {
  const student = await getStudentProfile(req.user.id);
  let classId = student?.classId || req.user?.classId || req.user?.student?.classId || req.user?.Student?.classId || null;
  let grade = student?.grade || req.user?.grade || req.user?.student?.grade || req.user?.Student?.grade || req.user?.className || null;
  let classRecord = null;

  if (classId) {
    classRecord = await Class.findOne({ where: { id: Number(classId), schoolCode: schoolCodeOf(req) } }).catch(() => null);
  }

  if (!classRecord && grade) {
    const cleanGrade = String(grade).trim();
    classRecord = await Class.findOne({
      where: {
        schoolCode: schoolCodeOf(req),
        [Op.or]: [
          { name: cleanGrade },
          { grade: cleanGrade },
          { stream: cleanGrade }
        ]
      }
    }).catch(() => null);
    if (classRecord?.id) classId = classRecord.id;
  }

  return { student, classId: classId ? Number(classId) : null, grade, classRecord };
}

function threadMatchesStudentContext(thread, ctx) {
  if (!thread) return false;
  if (!thread.classId) return true;
  if (ctx.classId && Number(thread.classId) === Number(ctx.classId)) return true;
  const meta = thread.metadata || {};
  const possibleNames = [ctx.grade, ctx.classRecord?.name, ctx.classRecord?.grade, ctx.classRecord?.stream].filter(Boolean).map(v => String(v).toLowerCase().trim());
  const threadNames = [meta.className, meta.grade, meta.stream].filter(Boolean).map(v => String(v).toLowerCase().trim());
  return possibleNames.some(name => threadNames.includes(name));
}

async function buildStudyMeta(req, threads, student) {
  const schoolCode = schoolCodeOf(req);
  const classIds = [...new Set([student?.classId, ...threads.map(t => t.classId)].filter(Boolean).map(Number))];
  const classes = classIds.length ? await Class.findAll({ where: { id: { [Op.in]: classIds }, schoolCode } }) : [];
  const classMap = new Map(classes.map(c => [Number(c.id), c]));
  const participantsByClass = {};
  for (const classId of classIds) {
    participantsByClass[classId] = await getClassStudyParticipants({ schoolCode, classId });
  }
  const groups = classIds.map(classId => {
    const c = classMap.get(Number(classId));
    const participants = participantsByClass[classId] || [];
    return {
      id: `class-${classId}`,
      classId,
      name: c?.name || c?.grade || 'My Class Study Group',
      grade: c?.grade || '',
      stream: c?.stream || '',
      type: 'class-study-group',
      participantCount: participants.length,
      participants
    };
  });
  return { groups, participantsByClass };
}

function canManageSchool(req) {
  return ['admin', 'super_admin'].includes(req.user?.role);
}

function canManageChatGroup(req) {
  return ['teacher', 'admin', 'super_admin'].includes(req.user?.role);
}

async function getTeacherAllowedClassIds(userId) {
  const teacher = await getTeacherProfile(userId);
  if (!teacher) return [];
  const ids = new Set();
  if (teacher.classId) ids.add(Number(teacher.classId));
  const assignments = await TeacherSubjectAssignment.findAll({ where: { teacherId: teacher.id }, attributes: ['classId'] }).catch(() => []);
  for (const item of assignments || []) {
    if (item.classId) ids.add(Number(item.classId));
  }
  return [...ids].filter(Boolean);
}

async function hydrateChatMessage(message) {
  if (!message) return null;
  return ChatMessage.findByPk(message.id, {
    include: [{ model: User, as: 'Sender', attributes: ['id','name','role','profileImage'] }]
  });
}

async function ensureChatGroupManager(req, groupId) {
  const member = await ChatGroupMember.findOne({ where: { groupId, userId: req.user.id } });
  if (canManageSchool(req)) return member || true;
  if (req.user.role !== 'teacher') return null;
  return ['owner','admin'].includes(member?.role) ? member : null;
}

async function ensureTeacherCanAddUsers(req, userIds) {
  if (canManageSchool(req)) return true;
  if (req.user.role !== 'teacher') return false;
  const requestedIds = [...new Set((userIds || []).map(Number).filter(Boolean))];
  if (!requestedIds.length) return true;
  const users = await User.findAll({ where: { id: { [Op.in]: requestedIds }, schoolCode: schoolCodeOf(req), isActive: true }, attributes: ['id','role'] });
  const allowedClassIds = await getTeacherAllowedClassIds(req.user.id);
  for (const user of users) {
    if (user.role === 'teacher') continue;
    if (user.role !== 'student') return false;
    if (!allowedClassIds.length) return false;
    const student = await getStudentProfile(user.id);
    if (!student?.classId || !allowedClassIds.includes(Number(student.classId))) return false;
  }
  return true;
}

async function ensureUserMayUseThread(req, thread) {
  if (!thread || thread.schoolCode !== schoolCodeOf(req)) return false;
  if (['teacher','admin','super_admin'].includes(req.user.role)) return true;
  if (req.user.role !== 'student') return false;
  const student = await getStudentProfile(req.user.id);
  if (!student) return false;
  const ctx = await resolveStudentClassContext(req);
  if (threadMatchesStudentContext(thread, ctx)) return true;

  // Legacy safeguard: older threads may have missing/wrong classId because student/class
  // data used grade names before classId existed. Let active students in the same school
  // reply to approved, open study threads instead of hard-failing with 403.
  const meta = thread.metadata || {};
  const approvalStatus = String(meta.approvalStatus || 'approved').toLowerCase();
  return approvalStatus === 'approved';
}

async function ensureStaffRoom(req) {
  const schoolCode = schoolCodeOf(req);
  let group = await ChatGroup.findOne({ where: { schoolCode, type: 'staff', name: 'Staff Room' } });
  if (!group) {
    group = await ChatGroup.create({
      schoolCode,
      name: 'Staff Room',
      type: 'staff',
      description: 'General teacher-to-teacher staff room',
      createdBy: req.user.id
    });
  }

  const teachers = await User.findAll({ where: { schoolCode, role: 'teacher', isActive: true } });
  for (const teacher of teachers) {
    await ChatGroupMember.findOrCreate({
      where: { groupId: group.id, userId: teacher.id },
      defaults: { role: 'member' }
    });
  }
  return group;
}

exports.listDepartments = async (req, res) => {
  try {
    const departments = await Department.findAll({
      where: { schoolCode: schoolCodeOf(req), isActive: true },
      include: [{ model: DepartmentMember, include: [{ model: Teacher, include: [{ model: User, attributes: ['id','name','email','role'] }] }] }],
      order: [['name', 'ASC']]
    });
    res.json({ success: true, data: departments });
  } catch (error) {
    console.error('listDepartments error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.createDepartment = async (req, res) => {
  try {
    if (!canManageSchool(req)) return res.status(403).json({ success: false, message: 'Only admin can create departments' });
    const { name, description, teacherIds = [] } = req.body;
    if (!name) return res.status(400).json({ success: false, message: 'Department name is required' });

    const department = await Department.create({ schoolCode: schoolCodeOf(req), name, description, headTeacherId: teacherIds[0] || null });
    const group = await ChatGroup.create({
      schoolCode: schoolCodeOf(req),
      name: `${name} Department`,
      type: 'department',
      description: description || `${name} department group`,
      createdBy: req.user.id,
      departmentId: department.id
    });

    for (const teacherId of teacherIds) {
      const teacher = await Teacher.findByPk(teacherId);
      if (!teacher) continue;
      await DepartmentMember.findOrCreate({ where: { departmentId: department.id, teacherId }, defaults: { role: teacherId === teacherIds[0] ? 'head' : 'member' } });
      await ChatGroupMember.findOrCreate({ where: { groupId: group.id, userId: teacher.userId }, defaults: { role: teacherId === teacherIds[0] ? 'admin' : 'member' } });
    }

    res.status(201).json({ success: true, data: { department, group } });
  } catch (error) {
    console.error('createDepartment error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.listTeacherDirectory = async (req, res) => {
  try {
    // Official rollout safety rule:
    // private/direct chat must never expose teacher <-> student 1:1 messaging.
    // Teacher-student communication stays in classroom, study-room, and homework threads.
    let roleFilter = ['teacher'];

    if (req.user.role === 'teacher') roleFilter = ['teacher', 'admin', 'parent'];
    else if (req.user.role === 'parent') roleFilter = ['teacher', 'admin'];
    else if (['admin', 'super_admin'].includes(req.user.role)) roleFilter = ['teacher', 'admin', 'parent'];
    else if (req.user.role === 'student') roleFilter = [];

    if (!roleFilter.length) return res.json({ success: true, data: [] });

    const users = await User.findAll({
      where: {
        schoolCode: schoolCodeOf(req),
        role: { [Op.in]: roleFilter },
        isActive: true,
        id: { [Op.ne]: req.user.id }
      },
      attributes: ['id','name','email','phone','role','profileImage'],
      include: [
        { model: Teacher, required: false, attributes: ['id','classId','subjects'] },
        { model: Student, required: false, attributes: ['id','classId','grade'] }
      ],
      order: [['role','ASC'], ['name','ASC']]
    });

    res.json({ success: true, data: users });
  } catch (error) {
    console.error('listTeacherDirectory error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.listTeacherGroups = async (req, res) => {
  try {
    await ensureStaffRoom(req);

    const memberships = await ChatGroupMember.findAll({
      where: { userId: req.user.id },
      include: [{ model: ChatGroup, where: { schoolCode: schoolCodeOf(req), isActive: true } }],
      order: [[ChatGroup, 'updatedAt', 'DESC']]
    });

    const groups = [];
    for (const m of memberships) {
      const group = { ...m.ChatGroup.toJSON(), membershipRole: m.role, muted: m.muted };
      if (group.departmentId) {
        const dept = await Department.findByPk(group.departmentId, {
          include: [{ model: DepartmentMember, where: { role: 'head' }, required: false, include: [{ model: Teacher, include: [{ model: User, attributes: ['id','name','email','profileImage'] }] }] }]
        });
        group.departmentName = dept?.name || group.name;
        group.headName = dept?.DepartmentMembers?.[0]?.Teacher?.User?.name || 'Not assigned';
        group.headUserId = dept?.DepartmentMembers?.[0]?.Teacher?.User?.id || null;
      }
      groups.push(group);
    }
    res.json({ success: true, data: groups });
  } catch (error) {
    console.error('listTeacherGroups error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.createTeacherGroup = async (req, res) => {
  try {
    if (!canManageChatGroup(req)) return res.status(403).json({ success: false, message: 'Only teachers/admins can create groups' });
    const { name, description, type = 'project', memberUserIds = [] } = req.body;
    if (!name) return res.status(400).json({ success: false, message: 'Group name is required' });

    const group = await ChatGroup.create({ schoolCode: schoolCodeOf(req), name, description, type, createdBy: req.user.id });
    await ChatGroupMember.create({ groupId: group.id, userId: req.user.id, role: 'owner' });
    if (!(await ensureTeacherCanAddUsers(req, memberUserIds))) {
      return res.status(403).json({ success: false, message: 'Teachers can only add teachers and students from their assigned class/subject' });
    }
    for (const userId of memberUserIds) {
      const user = await User.findOne({ where: { id: userId, schoolCode: schoolCodeOf(req), isActive: true, role: { [Op.in]: ['teacher','student'] } } });
      if (user) await ChatGroupMember.findOrCreate({ where: { groupId: group.id, userId }, defaults: { role: user.role === 'teacher' ? 'member' : 'student' } });
    }
    res.status(201).json({ success: true, data: group });
  } catch (error) {
    console.error('createTeacherGroup error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

async function canDirectMessage(req, otherUser) {
  if (!otherUser || otherUser.schoolCode !== schoolCodeOf(req)) return false;
  if (Number(otherUser.id) === Number(req.user.id)) return false;

  // Official rollout safety rule:
  // No private 1:1 teacher <-> student messages.
  // Teacher-student interaction is allowed only in auditable group/class/study/homework spaces.
  if (req.user.role === 'teacher') {
    return ['teacher', 'admin', 'parent'].includes(otherUser.role);
  }

  if (req.user.role === 'student') {
    if (otherUser.role !== 'student') return false;
    const meStudent = await getStudentProfile(req.user.id);
    const otherStudent = await getStudentProfile(otherUser.id);
    return Boolean(meStudent?.classId && otherStudent?.classId && Number(meStudent.classId) === Number(otherStudent.classId));
  }

  if (req.user.role === 'parent') {
    return ['teacher', 'admin'].includes(otherUser.role);
  }

  if (['admin', 'super_admin'].includes(req.user.role)) {
    return ['teacher', 'admin', 'parent'].includes(otherUser.role);
  }

  return false;
}

exports.getDirectMessages = async (req, res) => {
  try {
    const otherId = Number(req.params.userId);
    const other = await User.findOne({ where: { id: otherId, schoolCode: schoolCodeOf(req), isActive: true } });
    if (!(await canDirectMessage(req, other))) return res.status(404).json({ success: false, message: 'Contact not found or not allowed' });

    const messages = await ChatMessage.findAll({
      where: {
        schoolCode: schoolCodeOf(req),
        groupId: null,
        [Op.or]: [
          { senderId: req.user.id, receiverId: otherId },
          { senderId: otherId, receiverId: req.user.id }
        ]
      },
      include: [{ model: User, as: 'Sender', attributes: ['id','name','role','profileImage'] }],
      order: [['createdAt', 'ASC']],
      limit: 100
    });
    res.json({ success: true, data: messages });
  } catch (error) {
    console.error('getDirectMessages error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.sendDirectMessage = async (req, res) => {
  try {
    const { receiverId, content, attachmentUrl, attachment } = req.body;
    if (!receiverId || !content) return res.status(400).json({ success: false, message: 'receiverId and content are required' });
    const other = await User.findOne({ where: { id: receiverId, schoolCode: schoolCodeOf(req), isActive: true } });
    if (!(await canDirectMessage(req, other))) return res.status(404).json({ success: false, message: 'Contact not found or not allowed' });

    const message = await ChatMessage.create({
      schoolCode: schoolCodeOf(req),
      senderId: req.user.id,
      receiverId,
      content,
      attachmentUrl: attachmentUrl || null,
      messageType: attachmentUrl ? 'file' : 'text',
      metadata: attachment ? { attachmentName: attachment.name, attachmentType: attachment.mimeType, attachmentSize: attachment.size } : {}
    });
    const hydrated = await hydrateChatMessage(message);
    res.status(201).json({ success: true, data: hydrated || message });
  } catch (error) {
    console.error('sendDirectMessage error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.getGroupMessages = async (req, res) => {
  try {
    const groupId = Number(req.params.groupId);
    const member = await ChatGroupMember.findOne({ where: { groupId, userId: req.user.id } });
    if (!member && !canManageSchool(req)) return res.status(403).json({ success: false, message: 'Not a group member' });

    const messages = await ChatMessage.findAll({
      where: { schoolCode: schoolCodeOf(req), groupId },
      include: [{ model: User, as: 'Sender', attributes: ['id','name','role','profileImage'] }],
      order: [['createdAt', 'ASC']],
      limit: 100
    });
    res.json({ success: true, data: messages });
  } catch (error) {
    console.error('getGroupMessages error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.sendGroupMessage = async (req, res) => {
  try {
    const groupId = Number(req.params.groupId);
    const { content, attachmentUrl, attachment } = req.body;
    if (!content) return res.status(400).json({ success: false, message: 'content is required' });

    const group = await ChatGroup.findOne({ where: { id: groupId, schoolCode: schoolCodeOf(req), isActive: true } });
    if (!group) return res.status(404).json({ success: false, message: 'Group not found' });

    const member = await ChatGroupMember.findOne({ where: { groupId, userId: req.user.id } });
    if (!member && !canManageSchool(req)) return res.status(403).json({ success: false, message: 'Not a group member' });
    if (group.onlyAdminsCanSend && !['owner','admin'].includes(member?.role) && !canManageSchool(req)) {
      return res.status(403).json({ success: false, message: 'Only group admins can send messages' });
    }

    const message = await ChatMessage.create({
      schoolCode: schoolCodeOf(req),
      senderId: req.user.id,
      groupId,
      content,
      attachmentUrl: attachmentUrl || null,
      messageType: attachmentUrl ? 'file' : 'text',
      metadata: attachment ? { attachmentName: attachment.name, attachmentType: attachment.mimeType, attachmentSize: attachment.size } : {}
    });
    const hydrated = await hydrateChatMessage(message);
    res.status(201).json({ success: true, data: hydrated || message });
  } catch (error) {
    console.error('sendGroupMessage error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.listClassroomThreads = async (req, res) => {
  try {
    const where = { schoolCode: schoolCodeOf(req) };
    const studentCtx = req.user.role === 'student' ? await resolveStudentClassContext(req) : null;
    const student = studentCtx?.student || null;
    if (studentCtx?.classId) where.classId = studentCtx.classId;

    let threads = await ClassroomThread.findAll({
      where,
      include: [
        { model: User, as: 'Creator', attributes: ['id','name','role','profileImage'] },
        { model: Class, attributes: ['id','name','grade','stream'] },
        { model: ThreadReply, include: [{ model: User, as: 'Author', attributes: ['id','name','role','profileImage'] }] }
      ],
      order: [['isPinned', 'DESC'], ['updatedAt', 'DESC']],
      limit: 80
    });

    if (req.user.role === 'student' && !studentCtx?.classId) {
      threads = threads.filter(t => threadMatchesStudentContext(t, studentCtx || {}));
    }

    const json = threads.map(t => {
      const row = t.toJSON();
      row.className = row.Class?.name || row.metadata?.className || 'Class Study Group';
      row.studentCount = row.metadata?.studentCount || undefined;
      return row;
    });

    const meta = await buildStudyMeta(req, threads, student);
    for (const t of json) {
      const participants = meta.participantsByClass?.[Number(t.classId)] || [];
      t.participants = participants;
      t.studentCount = participants.length || t.studentCount || '—';
      t.metadata = { ...(t.metadata || {}), participantsCount: participants.length, className: t.className };
    }

    res.json({ success: true, data: json, meta });
  } catch (error) {
    console.error('listClassroomThreads error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.createClassroomThread = async (req, res) => {
  try {
    if (!['teacher','student','admin','super_admin'].includes(req.user.role)) return res.status(403).json({ success: false, message: 'Not allowed to create study threads' });
    const { classId, subject, topic, content, isPinned = false, metadata = {} } = req.body;
    if (!subject || !topic || !content) return res.status(400).json({ success: false, message: 'subject, topic and content are required' });

    const teacher = req.user.role === 'teacher' ? await getTeacherProfile(req.user.id) : null;
    const student = req.user.role === 'student' ? await getStudentProfile(req.user.id) : null;
    const approvalStatus = req.user.role === 'student' ? 'pending' : (metadata.approvalStatus || 'approved');
    let targetClassId = classId || student?.classId || null;
    if (!targetClassId && req.user.role === 'teacher') {
      const allowedClassIds = await getTeacherAllowedClassIds(req.user.id);
      targetClassId = allowedClassIds[0] || null;
    }
    const thread = await ClassroomThread.create({
      schoolCode: schoolCodeOf(req),
      classId: targetClassId,
      subject,
      topic,
      content,
      teacherId: teacher?.id || null,
      createdBy: req.user.id,
      isPinned: req.user.role === 'student' ? false : Boolean(isPinned),
      metadata: { ...(metadata || {}), approvalRequired: true, approvalStatus, createdByRole: req.user.role }
    });
    res.status(201).json({ success: true, data: thread });
  } catch (error) {
    console.error('createClassroomThread error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.updateClassroomThread = async (req, res) => {
  try {
    if (!['teacher','admin','super_admin'].includes(req.user.role)) return res.status(403).json({ success: false, message: 'Only teachers/admins can update study threads' });
    const threadId = Number(req.params.threadId);
    const thread = await ClassroomThread.findOne({ where: { id: threadId, schoolCode: schoolCodeOf(req) } });
    if (!thread) return res.status(404).json({ success: false, message: 'Thread not found' });

    const { approvalStatus, isClosed, isPinned, topic, subject, content, metadata = {} } = req.body || {};
    if (topic !== undefined) thread.topic = topic;
    if (subject !== undefined) thread.subject = subject;
    if (content !== undefined) thread.content = content;
    if (isClosed !== undefined) thread.isClosed = Boolean(isClosed);
    if (isPinned !== undefined) thread.isPinned = Boolean(isPinned);
    thread.metadata = { ...(thread.metadata || {}), ...(metadata || {}) };
    if (approvalStatus) thread.metadata = { ...(thread.metadata || {}), approvalStatus };
    await thread.save();
    res.json({ success: true, data: thread });
  } catch (error) {
    console.error('updateClassroomThread error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.replyToThread = async (req, res) => {
  try {
    const threadId = Number(req.params.threadId);
    const { content, parentReplyId, attachmentUrl, attachment } = req.body;
    if (!content) return res.status(400).json({ success: false, message: 'content is required' });

    const thread = await ClassroomThread.findOne({ where: { id: threadId, schoolCode: schoolCodeOf(req), isClosed: false } });
    if (!thread) return res.status(404).json({ success: false, message: 'Thread not found' });
    if (!(await ensureUserMayUseThread(req, thread))) return res.status(403).json({ success: false, message: 'Not allowed in this study room' });

    const reply = await ThreadReply.create({ threadId, userId: req.user.id, parentReplyId: parentReplyId || null, content, metadata: attachmentUrl ? { attachmentUrl, attachmentName: attachment?.name, attachmentType: attachment?.mimeType, attachmentSize: attachment?.size } : {} });
    thread.updatedAt = new Date();
    await thread.save();
    const hydrated = await ThreadReply.findByPk(reply.id, { include: [{ model: User, as: 'Author', attributes: ['id','name','role','profileImage'] }] });
    res.status(201).json({ success: true, data: hydrated || reply });
  } catch (error) {
    console.error('replyToThread error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

async function awardToUser({ req, recipientUserId, sourceType, sourceId, points, streakDelta, note }) {
  const recipient = await User.findOne({ where: { id: recipientUserId, schoolCode: schoolCodeOf(req) } });
  if (!recipient) throw new Error('Recipient not found');
  const student = recipient.role === 'student' ? await Student.findOne({ where: { userId: recipient.id } }) : null;
  if (!student) {
    const error = new Error('Stars and streaks can only be awarded to students. Use emoji reactions for teachers.');
    error.statusCode = 400;
    throw error;
  }

  return AchievementEvent.create({
    schoolCode: schoolCodeOf(req),
    studentId: student?.id || null,
    userId: recipient.id,
    awardedBy: req.user.id,
    sourceType,
    sourceId,
    points: Number(points || 0),
    streakDelta: Number(streakDelta || 0),
    title: points > 0 ? 'Star Points Awarded' : 'Streak Awarded',
    note: note || null
  });
}

exports.awardThreadReply = async (req, res) => {
  try {
    if (!['teacher','admin','super_admin'].includes(req.user.role)) return res.status(403).json({ success: false, message: 'Only teachers/admins can award points' });
    const reply = await ThreadReply.findByPk(req.params.replyId);
    if (!reply) return res.status(404).json({ success: false, message: 'Reply not found' });
    const { points = 0, streakDelta = 0, note } = req.body;

    reply.pointsAwarded = (reply.pointsAwarded || 0) + Number(points || 0);
    reply.streakAwarded = (reply.streakAwarded || 0) + Number(streakDelta || 0);
    await reply.save();

    const event = await awardToUser({ req, recipientUserId: reply.userId, sourceType: 'thread_reply', sourceId: reply.id, points, streakDelta, note });
    res.json({ success: true, data: { reply, achievement: event } });
  } catch (error) {
    console.error('awardThreadReply error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.awardChatMessage = async (req, res) => {
  try {
    if (!['teacher','admin','super_admin'].includes(req.user.role)) return res.status(403).json({ success: false, message: 'Only teachers/admins can award points' });
    const message = await ChatMessage.findByPk(req.params.messageId);
    if (!message) return res.status(404).json({ success: false, message: 'Message not found' });
    const { points = 0, streakDelta = 0, note } = req.body;

    message.pointsAwarded = (message.pointsAwarded || 0) + Number(points || 0);
    message.streakAwarded = (message.streakAwarded || 0) + Number(streakDelta || 0);
    await message.save();

    const event = await awardToUser({ req, recipientUserId: message.senderId, sourceType: 'chat_message', sourceId: message.id, points, streakDelta, note });
    res.json({ success: true, data: { message, achievement: event } });
  } catch (error) {
    console.error('awardChatMessage error:', error);
    res.status(error.statusCode || 500).json({ success: false, message: error.message });
  }
};

exports.reactToMessage = async (req, res) => {
  try {
    if (!['teacher','admin','super_admin'].includes(req.user.role)) return res.status(403).json({ success: false, message: 'Only staff can react to messages' });
    const message = await ChatMessage.findOne({ where: { id: req.params.messageId, schoolCode: schoolCodeOf(req) }, include: [{ model: User, as: 'Sender', attributes: ['id','name','role'] }] });
    if (!message) return res.status(404).json({ success: false, message: 'Message not found' });
    const emoji = String(req.body?.emoji || '👍').slice(0, 8);
    const metadata = message.metadata || {};
    const reactions = metadata.reactions || {};
    const list = Array.isArray(reactions[emoji]) ? reactions[emoji] : [];
    const uid = Number(req.user.id);
    reactions[emoji] = list.includes(uid) ? list.filter(id => Number(id) !== uid) : [...list, uid];
    message.metadata = { ...metadata, reactions };
    await message.save();
    res.json({ success: true, data: message });
  } catch (error) {
    console.error('reactToMessage error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.listGroupMembers = async (req, res) => {
  try {
    const groupId = Number(req.params.groupId);
    const member = await ChatGroupMember.findOne({ where: { groupId, userId: req.user.id } });
    if (!member && !canManageSchool(req)) return res.status(403).json({ success: false, message: 'Not a group member' });
    const members = await ChatGroupMember.findAll({ where: { groupId }, include: [{ model: User, attributes: ['id','name','email','role','profileImage'] }], order: [['role','ASC'], ['createdAt','ASC']] });
    res.json({ success: true, data: members });
  } catch (error) {
    console.error('listGroupMembers error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.listAvailableMembers = async (req, res) => {
  try {
    const where = { schoolCode: schoolCodeOf(req), isActive: true, role: { [Op.in]: ['teacher','student'] } };
    let users = await User.findAll({ where, attributes: ['id','name','email','role','profileImage'], include: [{ model: Student, required: false, attributes: ['id','classId','grade'] }, { model: Teacher, required: false, attributes: ['id','classId','subjects'] }], order: [['role','ASC'], ['name','ASC']] });

    if (req.user.role === 'teacher' && !canManageSchool(req)) {
      const allowedClassIds = await getTeacherAllowedClassIds(req.user.id);
      users = users.filter(u => {
        if (Number(u.id) === Number(req.user.id)) return true;
        if (u.role === 'teacher') return true;
        const classId = u.Student?.classId;
        return Boolean(classId && allowedClassIds.includes(Number(classId)));
      });
    }

    const classIds = [...new Set(users.map(u => u.Student?.classId || u.Teacher?.classId).filter(Boolean).map(Number))];
    const classes = classIds.length ? await Class.findAll({ where: { id: { [Op.in]: classIds }, schoolCode: schoolCodeOf(req) }, attributes: ['id','name','grade','stream'] }) : [];
    const classMap = new Map(classes.map(c => [Number(c.id), c]));

    res.json({ success: true, data: users.map(u => {
      const row = u.toJSON();
      const classId = row.Student?.classId || row.Teacher?.classId || null;
      const c = classId ? classMap.get(Number(classId)) : null;
      row.classId = classId;
      row.className = c?.name || c?.grade || row.Student?.grade || '';
      delete row.Student;
      delete row.Teacher;
      return row;
    }) });
  } catch (error) {
    console.error('listAvailableMembers error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.updateGroupMembers = async (req, res) => {
  try {
    const groupId = Number(req.params.groupId);
    const group = await ChatGroup.findOne({ where: { id: groupId, schoolCode: schoolCodeOf(req), isActive: true } });
    if (!group) return res.status(404).json({ success: false, message: 'Group not found' });
    const manager = await ensureChatGroupManager(req, groupId);
    if (!manager) return res.status(403).json({ success: false, message: 'Only teacher/admin group managers can manage members' });
    const memberUserIds = Array.isArray(req.body?.memberUserIds) ? req.body.memberUserIds.map(Number).filter(Boolean) : [];
    const keep = new Set([Number(group.createdBy), Number(req.user.id), ...memberUserIds]);
    if (!(await ensureTeacherCanAddUsers(req, [...keep]))) {
      return res.status(403).json({ success: false, message: 'Teachers can only manage teachers and students from their assigned class/subject' });
    }
    const users = await User.findAll({ where: { id: { [Op.in]: [...keep] }, schoolCode: schoolCodeOf(req), isActive: true, role: { [Op.in]: ['teacher','student'] } }, attributes: ['id','role'] });
    await ChatGroupMember.destroy({ where: { groupId, userId: { [Op.notIn]: users.map(u => u.id) } } });
    for (const u of users) {
      await ChatGroupMember.findOrCreate({ where: { groupId, userId: u.id }, defaults: { role: u.id === group.createdBy ? 'owner' : u.role } });
    }
    const members = await ChatGroupMember.findAll({ where: { groupId }, include: [{ model: User, attributes: ['id','name','email','role','profileImage'] }] });
    res.json({ success: true, data: members });
  } catch (error) {
    console.error('updateGroupMembers error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};


exports.pinThreadReply = async (req, res) => {
  try {
    if (!['teacher','admin','super_admin'].includes(req.user.role)) return res.status(403).json({ success: false, message: 'Only teachers/admins can pin replies' });
    const reply = await ThreadReply.findByPk(req.params.replyId, { include: [{ model: User, as: 'Author', attributes: ['id','name','role','profileImage'] }] });
    if (!reply) return res.status(404).json({ success: false, message: 'Reply not found' });
    const thread = await ClassroomThread.findOne({ where: { id: reply.threadId, schoolCode: schoolCodeOf(req) } });
    if (!thread) return res.status(404).json({ success: false, message: 'Thread not found' });
    const metadata = reply.metadata || {};
    reply.metadata = { ...metadata, isPinned: req.body?.isPinned === undefined ? !metadata.isPinned : Boolean(req.body.isPinned), pinnedBy: req.user.id, pinnedAt: new Date().toISOString() };
    await reply.save();
    res.json({ success: true, data: reply });
  } catch (error) {
    console.error('pinThreadReply error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.uploadAttachment = async (req, res) => {
  try {
    const uploadRoot = path.join(__dirname, '../../uploads/chat');
    if (!fs.existsSync(uploadRoot)) fs.mkdirSync(uploadRoot, { recursive: true });

    let file = req.file || null;
    if (!file && req.files) {
      file = req.files.file || req.files.attachment || req.files.upload || null;
      if (Array.isArray(file)) file = file[0];
    }
    if (Array.isArray(req.files) && req.files.length) file = req.files[0];
    if (!file) return res.status(400).json({ success: false, message: 'No file uploaded' });

    const originalName = file.originalname || file.name || file.filename || 'attachment';
    const safeExt = path.extname(originalName).toLowerCase().replace(/[^.a-z0-9]/g, '') || '';
    const safeBase = path.basename(originalName, safeExt).replace(/[^a-zA-Z0-9_-]/g, '-').slice(0, 40) || 'attachment';
    const filename = `chat-${req.user.id}-${Date.now()}-${Math.round(Math.random() * 1e9)}-${safeBase}${safeExt}`;
    const dest = path.join(uploadRoot, filename);

    if (file.mv) {
      await file.mv(dest);
    } else if (file.path && fs.existsSync(file.path)) {
      fs.copyFileSync(file.path, dest);
    } else if (file.tempFilePath && fs.existsSync(file.tempFilePath)) {
      fs.copyFileSync(file.tempFilePath, dest);
    } else if (file.buffer) {
      fs.writeFileSync(dest, file.buffer);
    } else {
      return res.status(400).json({ success: false, message: 'Attachment file could not be read' });
    }

    const relativeUrl = `/uploads/chat/${filename}`;
    const proto = req.get('x-forwarded-proto') || req.protocol || 'https';
    const safeProto = req.get('host')?.includes('onrender.com') ? 'https' : proto;
    res.status(201).json({ success: true, data: {
      url: relativeUrl,
      secureUrl: `${safeProto}://${req.get('host')}${relativeUrl}`,
      name: originalName,
      mimeType: file.mimetype || file.type || 'application/octet-stream',
      size: file.size || (fs.statSync(dest).size || 0)
    } });
  } catch (error) {
    console.error('uploadAttachment error:', error);
    res.status(500).json({ success: false, message: error.message || 'Attachment upload failed' });
  }
};

exports.myAchievements = async (req, res) => {
  try {
    const events = await AchievementEvent.findAll({
      where: { schoolCode: schoolCodeOf(req), userId: req.user.id },
      order: [['createdAt', 'DESC']],
      limit: 50
    });
    const totals = events.reduce((acc, e) => {
      acc.points += e.points || 0;
      acc.streak += e.streakDelta || 0;
      return acc;
    }, { points: 0, streak: 0 });
    res.json({ success: true, data: { totals, events } });
  } catch (error) {
    console.error('myAchievements error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};


exports.updateDepartment = async (req, res) => {
  try {
    if (!canManageSchool(req)) return res.status(403).json({ success: false, message: 'Only admin can update departments' });
    const departmentId = Number(req.params.departmentId);
    const { name, description, headTeacherId = null, teacherIds = [] } = req.body;

    const department = await Department.findOne({ where: { id: departmentId, schoolCode: schoolCodeOf(req) } });
    if (!department) return res.status(404).json({ success: false, message: 'Department not found' });

    if (name) department.name = name;
    if (description !== undefined) department.description = description;
    department.headTeacherId = headTeacherId || null;
    await department.save();

    if (Array.isArray(teacherIds)) {
      await DepartmentMember.destroy({ where: { departmentId } });
      const group = await ChatGroup.findOne({ where: { departmentId: department.id, type: 'department' } });

      if (group) {
        group.name = `${department.name} Department`;
        group.description = department.description || `${department.name} department group`;
        await group.save();
        await ChatGroupMember.destroy({ where: { groupId: group.id } });
      }

      for (const teacherId of teacherIds) {
        const teacher = await Teacher.findByPk(teacherId);
        if (!teacher) continue;
        const isHead = Number(teacherId) === Number(headTeacherId);
        await DepartmentMember.create({ departmentId, teacherId, role: isHead ? 'head' : 'member' });
        if (group) await ChatGroupMember.create({ groupId: group.id, userId: teacher.userId, role: isHead ? 'admin' : 'member' });
      }
    }

    res.json({ success: true, data: department });
  } catch (error) {
    console.error('updateDepartment error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.deleteDepartment = async (req, res) => {
  try {
    if (!canManageSchool(req)) return res.status(403).json({ success: false, message: 'Only admin can delete departments' });
    const departmentId = Number(req.params.departmentId);
    const department = await Department.findOne({ where: { id: departmentId, schoolCode: schoolCodeOf(req) } });
    if (!department) return res.status(404).json({ success: false, message: 'Department not found' });
    department.isActive = false;
    await department.save();

    await ChatGroup.update({ isActive: false }, { where: { departmentId: department.id, type: 'department' } });
    res.json({ success: true, message: 'Department archived' });
  } catch (error) {
    console.error('deleteDepartment error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};


exports.getDepartmentGroup = async (req, res) => {
  try {
    if (!canManageSchool(req)) return res.status(403).json({ success: false, message: 'Only admin can view department groups' });
    const departmentId = Number(req.params.departmentId);
    const department = await Department.findOne({ where: { id: departmentId, schoolCode: schoolCodeOf(req), isActive: true } });
    if (!department) return res.status(404).json({ success: false, message: 'Department not found' });

    const group = await ChatGroup.findOne({ where: { departmentId, schoolCode: schoolCodeOf(req), type: 'department', isActive: true } });
    if (!group) return res.status(404).json({ success: false, message: 'Department group chat not found' });

    const messages = await ChatMessage.findAll({
      where: { schoolCode: schoolCodeOf(req), groupId: group.id },
      include: [{ model: User, as: 'Sender', attributes: ['id','name','role','profileImage'] }],
      order: [['createdAt', 'ASC']],
      limit: 150
    });

    const members = await ChatGroupMember.findAll({
      where: { groupId: group.id },
      include: [{ model: User, attributes: ['id','name','role','profileImage','email'] }]
    });

    const head = await DepartmentMember.findOne({
      where: { departmentId, role: 'head' },
      include: [{ model: Teacher, include: [{ model: User, attributes: ['id','name','email','profileImage'] }] }]
    });

    res.json({ success: true, data: { department, group: { ...group.toJSON(), headName: head?.Teacher?.User?.name || 'Not assigned' }, members, messages } });
  } catch (error) {
    console.error('getDepartmentGroup error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};
