const { Sequelize } = require('sequelize');
require('dotenv').config();

const isProduction = process.env.NODE_ENV === 'production';
const shouldUseSsl = process.env.DB_SSL === 'false' ? false : true;

function intEnv(name, fallback) {
  const value = parseInt(process.env[name], 10);
  return Number.isFinite(value) ? value : fallback;
}

const pool = {
  max: intEnv('DB_POOL_MAX', isProduction ? 25 : 10),
  min: intEnv('DB_POOL_MIN', isProduction ? 2 : 0),
  acquire: intEnv('DB_POOL_ACQUIRE_MS', 60000),
  idle: intEnv('DB_POOL_IDLE_MS', 10000),
  evict: intEnv('DB_POOL_EVICT_MS', 10000)
};

const commonOptions = {
  dialect: 'postgres',
  logging: process.env.DB_LOGGING === 'true' ? console.log : false,
  pool,
  benchmark: process.env.DB_BENCHMARK === 'true',
  retry: {
    max: intEnv('DB_RETRY_MAX', 3),
    match: [/SequelizeConnectionError/, /SequelizeConnectionRefusedError/, /SequelizeHostNotFoundError/, /SequelizeHostNotReachableError/, /SequelizeInvalidConnectionError/, /SequelizeConnectionTimedOutError/, /TimeoutError/]
  },
  dialectOptions: shouldUseSsl ? {
    ssl: { require: true, rejectUnauthorized: false },
    statement_timeout: intEnv('DB_STATEMENT_TIMEOUT_MS', 60000),
    connectionTimeoutMillis: intEnv('DB_CONNECTION_TIMEOUT_MS', 10000),
    idle_in_transaction_session_timeout: intEnv('DB_IDLE_TX_TIMEOUT_MS', 60000)
  } : {
    statement_timeout: intEnv('DB_STATEMENT_TIMEOUT_MS', 60000),
    connectionTimeoutMillis: intEnv('DB_CONNECTION_TIMEOUT_MS', 10000),
    idle_in_transaction_session_timeout: intEnv('DB_IDLE_TX_TIMEOUT_MS', 60000)
  }
};

let sequelize;
if (process.env.DATABASE_URL) {
  sequelize = new Sequelize(process.env.DATABASE_URL, commonOptions);
} else {
  sequelize = new Sequelize(process.env.DB_NAME, process.env.DB_USER, process.env.DB_PASSWORD, {
    ...commonOptions,
    host: process.env.DB_HOST,
    port: process.env.DB_PORT || 5432
  });
}

sequelize.authenticate()
  .then(() => console.log(`✅ Database connection ready. Pool max=${pool.max}`))
  .catch(err => {
    console.error('❌ Database connection failed:', err.message);
    if (!isProduction) console.error(err);
  });

module.exports = sequelize;
