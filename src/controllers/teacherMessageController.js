const { Message, User, Teacher, Student } = require('../models');
const { Op } = require('sequelize');
const { createAlert } = require('../services/notificationService');

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
        
        // Mark messages as read
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
        
        res.json({ success: true, data: messages });
    } catch (error) {
        console.error('Get messages error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
};

// @desc    Reply to parent
// @route   POST /api/teacher/reply
// @access  Private/Teacher
exports.replyToParent = async (req, res) => {
    try {
        const { parentId, message, originalMessageId } = req.body;
        
        const reply = await Message.create({
            senderId: req.user.id,
            receiverId: parentId,
            content: message,
            metadata: {
                inReplyTo: originalMessageId,
                type: 'teacher_reply'
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
