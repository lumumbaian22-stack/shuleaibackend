const { Sequelize } = require('sequelize');
const { Umzug, SequelizeStorage } = require('umzug');
const { sequelize } = require('./src/models');

function createSafeQueryInterface(queryInterface) {
  const safe = Object.create(queryInterface);
  safe.sequelize = queryInterface.sequelize;
  safe.queryGenerator = queryInterface.queryGenerator;

  safe.addColumn = async function(tableName, columnName, attributes, options) {
    try {
      const desc = await queryInterface.describeTable(tableName);
      if (desc && desc[columnName]) {
        console.log(`[migration-safe] ${tableName}.${columnName} already exists; skipping addColumn`);
        return;
      }
    } catch (err) {
      console.warn(`[migration-safe] Could not describe ${tableName} before addColumn ${columnName}:`, err.message);
    }

    try {
      return await queryInterface.addColumn(tableName, columnName, attributes, options);
    } catch (err) {
      const code = err?.parent?.code || err?.original?.code;
      const msg = err?.message || '';
      if (code === '42701' || msg.includes('already exists')) {
        console.log(`[migration-safe] Duplicate column ${tableName}.${columnName}; continuing`);
        return;
      }
      throw err;
    }
  };

  safe.removeColumn = async function(tableName, columnName, options) {
    try {
      const desc = await queryInterface.describeTable(tableName);
      if (!desc || !desc[columnName]) {
        console.log(`[migration-safe] ${tableName}.${columnName} missing; skipping removeColumn`);
        return;
      }
    } catch (err) {
      console.warn(`[migration-safe] Could not describe ${tableName} before removeColumn ${columnName}:`, err.message);
    }

    try {
      return await queryInterface.removeColumn(tableName, columnName, options);
    } catch (err) {
      const code = err?.parent?.code || err?.original?.code;
      const msg = err?.message || '';
      if (code === '42703' || msg.includes('does not exist')) {
        console.log(`[migration-safe] Missing column ${tableName}.${columnName}; continuing`);
        return;
      }
      throw err;
    }
  };

  safe.addIndex = async function(tableName, attributes, options = {}) {
    try {
      return await queryInterface.addIndex(tableName, attributes, options);
    } catch (err) {
      const code = err?.parent?.code || err?.original?.code;
      const msg = err?.message || '';
      if (code === '42P07' || msg.includes('already exists')) {
        console.log(`[migration-safe] Duplicate index on ${tableName}; continuing`);
        return;
      }
      throw err;
    }
  };

  safe.createTable = async function(tableName, attributes, options) {
    try {
      return await queryInterface.createTable(tableName, attributes, options);
    } catch (err) {
      const code = err?.parent?.code || err?.original?.code;
      const msg = err?.message || '';
      if (code === '42P07' || msg.includes('already exists')) {
        console.log(`[migration-safe] Table ${tableName} already exists; continuing`);
        return;
      }
      throw err;
    }
  };

  return safe;
}

async function runMigrations() {
  try {
    console.log('🔧 Database Config Debug:');
    console.log('📊 NODE_ENV:', process.env.NODE_ENV);
    console.log('📊 DATABASE_URL exists:', !!process.env.DATABASE_URL);
    console.log('📊 isProduction:', process.env.NODE_ENV === 'production');
    if (process.env.DATABASE_URL) {
      console.log('📊 Using DATABASE_URL (first 20 chars):', process.env.DATABASE_URL.substring(0, 20) + '...');
    }

    await sequelize.authenticate();
    console.log('✅ Database connection test SUCCESSFUL');

    const queryInterface = sequelize.getQueryInterface();
    const safeQueryInterface = createSafeQueryInterface(queryInterface);

    const umzug = new Umzug({
      migrations: {
        glob: 'src/migrations/*.js',
        resolve: ({ name, path }) => {
          const migration = require(path);
          return {
            name,
            up: async () => migration.up(safeQueryInterface, Sequelize),
            down: async () => {
              if (typeof migration.down === 'function') {
                return migration.down(safeQueryInterface, Sequelize);
              }
            }
          };
        }
      },
      context: safeQueryInterface,
      storage: new SequelizeStorage({ sequelize }),
      logger: console,
    });

    const pending = await umzug.pending();
    console.log(`📦 Pending migrations: ${pending.length}`);
    pending.forEach(m => console.log(`  - ${m.name}`));

    await umzug.up();

    console.log('✅ All migrations completed successfully');
    await sequelize.close();
    process.exit(0);
  } catch (error) {
    console.error('Migration failed:', error);
    try { await sequelize.close(); } catch (_) {}
    process.exit(1);
  }
}

runMigrations();