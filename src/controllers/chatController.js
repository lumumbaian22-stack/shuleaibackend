const { User, Teacher, Message, Student, Parent } = require('../models');
const { Op } = require('sequelize');
const { createAlert } = require('../services/notificationService');
const { literal } = require('sequelize'); // Add at top of file


// @desc    Get staff members in same school
// @route   GET /api/teacher/staff-members
// @access  Private/Teacher
exports.getStaffMembers = async (req, res) => {
    try {
        const teachers = await Teacher.findAll({
            include: [{
                model: User,
                where: { schoolCode: req.user.schoolCode, isActive: true },
                attributes: ['id', 'name', 'email', 'role']
            }]
        });
        
        const staff = teachers.map(t => ({
            id: t.User.id,
            name: t.User.name,
            role: t.User.role,
            isOnline: false,
            teacherId: t.id,
            subjects: t.subjects,
            isClassTeacher: t.classTeacher !== null
        }));
        
        const admins = await User.findAll({
            where: { schoolCode: req.user.schoolCode, role: 'admin', isActive: true },
            attributes: ['id', 'name', 'email', 'role']
        });
        
        admins.forEach(admin => {
            staff.push({
                id: admin.id,
                name: admin.name,
                role: admin.role,
                isOnline: false,
                isAdmin: true
            });
        });
        
        res.json({ success: true, data: staff });
    } catch (error) {
        console.error('Get staff members error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
};

// @desc    Send group message to all staff
// @route   POST /api/teacher/group-message
// @access  Private/Teacher
exports.sendGroupMessage = async (req, res) => {
  try {
    const { content, replyToId } = req.body;
    const teachers = await Teacher.findAll({
      include: [{ model: User, where: { schoolCode: req.user.schoolCode, isActive: true }, attributes: ['id'] }]
    });
    const admins = await User.findAll({
      where: { schoolCode: req.user.schoolCode, role: 'admin', isActive: true },
      attributes: ['id']
    });
    const recipients = [...teachers.map(t => t.User.id), ...admins.map(a => a.id)].filter(id => id !== req.user.id);
    const messages = recipients.map(recipientId => ({
      senderId: req.user.id,
      receiverId: recipientId,
      content,
      metadata: { type: 'group_message', senderName: req.user.name, replyToId },
      replyToMessageId: replyToId || null
    }));
    await Message.bulkCreate(messages);
    if (global.io) {
      recipients.forEach(recipientId => {
        global.io.to(`user-${recipientId}`).emit('new-group-message', {
          from: req.user.id,
          fromName: req.user.name,
          content,
          replyToId,
          timestamp: new Date()
        });
      });
    }
    res.status(201).json({ success: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.sendPrivateMessage = async (req, res) => {
  try {
    const { receiverId, content, replyToId } = req.body;
    const receiver = await User.findOne({ where: { id: receiverId, schoolCode: req.user.schoolCode, isActive: true } });
    if (!receiver) return res.status(404).json({ success: false, message: 'Recipient not found' });
    const message = await Message.create({
      senderId: req.user.id,
      receiverId,
      content,
      metadata: { type: 'private_message', senderName: req.user.name, replyToId },
      replyToMessageId: replyToId || null
    });
    if (global.io) {
      global.io.to(`user-${receiverId}`).emit('new-private-message', {
        from: req.user.id,
        fromName: req.user.name,
        content,
        replyToId,
        timestamp: new Date()
      });
    }
    await createAlert({
      userId: receiverId,
      role: receiver.role,
      type: 'message',
      severity: 'info',
      title: `New message from ${req.user.name}`,
      message: content.substring(0, 100)
    });
    res.status(201).json({ success: true, data: message });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.getMessage = async (req, res) => {
  try {
    const { id } = req.params;
    const message = await Message.findByPk(id, {
      include: [{ model: User, as: 'Sender', attributes: ['id', 'name'] }]
    });
    res.json({ success: true, data: message });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Send private message to specific staff
// @route   POST /api/teacher/private-message
// @access  Private/Teacher
exports.sendPrivateMessage = async (req, res) => {
    try {
        const { receiverId, content } = req.body;
        
        const receiver = await User.findOne({
            where: { id: receiverId, schoolCode: req.user.schoolCode, isActive: true }
        });
        
        if (!receiver) {
            return res.status(404).json({ success: false, message: 'Recipient not found' });
        }
        
        const message = await Message.create({
            senderId: req.user.id,
            receiverId: receiverId,
            content: content,
            metadata: { type: 'private_message', senderName: req.user.name }
        });
        
        if (global.io) {
            global.io.to(`user-${receiverId}`).emit('new-private-message', {
                from: req.user.id,
                fromName: req.user.name,
                content: content,
                timestamp: new Date(),
                type: 'private'
            });
        }
        
        await createAlert({
            userId: receiverId,
            role: receiver.role,
            type: 'message',
            severity: 'info',
            title: `New message from ${req.user.name}`,
            message: content.substring(0, 100)
        });
        
        res.status(201).json({ success: true, data: message });
    } catch (error) {
        console.error('Send private message error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
};

// @desc    Get messages with specific user
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
        
        await Message.update(
            { isRead: true, readAt: new Date() },
            {
                where: {
                    senderId: otherUserId,
                    receiverId: req.user.id,
                    isRead: false
                }
            }
        );
        
        res.json({ success: true, data: messages });
    } catch (error) {
        console.error('Get messages error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
};

// @desc    Get all conversations for teacher
// @route   GET /api/teacher/conversations
// @access  Private/Teacher
exports.getConversations = async (req, res) => {
    try {
        const messages = await Message.findAll({
            where: {
                [Op.or]: [
                    { senderId: req.user.id },
                    { receiverId: req.user.id }
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
                    messages: []
                };
            }
            
            conversations[otherUserId].messages.push(msg);
            
            if (msg.receiverId === req.user.id && !msg.isRead) {
                conversations[otherUserId].unreadCount++;
            }
        });
        
        res.json({ success: true, data: Object.values(conversations) });
    } catch (error) {
        console.error('Get conversations error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
};

// @desc    Get group messages (messages sent to all staff)
// @route   GET /api/teacher/group-messages
// @access  Private/Teacher
exports.getGroupMessages = async (req, res) => {
  try {
    const messages = await Message.findAll({
      where: {
        [Op.or]: [
          { receiverId: null },
          { metadata: { [Op.contains]: { type: 'group_message' } } }
        ]
      },
      include: [
        { model: User, as: 'Sender', attributes: ['id', 'name', 'role'] }
      ],
      order: [['createdAt', 'ASC']]
    });
    res.json({ success: true, data: messages });
  } catch (error) {
    console.error('Get group messages error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Get private messages between two users
// @route   GET /api/teacher/private-messages/:otherUserId
// @access  Private/Teacher
exports.getPrivateMessages = async (req, res) => {
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
        { model: User, as: 'Sender', attributes: ['id', 'name', 'role'] }
      ],
      order: [['createdAt', 'ASC']]
    });
    res.json({ success: true, data: messages });
  } catch (error) {
    console.error('Get private messages error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Get conversations with parents only
// @route   GET /api/teacher/parent-conversations
// @access  Private/Teacher
exports.getParentConversations = async (req, res) => {
  try {
    const parents = await Parent.findAll({
      include: [{ model: User, where: { schoolCode: req.user.schoolCode, role: 'parent', isActive: true }, attributes: ['id', 'name', 'role'] }]
    });
    const parentUserIds = parents.map(p => p.userId);
    // Also fetch student for each parent
    const studentsByParent = {};
    for (const parent of parents) {
      const students = await parent.getStudents({ include: [{ model: User, attributes: ['name'] }] });
      if (students.length) {
        studentsByParent[parent.userId] = students[0].User.name;
      }
    }
    const messages = await Message.findAll({
      where: {
        [Op.or]: [
          { senderId: req.user.id, receiverId: { [Op.in]: parentUserIds } },
          { senderId: { [Op.in]: parentUserIds }, receiverId: req.user.id }
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
      const parentUserId = msg.senderId === req.user.id ? msg.receiverId : msg.senderId;
      const parentUser = msg.senderId === req.user.id ? msg.Receiver : msg.Sender;
      if (!conversations[parentUserId]) {
        conversations[parentUserId] = {
          userId: parentUserId,
          userName: parentUser?.name || 'Parent',
          userRole: 'parent',
          lastMessage: msg.content,
          lastMessageTime: msg.createdAt,
          unreadCount: msg.receiverId === req.user.id && !msg.isRead ? 1 : 0,
          studentName: studentsByParent[parentUserId] || null
        };
      } else if (msg.receiverId === req.user.id && !msg.isRead) {
        conversations[parentUserId].unreadCount++;
      }
    });
    res.json({ success: true, data: Object.values(conversations) });
  } catch (error) {
    console.error('Get parent conversations error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};
