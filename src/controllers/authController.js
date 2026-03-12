// Admin signup - creates pending school
adminSignup: async (req, res) => {
    try {
        const { 
            name, email, password, phone, 
            schoolName, schoolLevel, curriculum, 
            address, contact 
        } = req.body;

        // Validate required fields
        if (!name || !email || !password || !schoolName) {
            return res.status(400).json({ 
                success: false, 
                message: 'Missing required fields' 
            });
        }

        // Check if email already exists
        const existing = await User.findOne({ where: { email } });
        if (existing) {
            return res.status(400).json({ 
                success: false, 
                message: 'Email already in use' 
            });
        }

        // Create school - let the model defaults handle schoolId and shortCode
        console.log('Creating school with name:', schoolName);
        const school = await School.create({
            name: schoolName,
            system: curriculum || 'cbc',
            address: address || {},
            contact: contact || { phone, email },
            status: 'pending',
            isActive: false,
            settings: {
                allowTeacherSignup: true,
                requireApproval: true,
                autoApproveDomains: [],
                schoolLevel: schoolLevel || 'secondary',
                dutyManagement: {
                    enabled: true,
                    reminderHours: 24,
                    maxTeachersPerDay: 3,
                    checkInWindow: 15
                }
            }
        });

        console.log('School created successfully:', {
            id: school.id,
            schoolId: school.schoolId,
            shortCode: school.shortCode
        });

        // Create admin user (inactive until school approved)
        const user = await User.create({
            name,
            email,
            password,
            role: 'admin',
            phone,
            schoolCode: school.schoolId,
            isActive: false // Admin inactive until school approved
        });

        // Create admin profile - this will now work with the fixed Admin model
        const admin = await Admin.create({
            userId: user.id,
            position: 'School Administrator',
            managedSchools: [school.id]
        });

        console.log('Admin created successfully with ID:', admin.adminId);

        // Notify super admins about new school registration
        const superAdmins = await User.findAll({ where: { role: 'super_admin' } });
        for (const sa of superAdmins) {
            await createAlert({
                userId: sa.id,
                role: 'super_admin',
                type: 'approval',
                severity: 'info',
                title: 'New School Registration',
                message: `${schoolName} (${school.shortCode}) pending approval`,
                data: { schoolId: school.id, adminId: user.id }
            });
        }

        res.status(201).json({
            success: true,
            message: 'Registration successful. School pending approval by super admin.',
            data: {
                schoolId: school.schoolId,
                shortCode: school.shortCode,
                qrCode: school.qrCode,
                status: school.status
            }
        });
    } catch (error) {
        console.error('Admin signup error details:', {
            message: error.message,
            stack: error.stack,
            name: error.name,
            errors: error.errors
        });
        
        res.status(500).json({ 
            success: false, 
            message: error.message || 'Registration failed. Please try again.'
        });
    }
},
