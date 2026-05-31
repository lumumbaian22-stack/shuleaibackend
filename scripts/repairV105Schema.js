require('dotenv').config();
const { sequelize } = require('../src/models');
const { ensureRuntimeSchema } = require('../src/utils/schemaSafety');

(async () => {
  try {
    console.log('🔧 V105 strict schema repair starting...');
    await sequelize.authenticate();
    await ensureRuntimeSchema();
    console.log('✅ V105 strict schema repair completed. Login/access columns are aligned.');
    await sequelize.close();
    process.exit(0);
  } catch (err) {
    console.error('❌ V105 strict schema repair failed:', err);
    try { await sequelize.close(); } catch (_) {}
    process.exit(1);
  }
})();
