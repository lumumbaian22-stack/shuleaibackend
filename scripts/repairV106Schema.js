require('dotenv').config();
const { sequelize } = require('../src/models');
const { ensureRuntimeSchema } = require('../src/utils/schemaSafety');

(async () => {
  try {
    console.log('🔧 V106 schema repair starting...');
    await sequelize.authenticate();
    await ensureRuntimeSchema();
    await sequelize.query('ALTER TABLE IF EXISTS "Users" ALTER COLUMN "profileImage" TYPE TEXT').catch(() => null);
    console.log('✅ V106 schema repair completed. Access/curriculum/profile columns are aligned.');
    await sequelize.close();
    process.exit(0);
  } catch (err) {
    console.error('❌ V106 schema repair failed:', err);
    try { await sequelize.close(); } catch (_) {}
    process.exit(1);
  }
})();
