require('dotenv').config();
const app = require('./src/app');
const http = require('http');
const socketio = require('socket.io');
const { sequelize, ChatMessage, ChatGroupMember } = require('./src/models');
const { ensureRuntimeSchema } = require('./src/utils/schemaSafety');
const socketAuthMiddleware = require('./src/middleware/socketAuthMiddleware');
const socketRoomService = require('./src/services/socketRoomService');
const realtimeService = require('./src/services/realtimeService');
const { configureSocketRedisAdapter } = require('./src/config/socketRedisAdapter');
const birthdayService = require('./src/services/birthdayService');
const studentLifecycleController = require('./src/controllers/studentLifecycleController');

const PORT = process.env.PORT || 5000;
const server = http.createServer(app);

const socketAllowedOrigins = Array.from(new Set([
  'https://shuleai.live',
  'https://www.shuleai.live',
  'https://lumumbaian22-stack.github.io',
  'https://shuleaiinfo-cmd.github.io',
  'http://localhost:3000',
  'http://localhost:5173',
  'http://127.0.0.1:5500',
  ...(process.env.CORS_ORIGINS || '').split(','),
  ...(process.env.FRONTEND_URL || '').split(',')
].map(origin => String(origin || '').trim()).filter(Boolean)));

const io = socketio(server, {
  cors: {
    origin: (origin, callback) => {
      if (!origin || socketAllowedOrigins.includes(origin) || /^https:\/\/[a-z0-9-]+\.github\.io$/i.test(origin)) return callback(null, true);
      console.warn(`[Socket.IO CORS] Blocked origin: ${origin}`);
      return callback(null, false);
    },
    credentials: true,
    methods: ['GET', 'POST']
  },
  transports: ['websocket', 'polling'],
  pingTimeout: 30000,
  pingInterval: 20000
});
global.io = io;

io.use(socketAuthMiddleware);

async function canAcknowledgeMessage(socket, message) {
  if (!message || String(message.schoolCode) !== String(socket.schoolCode)) return false;
  if (message.groupId) {
    if (Number(message.senderId) === Number(socket.userId)) return false;
    if (['admin','super_admin'].includes(socket.userRole)) return true;
    return Boolean(await ChatGroupMember.findOne({ where: { groupId: message.groupId, userId: socket.userId } }));
  }
  return Number(message.receiverId) === Number(socket.userId);
}

io.on('connection', async (socket) => {
  try {
    await socketRoomService.joinBaseRooms(socket);
    console.log(`✅ WebSocket connected: user ${socket.userId} (${socket.userRole})`);
  } catch (error) {
    console.error('[Socket.IO] base room join failed:', error.message);
  }

  socket.on('realtime:join', async (room, ack = () => {}) => {
    try {
      const allowed = await socketRoomService.canJoinRoom(socket, room);
      if (!allowed) return ack({ success:false, message:'Room access denied' });
      await socket.join(room);
      ack({ success:true, room });
    } catch (error) { ack({ success:false, message:error.message }); }
  });

  socket.on('realtime:leave', async (room, ack = () => {}) => {
    await socket.leave(String(room || ''));
    ack({ success:true, room });
  });

  socket.on('chat:join_conversation', async (conversationKey, ack = () => {}) => {
    const room = `conversation:${conversationKey}`;
    try {
      if (!(await socketRoomService.canJoinRoom(socket, room))) return ack({ success:false, message:'Conversation access denied' });
      for (const joined of socket.rooms) if (joined.startsWith('conversation:') && joined !== room) await socket.leave(joined);
      await socket.join(room);
      ack({ success:true, room });
    } catch (error) { ack({ success:false, message:error.message }); }
  });

  socket.on('chat:leave_conversation', async (conversationKey, ack = () => {}) => {
    const room = `conversation:${conversationKey}`;
    await socket.leave(room);
    ack({ success:true, room });
  });

  socket.on('chat:typing_started', async ({ conversationKey } = {}) => {
    const room = `conversation:${conversationKey}`;
    if (await socketRoomService.canJoinRoom(socket, room)) socket.to(room).emit('chat:typing_started', { conversationKey, userId:socket.userId, name:socket.user?.name || 'User' });
  });

  socket.on('chat:typing_stopped', async ({ conversationKey } = {}) => {
    const room = `conversation:${conversationKey}`;
    if (await socketRoomService.canJoinRoom(socket, room)) socket.to(room).emit('chat:typing_stopped', { conversationKey, userId:socket.userId });
  });

  socket.on('chat:message_delivered', async ({ messageId } = {}, ack = () => {}) => {
    try {
      const message = await ChatMessage.findByPk(Number(messageId));
      if (!(await canAcknowledgeMessage(socket, message))) return ack({ success:false, message:'Message access denied' });
      const now = new Date();
      if (!message.deliveredAt) await message.update({ deliveredAt:now, deliveryStatus:'delivered', version:Number(message.version || 1) + 1 }, { hooks:false });
      const key = message.conversationKey || (message.groupId ? realtimeService.groupConversationKey(message.groupId) : realtimeService.directConversationKey(message.senderId, message.receiverId));
      await realtimeService.emitToConversation(message.schoolCode, key, 'chat:message_delivered', { messageId:message.id, conversationKey:key, deliveredAt:message.deliveredAt || now }, { entityType:'ChatMessage', entityId:message.id, version:message.version, audience:{ userIds:[message.senderId, message.receiverId].filter(Boolean) } });
      ack({ success:true });
    } catch (error) { ack({ success:false, message:error.message }); }
  });

  socket.on('chat:message_read', async ({ messageId } = {}, ack = () => {}) => {
    try {
      const message = await ChatMessage.findByPk(Number(messageId));
      if (!(await canAcknowledgeMessage(socket, message))) return ack({ success:false, message:'Message access denied' });
      const now = new Date();
      const metadata = message.metadata || {};
      const readBy = [...new Set([...(Array.isArray(metadata.readBy) ? metadata.readBy : []), socket.userId].map(Number))];
      await message.update({ isRead:true, readAt:now, deliveryStatus:'read', version:Number(message.version || 1) + 1, metadata:{ ...metadata, readBy } }, { hooks:false });
      const key = message.conversationKey || (message.groupId ? realtimeService.groupConversationKey(message.groupId) : realtimeService.directConversationKey(message.senderId, message.receiverId));
      await realtimeService.emitToConversation(message.schoolCode, key, 'chat:message_read', { messageId:message.id, conversationKey:key, readAt:now, readBy }, { entityType:'ChatMessage', entityId:message.id, version:message.version, audience:{ userIds:[message.senderId, message.receiverId].filter(Boolean) } });
      ack({ success:true });
    } catch (error) { ack({ success:false, message:error.message }); }
  });

  // Compatibility joins. The server still validates ownership; clients cannot choose arbitrary rooms.
  socket.on('join', async (userId) => { if (String(userId) === String(socket.userId)) await socket.join(`user-${userId}`); });
  socket.on('join-school', async (schoolCode) => { if (String(schoolCode) === String(socket.schoolCode)) await socket.join(`school-${schoolCode}`); });

  socket.on('disconnect', (reason) => console.log(`WebSocket disconnected: user ${socket.userId} (${reason})`));
});

async function start() {
  try {
    await sequelize.authenticate();
    console.log('✅ Database connection test SUCCESSFUL');
    await ensureRuntimeSchema();
    if (process.env.NODE_ENV === 'development') {
      await sequelize.sync({ alter: true });
      console.log('✅ Database models synchronized');
    }
    await configureSocketRedisAdapter(io);
    await realtimeService.processPending(250).catch(() => 0);
    const timer = setInterval(() => realtimeService.processPending(100).catch(() => 0), Number(process.env.REALTIME_OUTBOX_INTERVAL_MS || 3000));
    timer.unref?.();

    const runScheduledLifecycleJobs = async () => {
      await birthdayService.processAllSchools().catch(error => console.error('[Birthday scheduler]', error.message));
      await studentLifecycleController.applyDueSystem().catch(error => console.error('[Promotion scheduler]', error.message));
    };
    setTimeout(runScheduledLifecycleJobs, 5000).unref?.();
    const lifecycleTimer = setInterval(runScheduledLifecycleJobs, Number(process.env.LIFECYCLE_JOB_INTERVAL_MS || 60 * 60 * 1000));
    lifecycleTimer.unref?.();
    server.listen(PORT, () => console.log(`✅ Server running on port ${PORT}`));
  } catch (err) {
    console.error('❌ Database or startup error:', err);
    process.exit(1);
  }
}

start();

process.on('unhandledRejection', (reason, promise) => console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason));
process.on('uncaughtException', (err) => { console.error('❌ Uncaught Exception:', err); process.exit(1); });
