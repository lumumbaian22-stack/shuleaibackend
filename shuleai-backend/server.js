require('dotenv').config();
const app = require('./src/app');
const http = require('http');
const socketio = require('socket.io');
const { sequelize } = require('./src/models');

const server = http.createServer(app);
const io = socketio(server, {
  cors: { origin: process.env.FRONTEND_URL, credentials: true }
});
global.io = io;

io.on('connection', (socket) => {
  socket.on('join', (userId) => socket.join(`user-${userId}`));
  socket.on('private-message', (data) => {
    io.to(`user-${data.to}`).emit('private-message', {
      from: socket.userId,
      message: data.message,
      timestamp: new Date()
    });
  });
});

const PORT = process.env.PORT || 5000;

sequelize.sync({ alter: process.env.NODE_ENV === 'development' })
  .then(() => {
    server.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });
  })
  .catch(err => {
    console.error('Database sync failed:', err);
  });