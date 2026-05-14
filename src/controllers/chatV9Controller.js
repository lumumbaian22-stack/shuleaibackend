const { Op } = require('sequelize');
const {
  User, Teacher, Student, Class,
  Department, DepartmentMember,
  ChatGroup, ChatGroupMember, ChatMessage,
  ClassroomThread, ThreadReply, AchievementEvent, TeacherSubjectAssignment
} = require('../models');

const v9Presence = new Map();
const v9Typing = new Map();
function nowIso() { return new Date().toISOString(); }
function readMeta(obj) { return obj && typeof obj === 'object' ? obj : {}; }
function mergeMeta(row, extra) { row.metadata = { ...(readMeta(row.metadata)), ...(extra || {}) }; }
function userPublic(u) { return u ? { id:u.id, name:u.name, role:u.role, profileImage:u.profileImage, email:u.email } : null; }


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
  const classItem = await Class.findOne({ where: { id: classId, schoolCode } });
  const names = classLookupNames(classItem, null);
  const where = names.length
    ? { [Op.or]: [{ classId }, { grade: { [Op.in]: names } }] }
    : { classId };
  where.status = { [Op.ne]: 'inactive' };
  const students = await (Student.unscoped ? Student.unscoped() : Student).findAll({
    where,
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


async function getClassRecordForTeacher(teacher, schoolCode) {
  if (!teacher) return null;
  if (teacher.classId) {
    const byId = await Class.findOne({ where: { id: teacher.classId, schoolCode, isActive: true } });
    if (byId) return byId;
  }
  if (teacher.classTeacher) {
    return Class.findOne({
      where: {
        schoolCode,
        isActive: true,
        [Op.or]: [
          { name: teacher.classTeacher },
          { grade: teacher.classTeacher },
          { name: { [Op.iLike]: `%${teacher.classTeacher}%` } },
          { grade: { [Op.iLike]: `%${teacher.classTeacher}%` } }
        ]
      }
    });
  }
  return null;
}

function classLookupNames(classItem, teacher) {
  return [...new Set([
    classItem?.name,
    classItem?.grade,
    classItem?.stream ? `${classItem?.grade || ''} ${classItem.stream}`.trim() : '',
    classItem?.stream ? `${classItem?.name || ''} ${classItem.stream}`.trim() : '',
    teacher?.classTeacher
  ].filter(Boolean))];
}

async function getTeacherClassStudents(teacher, schoolCode) {
  const classItem = await getClassRecordForTeacher(teacher, schoolCode);
  const names = classLookupNames(classItem, teacher);
  const where = { status: { [Op.ne]: 'inactive' } };
  if (classItem?.id && names.length) {
    where[Op.or] = [{ classId: classItem.id }, { grade: { [Op.in]: names } }];
  } else if (classItem?.id) {
    where.classId = classItem.id;
  } else if (names.length) {
    where.grade = { [Op.in]: names };
  } else {
    return [];
  }
  return (Student.unscoped ? Student.unscoped() : Student).findAll({
    where,
    include: [{ model: User, attributes: ['id','name','email','role','profileImage'], where: { schoolCode, role: 'student', isActive: true } }],
    limit: 1000
  });
}

async function getAllowedTeacherGroupUsers(req) {
  const schoolCode = schoolCodeOf(req);
  if (canManageSchool(req)) {
    return User.findAll({
      where: { schoolCode, isActive: true, role: { [Op.in]: ['teacher','student'] } },
      attributes: ['id','name','email','role','profileImage'],
      include: [
        { model: Teacher, required: false, attributes: ['id','classId','subjects','classTeacher'] },
        { model: Student, required: false, attributes: ['id','classId','grade'] }
      ],
      order: [['role','ASC'], ['name','ASC']]
    });
  }

  if (req.user.role !== 'teacher') return [];
  const teacher = await getTeacherProfile(req.user.id);
  if (!teacher) return [];
  const classItem = await getClassRecordForTeacher(teacher, schoolCode);
  const students = await getTeacherClassStudents(teacher, schoolCode);

  const subjectList = Array.isArray(teacher.subjects) ? teacher.subjects.map(s => String(s).toLowerCase()) : [];
  const assignmentWhere = {};
  if (classItem?.id) assignmentWhere.classId = classItem.id;
  const assignments = classItem?.id ? await TeacherSubjectAssignment.findAll({ where: assignmentWhere }) : [];
  const peerTeacherIds = new Set();
  assignments.forEach(a => {
    if (!subjectList.length || subjectList.includes(String(a.subject || '').toLowerCase())) peerTeacherIds.add(Number(a.teacherId));
  });
  peerTeacherIds.add(Number(teacher.id));

  let peerTeachers = [];
  if (peerTeacherIds.size) {
    peerTeachers = await Teacher.findAll({
      where: { id: { [Op.in]: [...peerTeacherIds] } },
      include: [{ model: User, attributes: ['id','name','email','role','profileImage'], where: { schoolCode, role: 'teacher', isActive: true } }]
    });
  }

  const users = [];
  for (const t of peerTeachers) if (t.User) users.push({ ...t.User.toJSON(), className: classItem?.name || teacher.classTeacher || '', subjectScope: subjectList.join(', ') });
  for (const st of students) if (st.User) users.push({ ...st.User.toJSON(), className: classItem?.name || st.grade || '', studentId: st.id });
  const seen = new Set();
  return users.filter(u => { if (seen.has(Number(u.id))) return false; seen.add(Number(u.id)); return true; });
}

async function allowedTeacherGroupUserIds(req) {
  const users = await getAllowedTeacherGroupUsers(req);
  return new Set(users.map(u => Number(u.id)));
}

async function ensureCreatorMembership(group, userId) {
  if (!group || !userId) return null;
  let member = await ChatGroupMember.findOne({ where: { groupId: group.id, userId } });
  if (!member && Number(group.createdBy) === Number(userId)) {
    member = await ChatGroupMember.create({ groupId: group.id, userId, role: 'owner' });
  }
  return member;
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
    const teachers = await User.findAll({
      where: { schoolCode: schoolCodeOf(req), role: 'teacher', isActive: true },
      attributes: ['id','name','email','phone','role','profileImage'],
      include: [{ model: Teacher }]
    });
    res.json({ success: true, data: teachers });
  } catch (error) {
    console.error('listTeacherDirectory error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.listTeacherGroups = async (req, res) => {
  try {
    await ensureStaffRoom(req);
    const ownedGroups = await ChatGroup.findAll({ where: { schoolCode: schoolCodeOf(req), createdBy: req.user.id, isActive: true } });
    for (const group of ownedGroups) await ensureCreatorMembership(group, req.user.id);

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
    if (!['teacher','admin','super_admin'].includes(req.user.role)) return res.status(403).json({ success: false, message: 'Not allowed' });
    const { name, description, type = 'project', memberUserIds = [] } = req.body;
    if (!name) return res.status(400).json({ success: false, message: 'Group name is required' });

    const group = await ChatGroup.create({ schoolCode: schoolCodeOf(req), name, description, type, createdBy: req.user.id });
    await ChatGroupMember.create({ groupId: group.id, userId: req.user.id, role: 'owner' });
    const allowedIds = await allowedTeacherGroupUserIds(req);
    for (const userId of memberUserIds.map(Number).filter(Boolean)) {
      if (!allowedIds.has(Number(userId))) continue;
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
  if (req.user.role === 'teacher') return otherUser.role === 'teacher';
  if (req.user.role === 'student') {
    if (otherUser.role !== 'student') return false;
    const meStudent = await getStudentProfile(req.user.id);
    const otherStudent = await getStudentProfile(otherUser.id);
    return Boolean(meStudent?.classId && otherStudent?.classId && Number(meStudent.classId) === Number(otherStudent.classId));
  }
  return canManageSchool(req);
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
    for (const m of messages) {
      if (Number(m.receiverId) === Number(req.user.id) && !m.isRead) {
        const meta = readMeta(m.metadata);
        const readBy = { ...(meta.readBy || {}), [req.user.id]: nowIso() };
        m.isRead = true;
        m.metadata = { ...meta, readBy, deliveredTo: { ...(meta.deliveredTo || {}), [req.user.id]: meta.deliveredTo?.[req.user.id] || nowIso() } };
        await m.save();
      }
    }
    res.json({ success: true, data: messages });
  } catch (error) {
    console.error('getDirectMessages error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.sendDirectMessage = async (req, res) => {
  try {
    const { receiverId, content, attachmentUrl, attachment, messageType, replyToMessageId } = req.body;
    if (!receiverId || !content) return res.status(400).json({ success: false, message: 'receiverId and content are required' });
    const other = await User.findOne({ where: { id: receiverId, schoolCode: schoolCodeOf(req), isActive: true } });
    if (!(await canDirectMessage(req, other))) return res.status(404).json({ success: false, message: 'Contact not found or not allowed' });

    const message = await ChatMessage.create({
      schoolCode: schoolCodeOf(req),
      senderId: req.user.id,
      receiverId,
      content,
      attachmentUrl: attachmentUrl || null,
      messageType: messageType || (attachment?.mimeType?.startsWith?.('audio/') ? 'voice' : (attachmentUrl ? 'file' : 'text')),
      metadata: { ...(attachment ? { attachmentName: attachment.name, attachmentType: attachment.mimeType, attachmentSize: attachment.size } : {}), ...(replyToMessageId ? { replyToMessageId:Number(replyToMessageId) } : {}), deliveredTo: { [receiverId]: null } }
    });
    res.status(201).json({ success: true, data: message });
  } catch (error) {
    console.error('sendDirectMessage error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.getGroupMessages = async (req, res) => {
  try {
    const groupId = Number(req.params.groupId);
    const group = await ChatGroup.findOne({ where: { id: groupId, schoolCode: schoolCodeOf(req), isActive: true } });
    if (!group) return res.status(404).json({ success: false, message: 'Group not found' });
    const member = await ensureCreatorMembership(group, req.user.id);
    if (!member && !canManageSchool(req)) return res.status(403).json({ success: false, message: 'Not a group member' });

    const messages = await ChatMessage.findAll({
      where: { schoolCode: schoolCodeOf(req), groupId },
      include: [{ model: User, as: 'Sender', attributes: ['id','name','role','profileImage'] }],
      order: [['createdAt', 'ASC']],
      limit: 100
    });
    for (const m of messages) {
      if (Number(m.senderId) !== Number(req.user.id)) {
        const meta = readMeta(m.metadata);
        const readBy = { ...(meta.readBy || {}), [req.user.id]: nowIso() };
        const deliveredTo = { ...(meta.deliveredTo || {}), [req.user.id]: meta.deliveredTo?.[req.user.id] || nowIso() };
        m.metadata = { ...meta, readBy, deliveredTo };
        await m.save();
      }
    }
    res.json({ success: true, data: messages });
  } catch (error) {
    console.error('getGroupMessages error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.sendGroupMessage = async (req, res) => {
  try {
    const groupId = Number(req.params.groupId);
    const { content, attachmentUrl, attachment, messageType, replyToMessageId } = req.body;
    if (!content) return res.status(400).json({ success: false, message: 'content is required' });

    const group = await ChatGroup.findOne({ where: { id: groupId, schoolCode: schoolCodeOf(req), isActive: true } });
    if (!group) return res.status(404).json({ success: false, message: 'Group not found' });

    const member = await ensureCreatorMembership(group, req.user.id);
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
      messageType: messageType || (attachment?.mimeType?.startsWith?.('audio/') ? 'voice' : (attachmentUrl ? 'file' : 'text')),
      metadata: { ...(attachment ? { attachmentName: attachment.name, attachmentType: attachment.mimeType, attachmentSize: attachment.size } : {}), ...(replyToMessageId ? { replyToMessageId:Number(replyToMessageId) } : {}), deliveredTo: {} }
    });
    res.status(201).json({ success: true, data: message });
  } catch (error) {
    console.error('sendGroupMessage error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.listClassroomThreads = async (req, res) => {
  try {
    const where = { schoolCode: schoolCodeOf(req) };
    const student = req.user.role === 'student' ? await getStudentProfile(req.user.id) : null;
    if (student?.classId) where.classId = student.classId;

    const threads = await ClassroomThread.findAll({
      where,
      include: [
        { model: User, as: 'Creator', attributes: ['id','name','role','profileImage'] },
        { model: Class, attributes: ['id','name','grade','stream'] },
        { model: ThreadReply, include: [{ model: User, as: 'Author', attributes: ['id','name','role','profileImage'] }] }
      ],
      order: [['isPinned', 'DESC'], ['updatedAt', 'DESC']],
      limit: 80
    });

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
    const thread = await ClassroomThread.create({
      schoolCode: schoolCodeOf(req),
      classId: classId || student?.classId || null,
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

    const reply = await ThreadReply.create({ threadId, userId: req.user.id, parentReplyId: parentReplyId || null, content, metadata: { ...(attachmentUrl ? { attachmentUrl, attachmentName: attachment?.name, attachmentType: attachment?.mimeType, attachmentSize: attachment?.size } : {}), reactions:{}, reports:[] } });
    thread.updatedAt = new Date();
    await thread.save();
    res.status(201).json({ success: true, data: reply });
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
    const group = await ChatGroup.findOne({ where: { id: groupId, schoolCode: schoolCodeOf(req), isActive: true } });
    if (!group) return res.status(404).json({ success: false, message: 'Group not found' });
    const member = await ensureCreatorMembership(group, req.user.id);
    if (!member && !canManageSchool(req)) return res.status(403).json({ success: false, message: 'Not a group member' });
    const members = await ChatGroupMember.findAll({ where: { groupId }, include: [{ model: User, where: { role: { [Op.in]: ['teacher','student'] } }, attributes: ['id','name','email','role','profileImage'] }], order: [['role','ASC'], ['createdAt','ASC']] });
    res.json({ success: true, data: members });
  } catch (error) {
    console.error('listGroupMembers error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.listAvailableMembers = async (req, res) => {
  try {
    const users = await getAllowedTeacherGroupUsers(req);
    res.json({ success: true, data: users });
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
    const member = await ensureCreatorMembership(group, req.user.id);
    if (!canManageSchool(req) && !['owner','admin'].includes(member?.role)) return res.status(403).json({ success: false, message: 'Only group owners/admins can manage members' });
    const requestedUserIds = Array.isArray(req.body?.memberUserIds) ? req.body.memberUserIds.map(Number).filter(Boolean) : [];
    const allowedIds = await allowedTeacherGroupUserIds(req);
    const keep = new Set([Number(group.createdBy), Number(req.user.id), ...requestedUserIds.filter(id => allowedIds.has(Number(id)))]);
    const users = await User.findAll({ where: { id: { [Op.in]: [...keep] }, schoolCode: schoolCodeOf(req), isActive: true, role: { [Op.in]: ['teacher','student'] } }, attributes: ['id','role'] });
    await ChatGroupMember.destroy({ where: { groupId, userId: { [Op.notIn]: users.map(u => u.id) } } });
    for (const u of users) {
      await ChatGroupMember.findOrCreate({ where: { groupId, userId: u.id }, defaults: { role: u.id === group.createdBy ? 'owner' : (u.role === 'teacher' ? 'member' : 'student') } });
    }
    const members = await ChatGroupMember.findAll({ where: { groupId }, include: [{ model: User, attributes: ['id','name','email','role','profileImage'] }] });
    res.json({ success: true, data: members });
  } catch (error) {
    console.error('updateGroupMembers error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.uploadAttachment = async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, message: 'No file uploaded' });
    res.status(201).json({ success: true, data: {
      url: `/uploads/${req.file.filename}`,
      name: req.file.originalname,
      mimeType: req.file.mimetype,
      size: req.file.size
    } });
  } catch (error) {
    console.error('uploadAttachment error:', error);
    res.status(500).json({ success: false, message: error.message });
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


exports.markMessageRead = async (req, res) => {
  try {
    const message = await ChatMessage.findOne({ where: { id: req.params.messageId, schoolCode: schoolCodeOf(req) } });
    if (!message) return res.status(404).json({ success:false, message:'Message not found' });
    if (message.receiverId && Number(message.receiverId) !== Number(req.user.id) && Number(message.senderId) !== Number(req.user.id)) return res.status(403).json({ success:false, message:'Not allowed' });
    const meta = readMeta(message.metadata);
    message.metadata = { ...meta, readBy:{ ...(meta.readBy || {}), [req.user.id]: nowIso() } };
    if (Number(message.receiverId) === Number(req.user.id)) message.isRead = true;
    await message.save();
    res.json({ success:true, data:message });
  } catch(error) { console.error('markMessageRead error:', error); res.status(500).json({ success:false, message:error.message }); }
};

exports.reactToReply = async (req, res) => {
  try {
    const reply = await ThreadReply.findByPk(req.params.replyId);
    if (!reply) return res.status(404).json({ success:false, message:'Reply not found' });
    const thread = await ClassroomThread.findOne({ where:{ id:reply.threadId, schoolCode:schoolCodeOf(req) } });
    if (!thread) return res.status(404).json({ success:false, message:'Thread not found' });
    const emoji = String(req.body?.emoji || '👍').slice(0,8);
    const meta = readMeta(reply.metadata);
    const reactions = meta.reactions || {};
    const list = Array.isArray(reactions[emoji]) ? reactions[emoji] : [];
    const uid = Number(req.user.id);
    reactions[emoji] = list.includes(uid) ? list.filter(id => Number(id) !== uid) : [...list, uid];
    if (emoji === '👍') reply.helpfulCount = reactions[emoji].length;
    reply.metadata = { ...meta, reactions };
    await reply.save();
    res.json({ success:true, data:reply });
  } catch(error) { console.error('reactToReply error:', error); res.status(500).json({ success:false, message:error.message }); }
};

exports.reportMessage = async (req, res) => {
  try {
    const message = await ChatMessage.findOne({ where:{ id:req.params.messageId, schoolCode:schoolCodeOf(req) } });
    if (!message) return res.status(404).json({ success:false, message:'Message not found' });
    const meta = readMeta(message.metadata);
    const reports = Array.isArray(meta.reports) ? meta.reports : [];
    reports.push({ userId:req.user.id, reason:req.body?.reason || 'Reported by user', at:nowIso() });
    message.metadata = { ...meta, reports, moderationStatus:'reported' };
    await message.save();
    res.json({ success:true, data:message });
  } catch(error) { console.error('reportMessage error:', error); res.status(500).json({ success:false, message:error.message }); }
};

exports.reportReply = async (req, res) => {
  try {
    const reply = await ThreadReply.findByPk(req.params.replyId);
    if (!reply) return res.status(404).json({ success:false, message:'Reply not found' });
    const thread = await ClassroomThread.findOne({ where:{ id:reply.threadId, schoolCode:schoolCodeOf(req) } });
    if (!thread) return res.status(404).json({ success:false, message:'Thread not found' });
    const meta = readMeta(reply.metadata);
    const reports = Array.isArray(meta.reports) ? meta.reports : [];
    reports.push({ userId:req.user.id, reason:req.body?.reason || 'Reported by user', at:nowIso() });
    reply.metadata = { ...meta, reports, moderationStatus:'reported' };
    await reply.save();
    res.json({ success:true, data:reply });
  } catch(error) { console.error('reportReply error:', error); res.status(500).json({ success:false, message:error.message }); }
};

exports.updatePresence = async (req, res) => {
  const status = req.body?.status || 'online';
  v9Presence.set(Number(req.user.id), { userId:Number(req.user.id), status, at:Date.now(), name:req.user.name, role:req.user.role });
  res.json({ success:true, data:v9Presence.get(Number(req.user.id)) });
};

exports.getPresence = async (req, res) => {
  const ids = String(req.query.ids || '').split(',').map(Number).filter(Boolean);
  const now = Date.now();
  const data = ids.map(id => {
    const p = v9Presence.get(id);
    return { userId:id, status:p && now - p.at < 120000 ? p.status : 'offline', lastSeen:p?.at ? new Date(p.at).toISOString() : null };
  });
  res.json({ success:true, data });
};

exports.updateTyping = async (req, res) => {
  const scope = String(req.body?.scope || 'direct');
  const targetId = String(req.body?.targetId || '');
  const key = `${schoolCodeOf(req)}:${scope}:${targetId}`;
  const entry = { userId:Number(req.user.id), name:req.user.name, role:req.user.role, at:Date.now() };
  const list = (v9Typing.get(key) || []).filter(x => Date.now() - x.at < 10000 && Number(x.userId) !== Number(req.user.id));
  list.push(entry);
  v9Typing.set(key, list);
  res.json({ success:true, data:entry });
};

exports.getTyping = async (req, res) => {
  const scope = String(req.query.scope || 'direct');
  const targetId = String(req.query.targetId || '');
  const key = `${schoolCodeOf(req)}:${scope}:${targetId}`;
  const list = (v9Typing.get(key) || []).filter(x => Date.now() - x.at < 10000 && Number(x.userId) !== Number(req.user.id));
  v9Typing.set(key, list);
  res.json({ success:true, data:list });
};

exports.searchMessages = async (req, res) => {
  try {
    const q = String(req.query.q || '').trim();
    if (!q) return res.json({ success:true, data:{ messages:[], threads:[], replies:[] } });
    const messages = await ChatMessage.findAll({
      where:{ schoolCode:schoolCodeOf(req), content:{ [Op.iLike]: `%${q}%` } },
      include:[{ model:User, as:'Sender', attributes:['id','name','role','profileImage'] }],
      limit:40,
      order:[['updatedAt','DESC']]
    });
    const threads = await ClassroomThread.findAll({
      where:{ schoolCode:schoolCodeOf(req), [Op.or]:[{ topic:{ [Op.iLike]: `%${q}%` } }, { content:{ [Op.iLike]: `%${q}%` } }, { subject:{ [Op.iLike]: `%${q}%` } }] },
      limit:40,
      order:[['updatedAt','DESC']]
    });
    const replies = await ThreadReply.findAll({ where:{ content:{ [Op.iLike]: `%${q}%` } }, limit:40, order:[['updatedAt','DESC']] });
    res.json({ success:true, data:{ messages, threads, replies } });
  } catch(error) { console.error('searchMessages error:', error); res.status(500).json({ success:false, message:error.message }); }
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
