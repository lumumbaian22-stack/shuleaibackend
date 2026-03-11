require('dotenv').config();
const app = require('./src/app');
const http = require('http');
const socketio = require('socket.io');
const { sequelize } = require('./src/models');
const { Sequelize, Op } = require('sequelize');

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

    // Main migration function - fully sequential
    (async () => {
        try {
            console.log('📊 Starting migration steps...');

            // STEP 1: Add shortCode column only if it doesn't exist
            console.log('Step 1: Checking shortCode column...');
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

            // STEP 2: Get School model and generate short codes for existing schools
            console.log('Step 2: Generating short codes for existing schools...');
            const { School } = require('./src/models');
            
            // Wait for model to be ready
            await School.findOne().catch(() => null);
            
            const schoolsWithoutCode = await School.findAll({ 
                where: { shortCode: null },
                attributes: ['id', 'shortCode'] // Only select needed fields
            });
            
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

            // STEP 3: Add status column only if it doesn't exist
            console.log('Step 3: Checking status column...');
            if (!(await columnExists('Schools', 'status'))) {
                await queryInterface.addColumn('Schools', 'status', {
                    type: Sequelize.ENUM('pending', 'active', 'suspended', 'rejected'),
                    defaultValue: 'pending'
                });
                console.log('✅ Added status column');
            } else {
                console.log('⏩ status column already exists, skipping...');
            }

            // STEP 4: Update school statuses (only after status column definitely exists)
            console.log('Step 4: Updating school statuses...');
            // Re-fetch the model to ensure it has the latest schema
            const { School: UpdatedSchoolModel } = require('./src/models');
            
            // Wait for model to be ready with new schema
            await UpdatedSchoolModel.findOne().catch(() => null);
            
            const updateResult = await UpdatedSchoolModel.update(
                { 
                    status: 'active', 
                    isActive: true 
                },
                { 
                    where: {
                        [Op.or]: [
                            { status: null },
                            { status: 'pending' }
                        ]
                    }
                }
            );
            console.log(`✅ Updated ${updateResult[0] || 0} schools to active status`);

            // STEP 5: Add approvedBy column
            console.log('Step 5: Checking approvedBy column...');
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

            // STEP 6: Add approvedAt column
            console.log('Step 6: Checking approvedAt column...');
            if (!(await columnExists('Schools', 'approvedAt'))) {
                await queryInterface.addColumn('Schools', 'approvedAt', {
                    type: Sequelize.DATE,
                    allowNull: true
                });
                console.log('✅ Added approvedAt column');
            } else {
                console.log('⏩ approvedAt column already exists, skipping...');
            }

            // STEP 7: Add rejectionReason column
            console.log('Step 7: Checking rejectionReason column...');
            if (!(await columnExists('Schools', 'rejectionReason'))) {
                await queryInterface.addColumn('Schools', 'rejectionReason', {
                    type: Sequelize.TEXT,
                    allowNull: true
                });
                console.log('✅ Added rejectionReason column');
            } else {
                console.log('⏩ rejectionReason column already exists, skipping...');
            }

            // STEP 8: Make schoolCode nullable in Users table
            console.log('Step 8: Checking Users table schoolCode column...');
            try {
                const usersColumns = await queryInterface.describeTable('Users');
                if (usersColumns.schoolCode) {
                    if (usersColumns.schoolCode.allowNull === false) {
                        await queryInterface.changeColumn('Users', 'schoolCode', {
                            type: Sequelize.STRING,
                            allowNull: true
                        });
                        console.log('✅ Updated Users table (schoolCode is now nullable)');
                    } else {
                        console.log('⏩ schoolCode column already nullable, skipping...');
                    }
                } else {
                    console.log('⚠️ schoolCode column not found in Users table');
                }
            } catch (changeError) {
                console.log('⚠️ Note: Could not modify schoolCode column:', changeError.message);
            }

            // STEP 9: Add indexes
            console.log('Step 9: Adding indexes...');
            
            // Index on shortCode
            try {
                await queryInterface.addIndex('Schools', ['shortCode'], {
                    name: 'schools_short_code_idx',
                    unique: true,
                    where: { shortCode: { [Op.ne]: null } }
                });
                console.log('✅ Added index on shortCode');
            } catch (indexError) {
                if (indexError.name === 'SequelizeUniqueConstraintError') {
                    console.log('⏩ Index on shortCode already exists, skipping...');
                } else {
                    console.log('⚠️ Index creation note for shortCode:', indexError.message);
                }
            }

            // Index on status
            try {
                await queryInterface.addIndex('Schools', ['status'], {
                    name: 'schools_status_idx'
                });
                console.log('✅ Added index on status');
            } catch (indexError) {
                if (indexError.name === 'SequelizeUniqueConstraintError') {
                    console.log('⏩ Index on status already exists, skipping...');
                } else {
                    console.log('⚠️ Index creation note for status:', indexError.message);
                }
            }

            console.log('\n🎉 All migrations completed successfully!');
            console.log('📊 Migration Summary:');
            console.log('   ✓ All required columns added/verified');
            console.log('   ✓ Short codes generated for existing schools');
            console.log('   ✓ School statuses updated');
            console.log('   ✓ Database indexes added');
            console.log('\n✅ Migration process complete. You can now remove RUN_MIGRATIONS env variable and redeploy.');
            process.exit(0);

        } catch (err) {
            console.error('\n❌ Migration failed with error:', err);
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
        console.log('New WebSocket connection');
        
        socket.on('join', (userId) => {
            if (userId) {
                socket.join(`user-${userId}`);
                console.log(`User ${userId} joined their room`);
            }
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

        socket.on('disconnect', () => {
            console.log('WebSocket disconnected');
        });
    });

    const PORT = process.env.PORT || 5000;

    sequelize.sync({ alter: process.env.NODE_ENV === 'development' })
        .then(() => {
            server.listen(PORT, () => {
                console.log(`✅ Server running on port ${PORT}`);
                console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
                console.log(`🔗 Frontend URL: ${process.env.FRONTEND_URL || 'Not set'}`);
            });
        })
        .catch(err => {
            console.error('❌ Database sync failed:', err);
            process.exit(1);
        });
}
