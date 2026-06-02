require('dotenv').config();
const { sequelize } = require('../src/models');
const { ensureRuntimeSchema } = require('../src/utils/schemaSafety');

(async () => {
  try {
    await sequelize.authenticate();
    await ensureRuntimeSchema({ force: true });
    console.log('✅ Schema repair completed successfully');
    await sequelize.close();
    process.exit(0);
  } catch (error) {
    console.error('❌ Schema repair failed:', error);
    try { await sequelize.close(); } catch (_) {}
    process.exit(1);
  }
})();
