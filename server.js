require('dotenv').config();
const app = require('./src/app');
const http = require('http');
const socketio = require('socket.io');
const { sequelize } = require('./src/models');
const { Sequelize } = require('sequelize');

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
    const queryInterface = sequelize.getQueryInterface();

    // Helper function to check if a column exists
    async function columnExists(tableName, columnName) {
        try {
            const tableDescription = await queryInterface.describeTable(tableName);
            return tableDescription.hasOwnProperty(columnName);
        } catch (error) {
            console.error(`Error describing table ${tableName}:`, error);
            return false;
        }
    }

    // Wrap everything in an async function to use await
    (async () => {
        try {
            // 1. Add shortCode column only if it doesn't exist
            if (!(await columnExists('Schools', 'shortCode'))) {
                await queryInterface.addColumn('Schools', 'shortCode', {
                    type: Sequelize.STRING,
                    allowNull: true,
                    unique: true
                });
                console.log('✅ Added shortCode column');
            } else {
                console.log('⏩ shortCode column already exists, skipping...');
            }

            // Get the School model (do this after potential column addition)
            const { School } = require('./src/models');

            // 2. Generate short codes for existing schools that don't have one
            const schoolsWithoutCode = await School.findAll({ where: { shortCode: null } });
            if (schoolsWithoutCode.length > 0) {
                console.log(`📝 Generating short codes for ${schoolsWithoutCode.length} existing schools...`);
                for (const school of schoolsWithoutCode) {
                    let shortCode = generateShortCode();
                    // Ensure uniqueness
                    while (await School.findOne({ where: { shortCode } })) {
                        shortCode = generateShortCode();
                    }
                    school.shortCode = shortCode;
                    await school.save();
                }
                console.log('✅ Short codes generated for all schools');
            } else {
                console.log('⏩ All schools already have short codes, skipping generation...');
            }

            // 3. Add status column only if it doesn't exist
            if (!(await columnExists('Schools', 'status'))) {
                await queryInterface.addColumn('Schools', 'status', {
                    type: Sequelize.ENUM('pending', 'active', 'suspended', 'rejected'),
                    defaultValue: 'pending'
                });
                console.log('✅ Added status column');
            } else {
                console.log('⏩ status column already exists, skipping...');
            }

            // 4. Set existing schools to active (only if status is null or pending)
            const { School: SchoolModel } = require('./src/models');
            await SchoolModel.update(
                { status: 'active', isActive: true },
                { where: { status: ['pending', null] } }
            );
            console.log('✅ Updated existing schools status to active');

            // 5. Add approvedBy column only if it doesn't exist
            if (!(await columnExists('Schools', 'approvedBy'))) {
                await queryInterface.addColumn('Schools', 'approvedBy', {
                    type: Sequelize.INTEGER,
                    allowNull: true,
                    references: { model: 'Users', key: 'id' },
                    onDelete: 'SET NULL'
                });
                console.log('✅ Added approvedBy column');
            } else {
                console.log('⏩ approvedBy column already exists, skipping...');
            }

            // 6. Add approvedAt column only if it doesn't exist
            if (!(await columnExists('Schools', 'approvedAt'))) {
                await queryInterface.addColumn('Schools', 'approvedAt', {
                    type: Sequelize.DATE,
                    allowNull: true
                });
                console.log('✅ Added approvedAt column');
            } else {
                console.log('⏩ approvedAt column already exists, skipping...');
            }

            // 7. Add rejectionReason column only if it doesn't exist
            if (!(await columnExists('Schools', 'rejectionReason'))) {
                await queryInterface.addColumn('Schools', 'rejectionReason', {
                    type: Sequelize.TEXT,
                    allowNull: true
                });
                console.log('✅ Added rejectionReason column');
            } else {
                console.log('⏩ rejectionReason column already exists, skipping...');
            }

            // 8. Make schoolCode nullable in Users table
            try {
                // Check if column exists and its current nullable state
                const usersColumns = await queryInterface.describeTable('Users');
                if (usersColumns.schoolCode && usersColumns.schoolCode.allowNull === false) {
                    await queryInterface.changeColumn('Users', 'schoolCode', {
                        type: Sequelize.STRING,
                        allowNull: true
                    });
                    console.log('✅ Updated Users table (schoolCode is now nullable)');
                } else if (!usersColumns.schoolCode) {
                    console.log('⚠️ schoolCode column not found in Users table');
                } else {
                    console.log('⏩ schoolCode column already nullable, skipping...');
                }
            } catch (changeError) {
                console.log('⚠️ Note: Could not modify schoolCode column:', changeError.message);
            }

            // 9. Add indexes (check if they exist first - using try/catch as they're idempotent)
            try {
                await queryInterface.addIndex('Schools', ['shortCode'], {
                    name: 'schools_short_code_idx',
                    unique: true,
                    where: { shortCode: { [Sequelize.Op.ne]: null } }
                });
                console.log('✅ Added index on shortCode');
            } catch (indexError) {
                if (indexError.name === 'SequelizeUniqueConstraintError') {
                    console.log('⏩ Index on shortCode already exists, skipping...');
                } else {
                    console.log('⚠️ Index creation note:', indexError.message);
                }
            }

            try {
                await queryInterface.addIndex('Schools', ['status'], {
                    name: 'schools_status_idx'
                });
                console.log('✅ Added index on status');
            } catch (indexError) {
                if (indexError.name === 'SequelizeUniqueConstraintError') {
                    console.log('⏩ Index on status already exists, skipping...');
                } else {
                    console.log('⚠️ Index creation note:', indexError.message);
                }
            }

            console.log('🎉 All migrations completed successfully!');
            console.log('📊 Summary:');
            console.log('   - Added all required columns');
            console.log(`   - Generated short codes for existing schools`);
            console.log('   - Updated school statuses');
            console.log('   - Added database indexes');
            console.log('\n✅ Migration process complete. You can now remove RUN_MIGRATIONS env variable and redeploy.');
            process.exit(0);

        } catch (err) {
            console.error('❌ Migration failed with error:', err);
            console.error('Stack trace:', err.stack);
            process.exit(1);
        }
    })(); // Execute the async function immediately
    
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
