const { Parent, Teacher, User, Message, Student, Admin } = require('../models');
const { Op } = require('sequelize');
const { createAlert } = require('../services/notificationService');

// @desc    Send message to class teacher or admin
// @route   POST /api/parent/message
// @access  Private/Parent
exports.sendMessage = async (req, res) => {
    try {
        const { studentId, message, recipientType } = req.body;
        
        // Find parent
        const parent = await Parent.findOne({ where: { userId: req.user.id } });
        if (!parent) {
            return res.status(404).json({ success: false, message: 'Parent not found' });
        }
        
        // Find student
        const student = await Student.findByPk(studentId, {
            include: [{ model: User, attributes: ['id', 'name'] }]
        });
        
        if (!student) {
            return res.status(404).json({ success: false, message: 'Student not found' });
        }
        
        // Verify parent owns this child
        const hasChild = await parent.hasStudent(student);
        if (!hasChild) {
            return res.status(403).json({ success: false, message: 'Not your child' });
        }
        
        let recipientId = null;
        let recipientRole = '';
        let recipientName = '';
        
        if (recipientType === 'teacher') {
            // Find class teacher
            const classTeacher = await Teacher.findOne({
                where: { classTeacher: student.grade },
                include: [{ model: User, attributes: ['id', 'name', 'email'] }]
            });
            
            if (!classTeacher) {
                return res.status(404).json({ 
                    success: false, 
                    message: 'Class teacher not found for this grade' 
                });
            }
            
            recipientId = classTeacher.User.id;
            recipientRole = 'teacher';
            recipientName = classTeacher.User.name;
            
        } else if (recipientType === 'admin') {
            // Find school admin
            const admin = await User.findOne({
                where: { 
                    role: 'admin', 
                    schoolCode: req.user.schoolCode 
                }
            });
            
            if (!admin) {
                return res.status(404).json({ 
                    success: false, 
                    message: 'School admin not found' 
                });
            }
            
            recipientId = admin.id;
            recipientRole = 'admin';
            recipientName = admin.name;
        } else {
            return res.status(400).json({ success: false, message: 'Invalid recipient type' });
        }
        
        // Create message
        const newMessage = await Message.create({
            senderId: req.user.id,
            receiverId: recipientId,
            content: message,
            metadata: {
                studentId: student.id,
                studentName: student.User.name,
                studentGrade: student.grade,
                parentName: req.user.name,
                parentEmail: req.user.email,
                type: 'parent_query'
            }
        });
        
        // Create alert for recipient
        await createAlert({
            userId: recipientId,
            role: recipientRole,
            type: 'message',
            severity: 'info',
            title: `📬 Message from parent of ${student.User.name}`,
            message: message.substring(0, 100) + (message.length > 100 ? '...' : ''),
            data: {
                studentId: student.id,
                studentName: student.User.name,
                studentGrade: student.grade,
                parentId: parent.id,
                parentName: req.user.name,
                messageId: newMessage.id,
                replyTo: req.user.id
            }
        });
        
        // Send real-time notification via WebSocket
        if (global.io) {
            global.io.to(`user-${recipientId}`).emit('new-parent-message', {
                messageId: newMessage.id,
                from: req.user.id,
                fromName: req.user.name,
                studentName: student.User.name,
                studentGrade: student.grade,
                content: message,
                timestamp: new Date()
            });
        }
        
        res.status(201).json({
            success: true,
            message: 'Message sent successfully',
            data: {
                id: newMessage.id,
                recipient: recipientName,
                recipientType: recipientType,
                sentAt: newMessage.createdAt
            }
        });
        
    } catch (error) {
        console.error('Send message error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
};

// @desc    Get conversations for parent
// @route   GET /api/parent/conversations
// @access  Private/Parent
exports.getConversations = async (req, res) => {
    try {
        const parent = await Parent.findOne({ where: { userId: req.user.id } });
        
        // Find all messages where parent is sender or receiver
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
                    messages: []
                };
            }
            
            conversations[otherUserId].messages.push(msg);
            
            if (msg.receiverId === req.user.id && !msg.isRead) {
                conversations[otherUserId].unreadCount++;
            }
        });
        
        res.json({
            success: true,
            data: Object.values(conversations)
        });
        
    } catch (error) {
        console.error('Get conversations error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
};

// @desc    Get messages with specific user
// @route   GET /api/parent/messages/:otherUserId
// @access  Private/Parent
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
        
        // Mark messages as read
        await Message.update(
            { isRead: true },
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

// @desc    Reply to parent message (for teachers/admins)
// @route   POST /api/messages/reply
// @access  Private/Teacher/Admin
exports.replyToParent = async (req, res) => {
    try {
        const { parentId, message, originalMessageId } = req.body;
        
        // Create reply message
        const reply = await Message.create({
            senderId: req.user.id,
            receiverId: parentId,
            content: message,
            metadata: {
                inReplyTo: originalMessageId,
                type: 'teacher_reply'
            }
        });
        
        // Get parent info for notification
        const parent = await User.findByPk(parentId);
        
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
