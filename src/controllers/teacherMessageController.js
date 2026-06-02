// src/controllers/teacherMessageController.js
const { Op } = require('sequelize');
const { Message, User, Teacher, Student, Parent } = require('../models');
const { createAlert } = require('../services/notificationService');

function messageMeta(message) { return (message?.toJSON ? message.toJSON() : (message || {})).metadata || {}; }
function isTeacherParentConversation(message, user) {
  const md = messageMeta(message);
  return (!md.schoolCode || String(md.schoolCode) === String(user.schoolCode))
    && md.conversationType === 'parent_class_teacher'
    && Number(md.classTeacherUserId) === Number(user.id);
}

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
                { model: User, as: 'Sender', attributes: ['id', 'name', 'role'] },
                { model: User, as: 'Receiver', attributes: ['id', 'name', 'role'] }
            ],
            order: [['createdAt', 'DESC']]
        });
        
        // Group by conversation
        const conversations = {};
        
        for (const msg of messages) {
            const otherUserId = msg.senderId === req.user.id ? msg.receiverId : msg.senderId;
            const otherUser = msg.senderId === req.user.id ? msg.Receiver : msg.Sender;
            
            if (!conversations[otherUserId]) {
                // Try to get student info if this is a parent
                let studentName = null;
                let studentGrade = null;
                
                if (otherUser?.role === 'parent') {
                    try {
                        const parent = await Parent.findOne({ where: { userId: otherUserId } });
                        if (parent) {
                            const students = await parent.getStudents({ 
                                include: [{ model: User, attributes: ['name'] }]
                            });
                            if (students.length > 0) {
                                studentName = students[0].User?.name;
                                studentGrade = students[0].grade;
                            }
                        }
                    } catch (err) {
                        console.error('Error fetching parent students:', err);
                    }
                }
                
                conversations[otherUserId] = {
                    userId: otherUserId,
                    userName: otherUser?.name || 'Unknown',
                    userRole: otherUser?.role || 'unknown',
                    lastMessage: msg.content,
                    lastMessageTime: msg.createdAt,
                    unreadCount: msg.receiverId === req.user.id && !msg.isRead ? 1 : 0,
                    studentName,
                    studentGrade,
                    messages: []
                };
            } else {
                if (msg.receiverId === req.user.id && !msg.isRead) {
                    conversations[otherUserId].unreadCount++;
                }
            }
            
            conversations[otherUserId].messages.push(msg);
        }
        
        res.json({ success: true, data: Object.values(conversations) });
    } catch (error) {
        console.error('Get conversations error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
};

// @desc    Get messages with specific parent
// @route   GET /api/teacher/messages/:parentId
// @access  Private/Teacher
exports.getMessages = async (req, res) => {
    try {
        const { parentId } = req.params;

        const messages = await Message.findAll({
            where: {
                [Op.or]: [
                    { senderId: req.user.id, receiverId: parentId },
                    { senderId: parentId, receiverId: req.user.id }
                ]
            },
            include: [
                { model: User, as: 'Sender', attributes: ['id', 'name', 'role'] },
                { model: User, as: 'Receiver', attributes: ['id', 'name', 'role'] }
            ],
            order: [['createdAt', 'ASC']]
        });

        const scoped = messages.filter(message => isTeacherParentConversation(message, req.user));

        await Message.update(
            { isRead: true, readAt: new Date() },
            {
                where: {
                    senderId: parentId,
                    receiverId: req.user.id,
                    isRead: false
                }
            }
        );

        res.json({ success: true, data: scoped });
    } catch (error) {
        console.error('Get messages error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
};

// @desc    Mark messages as read for a conversation
// @route   PUT /api/teacher/messages/read/:conversationId
// @access  Private/Teacher
exports.markMessagesAsRead = async (req, res) => {
    try {
        const { conversationId } = req.params;
        
        const updated = await Message.update(
            { isRead: true, readAt: new Date() },
            {
                where: {
                    senderId: conversationId,
                    receiverId: req.user.id,
                    isRead: false
                }
            }
        );
        
        res.json({ success: true, message: 'Messages marked as read', count: updated[0] });
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

        if (!parentId || !String(message || '').trim()) {
            return res.status(400).json({ success: false, message: 'Parent ID and message are required' });
        }

        let baseMessage = null;
        if (originalMessageId) {
            baseMessage = await Message.findByPk(originalMessageId).catch(() => null);
        }
        if (!baseMessage) {
            const recent = await Message.findAll({
                where: {
                    [Op.or]: [
                        { senderId: req.user.id, receiverId: parentId },
                        { senderId: parentId, receiverId: req.user.id }
                    ]
                },
                order: [['createdAt', 'DESC']],
                limit: 20
            });
            baseMessage = recent.find(m => isTeacherParentConversation(m, req.user)) || null;
        }
        if (!baseMessage) {
            return res.status(403).json({ success: false, message: 'This parent conversation is not assigned to you as class teacher.' });
        }
        const baseMeta = messageMeta(baseMessage);

        const reply = await Message.create({
            senderId: req.user.id,
            receiverId: parentId,
            content: String(message).trim(),
            metadata: {
                ...baseMeta,
                schoolCode: req.user.schoolCode,
                inReplyTo: originalMessageId || baseMessage.id,
                type: 'teacher_reply',
                teacherName: req.user.name,
                teacherId: req.user.id
            }
        });

        await createAlert({
            userId: parentId,
            role: 'parent',
            type: 'message',
            severity: 'info',
            title: `Reply from ${req.user.name}`,
            message: String(message).substring(0, 100) + (String(message).length > 100 ? '...' : ''),
            data: { schoolCode: req.user.schoolCode, scope: 'user', targetUserIds: [parentId], conversationType: baseMeta.conversationType, conversationKey: baseMeta.conversationKey, messageId: reply.id }
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

        res.status(201).json({ success: true, message: 'Reply sent successfully', data: reply });
    } catch (error) {
        console.error('Reply error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
};
