require('dotenv').config();

// --- Migration Block - MUST run before anything else ---
const RUN_MIGRATIONS = process.env.RUN_MIGRATIONS === 'true';

if (RUN_MIGRATIONS) {
    console.log('🔧 Running migrations in isolation...');
    
    // Import ONLY what's needed for migration
    const { Sequelize, Op } = require('sequelize');
    const { sequelize } = require('./src/models');

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

    // Helper function to check if a column exists
    async function columnExists(queryInterface, tableName, columnName) {
        try {
            const tableDescription = await queryInterface.describeTable(tableName);
            return tableDescription.hasOwnProperty(columnName);
        } catch (error) {
            console.error(`Error describing table ${tableName}:`, error.message);
            return false;
        }
    }

    // Main migration function
    (async () => {
        const queryInterface = sequelize.getQueryInterface();
        
        try {
            console.log('📊 Starting atomic migration steps...');
            console.log('🕐 Step 1 of 9: Adding shortCode column...');
            
            // --- STEP 1: Add shortCode column ---
            if (!(await columnExists(queryInterface, 'Schools', 'shortCode'))) {
                await queryInterface.addColumn('Schools', 'shortCode', {
                    type: Sequelize.STRING,
                    allowNull: true,
                    unique: true
                });
                console.log('✅ Added shortCode column');
            } else {
                console.log('⏩ shortCode column already exists, skipping...');
            }

            console.log('🕐 Step 2 of 9: Generating short codes for existing schools...');
            
            // --- STEP 2: Generate short codes for existing schools ---
            // Load the School model AFTER potential column addition
            const { School } = require('./src/models');
            
            // Force the model to reload its schema from the database
            await School.describe().catch(e => console.log('Note: School.describe()', e.message));
            
            // Find schools without short codes
            const schoolsWithoutCode = await School.findAll({
                where: { shortCode: null },
                attributes: ['id', 'shortCode']
            });

            if (schoolsWithoutCode.length > 0) {
                console.log(`📝 Generating short codes for ${schoolsWithoutCode.length} schools...`);
                
                for (const school of schoolsWithoutCode) {
                    let shortCode = generateShortCode();
                    
                    // Ensure uniqueness
                    while (await School.findOne({ 
                        where: { shortCode },
                        attributes: ['id']
                    })) {
                        shortCode = generateShortCode();
                    }
                    
                    school.shortCode = shortCode;
                    await school.save();
                }
                console.log('✅ Short codes generated for all schools');
            } else {
                console.log('⏩ All schools already have short codes, skipping generation...');
            }

            console.log('🕐 Step 3 of 9: Adding status column...');
            
            // --- STEP 3: Add status column ---
            if (!(await columnExists(queryInterface, 'Schools', 'status'))) {
                await queryInterface.addColumn('Schools', 'status', {
                    type: Sequelize.ENUM('pending', 'active', 'suspended', 'rejected'),
                    defaultValue: 'pending'
                });
                console.log('✅ Added status column');
            } else {
                console.log('⏩ status column already exists, skipping...');
            }

            console.log('🕐 Step 4 of 9: Updating school statuses...');
            
            // --- STEP 4: Update school statuses ---
            // Reload model schema again after adding the column
            const { School: UpdatedSchoolModel } = require('./src/models');
            await UpdatedSchoolModel.describe().catch(e => console.log('Note: UpdatedSchoolModel.describe()', e.message));
            
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

            console.log('🕐 Step 5 of 9: Adding approvedBy column...');
            
            // --- STEP 5: Add approvedBy column ---
            if (!(await columnExists(queryInterface, 'Schools', 'approvedBy'))) {
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

            console.log('🕐 Step 6 of 9: Adding approvedAt column...');
            
            // --- STEP 6: Add approvedAt column ---
            if (!(await columnExists(queryInterface, 'Schools', 'approvedAt'))) {
                await queryInterface.addColumn('Schools', 'approvedAt', {
                    type: Sequelize.DATE,
                    allowNull: true
                });
                console.log('✅ Added approvedAt column');
            } else {
                console.log('⏩ approvedAt column already exists, skipping...');
            }

            console.log('🕐 Step 7 of 9: Adding rejectionReason column...');
            
            // --- STEP 7: Add rejectionReason column ---
            if (!(await columnExists(queryInterface, 'Schools', 'rejectionReason'))) {
                await queryInterface.addColumn('Schools', 'rejectionReason', {
                    type: Sequelize.TEXT,
                    allowNull: true
                });
                console.log('✅ Added rejectionReason column');
            } else {
                console.log('⏩ rejectionReason column already exists, skipping...');
            }

            console.log('🕐 Step 8 of 9: Making schoolCode nullable in Users table...');
            
            // --- STEP 8: Make schoolCode nullable in Users table ---
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

            console.log('🕐 Step 9 of 9: Adding indexes...');
            
            // --- STEP 9: Add indexes ---
            
            // Index on shortCode
            try {
                await queryInterface.addIndex('Schools', ['shortCode'], {
                    name: 'schools_short_code_idx',
                    unique: true,
                    where: { shortCode: { [Op.ne]: null } }
                });
                console.log('✅ Added unique index on shortCode');
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
            console.log('   ✓ shortCode column added/verified');
            console.log('   ✓ Short codes generated for existing schools');
            console.log('   ✓ status column added/verified');
            console.log('   ✓ School statuses updated to active');
            console.log('   ✓ approvedBy column added/verified');
            console.log('   ✓ approvedAt column added/verified');
            console.log('   ✓ rejectionReason column added/verified');
            console.log('   ✓ schoolCode made nullable in Users table');
            console.log('   ✓ Database indexes added/verified');
            console.log('\n✅ Migration process complete. You can now:');
            console.log('   1. Remove RUN_MIGRATIONS environment variable from Render');
            console.log('   2. Redeploy for normal operation');
            
            process.exit(0);

        } catch (err) {
            console.error('\n❌ Migration failed with error:', err);
            console.error('Stack trace:', err.stack);
            process.exit(1);
        }
    })(); // Execute the async function immediately
    
} else {
    // --- Normal server startup (only runs if RUN_MIGRATIONS is not true) ---
    console.log('🚀 Starting normal server mode...');
    
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
        console.log('📡 New WebSocket connection');
        
        socket.on('join', (userId) => {
            if (userId) {
                socket.join(`user-${userId}`);
                console.log(`👤 User ${userId} joined their room`);
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
            console.log('📡 WebSocket disconnected');
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
