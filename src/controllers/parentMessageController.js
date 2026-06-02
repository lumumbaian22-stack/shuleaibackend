const { Parent, Teacher, User, Message, Student, Class, sequelize } = require('../models');
const { Op } = require('sequelize');
const { createAlert } = require('../services/notificationService');

function meta(message) {
  const raw = message?.toJSON ? message.toJSON() : (message || {});
  return raw.metadata || {};
}

function schoolMatches(message, schoolCode) {
  const m = meta(message);
  return !m.schoolCode || String(m.schoolCode) === String(schoolCode);
}

async function getParentProfile(userId) {
  return Parent.findOne({ where: { userId } });
}

async function verifyParentChild(parent, student) {
  if (!parent || !student) return false;
  if (typeof parent.hasStudent === 'function') return parent.hasStudent(student).catch(() => false);
  const rows = await sequelize.query(
    'SELECT 1 FROM "StudentParents" WHERE "parentId" = :parentId AND "studentId" = :studentId LIMIT 1',
    { replacements: { parentId: parent.id, studentId: student.id }, type: sequelize.QueryTypes.SELECT }
  ).catch(() => []);
  return rows.length > 0;
}

async function findStudentForParent({ parent, studentId, schoolCode }) {
  const student = await Student.findByPk(studentId, { include: [{ model: User, attributes: ['id', 'name', 'schoolCode'] }] });
  if (!student || student.User?.schoolCode !== schoolCode) return null;
  const ok = await verifyParentChild(parent, student);
  return ok ? student : null;
}

async function findClassTeacherForStudent(student, schoolCode) {
  const rows = await sequelize.query(
    `SELECT t."id" AS "teacherId", u."id" AS "userId", u."name", u."email", c."id" AS "classId", c."name" AS "className", c."grade"
       FROM "Classes" c
       JOIN "Teachers" t ON (t."id" = c."teacherId" OR t."classId" = c."id")
       JOIN "Users" u ON u."id" = t."userId"
      WHERE c."schoolCode" = :schoolCode
        AND u."schoolCode" = :schoolCode
        AND u."role" = 'teacher'
        AND u."isActive" = true
        AND (:classId::integer IS NULL OR c."id" = :classId)
      ORDER BY CASE WHEN t."id" = c."teacherId" THEN 0 ELSE 1 END
      LIMIT 1`,
    { replacements: { schoolCode, classId: student.classId || null }, type: sequelize.QueryTypes.SELECT }
  ).catch(() => []);
  if (rows.length) return rows[0];
  if (!student.grade && !student.className) return null;
  const fallbackRows = await sequelize.query(
    `SELECT t."id" AS "teacherId", u."id" AS "userId", u."name", u."email", c."id" AS "classId", c."name" AS "className", c."grade"
       FROM "Classes" c
       JOIN "Teachers" t ON (t."id" = c."teacherId" OR t."classId" = c."id")
       JOIN "Users" u ON u."id" = t."userId"
      WHERE c."schoolCode" = :schoolCode
        AND u."schoolCode" = :schoolCode
        AND u."role" = 'teacher'
        AND u."isActive" = true
        AND (LOWER(COALESCE(c."grade",'')) = LOWER(:grade) OR LOWER(COALESCE(c."name",'')) = LOWER(:className))
      ORDER BY CASE WHEN t."id" = c."teacherId" THEN 0 ELSE 1 END
      LIMIT 1`,
    { replacements: { schoolCode, grade: student.grade || '', className: student.className || student.grade || '' }, type: sequelize.QueryTypes.SELECT }
  ).catch(() => []);
  return fallbackRows[0] || null;
}

async function findSchoolAdmin(schoolCode) {
  return User.findOne({ where: { role: 'admin', schoolCode, isActive: true }, order: [['createdAt', 'ASC']] });
}

function buildConversationKey({ type, schoolCode, parentUserId, studentId, classId, receiverId }) {
  return [schoolCode, type, parentUserId, studentId || 'student', classId || 'class', receiverId].join(':');
}

exports.sendMessage = async (req, res) => {
  try {
    const { studentId, message, recipientType } = req.body || {};
    const cleanMessage = String(message || '').trim();
    if (!studentId) return res.status(400).json({ success: false, message: 'Student is required' });
    if (!cleanMessage) return res.status(400).json({ success: false, message: 'Message is required' });

    const parent = await getParentProfile(req.user.id);
    if (!parent) return res.status(404).json({ success: false, message: 'Parent not found' });

    const student = await findStudentForParent({ parent, studentId, schoolCode: req.user.schoolCode });
    if (!student) return res.status(403).json({ success: false, message: 'Not your child or child is outside your school' });

    let recipientId = null;
    let recipientRole = null;
    let recipientName = null;
    let conversationType = null;
    let classId = student.classId || null;
    let classTeacher = null;

    if (recipientType === 'teacher') {
      classTeacher = await findClassTeacherForStudent(student, req.user.schoolCode);
      if (!classTeacher?.userId) {
        return res.status(404).json({ success: false, message: 'Class teacher has not been assigned yet. Please message the school admin.', fallbackTarget: 'admin' });
      }
      recipientId = classTeacher.userId;
      recipientRole = 'teacher';
      recipientName = classTeacher.name;
      conversationType = 'parent_class_teacher';
      classId = classTeacher.classId || classId;
    } else if (recipientType === 'admin') {
      const admin = await findSchoolAdmin(req.user.schoolCode);
      if (!admin) return res.status(404).json({ success: false, message: 'School admin not found' });
      recipientId = admin.id;
      recipientRole = 'admin';
      recipientName = admin.name;
      conversationType = 'parent_admin';
    } else {
      return res.status(400).json({ success: false, message: 'Invalid recipient type' });
    }

    const conversationKey = buildConversationKey({ type: conversationType, schoolCode: req.user.schoolCode, parentUserId: req.user.id, studentId: student.id, classId, receiverId: recipientId });
    const newMessage = await Message.create({
      senderId: req.user.id,
      receiverId: recipientId,
      content: cleanMessage,
      metadata: {
        schoolCode: req.user.schoolCode,
        conversationType,
        conversationKey,
        parentUserId: req.user.id,
        parentProfileId: parent.id,
        studentId: student.id,
        studentName: student.User?.name || student.name || 'Student',
        studentGrade: student.grade,
        classId,
        className: classTeacher?.className || student.className || student.grade || null,
        classTeacherUserId: conversationType === 'parent_class_teacher' ? recipientId : null,
        adminUserId: conversationType === 'parent_admin' ? recipientId : null,
        recipientType,
        actualRecipientType: recipientRole
      }
    });

    await createAlert({
      userId: recipientId,
      role: recipientRole,
      type: 'message',
      severity: 'info',
      title: `Message from parent of ${student.User?.name || 'student'}`,
      message: cleanMessage.substring(0, 100) + (cleanMessage.length > 100 ? '...' : ''),
      data: { schoolCode: req.user.schoolCode, scope: 'user', targetUserIds: [recipientId], conversationType, conversationKey, studentId: student.id, classId, messageId: newMessage.id }
    });

    if (global.io) {
      global.io.to(`user-${recipientId}`).emit('new-parent-message', { messageId: newMessage.id, from: req.user.id, fromName: req.user.name, fromRole: 'parent', studentName: student.User?.name, studentGrade: student.grade, content: cleanMessage, conversationType, conversationKey, timestamp: new Date() });
    }

    res.status(201).json({ success: true, message: 'Message sent successfully', data: { id: newMessage.id, conversationKey, recipient: recipientName, recipientType: recipientRole, requestedRecipientType: recipientType, recipientId, sentAt: newMessage.createdAt } });
  } catch (error) {
    console.error('Send parent message error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

function groupConversation(messages, currentUserId) {
  const conversations = {};
  for (const msg of messages) {
    const m = meta(msg);
    const otherUserId = Number(msg.senderId) === Number(currentUserId) ? msg.receiverId : msg.senderId;
    const otherUser = Number(msg.senderId) === Number(currentUserId) ? msg.Receiver : msg.Sender;
    const key = m.conversationKey || `${m.schoolCode || ''}:${m.conversationType || 'direct'}:${otherUserId}:${m.studentId || ''}`;
    if (!conversations[key]) {
      conversations[key] = { conversationKey: key, userId: otherUserId, userName: otherUser?.name || 'Unknown', userRole: otherUser?.role || 'unknown', conversationType: m.conversationType || 'direct', studentId: m.studentId || null, studentName: m.studentName || null, studentGrade: m.studentGrade || null, classId: m.classId || null, className: m.className || null, lastMessage: msg.content, lastMessageTime: msg.createdAt, unreadCount: 0, messages: [] };
    }
    if (Number(msg.receiverId) === Number(currentUserId) && !msg.isRead) conversations[key].unreadCount += 1;
    conversations[key].messages.push(msg);
  }
  return Object.values(conversations).sort((a, b) => new Date(b.lastMessageTime) - new Date(a.lastMessageTime));
}

exports.getConversations = async (req, res) => {
  try {
    const messages = await Message.findAll({
      where: { [Op.or]: [{ senderId: req.user.id }, { receiverId: req.user.id }] },
      include: [{ model: User, as: 'Sender', attributes: ['id', 'name', 'role'] }, { model: User, as: 'Receiver', attributes: ['id', 'name', 'role'] }],
      order: [['createdAt', 'DESC']]
    });
    const scoped = messages.filter(m => schoolMatches(m, req.user.schoolCode) && ['parent_class_teacher', 'parent_admin'].includes(meta(m).conversationType));
    res.json({ success: true, data: groupConversation(scoped, req.user.id) });
  } catch (error) {
    console.error('Get parent conversations error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.getMessages = async (req, res) => {
  try {
    const { otherUserId } = req.params;
    const messages = await Message.findAll({
      where: { [Op.or]: [{ senderId: req.user.id, receiverId: otherUserId }, { senderId: otherUserId, receiverId: req.user.id }] },
      include: [{ model: User, as: 'Sender', attributes: ['id', 'name', 'role'] }, { model: User, as: 'Receiver', attributes: ['id', 'name', 'role'] }],
      order: [['createdAt', 'ASC']]
    });
    const scoped = messages.filter(m => schoolMatches(m, req.user.schoolCode) && ['parent_class_teacher', 'parent_admin'].includes(meta(m).conversationType));
    await Message.update({ isRead: true, readAt: new Date() }, { where: { senderId: otherUserId, receiverId: req.user.id, isRead: false } });
    res.json({ success: true, data: scoped });
  } catch (error) {
    console.error('Get parent messages error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.replyToParent = async (req, res) => {
  try {
    const { parentId, message, originalMessageId } = req.body || {};
    const cleanMessage = String(message || '').trim();
    if (!parentId || !cleanMessage) return res.status(400).json({ success: false, message: 'Parent ID and message are required' });
    const original = originalMessageId ? await Message.findByPk(originalMessageId).catch(() => null) : null;
    const originalMeta = meta(original);
    const reply = await Message.create({
      senderId: req.user.id,
      receiverId: parentId,
      content: cleanMessage,
      metadata: { ...originalMeta, schoolCode: req.user.schoolCode, inReplyTo: originalMessageId || null, senderRole: req.user.role, type: `${req.user.role}_reply` }
    });
    await createAlert({ userId: parentId, role: 'parent', type: 'message', severity: 'info', title: `Reply from ${req.user.name}`, message: cleanMessage.substring(0, 100), data: { schoolCode: req.user.schoolCode, scope: 'user', targetUserIds: [parentId], conversationType: originalMeta.conversationType || 'parent_reply', conversationKey: originalMeta.conversationKey || null, messageId: reply.id } });
    if (global.io) global.io.to(`user-${parentId}`).emit('new-message', { from: req.user.id, fromName: req.user.name, content: cleanMessage, timestamp: new Date() });
    res.status(201).json({ success: true, message: 'Reply sent successfully', data: reply });
  } catch (error) {
    console.error('Reply error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.getAdminConversations = async (req, res) => {
  try {
    const messages = await Message.findAll({
      where: { [Op.or]: [{ senderId: req.user.id }, { receiverId: req.user.id }] },
      include: [{ model: User, as: 'Sender', attributes: ['id', 'name', 'role'] }, { model: User, as: 'Receiver', attributes: ['id', 'name', 'role'] }],
      order: [['createdAt', 'DESC']]
    });
    const scoped = messages.filter(m => schoolMatches(m, req.user.schoolCode) && meta(m).conversationType === 'parent_admin' && Number(meta(m).adminUserId || req.user.id) === Number(req.user.id));
    res.json({ success: true, data: groupConversation(scoped, req.user.id) });
  } catch (error) {
    console.error('Get admin parent conversations error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.getAdminMessages = async (req, res) => {
  try {
    const { parentId } = req.params;
    const messages = await Message.findAll({
      where: { [Op.or]: [{ senderId: req.user.id, receiverId: parentId }, { senderId: parentId, receiverId: req.user.id }] },
      include: [{ model: User, as: 'Sender', attributes: ['id', 'name', 'role'] }, { model: User, as: 'Receiver', attributes: ['id', 'name', 'role'] }],
      order: [['createdAt', 'ASC']]
    });
    const scoped = messages.filter(m => schoolMatches(m, req.user.schoolCode) && meta(m).conversationType === 'parent_admin' && Number(meta(m).adminUserId || req.user.id) === Number(req.user.id));
    await Message.update({ isRead: true, readAt: new Date() }, { where: { senderId: parentId, receiverId: req.user.id, isRead: false } });
    res.json({ success: true, data: scoped });
  } catch (error) {
    console.error('Get admin parent messages error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.adminReplyToParent = async (req, res) => {
  try {
    const { parentId, message, originalMessageId } = req.body || {};
    const cleanMessage = String(message || '').trim();
    if (!parentId || !cleanMessage) return res.status(400).json({ success: false, message: 'Parent ID and message are required' });
    let baseMessage = originalMessageId ? await Message.findByPk(originalMessageId).catch(() => null) : null;
    if (!baseMessage) {
      const recent = await Message.findAll({ where: { [Op.or]: [{ senderId: req.user.id, receiverId: parentId }, { senderId: parentId, receiverId: req.user.id }] }, order: [['createdAt', 'DESC']], limit: 20 });
      baseMessage = recent.find(m => schoolMatches(m, req.user.schoolCode) && meta(m).conversationType === 'parent_admin') || null;
    }
    if (!baseMessage) return res.status(403).json({ success: false, message: 'This parent-admin conversation does not belong to this school admin.' });
    const baseMeta = meta(baseMessage);
    const reply = await Message.create({ senderId: req.user.id, receiverId: parentId, content: cleanMessage, metadata: { ...baseMeta, schoolCode: req.user.schoolCode, inReplyTo: originalMessageId || baseMessage.id, type: 'admin_reply', adminUserId: req.user.id } });
    await createAlert({ userId: parentId, role: 'parent', type: 'message', severity: 'info', title: `Reply from ${req.user.name}`, message: cleanMessage.substring(0,100), data: { schoolCode: req.user.schoolCode, scope: 'user', targetUserIds: [parentId], conversationType: 'parent_admin', conversationKey: baseMeta.conversationKey, messageId: reply.id } });
    res.status(201).json({ success: true, data: reply, message: 'Reply sent successfully' });
  } catch (error) {
    console.error('Admin reply to parent error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};
