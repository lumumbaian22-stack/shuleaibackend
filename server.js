require('dotenv').config();
const path = require('path');

// Try to find app.js in the current directory
let app;
try {
  // Try with .js extension
  app = require('./app.js');
  console.log('✅ Found app.js');
} catch (err) {
  try {
    // Try without extension
    app = require('./app');
    console.log('✅ Found app (no extension)');
  } catch (err2) {
    console.error('❌ Cannot find app.js. Current directory:', __dirname);
    console.error('Files in current directory:', require('fs').readdirSync(__dirname));
    process.exit(1);
  }
}

const http = require('http');
const socketio = require('socket.io');
const { sequelize } = require('./models');

// Check if we should just run migrations and exit
if (process.env.RUN_MIGRATIONS === 'true') {
    console.log('🔧 Running migrations...');
    sequelize.sync({ alter: true })
        .then(() => {
            console.log('✅ Migrations completed successfully');
            process.exit(0);
        })
        .catch(err => {
            console.error('❌ Migration failed:', err);
            process.exit(1);
        });
} else {
    const server = http.createServer(app);
    const io = socketio(server, {
        cors: { origin: process.env.FRONTEND_URL, credentials: true }
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

    const PORT = process.env.PORT || 5000;

    // Debug database configuration
    console.log('🔧 Database Config Debug:');
    console.log(`📊 NODE_ENV: ${process.env.NODE_ENV}`);
    console.log(`📊 DATABASE_URL exists: ${!!process.env.DATABASE_URL}`);
    console.log(`📊 isProduction: ${process.env.NODE_ENV === 'production'}`);
    if (process.env.DATABASE_URL) {
        console.log(`📊 Using DATABASE_URL (first 20 chars): ${process.env.DATABASE_URL.substring(0, 20)}...`);
    }

    // Test database connection before syncing
    sequelize.authenticate()
        .then(() => {
            console.log('✅ Database connection test SUCCESSFUL');
            return sequelize.sync({ alter: process.env.NODE_ENV === 'development' });
        })
        .then(() => {
            server.listen(PORT, () => {
                console.log(`✅ Server running on port ${PORT}`);
            });
        })
        .catch(err => {
            console.error('❌ Database sync failed:', err);
            process.exit(1);
        });
}
