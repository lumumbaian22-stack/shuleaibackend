const { sequelize, User, School, Admin } = require('../models');
const bcrypt = require('bcryptjs');

async function seed() {
  try {
    await sequelize.sync({ force: true });
    console.log('Database synced');

    // Create a default school
    const school = await School.create({
      name: 'Demo School',
      system: '844'
    });

    // Create super admin
    const superUser = await User.create({
      name: 'Super Admin',
      email: process.env.SUPER_ADMIN_EMAIL || 'super@shuleai.com',
      password: process.env.SUPER_ADMIN_PASSWORD || 'SuperAdmin123!',
      role: 'super_admin',
      schoolCode: school.code,
      isActive: true
    });

    await Admin.create({
      userId: superUser.id,
      position: 'Super Administrator',
      managedSchools: [school.id]
    });

    console.log('Seed completed');
    process.exit(0);
  } catch (error) {
    console.error('Seed error:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  seed();
}