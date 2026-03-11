require('dotenv').config();
const app = require('./src/app');
const http = require('http');
const socketio = require('socket.io');
const { sequelize } = require('./src/models');
const { Sequelize } = require('sequelize'); // <-- ADD THIS LINE

// Function to generate short code (same as in School model)
function generateShortCode() {
    const prefix = 'SHL';
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let randomPart = '';
    for (let i = 0; i < 5; i++) {
        randomPart += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return `${prefix}-${randomPart}`;
}

// Check if we should just run migrations and exit
if (process.env.RUN_MIGRATIONS === 'true') {
    console.log('🔧 Running migrations...');
    
    // First, add the columns as nullable
    sequelize.getQueryInterface().addColumn('Schools', 'shortCode', {
        type: Sequelize.STRING,
        allowNull: true,
        unique: true
    }).then(() => {
        console.log('✅ Added shortCode column');
        
        // Get the School model
        const { School } = require('./src/models');
        
        // Generate short codes for existing schools
        return School.findAll({ where: { shortCode: null } });
    }).then(async (schools) => {
        console.log(`📝 Generating short codes for ${schools.length} existing schools...`);
        
        for (const school of schools) {
            let shortCode = generateShortCode();
            // Ensure uniqueness
            while (await School.findOne({ where: { shortCode } })) {
                shortCode = generateShortCode();
            }
            school.shortCode = shortCode;
            await school.save();
        }
        
        console.log('✅ Short codes generated');
        
        // Now add status column
        return sequelize.getQueryInterface().addColumn('Schools', 'status', {
            type: Sequelize.ENUM('pending', 'active', 'suspended', 'rejected'),
            defaultValue: 'pending'
        });
    }).then(() => {
        console.log('✅ Added status column');
        
        // Set existing schools to active (since they were working before)
        const { School } = require('./src/models');
        return School.update(
            { status: 'active', isActive: true },
            { where: {} }
        );
    }).then(() => {
        console.log('✅ Updated existing schools to active');
        
        // Add approvedBy column
        return sequelize.getQueryInterface().addColumn('Schools', 'approvedBy', {
            type: Sequelize.INTEGER,
            allowNull: true,
            references: { model: 'Users', key: 'id' },
            onDelete: 'SET NULL'
        });
    }).then(() => {
        console.log('✅ Added approvedBy column');
        
        // Add approvedAt column
        return sequelize.getQueryInterface().addColumn('Schools', 'approvedAt', {
            type: Sequelize.DATE,
            allowNull: true
        });
    }).then(() => {
        console.log('✅ Added approvedAt column');
        
        // Add rejectionReason column
        return sequelize.getQueryInterface().addColumn('Schools', 'rejectionReason', {
            type: Sequelize.TEXT,
            allowNull: true
        });
    }).then(() => {
        console.log('✅ Added rejectionReason column');
        
        // Make schoolCode nullable in Users table
        return sequelize.getQueryInterface().changeColumn('Users', 'schoolCode', {
            type: Sequelize.STRING,
            allowNull: true
        });
    }).then(() => {
        console.log('✅ Updated Users table');
        
        // Add indexes
        return Promise.all([
            sequelize.getQueryInterface().addIndex('Schools', ['shortCode']),
            sequelize.getQueryInterface().addIndex('Schools', ['status'])
        ]);
    }).then(() => {
        console.log('✅ Added indexes');
        console.log('🎉 All migrations completed successfully!');
        process.exit(0);
    }).catch(err => {
        console.error('❌ Migration failed:', err);
        process.exit(1);
    });
    
} else {
    // Normal server startup
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

    sequelize.sync({ alter: process.env.NODE_ENV === 'development' })
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

