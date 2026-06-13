const { Sequelize } = require('sequelize');
require('dotenv').config();

const isRender = Boolean(process.env.RENDER || process.env.RENDER_SERVICE_ID || process.env.RENDER_EXTERNAL_HOSTNAME);
const isProduction = process.env.NODE_ENV === 'production' || isRender;
const shouldUseSsl = process.env.DB_SSL === 'false' ? false : true;

function intEnv(name, fallback) {
  const value = parseInt(process.env[name], 10);
  return Number.isFinite(value) ? value : fallback;
}

const pool = {
  // Render/Postgres free/shared plans can terminate connections when a single
  // Node process opens too many sockets. Keep the default pool small and let
  // requests queue instead of overwhelming PostgreSQL during timetable writes.
  max: intEnv('DB_POOL_MAX', isProduction ? 5 : 10),
  min: intEnv('DB_POOL_MIN', 0),
  acquire: intEnv('DB_POOL_ACQUIRE_MS', 45000),
  idle: intEnv('DB_POOL_IDLE_MS', 30000),
  evict: intEnv('DB_POOL_EVICT_MS', 30000)
};

const commonOptions = {
  dialect: 'postgres',
  logging: process.env.DB_LOGGING === 'true' ? console.log : false,
  pool,
  benchmark: process.env.DB_BENCHMARK === 'true',
  retry: {
    max: intEnv('DB_RETRY_MAX', 3),
    match: [/SequelizeConnectionError/, /SequelizeConnectionRefusedError/, /SequelizeHostNotFoundError/, /SequelizeHostNotReachableError/, /SequelizeInvalidConnectionError/, /SequelizeConnectionTimedOutError/, /TimeoutError/, /Connection terminated unexpectedly/i, /Connection terminated/i, /Connection reset/i, /ECONNRESET/i, /Client has encountered a connection error/i]
  },
  dialectOptions: shouldUseSsl ? {
    ssl: { require: true, rejectUnauthorized: false },
    keepAlive: true,
    keepAliveInitialDelayMillis: intEnv('DB_KEEPALIVE_INITIAL_DELAY_MS', 10000),
    keepAlive: true,
    keepAliveInitialDelayMillis: intEnv('DB_KEEPALIVE_INITIAL_DELAY_MS', 10000),
    statement_timeout: intEnv('DB_STATEMENT_TIMEOUT_MS', 60000),
    connectionTimeoutMillis: intEnv('DB_CONNECTION_TIMEOUT_MS', 10000),
    idle_in_transaction_session_timeout: intEnv('DB_IDLE_TX_TIMEOUT_MS', 60000)
  } : {
    keepAlive: true,
    keepAliveInitialDelayMillis: intEnv('DB_KEEPALIVE_INITIAL_DELAY_MS', 10000),
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
  .then(() => console.log(`✅ Database connection ready. Pool max=${pool.max}, min=${pool.min}, render=${isRender}`))
  .catch(err => {
    console.error('❌ Database connection failed:', err.message);
    if (!isProduction) console.error(err);
  });

module.exports = sequelize;
