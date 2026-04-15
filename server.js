require('dotenv').config();
const path = require('path');

// Correct path to app.js in src folder
const app = require('./src/app');

const http = require('http');
const socketio = require('socket.io');
const { sequelize } = require('./src/models');

// Determine port
const PORT = process.env.PORT || 5000;

// Create HTTP server
const server = http.createServer(app);

// Socket.io setup
const io = socketio(server, {
    cors: { origin: process.env.FRONTEND_URL || '*', credentials: true }
});
global.io = io;

io.on('connection', (socket) => {
    socket.on('join', (userId) => {
        if (userId) socket.join(`user-${userId}`);
    });
    socket.on('private-message', (data) => {
        io.to(`user-${data.to}`).emit('private-message', {
            from: socket.userId,
            message: data.message,
            timestamp: new Date()
        });
    });
    socket.on('typing', (data) => {
        socket.to(`user-${data.to}`).emit('typing', {
            from: socket.userId,
            isTyping: data.isTyping
        });
    });
});

// Test database connection and sync models
sequelize.authenticate()
  .then(() => {
    console.log('✅ Database connection test SUCCESSFUL');
    if (process.env.NODE_ENV === 'development') {
      return sequelize.sync({ alter: true });
    }
  })
  .then(() => {
    if (process.env.NODE_ENV === 'development') {
      console.log('✅ Database models synchronized');
    }
    server.listen(PORT, () => {
      console.log(`✅ Server running on port ${PORT}`);
    });
  })
  .catch(err => {
    console.error('❌ Database or sync error:', err);
    process.exit(1);
  });

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
    console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
    // Optionally exit or log, but don't crash immediately
});

// Handle uncaught exceptions
process.on('uncaughtException', (err) => {
    console.error('❌ Uncaught Exception:', err);
    process.exit(1);
});
