const { Op } = require('sequelize');
const {
  User, Teacher, Student, Class,
  Department, DepartmentMember,
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
  return Student.findOne({ where: { userId } });
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

    const memberships = await ChatGroupMember.findAll({
      where: { userId: req.user.id },
      include: [{ model: ChatGroup, where: { schoolCode: schoolCodeOf(req), isActive: true } }],
      order: [[ChatGroup, 'updatedAt', 'DESC']]
    });

    const groups = memberships.map(m => ({ ...m.ChatGroup.toJSON(), membershipRole: m.role, muted: m.muted }));
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
    for (const userId of memberUserIds) {
      const user = await User.findOne({ where: { id: userId, schoolCode: schoolCodeOf(req), role: 'teacher' } });
      if (user) await ChatGroupMember.findOrCreate({ where: { groupId: group.id, userId }, defaults: { role: 'member' } });
    }
    res.status(201).json({ success: true, data: group });
  } catch (error) {
    console.error('createTeacherGroup error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.getDirectMessages = async (req, res) => {
  try {
    const otherId = Number(req.params.userId);
    const other = await User.findOne({ where: { id: otherId, schoolCode: schoolCodeOf(req), role: 'teacher' } });
    if (!other) return res.status(404).json({ success: false, message: 'Teacher not found' });

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
    const { receiverId, content, attachmentUrl } = req.body;
    if (!receiverId || !content) return res.status(400).json({ success: false, message: 'receiverId and content are required' });
    const other = await User.findOne({ where: { id: receiverId, schoolCode: schoolCodeOf(req), role: 'teacher' } });
    if (!other) return res.status(404).json({ success: false, message: 'Teacher not found' });

    const message = await ChatMessage.create({
      schoolCode: schoolCodeOf(req),
      senderId: req.user.id,
      receiverId,
      content,
      attachmentUrl: attachmentUrl || null,
      messageType: attachmentUrl ? 'file' : 'text'
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
    const { content, attachmentUrl } = req.body;
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
      messageType: attachmentUrl ? 'file' : 'text'
    });
    res.status(201).json({ success: true, data: message });
  } catch (error) {
    console.error('sendGroupMessage error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.listClassroomThreads = async (req, res) => {
  try {
    const where = { schoolCode: schoolCodeOf(req), isClosed: false };
    const student = req.user.role === 'student' ? await getStudentProfile(req.user.id) : null;
    if (student?.classId) where.classId = student.classId;

    const threads = await ClassroomThread.findAll({
      where,
      include: [
        { model: User, as: 'Creator', attributes: ['id','name','role','profileImage'] },
        { model: ThreadReply, include: [{ model: User, as: 'Author', attributes: ['id','name','role','profileImage'] }] }
      ],
      order: [['isPinned', 'DESC'], ['updatedAt', 'DESC']],
      limit: 50
    });
    res.json({ success: true, data: threads });
  } catch (error) {
    console.error('listClassroomThreads error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.createClassroomThread = async (req, res) => {
  try {
    if (!['teacher','admin','super_admin'].includes(req.user.role)) return res.status(403).json({ success: false, message: 'Only teachers/admins create classroom threads' });
    const { classId, subject, topic, content, isPinned = false } = req.body;
    if (!subject || !topic || !content) return res.status(400).json({ success: false, message: 'subject, topic and content are required' });

    const teacher = req.user.role === 'teacher' ? await getTeacherProfile(req.user.id) : null;
    const thread = await ClassroomThread.create({
      schoolCode: schoolCodeOf(req),
      classId: classId || null,
      subject,
      topic,
      content,
      teacherId: teacher?.id || null,
      createdBy: req.user.id,
      isPinned
    });
    res.status(201).json({ success: true, data: thread });
  } catch (error) {
    console.error('createClassroomThread error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.replyToThread = async (req, res) => {
  try {
    const threadId = Number(req.params.threadId);
    const { content, parentReplyId } = req.body;
    if (!content) return res.status(400).json({ success: false, message: 'content is required' });

    const thread = await ClassroomThread.findOne({ where: { id: threadId, schoolCode: schoolCodeOf(req), isClosed: false } });
    if (!thread) return res.status(404).json({ success: false, message: 'Thread not found' });

    const reply = await ThreadReply.create({ threadId, userId: req.user.id, parentReplyId: parentReplyId || null, content });
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
