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
    
    // Use raw SQL queries to avoid model synchronization issues
    const queryInterface = sequelize.getQueryInterface();
    
    // Step 1: Add shortCode column as nullable
    queryInterface.addColumn('Schools', 'shortCode', {
        type: Sequelize.STRING,
        allowNull: true,
        unique: true
    })
    .then(() => {
        console.log('✅ Added shortCode column');
        
        // Step 2: Generate short codes using raw query to avoid model issues
        return sequelize.query(
            `SELECT id FROM "Schools" WHERE "shortCode" IS NULL`,
            { type: Sequelize.QueryTypes.SELECT }
        );
    })
    .then(async (schools) => {
        console.log(`📝 Generating short codes for ${schools.length} existing schools...`);
        
        // Generate short codes one by one using raw updates
        for (const school of schools) {
            let shortCode = generateShortCode();
            let isUnique = false;
            
            // Ensure uniqueness
            while (!isUnique) {
                const existing = await sequelize.query(
                    `SELECT id FROM "Schools" WHERE "shortCode" = :shortCode`,
                    { 
                        replacements: { shortCode },
                        type: Sequelize.QueryTypes.SELECT 
                    }
                );
                
                if (existing.length === 0) {
                    isUnique = true;
                } else {
                    shortCode = generateShortCode();
                }
            }
            
            // Update the school with the unique short code
            await sequelize.query(
                `UPDATE "Schools" SET "shortCode" = :shortCode WHERE id = :id`,
                { 
                    replacements: { shortCode, id: school.id },
                    type: Sequelize.QueryTypes.UPDATE 
                }
            );
        }
        
        console.log('✅ Short codes generated');
        
        // Step 3: Now add status column
        return queryInterface.addColumn('Schools', 'status', {
            type: Sequelize.ENUM('pending', 'active', 'suspended', 'rejected'),
            defaultValue: 'pending'
        });
    })
    .then(() => {
        console.log('✅ Added status column');
        
        // Step 4: Set existing schools to active
        return sequelize.query(
            `UPDATE "Schools" SET status = 'active', "isActive" = true WHERE status IS NULL`,
            { type: Sequelize.QueryTypes.UPDATE }
        );
    })
    .then(() => {
        console.log('✅ Updated existing schools to active');
        
        // Step 5: Add approvedBy column
        return queryInterface.addColumn('Schools', 'approvedBy', {
            type: Sequelize.INTEGER,
            allowNull: true,
            references: { model: 'Users', key: 'id' },
            onDelete: 'SET NULL'
        });
    })
    .then(() => {
        console.log('✅ Added approvedBy column');
        
        // Step 6: Add approvedAt column
        return queryInterface.addColumn('Schools', 'approvedAt', {
            type: Sequelize.DATE,
            allowNull: true
        });
    })
    .then(() => {
        console.log('✅ Added approvedAt column');
        
        // Step 7: Add rejectionReason column
        return queryInterface.addColumn('Schools', 'rejectionReason', {
            type: Sequelize.TEXT,
            allowNull: true
        });
    })
    .then(() => {
        console.log('✅ Added rejectionReason column');
        
        // Step 8: Make schoolCode nullable in Users table
        return queryInterface.changeColumn('Users', 'schoolCode', {
            type: Sequelize.STRING,
            allowNull: true
        });
    })
    .then(() => {
        console.log('✅ Updated Users table');
        
        // Step 9: Add indexes
        return Promise.all([
            queryInterface.addIndex('Schools', ['shortCode']),
            queryInterface.addIndex('Schools', ['status'])
        ]);
    })
    .then(() => {
        console.log('✅ Added indexes');
        console.log('🎉 All migrations completed successfully!');
        process.exit(0);
    })
    .catch(err => {
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
